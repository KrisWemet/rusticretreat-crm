const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');

// Admin: Get all vendors (global directory or for couple)
router.get('/', authenticateToken, (req, res) => {
  const vendors = db.prepare(`
    SELECT v.*, c.partner1_name, c.partner2_name
    FROM vendors v
    LEFT JOIN couples c ON v.couple_id = c.id
    ORDER BY v.vendor_type ASC, v.business_name ASC
  `).all();
  res.json(vendors);
});

// Admin: Get vendors for couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const vendors = db.prepare(`
    SELECT * FROM vendors WHERE couple_id = ? ORDER BY vendor_type ASC, business_name ASC
  `).all(req.params.coupleId);
  res.json(vendors);
});

// Portal: Get vendors
router.get('/portal', authenticateCouple, (req, res) => {
  const vendors = db.prepare(`
    SELECT * FROM vendors WHERE couple_id = ? ORDER BY vendor_type ASC, business_name ASC
  `).all(req.couple.coupleId);
  res.json(vendors);
});

// Portal: Add vendor
router.post('/portal', authenticateCouple, (req, res) => {
  const { vendor_type, business_name, contact_name, phone, email, website, notes, booked } = req.body;
  if (!vendor_type || !business_name) return res.status(400).json({ error: 'Vendor type and business name required' });

  const result = db.prepare(`
    INSERT INTO vendors (couple_id, vendor_type, business_name, contact_name, phone, email, website, notes, booked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.couple.coupleId, vendor_type, business_name, contact_name || null, phone || null,
    email || null, website || null, notes || null, booked ? 1 : 0);

  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(vendor);
});

// Admin: Add vendor for couple
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const { vendor_type, business_name, contact_name, phone, email, website, notes, booked } = req.body;
  if (!vendor_type || !business_name) return res.status(400).json({ error: 'Vendor type and business name required' });

  const result = db.prepare(`
    INSERT INTO vendors (couple_id, vendor_type, business_name, contact_name, phone, email, website, notes, booked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.coupleId, vendor_type, business_name, contact_name || null, phone || null,
    email || null, website || null, notes || null, booked ? 1 : 0);

  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(vendor);
});

// Update vendor
router.put('/:id', authenticateAny, (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  if (req.auth.coupleId && req.auth.coupleId !== vendor.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { vendor_type, business_name, contact_name, phone, email, website, notes, booked } = req.body;

  db.prepare(`
    UPDATE vendors SET
      vendor_type = ?, business_name = ?, contact_name = ?,
      phone = ?, email = ?, website = ?, notes = ?, booked = ?
    WHERE id = ?
  `).run(
    vendor_type || vendor.vendor_type,
    business_name || vendor.business_name,
    contact_name !== undefined ? contact_name : vendor.contact_name,
    phone !== undefined ? phone : vendor.phone,
    email !== undefined ? email : vendor.email,
    website !== undefined ? website : vendor.website,
    notes !== undefined ? notes : vendor.notes,
    booked !== undefined ? (booked ? 1 : 0) : vendor.booked,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete vendor (both admin and couple, couple limited to own vendors)
router.delete('/:id', authenticateAny, (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

  if (req.auth.coupleId && req.auth.coupleId !== vendor.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.json({ message: 'Vendor deleted' });
});

module.exports = router;
