const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

function getFullForm(id) {
  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
  if (!form) return null;
  form.fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY order_index, id').all(id);
  return form;
}

function saveFields(formId, fields) {
  db.prepare('DELETE FROM form_fields WHERE form_id = ?').run(formId);
  const insert = db.prepare(`
    INSERT INTO form_fields (form_id, label, field_type, options, required, order_index)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  (fields || []).forEach((f, idx) => {
    const type = ['text', 'textarea', 'number', 'date', 'select', 'checkbox'].includes(f.field_type) ? f.field_type : 'text';
    const options = f.options ? (typeof f.options === 'string' ? f.options : JSON.stringify(f.options)) : null;
    insert.run(formId, f.label || 'Question', type, options, f.required ? 1 : 0, idx);
  });
}

// ── Admin: list forms with field + assignment counts ─────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM form_fields ff WHERE ff.form_id = f.id) AS field_count,
      (SELECT COUNT(*) FROM form_assignments fa WHERE fa.form_id = f.id) AS assigned_count,
      (SELECT COUNT(*) FROM form_assignments fa WHERE fa.form_id = f.id AND fa.status = 'completed') AS completed_count
    FROM forms f ORDER BY f.created_at DESC
  `).all();
  res.json(rows);
});

router.get('/:id', authenticateToken, (req, res) => {
  const form = getFullForm(req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
});

router.post('/', authenticateToken, (req, res) => {
  const { title, description, fields } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare('INSERT INTO forms (title, description) VALUES (?, ?)').run(title, description || null);
  saveFields(result.lastInsertRowid, fields);
  res.status(201).json(getFullForm(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Form not found' });
  const { title, description, is_active, fields } = req.body;
  db.prepare('UPDATE forms SET title = ?, description = ?, is_active = ? WHERE id = ?').run(
    title ?? existing.title,
    description ?? existing.description,
    is_active != null ? (is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );
  if (fields) saveFields(req.params.id, fields);
  res.json(getFullForm(req.params.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM forms WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Admin: assignments for a form ────────────────────────────────────────────
router.get('/:id/assignments', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT fa.*, c.partner1_name, c.partner2_name
    FROM form_assignments fa JOIN couples c ON c.id = fa.couple_id
    WHERE fa.form_id = ? ORDER BY fa.created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

// ── Admin: assign a form to a couple ─────────────────────────────────────────
router.post('/:id/assign', authenticateToken, (req, res) => {
  const { couple_id } = req.body;
  if (!couple_id) return res.status(400).json({ error: 'couple_id is required' });
  const existing = db.prepare('SELECT id FROM form_assignments WHERE form_id = ? AND couple_id = ?')
    .get(req.params.id, couple_id);
  if (existing) return res.status(409).json({ error: 'Form already assigned to this couple' });
  const result = db.prepare('INSERT INTO form_assignments (form_id, couple_id) VALUES (?, ?)')
    .run(req.params.id, couple_id);
  res.status(201).json(db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(result.lastInsertRowid));
});

// ── Admin: view a couple's submitted responses for an assignment ─────────────
router.get('/assignments/:assignmentId/responses', authenticateToken, (req, res) => {
  const assignment = db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(req.params.assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const rows = db.prepare(`
    SELECT ff.label, ff.field_type, ff.order_index, r.value
    FROM form_fields ff
    LEFT JOIN form_responses r ON r.field_id = ff.id AND r.assignment_id = ?
    WHERE ff.form_id = ?
    ORDER BY ff.order_index, ff.id
  `).all(req.params.assignmentId, assignment.form_id);
  res.json({ assignment, responses: rows });
});

router.delete('/assignments/:assignmentId', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM form_assignments WHERE id = ?').run(req.params.assignmentId);
  res.json({ success: true });
});

module.exports = router;
