const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { ANCHORS, applyTemplate } = require('../services/taskTemplates');
const { logActivity } = require('../services/activity');

// Checklist templates and applying them to a couple. See services/taskTemplates.js.

const AUTO = ['none', 'on_enquiry', 'on_booking'];
const PRIORITY = ['low', 'medium', 'high'];

const full = (id) => {
  const t = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id);
  return t && { ...t, items: db.prepare('SELECT * FROM task_template_items WHERE template_id = ? ORDER BY order_index, id').all(id) };
};

function readItems(items) {
  if (!Array.isArray(items)) return { items: [] };
  const out = [];
  for (const [i, it] of items.entries()) {
    const title = String(it.title || '').trim();
    if (!title) continue;
    const anchor = ANCHORS[it.anchor] ? it.anchor : 'checkin';
    const offset = Math.round(Number(it.offset_days) || 0);
    if (Math.abs(offset) > 1000) return { error: `“${title}” is more than 1,000 days away` };
    out.push({ id: it.id || null, title: title.slice(0, 200), description: it.description ? String(it.description).slice(0, 2000) : null,
      anchor, offset_days: offset, priority: PRIORITY.includes(it.priority) ? it.priority : 'medium',
      assigned_to: it.assigned_to ? String(it.assigned_to).slice(0, 120) : null, order_index: i });
  }
  return { items: out };
}

function saveItems(templateId, items) {
  // Items keep their ids across edits: a task remembers the item it came
  // from, which is how applying the checklist again skips what is done.
  const keep = new Set(items.filter(i => i.id).map(i => Number(i.id)));
  for (const row of db.prepare('SELECT id FROM task_template_items WHERE template_id = ?').all(templateId)) {
    if (!keep.has(row.id)) db.prepare('DELETE FROM task_template_items WHERE id = ?').run(row.id);
  }
  const upd = db.prepare(`UPDATE task_template_items SET title = @title, description = @description, anchor = @anchor,
    offset_days = @offset_days, priority = @priority, assigned_to = @assigned_to, order_index = @order_index
    WHERE id = @id AND template_id = @template_id`);
  const ins = db.prepare(`INSERT INTO task_template_items (template_id, title, description, anchor, offset_days, priority, assigned_to, order_index)
    VALUES (@template_id, @title, @description, @anchor, @offset_days, @priority, @assigned_to, @order_index)`);
  for (const it of items) {
    const row = { ...it, template_id: templateId };
    if (it.id && upd.run(row).changes) continue;
    ins.run(row);
  }
}

router.get('/anchors', authenticateToken, (req, res) => res.json(ANCHORS));

router.get('/', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT id FROM task_templates ORDER BY name').all().map(t => full(t.id)));
});

router.post('/', authenticateToken, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name the checklist' });
  const { items, error } = readItems(req.body.items);
  if (error) return res.status(400).json({ error });
  const auto = AUTO.includes(req.body.auto_apply) ? req.body.auto_apply : 'none';
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO task_templates (name, description, auto_apply) VALUES (?, ?, ?)').run(name.slice(0, 120), req.body.description || null, auto);
    saveItems(r.lastInsertRowid, items.map(i => ({ ...i, id: null })));
    return r.lastInsertRowid;
  })();
  res.status(201).json(full(id));
});

router.put('/:id', authenticateToken, (req, res) => {
  const t = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Checklist not found' });
  const name = req.body.name !== undefined ? String(req.body.name).trim() : t.name;
  if (!name) return res.status(400).json({ error: 'Name the checklist' });
  const auto = AUTO.includes(req.body.auto_apply) ? req.body.auto_apply : t.auto_apply;
  const parsed = req.body.items !== undefined ? readItems(req.body.items) : null;
  if (parsed?.error) return res.status(400).json({ error: parsed.error });
  db.transaction(() => {
    db.prepare('UPDATE task_templates SET name = ?, description = ?, auto_apply = ? WHERE id = ?')
      .run(name.slice(0, 120), req.body.description !== undefined ? (req.body.description || null) : t.description, auto, t.id);
    if (parsed) saveItems(t.id, parsed.items);
  })();
  res.json(full(t.id));
});

// Tasks already made from it stay; they simply stop being linked to an item.
router.delete('/:id', authenticateToken, (req, res) => {
  const t = full(req.params.id);
  if (!t) return res.status(404).json({ error: 'Checklist not found' });
  db.transaction(() => {
    db.prepare(`UPDATE tasks SET template_item_id = NULL WHERE template_item_id IN (SELECT id FROM task_template_items WHERE template_id = ?)`).run(t.id);
    db.prepare('DELETE FROM task_templates WHERE id = ?').run(t.id);
  })();
  logActivity(req, { action: 'checklist.deleted', entity: 'task_template', entityId: t.id, summary: `Deleted checklist "${t.name}"`, detail: t });
  res.json({ success: true });
});

router.post('/:id/apply', authenticateToken, (req, res) => {
  try {
    const result = applyTemplate(req.params.id, req.body.couple_id);
    if (result.created.length) {
      logActivity(req, { action: 'checklist.applied', entity: 'task_template', entityId: Number(req.params.id), coupleId: Number(req.body.couple_id),
        summary: `Added ${result.created.length} task${result.created.length === 1 ? '' : 's'} from "${result.template}"` });
    }
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Could not apply the checklist' });
  }
});

module.exports = router;
