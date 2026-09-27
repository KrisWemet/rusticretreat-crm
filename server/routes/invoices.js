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

// Mark an invoice paid/unpaid and, on the unpaid→paid transition, email a
// receipt (unless sendReceipt is false). Shared by the admin route and the
// Stripe webhook. paidAt is the day the money arrived (defaults to now).
function markInvoicePaid(invoiceId, paid, paymentMethod, { paidAt = null, reference, sendReceipt = true } = {}) {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  if (!invoice) return null;
  const wasUnpaid = !invoice.paid;
  const when = paid ? (paidAt && /^\d{4}-\d{2}-\d{2}/.test(paidAt) ? paidAt : new Date().toISOString()) : null;

  db.prepare(`UPDATE invoices SET paid = ?, paid_at = ?, payment_method = ?, payment_reference = ? WHERE id = ?`).run(
    paid ? 1 : 0,
    when,
    paid ? (paymentMethod || invoice.payment_method) : invoice.payment_method,
    paid ? (reference !== undefined ? (reference || null) : invoice.payment_reference) : invoice.payment_reference,
    invoiceId,
  );

  let receipt = null;
  if (paid && wasUnpaid && sendReceipt) {
    const couple = db.prepare('SELECT partner1_name, partner2_name, email, partner2_email FROM couples WHERE id = ?').get(invoice.couple_id);
    if (couple && couple.email) {
      const { balance } = coupleStatement(invoice.couple_id);
      receipt = email.sendPaymentReceipt({
        to: [couple.email, couple.partner2_email].filter(Boolean),
        coupleId: invoice.couple_id,
        coupleNames: `${couple.partner1_name} & ${couple.partner2_name}`,
        description: invoice.description,
        amount: invoice.amount,
        paymentMethod: paymentMethod || invoice.payment_method || 'E-Transfer',
        paidDate: new Date(when.length === 10 ? when + 'T12:00:00Z' : when).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' }),
        balance,
      });
    }
  }
  return { invoice: db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId), receipt };
}

// ── Admin: mark invoice paid / unpaid ────────────────────────────────────────
router.patch('/:id/paid', authenticateToken, async (req, res) => {
  const { paid, payment_method, paid_at, reference, send_receipt } = req.body;
  const result = markInvoicePaid(req.params.id, paid, payment_method,
    { paidAt: paid_at, reference, sendReceipt: send_receipt !== false });
  if (!result) return res.status(404).json({ error: 'Invoice not found' });
  const updated = result.invoice;
  const receipt = result.receipt ? await result.receipt : null;
  logActivity(req, { action: paid ? 'invoice.paid' : 'invoice.unpaid', entity: 'invoice', entityId: updated.id, coupleId: updated.couple_id,
    summary: `Marked "${updated.description}" ($${updated.amount}) ${paid ? `paid${updated.payment_method ? ` by ${updated.payment_method}` : ''}${updated.payment_reference ? ` (ref ${updated.payment_reference})` : ''}` : 'unpaid'}` });
  res.json({ ...updated, receipt_sent: receipt ? !!receipt.delivered : null, receipt_error: receipt && !receipt.delivered ? receipt.error : null });
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
  const after = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  const changed = ['description', 'amount', 'due_date'].filter(k => String(invoice[k] ?? '') !== String(after[k] ?? ''));
  if (changed.length) {
    logActivity(req, { action: 'invoice.updated', entity: 'invoice', entityId: invoice.id, coupleId: invoice.couple_id,
      summary: `Changed ${changed.join(', ')} on "${after.description}"`,
      detail: Object.fromEntries(changed.map(k => [k, { from: invoice[k], to: after[k] }])) });
  }
  res.json(after);
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

// ── Admin: email a payment reminder now ─────────────────────────────────────
router.post('/:id/remind', authenticateToken, async (req, res) => {
  const inv = db.prepare(`SELECT i.*, c.email, c.partner2_email, c.partner1_name, c.partner2_name
                          FROM invoices i JOIN couples c ON c.id = i.couple_id WHERE i.id = ?`).get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.paid) return res.status(400).json({ error: 'This invoice is already paid' });
  if (!inv.email && !inv.partner2_email) return res.status(400).json({ error: 'No email address on file for this couple' });
  const today = require('../services/schedule').albertaToday();
  const days = inv.due_date ? Math.round((new Date(inv.due_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000) : 0;
  const r = await email.sendPaymentReminder({
    to: [inv.email, inv.partner2_email].filter(Boolean),
    coupleId: inv.couple_id,
    coupleNames: `${inv.partner1_name} & ${inv.partner2_name}`,
    description: inv.description,
    amount: inv.amount,
    dueDate: inv.due_date ? new Date(inv.due_date + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'now',
    daysUntilDue: days,
  });
  if (!r.delivered) return res.status(502).json({ error: `The reminder did not send: ${r.error}` });
  logActivity(req, { action: 'invoice.reminded', entity: 'invoice', entityId: inv.id, coupleId: inv.couple_id,
    summary: `Emailed a reminder for "${inv.description}"` });
  res.json({ sent: true });
});

// ── Admin: printable statement for a couple ─────────────────────────────────
router.get('/couple/:coupleId/statement/print', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const rows = db.prepare('SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date IS NULL, due_date, id').all(couple.id);
  const st = coupleStatement(couple.id);
  const { ETRANSFER_EMAIL } = require('../venue');
  const esc = email.esc;
  const money = n => '$' + Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const day = d => d ? new Date(String(d).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—';
  const today = require('../services/schedule').albertaToday();
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Statement — ${esc(couple.partner1_name)} &amp; ${esc(couple.partner2_name)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1e293b;max-width:760px;margin:40px auto;padding:0 20px}
h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;font-size:14px}
th{font-size:12px;text-transform:uppercase;color:#64748b}td.r,th.r{text-align:right}.muted{color:#64748b;font-size:13px}.tot td{font-weight:600;border-bottom:none}
@media print{.noprint{display:none}}</style></head><body>
<p class="noprint"><button onclick="window.print()">Print</button></p>
<h1>Rustic Retreat — Payment statement</h1>
<p class="muted">${esc(couple.partner1_name)} &amp; ${esc(couple.partner2_name)} · ${esc(couple.email || '')}<br>As of ${day(today)}</p>
<table><thead><tr><th>Payment</th><th>Due</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.description)}</td><td>${day(r.due_date)}</td><td>${r.paid ? `Paid ${day(r.paid_at)}${r.payment_method ? ` · ${esc(r.payment_method)}` : ''}` : (r.due_date && r.due_date < today ? '<strong style="color:#dc2626">Overdue</strong>' : 'Due')}</td><td class="r">${money(r.amount)}</td></tr>`).join('')}
</tbody><tfoot><tr class="tot"><td colspan="3">Total</td><td class="r">${money(st.total)}</td></tr>
<tr class="tot"><td colspan="3">Paid</td><td class="r">${money(st.paid)}</td></tr>
<tr class="tot"><td colspan="3">Balance owing</td><td class="r">${money(st.balance)}</td></tr></tfoot></table>
<p class="muted">Amounts in CAD and include 5% GST. To pay, send an Interac e-Transfer to ${esc(ETRANSFER_EMAIL)} with your names and the payment in the message.</p>
</body></html>`);
});

module.exports = router;
module.exports.markInvoicePaid = markInvoicePaid;
module.exports.coupleStatement = coupleStatement;
