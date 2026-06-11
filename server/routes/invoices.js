const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple } = require('../middleware/auth');

// ── Admin: get all invoices ──────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, c.partner1_name, c.partner2_name, c.email AS couple_email
    FROM invoices i JOIN couples c ON c.id = i.couple_id
    ORDER BY i.due_date ASC, i.created_at DESC
  `).all();
  res.json(rows);
});

// ── Admin: get invoices for a couple ─────────────────────────────────────────
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date ASC, created_at DESC
  `).all(req.params.coupleId);
  res.json(rows);
});

// ── Admin: create invoice ────────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const { couple_id, booking_id, description, amount, due_date, notes } = req.body;
  if (!couple_id || !description || amount == null) {
    return res.status(400).json({ error: 'couple_id, description, and amount are required' });
  }
  const result = db.prepare(`
    INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(couple_id, booking_id || null, description, amount, due_date || null, notes || null);
  res.status(201).json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(result.lastInsertRowid));
});

// ── Admin: mark invoice paid / unpaid ────────────────────────────────────────
router.patch('/:id/paid', authenticateToken, (req, res) => {
  const { paid, payment_method } = req.body;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  db.prepare(`
    UPDATE invoices SET paid = ?, paid_at = ?, payment_method = ? WHERE id = ?
  `).run(
    paid ? 1 : 0,
    paid ? new Date().toISOString() : null,
    payment_method || invoice.payment_method,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

// ── Admin: update invoice ────────────────────────────────────────────────────
router.put('/:id', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { description, amount, due_date, notes } = req.body;
  db.prepare(`
    UPDATE invoices SET description = ?, amount = ?, due_date = ?, notes = ? WHERE id = ?
  `).run(
    description ?? invoice.description,
    amount ?? invoice.amount,
    due_date !== undefined ? due_date : invoice.due_date,
    notes !== undefined ? notes : invoice.notes,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
});

// ── Admin: delete invoice ────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Admin: auto-create standard payment schedule from booking total ───────────
router.post('/schedule/:coupleId', authenticateToken, (req, res) => {
  const { booking_id, total_price, wedding_date } = req.body;
  if (!total_price || total_price <= 0) {
    return res.status(400).json({ error: 'total_price required' });
  }

  // Delete existing unpaid invoices for this couple first
  db.prepare(`DELETE FROM invoices WHERE couple_id = ? AND paid = 0`).run(req.params.coupleId);

  const deposit      = Math.round(total_price * 0.25 * 100) / 100;
  const midPayment   = Math.round(total_price * 0.25 * 100) / 100;
  const finalPayment = Math.round((total_price - deposit - midPayment) * 100) / 100;

  const wDate = wedding_date ? new Date(wedding_date) : null;
  const midDate   = wDate ? new Date(wDate.getTime() - 90 * 86400000).toISOString().slice(0, 10) : null;
  const finalDate = wDate ? new Date(wDate.getTime() - 30 * 86400000).toISOString().slice(0, 10) : null;

  const items = [
    { description: 'Booking Deposit (25%)',        amount: deposit,      due_date: null },
    { description: 'Second Payment (25%) — 90 days before event', amount: midPayment,   due_date: midDate },
    { description: 'Final Balance (50%) — 30 days before event',  amount: finalPayment, due_date: finalDate },
  ];

  const inserted = items.map(item => {
    const r = db.prepare(`
      INSERT INTO invoices (couple_id, booking_id, description, amount, due_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.params.coupleId, booking_id || null, item.description, item.amount, item.due_date);
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(r.lastInsertRowid);
  });

  res.status(201).json(inserted);
});

// ── Portal: couple's own invoices ────────────────────────────────────────────
router.get('/portal/mine', authenticateCouple, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date ASC, created_at DESC
  `).all(req.couple.coupleId);
  res.json(rows);
});

module.exports = router;
