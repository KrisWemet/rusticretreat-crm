const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');

// Admin: Get budget items for couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const items = db.prepare(`
    SELECT * FROM budget_items WHERE couple_id = ? ORDER BY category ASC, created_at ASC
  `).all(req.params.coupleId);
  const couple = db.prepare('SELECT budget_total FROM couples WHERE id = ?').get(req.params.coupleId);
  res.json({ items, budget_total: couple ? couple.budget_total : 0 });
});

// Portal: Get budget items
router.get('/portal', authenticateCouple, (req, res) => {
  const items = db.prepare(`
    SELECT * FROM budget_items WHERE couple_id = ? ORDER BY category ASC, created_at ASC
  `).all(req.couple.coupleId);
  const couple = db.prepare('SELECT budget_total FROM couples WHERE id = ?').get(req.couple.coupleId);
  res.json({ items, budget_total: couple ? couple.budget_total : 0 });
});

// Portal: Add budget item
router.post('/portal', authenticateCouple, (req, res) => {
  const { category, description, estimated_cost, actual_cost, paid, vendor_name, notes } = req.body;
  if (!category || !description) return res.status(400).json({ error: 'Category and description required' });

  const result = db.prepare(`
    INSERT INTO budget_items (couple_id, category, description, estimated_cost, actual_cost, paid, vendor_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.couple.coupleId, category, description, estimated_cost || 0, actual_cost || 0,
    paid ? 1 : 0, vendor_name || null, notes || null);

  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Admin: Add budget item
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const { category, description, estimated_cost, actual_cost, paid, vendor_name, notes } = req.body;
  if (!category || !description) return res.status(400).json({ error: 'Category and description required' });

  const result = db.prepare(`
    INSERT INTO budget_items (couple_id, category, description, estimated_cost, actual_cost, paid, vendor_name, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.coupleId, category, description, estimated_cost || 0, actual_cost || 0,
    paid ? 1 : 0, vendor_name || null, notes || null);

  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

// Update budget item
router.put('/:id', authenticateAny, (req, res) => {
  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Budget item not found' });

  if (req.auth.coupleId && req.auth.coupleId !== item.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { category, description, estimated_cost, actual_cost, paid, vendor_name, notes } = req.body;

  db.prepare(`
    UPDATE budget_items SET
      category = ?, description = ?, estimated_cost = ?, actual_cost = ?,
      paid = ?, vendor_name = ?, notes = ?
    WHERE id = ?
  `).run(
    category || item.category,
    description || item.description,
    estimated_cost !== undefined ? estimated_cost : item.estimated_cost,
    actual_cost !== undefined ? actual_cost : item.actual_cost,
    paid !== undefined ? (paid ? 1 : 0) : item.paid,
    vendor_name !== undefined ? vendor_name : item.vendor_name,
    notes !== undefined ? notes : item.notes,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete budget item
router.delete('/:id', authenticateAny, (req, res) => {
  const item = db.prepare('SELECT * FROM budget_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Budget item not found' });

  if (req.auth.coupleId && req.auth.coupleId !== item.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM budget_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Budget item deleted' });
});

module.exports = router;
