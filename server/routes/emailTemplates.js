const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { PLACEHOLDERS, mergeContext, fill } = require('../services/mergeFields');

// Saved emails staff reuse from Messages, with {placeholders} filled in from
// the couple's record. Rendering never sends anything; staff read and edit
// the result before it goes out.

function read(body, existing = {}) {
  const name = String(body.name ?? existing.name ?? '').trim();
  const text = String(body.body ?? existing.body ?? '').trim();
  if (!name) return { error: 'Name the template' };
  if (!text) return { error: 'The template needs some text' };
  return { value: { name: name.slice(0, 120), subject: String(body.subject ?? existing.subject ?? '').slice(0, 200) || null, body: text.slice(0, 20000) } };
}

router.get('/placeholders', authenticateToken, (req, res) => res.json(PLACEHOLDERS));

router.get('/', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM email_templates WHERE is_active = 1 ORDER BY name COLLATE NOCASE').all());
});

router.post('/', authenticateToken, (req, res) => {
  const { value, error } = read(req.body);
  if (error) return res.status(400).json({ error });
  const r = db.prepare('INSERT INTO email_templates (name, subject, body) VALUES (@name, @subject, @body)').run(value);
  res.status(201).json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const t = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  const { value, error } = read(req.body, t);
  if (error) return res.status(400).json({ error });
  db.prepare(`UPDATE email_templates SET name = @name, subject = @subject, body = @body, updated_at = datetime('now') WHERE id = @id`).run({ ...value, id: t.id });
  res.json(db.prepare('SELECT * FROM email_templates WHERE id = ?').get(t.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM email_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Fill a saved template (or unsaved subject/body, for a preview) for a couple.
router.post('/render', authenticateToken, (req, res) => {
  const t = req.body.template_id ? db.prepare('SELECT * FROM email_templates WHERE id = ?').get(req.body.template_id) : null;
  if (req.body.template_id && !t) return res.status(404).json({ error: 'Template not found' });
  const ctx = mergeContext(req.body.couple_id, { staffName: req.user?.name });
  if (!ctx) return res.status(404).json({ error: 'Couple not found' });
  const subject = fill(t ? t.subject : req.body.subject, ctx);
  const body = fill(t ? t.body : req.body.body, ctx);
  const missing = [...new Set([...subject.missing, ...body.missing])];
  res.json({ subject: subject.text, body: body.text, missing, missing_labels: missing.map(k => PLACEHOLDERS[k]) });
});

module.exports = router;
