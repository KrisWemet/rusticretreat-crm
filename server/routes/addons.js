const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { normaliseSeasonPrices } = require('../services/packagePricing');
const { presentAddon } = require('../services/extras');
const { logActivity } = require('../services/activity');

// The add-on catalog (extras). Prices are before GST and can differ by wedding
// year (season_prices, like packages). price_placeholder marks a price the
// owner has not set yet: such an add-on is kept off the Final Details Form and
// cannot be billed without typing the real price. Saving a new price clears it.

const UNITS = ['flat', 'per_guest', 'per_night'];
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const get = (id) => db.prepare('SELECT * FROM addons WHERE id = ?').get(id);

function seasonsOr400(res, input) {
  try { return { ok: true, value: normaliseSeasonPrices(input) }; }
  catch (err) { res.status(400).json({ error: err.message }); return { ok: false }; }
}

// List add-ons (staff). ?active=1 to filter to active only.
router.get('/', authenticateToken, (req, res) => {
  const onlyActive = req.query.active === '1';
  const rows = db.prepare(`SELECT * FROM addons ${onlyActive ? 'WHERE is_active = 1' : ''} ORDER BY name COLLATE NOCASE`).all();
  res.json(rows.map(a => presentAddon(a, req.query.date || null)));
});

router.post('/', authenticateToken, (req, res) => {
  const { name, description, price, unit, on_final_form, unit_label, season_prices, price_placeholder } = req.body;
  if (!name || price == null || price === '') return res.status(400).json({ error: 'name and price are required' });
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return res.status(400).json({ error: 'The price must be 0 or more' });
  const seasons = seasonsOr400(res, season_prices);
  if (!seasons.ok) return;
  const result = db.prepare(
    `INSERT INTO addons (name, description, price, unit, on_final_form, unit_label, season_prices, price_placeholder)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(String(name).trim(), description || null, p, UNITS.includes(unit) ? unit : 'flat',
    on_final_form === false || on_final_form === 0 ? 0 : 1, String(unit_label || '').trim().slice(0, 60) || null,
    seasons.value, bool(price_placeholder) ? 1 : 0);
  res.status(201).json(presentAddon(get(result.lastInsertRowid)));
});

router.put('/:id', authenticateToken, (req, res) => {
  const existing = get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Add-on not found' });
  const { name, description, price, unit, is_active, on_final_form, unit_label, season_prices, price_placeholder } = req.body;
  if (price != null && price !== '' && (!Number.isFinite(Number(price)) || Number(price) < 0)) return res.status(400).json({ error: 'The price must be 0 or more' });
  let seasonValue = existing.season_prices;
  if (season_prices !== undefined) {
    const seasons = seasonsOr400(res, season_prices);
    if (!seasons.ok) return;
    seasonValue = seasons.value;
  }
  const newPrice = price != null && price !== '' ? Number(price) : existing.price;
  // A placeholder stays one until the owner says otherwise or changes a price.
  const pricesChanged = newPrice !== existing.price || (seasonValue || null) !== (existing.season_prices || null);
  const placeholder = price_placeholder !== undefined ? (bool(price_placeholder) ? 1 : 0)
    : (existing.price_placeholder && pricesChanged ? 0 : existing.price_placeholder || 0);
  db.prepare(`UPDATE addons SET name = ?, description = ?, price = ?, unit = ?, is_active = ?, on_final_form = ?,
      unit_label = ?, season_prices = ?, price_placeholder = ? WHERE id = ?`).run(
    name ?? existing.name,
    description ?? existing.description,
    newPrice,
    UNITS.includes(unit) ? unit : existing.unit,
    is_active != null ? (is_active ? 1 : 0) : existing.is_active,
    on_final_form != null ? (on_final_form ? 1 : 0) : (existing.on_final_form ?? 1),
    unit_label !== undefined ? (String(unit_label || '').trim().slice(0, 60) || null) : existing.unit_label,
    seasonValue,
    placeholder,
    req.params.id
  );
  const after = get(req.params.id);
  if (after.price !== existing.price || after.season_prices !== existing.season_prices || after.price_placeholder !== existing.price_placeholder) {
    logActivity(req, { action: 'addon.price_changed', entity: 'addon', entityId: after.id,
      summary: `Changed the price of "${after.name}"${!after.price_placeholder && existing.price_placeholder ? ' (no longer a placeholder)' : ''}`,
      detail: { before: { price: existing.price, season_prices: existing.season_prices }, after: { price: after.price, season_prices: after.season_prices } } });
  }
  res.json(presentAddon(after));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM addons WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
