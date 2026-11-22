const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// A couple's notes log: who wrote what, when, and how the conversation
// happened. The single notes box on the couple stays as it was (the website
// writes enquiry answers into it); this keeps a dated history beside it.

const KINDS = ['note', 'call', 'email', 'meeting', 'visit'];

router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM couple_notes WHERE couple_id = ? ORDER BY pinned DESC, created_at DESC, id DESC').all(req.params.coupleId));
});

router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  if (!db.prepare('SELECT 1 FROM couples WHERE id = ?').get(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  const body = String(req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Write the note first' });
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'note';
  const r = db.prepare('INSERT INTO couple_notes (couple_id, kind, body, pinned, author) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.coupleId, kind, body.slice(0, 10000), req.body.pinned ? 1 : 0, req.user?.name || req.user?.email || null);
  res.status(201).json(db.prepare('SELECT * FROM couple_notes WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const note = db.prepare('SELECT * FROM couple_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const body = req.body.body !== undefined ? String(req.body.body).trim() : note.body;
  if (!body) return res.status(400).json({ error: 'A note cannot be empty' });
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : note.kind;
  const pinned = req.body.pinned !== undefined ? (req.body.pinned ? 1 : 0) : note.pinned;
  const edited = body !== note.body || kind !== note.kind;
  db.prepare(`UPDATE couple_notes SET body = ?, kind = ?, pinned = ?, updated_at = CASE WHEN ? THEN datetime('now') ELSE updated_at END WHERE id = ?`)
    .run(body.slice(0, 10000), kind, pinned, edited ? 1 : 0, note.id);
  res.json(db.prepare('SELECT * FROM couple_notes WHERE id = ?').get(note.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM couple_notes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
