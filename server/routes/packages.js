const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { normaliseSeasonPrices, present } = require('../services/packagePricing');

// Reject bad season prices with a message staff can act on.
function seasonPricesOrFail(res, input) {
  try { return { ok: true, value: normaliseSeasonPrices(input) }; }
  catch (err) { res.status(400).json({ error: err.message }); return { ok: false }; }
}

router.get('/public', (req, res) => {
  res.json(db.prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY price ASC').all().map(present));
});

router.get('/', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM packages ORDER BY price ASC').all().map(present));
});

router.post('/', authenticateToken, (req, res) => {
  const { name, description, price, max_guests, includes, is_active, season_prices } = req.body;
  if (!name || price == null) return res.status(400).json({ error: 'name and price are required' });
  const seasons = seasonPricesOrFail(res, season_prices);
  if (!seasons.ok) return;
  const result = db.prepare(`
    INSERT INTO packages (name, description, price, max_guests, includes, is_active, season_prices) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || null, price, max_guests || null, includes || null, is_active !== false ? 1 : 0, seasons.value);
  res.status(201).json(present(db.prepare('SELECT * FROM packages WHERE id = ?').get(result.lastInsertRowid)));
});

router.put('/:id', authenticateToken, (req, res) => {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id);
  if (!pkg) return res.status(404).json({ error: 'Package not found' });
  const { name, description, price, max_guests, includes, is_active, season_prices } = req.body;
  let seasonValue = pkg.season_prices;
  if (season_prices !== undefined) {
    const seasons = seasonPricesOrFail(res, season_prices);
    if (!seasons.ok) return;
    seasonValue = seasons.value;
  }
  db.prepare(`
    UPDATE packages SET name = ?, description = ?, price = ?, max_guests = ?, includes = ?, is_active = ?, season_prices = ? WHERE id = ?
  `).run(
    name ?? pkg.name,
    description !== undefined ? description : pkg.description,
    price ?? pkg.price,
    max_guests !== undefined ? max_guests : pkg.max_guests,
    includes !== undefined ? includes : pkg.includes,
    is_active !== undefined ? (is_active ? 1 : 0) : pkg.is_active,
    seasonValue,
    req.params.id,
  );
  res.json(present(db.prepare('SELECT * FROM packages WHERE id = ?').get(req.params.id)));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM packages WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
