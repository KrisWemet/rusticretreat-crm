const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../services/activity');

// The venue's own vendor list: photographers, caterers, rentals and the like
// it knows and recommends. Adding one to a couple copies it onto their vendor
// list, so a later edit here never rewrites what an earlier wedding recorded.

const CATEGORIES = ['Photography', 'Videography', 'Catering', 'Food truck', 'Bar service', 'Florist', 'Music/DJ', 'Band',
  'Officiant', 'Hair & Makeup', 'Rentals', 'Tents', 'Transportation', 'Cake/Bakery', 'Lighting', 'Planner', 'Accommodation', 'Other'];

function read(body, existing = {}) {
  const pick = (k) => (body[k] !== undefined ? body[k] : existing[k]);
  const text = (k, max = 200) => { const v = pick(k); return v == null || String(v).trim() === '' ? null : String(v).trim().slice(0, max); };
  const category = text('category', 60);
  const business = text('business_name');
  if (!category || !business) return { error: 'Category and business name are required' };
  const expires = text('insurance_expires', 10);
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) return { error: 'Insurance expiry must be a date' };
  return {
    value: {
      category, business_name: business, contact_name: text('contact_name'), phone: text('phone', 60),
      email: text('email'), website: text('website'), notes: text('notes', 4000), insurance_expires: expires,
      preferred: pick('preferred') === undefined ? 1 : (pick('preferred') ? 1 : 0),
      is_active: pick('is_active') === undefined ? 1 : (pick('is_active') ? 1 : 0),
    },
  };
}

router.get('/categories', authenticateToken, (req, res) => res.json(CATEGORIES));

// How many weddings each vendor has been added to, so staff can see who they
// actually work with.
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, (SELECT COUNT(*) FROM vendors v WHERE v.directory_id = d.id) AS weddings
    FROM vendor_directory d
    ${req.query.include_inactive === '1' ? '' : 'WHERE d.is_active = 1'}
    ORDER BY d.category COLLATE NOCASE, d.business_name COLLATE NOCASE
  `).all();
  res.json(rows);
});

router.post('/', authenticateToken, (req, res) => {
  const { value, error } = read(req.body);
  if (error) return res.status(400).json({ error });
  const r = db.prepare(`INSERT INTO vendor_directory (category, business_name, contact_name, phone, email, website, notes, preferred, insurance_expires, is_active)
    VALUES (@category, @business_name, @contact_name, @phone, @email, @website, @notes, @preferred, @insurance_expires, @is_active)`).run(value);
  res.status(201).json(db.prepare('SELECT * FROM vendor_directory WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM vendor_directory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  const { value, error } = read(req.body, existing);
  if (error) return res.status(400).json({ error });
  db.prepare(`UPDATE vendor_directory SET category = @category, business_name = @business_name, contact_name = @contact_name,
    phone = @phone, email = @email, website = @website, notes = @notes, preferred = @preferred,
    insurance_expires = @insurance_expires, is_active = @is_active, updated_at = datetime('now') WHERE id = @id`).run({ ...value, id: existing.id });
  res.json(db.prepare('SELECT * FROM vendor_directory WHERE id = ?').get(existing.id));
});

// Couples who already have this vendor keep their copy.
router.delete('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM vendor_directory WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Vendor not found' });
  db.transaction(() => {
    db.prepare('UPDATE vendors SET directory_id = NULL WHERE directory_id = ?').run(existing.id);
    db.prepare('DELETE FROM vendor_directory WHERE id = ?').run(existing.id);
  })();
  logActivity(req, { action: 'vendor_directory.deleted', entity: 'vendor_directory', entityId: existing.id,
    summary: `Removed ${existing.business_name} from the vendor directory`, detail: existing });
  res.json({ success: true });
});

// Put a directory vendor on a couple's vendor list.
router.post('/:id/assign', authenticateToken, (req, res) => {
  const d = db.prepare('SELECT * FROM vendor_directory WHERE id = ?').get(req.params.id);
  if (!d) return res.status(404).json({ error: 'Vendor not found' });
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.body.couple_id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  if (db.prepare('SELECT 1 FROM vendors WHERE couple_id = ? AND directory_id = ?').get(couple.id, d.id)) {
    return res.status(409).json({ error: `${d.business_name} is already on this couple’s vendor list` });
  }
  const r = db.prepare(`INSERT INTO vendors (couple_id, vendor_type, business_name, contact_name, phone, email, website, notes, booked, directory_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)`).run(couple.id, d.category, d.business_name, d.contact_name, d.phone, d.email, d.website, d.id);
  res.status(201).json(db.prepare('SELECT * FROM vendors WHERE id = ?').get(r.lastInsertRowid));
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
