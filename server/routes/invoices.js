const express = require('express');
const router = express.Router();
const db = require('../db');
const { buildPaymentSchedule, normaliseCustomSchedule } = require('../services/paymentSchedule');
const { authenticateToken } = require('../middleware/auth');
const ledger = require('../services/ledger');
const { logActivity } = require('../services/activity');
const email = require('../services/email');

// Totals across a couple's invoices: contracted, paid, and outstanding balance.
function coupleStatement(coupleId) {
  return ledger.statement(coupleId);
}

// ── Admin: get all invoices ──────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT i.*, c.partner1_name, c.partner2_name, c.email AS couple_email
    FROM invoices i JOIN couples c ON c.id = i.couple_id
    ORDER BY i.due_date ASC, i.created_at DESC
  `).all();
  res.json(rows.map(ledger.invoiceView));
});

// ── Admin: get invoices for a couple ─────────────────────────────────────────
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date ASC, created_at DESC
  `).all(req.params.coupleId);
  res.json(rows.map(ledger.invoiceView));
});

// ── Admin: create invoice ────────────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const { couple_id, booking_id, description, amount, due_date, notes } = req.body;
  if (!couple_id || !description || amount == null) {
    return res.status(400).json({ error: 'couple_id, description, and amount are required' });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'Invoice amount must be above $0. Use a recorded refund for money returned.' });
  if (!db.prepare('SELECT id FROM couples WHERE id = ?').get(couple_id)) return res.status(404).json({ error: 'Couple not found' });
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
  const invoice = ledger.invoiceView(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId));
  if (!invoice) return null;
  const wasUnpaid = !invoice.paid;
  const when = paidAt || new Date().toISOString();
  if (paid && invoice.balance > 0) {
    ledger.record(invoice.id, { amount: invoice.balance, received_at: when.slice(0,10), method: paymentMethod,
      reference, idempotency_key: `settle:${invoice.id}:${invoice.amount_paid}` });
  }

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
        amount: invoice.balance,
        paymentMethod: paymentMethod || invoice.payment_method || 'E-Transfer',
        paidDate: new Date(when.length === 10 ? when + 'T12:00:00Z' : when).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Edmonton' }),
        balance,
      });
    }
  }
  return { invoice: ledger.invoiceView(db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId)), receipt };
}

// ── Admin: mark invoice paid / unpaid ────────────────────────────────────────
router.patch('/:id/paid', authenticateToken, async (req, res) => {
  const { paid, payment_method, paid_at, reference, send_receipt } = req.body;
  if (!paid) return res.status(409).json({ error: 'Payment history is kept. Record a refund or reversal with a reason instead.' });
  let result;
  try { result = markInvoicePaid(req.params.id, paid, payment_method,
    { paidAt: paid_at, reference, sendReceipt: send_receipt !== false }); }
  catch (err) { return res.status(err.status || 400).json({ error: err.message }); }
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
  const view = ledger.invoiceView(invoice);
  if (view.has_payments && ((amount !== undefined && Number(amount) !== Number(invoice.amount)) ||
      (description !== undefined && description !== invoice.description))) {
    return res.status(409).json({ error: 'This invoice has payment history. Its amount and description are protected; record a refund or create a separate adjustment.' });
  }
  if (amount !== undefined && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) return res.status(400).json({ error: 'Amount must be above $0' });
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
  res.json(ledger.invoiceView(after));
});

// ── Admin: delete invoice ────────────────────────────────────────────────────
// A paid invoice is the record of money received, so it cannot be deleted —
// record a reversal if it was entered by mistake. Invoices with history stay
// in the ledger; deleting a draft obligation is logged.
router.delete('/:id', authenticateToken, (req, res) => {
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (ledger.invoiceView(invoice).has_payments) {
    return res.status(409).json({ error: 'This invoice has payment history and cannot be deleted. Record a refund or reversal instead.' });
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
  if (!Number.isFinite(Number(total_price)) || Number(total_price) <= 0) return res.status(400).json({ error: 'total_price required' });
  res.json(buildPaymentSchedule({ total: Number(total_price), checkIn: wedding_date || null }));
});

// ── Admin: replace a couple's unpaid invoices with a payment schedule ─────────
// Without `items` this is the standard agreement schedule; with `items` it is
// the plan staff agreed with the couple, which must cover what is still owed.
router.post('/schedule/:coupleId', authenticateToken, (req, res) => {
  const { booking_id, total_price, wedding_date, items: custom } = req.body;
  if (!Number.isFinite(Number(total_price)) || Number(total_price) <= 0) {
    return res.status(400).json({ error: 'total_price required' });
  }

  const existing = db.prepare('SELECT * FROM invoices WHERE couple_id = ?').all(req.params.coupleId).map(ledger.invoiceView);
  const protectedTotal = ledger.money(existing.filter(i => i.has_payments).reduce((n,i) => n + ledger.cents(i.amount), 0));
  if (Number(total_price) < protectedTotal) return res.status(400).json({ error: 'The total cannot be below invoices with payment history' });
  let items;
  if (custom !== undefined) {
    // Paid invoices are kept, so the new plan only has to cover what's left.
    try { items = custom.length === 0 && Number(total_price) === protectedTotal ? [] : normaliseCustomSchedule(custom, total_price, protectedTotal); }
    catch (err) { return res.status(400).json({ error: err.message }); }
  } else {
    // Same instalments and dates as Section 4 of the signed agreement.
    let allocated = ledger.cents(protectedTotal);
    items = buildPaymentSchedule({ total: Number(total_price), checkIn: wedding_date }).map(p => {
      const deduction = Math.min(allocated, ledger.cents(p.amount));
      allocated -= deduction;
      return { description: p.label, amount: ledger.money(ledger.cents(p.amount) - deduction), due_date: p.due_date };
    }).filter(p => p.amount > 0);
  }

  // One transaction, so a failure never leaves the couple with no invoices.
  const replace = db.transaction(() => {
    db.prepare(`DELETE FROM invoices WHERE couple_id = ? AND NOT EXISTS (SELECT 1 FROM payment_entries pe WHERE pe.invoice_id = invoices.id)`).run(req.params.coupleId);
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
  if (ledger.invoiceView(inv).paid) return res.status(400).json({ error: 'This invoice is already paid' });
  if (!inv.email && !inv.partner2_email) return res.status(400).json({ error: 'No email address on file for this couple' });
  const today = require('../services/schedule').albertaToday();
  const days = inv.due_date ? Math.round((new Date(inv.due_date + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000) : 0;
  const r = await email.sendPaymentReminder({
    to: [inv.email, inv.partner2_email].filter(Boolean),
    coupleId: inv.couple_id,
    coupleNames: `${inv.partner1_name} & ${inv.partner2_name}`,
    description: inv.description,
    amount: ledger.invoiceView(inv).balance,
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
  const rows = db.prepare('SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date IS NULL, due_date, id').all(couple.id).map(ledger.invoiceView);
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
<p class="muted">${esc(couple.partner1_name)} &amp; ${esc(couple.partner2_name)} · ${esc(couple.email?.startsWith('phone:') ? '' : couple.email || '')}<br>As of ${day(today)}</p>
<table><thead><tr><th>Payment</th><th>Due</th><th>Status</th><th class="r">Amount / received / owing</th></tr></thead><tbody>
${rows.map(r => `<tr><td>${esc(r.description)}</td><td>${day(r.due_date)}</td><td>${r.paid ? `Paid ${day(r.paid_at)}${r.payment_method ? ` · ${esc(r.payment_method)}` : ''}` : (r.due_date && r.due_date < today ? '<strong style="color:#dc2626">Overdue</strong>' : 'Due')}</td><td class="r">${money(r.amount)} / ${money(r.amount_paid)} / ${money(r.balance)}</td></tr>`).join('')}
</tbody><tfoot><tr class="tot"><td colspan="3">Total</td><td class="r">${money(st.total)}</td></tr>
<tr class="tot"><td colspan="3">Paid</td><td class="r">${money(st.paid)}</td></tr>
<tr class="tot"><td colspan="3">Balance owing</td><td class="r">${money(st.balance)}</td></tr></tfoot></table>
<p class="muted">Amounts in CAD and include 5% GST. To pay, send an Interac e-Transfer to ${esc(ETRANSFER_EMAIL)} with your names and the payment in the message.</p>
</body></html>`);
});

router.post('/:id/reallocate',authenticateToken,require('../middleware/auth').requireAdmin,(req,res)=>{
 try{const amount=ledger.cents(req.body.amount),target=Number(req.body.target_invoice_id),reason=String(req.body.reason||'').trim(),key=req.body.idempotency_key;
 if(!Number.isSafeInteger(amount)||amount<=0||target===Number(req.params.id)||!reason||!key)throw new Error('Choose another invoice, a positive amount and a reason');
 const result=db.transaction(()=>{const source=ledger.invoiceView(db.prepare('SELECT * FROM invoices WHERE id=?').get(req.params.id)),dest=ledger.invoiceView(db.prepare('SELECT * FROM invoices WHERE id=?').get(target));
 if(!source||!dest||source.couple_id!==dest.couple_id)throw new Error('Both invoices must belong to the same couple');
 const a=ledger.record(source.id,{amount:-ledger.money(amount),kind:'reversal',reason,reference:`Allocation to invoice ${target}`,idempotency_key:key+':out'},req.user.userId);
 const b=ledger.record(dest.id,{amount:ledger.money(amount),reason,reference:`Allocation from invoice ${source.id}`,idempotency_key:key+':in'},req.user.userId);
 logActivity(req,{action:'payment.reallocated',entity:'invoice',entityId:source.id,coupleId:source.couple_id,summary:`Moved $${ledger.money(amount)} received to invoice ${target}`,detail:{reason,source:a.entry.id,target:b.entry.id}});return{source:a.invoice,target:b.invoice}})();res.json(result);
 }catch(e){res.status(e.status||400).json({error:e.message})}
});

router.get('/:id/payments', authenticateToken, (req, res) => {
  const invoice = ledger.invoiceView(db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id));
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ invoice, entries: db.prepare('SELECT * FROM payment_entries WHERE invoice_id = ? ORDER BY id DESC').all(invoice.id)
    .map(e => ({ ...e, amount: ledger.money(e.amount_cents) })) });
});
router.post('/:id/payments', authenticateToken, async (req, res) => {
  try {
    if (Number(req.body.amount) < 0 && req.user.role !== 'admin') return res.status(403).json({ error: 'Only an admin can record a refund or reversal' });
    const result = ledger.record(Number(req.params.id), req.body, req.user.userId);
    if (!result.duplicate) logActivity(req, { action: `payment.${result.entry.kind}`, entity: 'invoice', entityId: result.invoice.id,
      coupleId: result.invoice.couple_id, summary: `Recorded ${result.entry.kind} of $${ledger.money(result.entry.amount_cents).toFixed(2)}`,
      detail: result.entry });
    let receipt = null;
    if (!result.duplicate && result.entry.amount_cents > 0 && req.body.send_receipt === true) {
      const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(result.invoice.couple_id);
      receipt = await email.sendPaymentReceipt({ to: [couple.email, couple.partner2_email].filter(Boolean), coupleId: couple.id,
        coupleNames: [couple.partner1_name, couple.partner2_name].filter(Boolean).join(' & '), description: result.invoice.description,
        amount: ledger.money(result.entry.amount_cents), paymentMethod: result.entry.method, paidDate: result.entry.received_at, balance: ledger.statement(couple.id).balance });
    }
    res.status(result.duplicate ? 200 : 201).json({ ...result, receipt_sent: receipt ? !!receipt.delivered : null, receipt_error: receipt && !receipt.delivered ? receipt.error : null });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});

module.exports = router;
module.exports.markInvoicePaid = markInvoicePaid;
module.exports.coupleStatement = coupleStatement;
