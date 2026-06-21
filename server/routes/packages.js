const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.get('/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY price ASC').all());
});

router.get('/', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM packages ORDER BY price ASC').all());
});

router.post('/', authenticateToken, (req, res) => {
  const { name, description, price, max_guests, includes, is_active } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
  const result = db.prepare(`
    INSERT INTO packages (name, description, price, max_guests, includes, is_active) VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, description || null, price, max_guests || null, includes || null, is_active !== false ? 1 : 0);
  res.status(201).json(db.prepare('SELECT * FROM packages WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  const { name, description, price, max_guests, includes, is_active } = req.body;
  db.prepare(`
    UPDATE packages SET name = ?, description = ?, price = ?, max_guests = ?, includes = ?, is_active = ? WHERE id = ?
  `).run(
    name ?? pkg.name,
    description !== undefined ? description : pkg.description,
    price ?? pkg.price,
    max_guests !== undefined ? max_guests : pkg.max_guests,
    includes !== undefined ? includes : pkg.includes,
    is_active !== undefined ? (is_active ? 1 : 0) : pkg.is_active,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
