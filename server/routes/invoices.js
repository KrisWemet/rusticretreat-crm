const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildPaymentSchedule, normaliseCustomSchedule } = require('../services/paymentSchedule');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
const email = require('../services/email');

// Totals across a couple's invoices: contracted, paid, and outstanding balance.
function coupleStatement(coupleId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COALESCE(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 0) AS paid
    FROM invoices WHERE couple_id = ?
  `).get(coupleId);
  return { total: row.total, paid: row.paid, balance: row.total - row.paid };
}

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

// Mark an invoice paid/unpaid and email a receipt on the unpaid→paid transition.
// Shared by the admin route and the Stripe webhook.
function markInvoicePaid(invoiceId, paid, paymentMethod) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const wasUnpaid = !invoice.paid;

  db.prepare(`UPDATE invoices SET paid = ?, paid_at = ?, payment_method = ? WHERE id = ?`).run(
    paid ? 1 : 0,
    paid ? new Date().toISOString() : null,
    paymentMethod || invoice.payment_method,
    invoiceId,
  );

  if (paid && wasUnpaid) {
    const couple = db.prepare('SELECT partner1_name, partner2_name, email, partner2_email FROM couples WHERE id = ?').get(invoice.couple_id);
    if (couple && couple.email) {
      const { balance } = coupleStatement(invoice.couple_id);
      email.sendPaymentReceipt({
        to: [couple.email, couple.partner2_email].filter(Boolean),
        coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
        description: invoice.description,
        amount: invoice.amount,
        paymentMethod: paymentMethod || invoice.payment_method || 'E-Transfer',
        paidDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        balance,
      });
    }
  }
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
}

// ── Admin: mark invoice paid / unpaid ────────────────────────────────────────
router.patch('/:id/paid', authenticateToken, (req, res) => {
  const { paid, payment_method } = req.body;
  const updated = markInvoicePaid(req.params.id, paid, payment_method);
  if (!updated) return res.status(404).json({ error: 'Invoice not found' });
  logActivity(req, { action: paid ? 'invoice.paid' : 'invoice.unpaid', entity: 'invoice', entityId: updated.id, coupleId: updated.couple_id,
    summary: `Marked "${updated.description}" ($${updated.amount}) ${paid ? 'paid' : 'unpaid'}` });
  res.json(updated);
});

// ── Admin: running-balance statement for a couple ────────────────────────────
router.get('/couple/:coupleId/statement', authenticateToken, (req, res) => {
  res.json(coupleStatement(req.params.coupleId));
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
// A paid invoice is the record of money received, so it cannot be deleted —
// mark it unpaid first if it really was entered by mistake. Every deletion is
// logged with what was removed.
router.delete('/:id', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.paid) {
    return res.status(409).json({ error: 'This invoice is marked paid. Mark it unpaid first if it was recorded by mistake.' });
  }
  db.prepare('DELETE FROM invoices WHERE id = ?').run(invoice.id);
  logActivity(req, { action: 'invoice.deleted', entity: 'invoice', entityId: invoice.id, coupleId: invoice.couple_id,
    summary: `Deleted invoice "${invoice.description}" ($${invoice.amount})`, detail: invoice });
  res.json({ success: true });
});

// ── Admin: the standard schedule for a total and check-in, without saving ─────
// The Payments page shows it so staff can adjust it (e.g. split the deposit).
router.post('/schedule-preview', authenticateToken, (req, res) => {
  const { total_price, wedding_date } = req.body;
  if (!total_price || total_price <= 0) return res.status(400).json({ error: 'total_price required' });
  res.json(buildPaymentSchedule({ total: Number(total_price), checkIn: wedding_date || null }));
});

// ── Admin: replace a couple's unpaid invoices with a payment schedule ─────────
// Without `items` this is the standard agreement schedule; with `items` it is
// the plan staff agreed with the couple, which must cover what is still owed.
router.post('/schedule/:coupleId', authenticateToken, (req, res) => {
  const { booking_id, total_price, wedding_date, items: custom } = req.body;
  if (!total_price || total_price <= 0) {
    return res.status(400).json({ error: 'total_price required' });
  }

  let items;
  if (custom !== undefined) {
    // Paid invoices are kept, so the new plan only has to cover what's left.
    const { paid } = coupleStatement(req.params.coupleId);
    try { items = normaliseCustomSchedule(custom, total_price, paid); }
    catch (err) { return res.status(400).json({ error: err.message }); }
  } else {
    // Same instalments and dates as Section 4 of the signed agreement.
    items = buildPaymentSchedule({ total: Number(total_price), checkIn: wedding_date })
      .map(p => ({ description: p.label, amount: p.amount, due_date: p.due_date }));
  }

  // One transaction, so a failure never leaves the couple with no invoices.
  const replace = db.transaction(() => {
    db.prepare(`DELETE FROM invoices WHERE couple_id = ? AND paid = 0`).run(req.params.coupleId);
    return items.map(item => {
      const r = db.prepare(`
        INSERT INTO invoices (couple_id, booking_id, description, amount, due_date)
        VALUES (?, ?, ?, ?, ?)
      `).run(req.params.coupleId, booking_id || null, item.description, item.amount, item.due_date);
      return db.prepare('SELECT * FROM invoices WHERE id = ?').get(r.lastInsertRowid);
    });
  });

  const created = replace();
  logActivity(req, { action: 'invoice.schedule', entity: 'couple', entityId: Number(req.params.coupleId), coupleId: Number(req.params.coupleId),
    summary: `Replaced unpaid invoices with a ${custom !== undefined ? 'custom' : 'standard'} schedule of ${created.length} payment${created.length === 1 ? '' : 's'} (total $${total_price})` });
  res.status(201).json(created);
});

module.exports = router;
module.exports.markInvoicePaid = markInvoicePaid;
module.exports.coupleStatement = coupleStatement;
