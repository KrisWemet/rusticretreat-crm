const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');

// Admin: Get checklist for couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const items = db.prepare(`
    SELECT * FROM checklist_items WHERE couple_id = ? ORDER BY due_date ASC, created_at ASC
  `).all(req.params.coupleId);
  res.json(items);
});

// Admin: Create checklist item
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const { title, description, due_date, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(`
    INSERT INTO checklist_items (couple_id, title, description, due_date, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.coupleId, title, description || null, due_date || null, category || 'General');

  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Portal: Get checklist
router.get('/portal', authenticateCouple, (req, res) => {
  const items = db.prepare(`
    SELECT * FROM checklist_items WHERE couple_id = ? ORDER BY due_date ASC, created_at ASC
  `).all(req.couple.coupleId);
  res.json(items);
});

// Portal: Create checklist item
router.post('/portal', authenticateCouple, (req, res) => {
  const { title, description, due_date, category } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const result = db.prepare(`
    INSERT INTO checklist_items (couple_id, title, description, due_date, category)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.couple.coupleId, title, description || null, due_date || null, category || 'General');

  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Update checklist item (both admin and couple)
router.put('/:id', authenticateAny, (req, res) => {
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  // Check access
  if (req.auth.coupleId && req.auth.coupleId !== item.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { title, description, due_date, completed, category } = req.body;
  const isCompleted = completed !== undefined ? (completed ? 1 : 0) : item.completed;
  const completedAt = isCompleted && !item.completed ? 'CURRENT_TIMESTAMP' : item.completed_at;

  db.prepare(`
    UPDATE checklist_items SET
      title = ?, description = ?, due_date = ?, completed = ?,
      completed_at = CASE WHEN ? = 1 AND completed = 0 THEN CURRENT_TIMESTAMP ELSE completed_at END,
      category = ?
    WHERE id = ?
  `).run(
    title || item.title,
    description !== undefined ? description : item.description,
    due_date !== undefined ? due_date : item.due_date,
    isCompleted,
    isCompleted,
    category || item.category,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete checklist item (both admin and couple, couple limited to own items)
router.delete('/:id', authenticateAny, (req, res) => {
  const item = db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  if (req.auth.coupleId && req.auth.coupleId !== item.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM checklist_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Item deleted' });
});

module.exports = router;
