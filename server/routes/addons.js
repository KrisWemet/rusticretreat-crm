const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// List add-ons (staff). ?active=1 to filter to active only.
router.get('/', authenticateToken, (req, res) => {
  const onlyActive = req.query.active === '1';
  const rows = db.prepare(
    `SELECT * FROM addons ${onlyActive ? 'WHERE is_active = 1' : ''} ORDER BY name`
  ).all();
  res.json(rows);
});

router.post('/', authenticateToken, (req, res) => {
  const { name, description, price, unit, on_final_form } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
  const validUnit = ['flat', 'per_guest', 'per_night'].includes(unit) ? unit : 'flat';
  // on_final_form: whether couples can pick it on the Final Details Form (default yes).
  const result = db.prepare(
    'INSERT INTO addons (name, description, price, unit, on_final_form) VALUES (?, ?, ?, ?, ?)'
  ).run(name, description || null, price, validUnit, on_final_form === false || on_final_form === 0 ? 0 : 1);
  res.status(201).json(db.prepare('SELECT * FROM addons WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM addons WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Add-on not found' });
  const { name, description, price, unit, is_active, on_final_form } = req.body;
  const validUnit = ['flat', 'per_guest', 'per_night'].includes(unit) ? unit : existing.unit;
  db.prepare(
    'UPDATE addons SET name = ?, description = ?, price = ?, unit = ?, is_active = ?, on_final_form = ? WHERE id = ?'
  ).run(
    name ?? existing.name,
    description ?? existing.description,
    price ?? existing.price,
    validUnit,
    is_active != null ? (is_active ? 1 : 0) : existing.is_active,
    on_final_form != null ? (on_final_form ? 1 : 0) : (existing.on_final_form ?? 1),
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM addons WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM addons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
