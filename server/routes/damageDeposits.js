const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const email = require('../services/email');
const dd = require('../services/damageDeposit');
const { logActivity } = require('../services/activity');
const { albertaToday } = require('../services/schedule');
const { sendCsv } = require('../services/planning');

// The damage deposit (rental agreement Section 4.2), step by step: received at
// check-in → inspection with any deductions → refund sent (or kept). Staff
// only; nothing here emails a couple unless staff press "Email the statement".

const coupleOf = (id) => db.prepare('SELECT id, partner1_name, partner2_name, email, partner2_email FROM couples WHERE id = ?').get(id);
const names = (c) => `${c.partner1_name} & ${c.partner2_name}`;
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const who = (req) => req.user?.name || req.user?.email || 'staff';
const dayOr = (v, fallback) => (dd.isDay(v) ? v : fallback);
const method = (v) => (dd.METHODS.includes(v) ? v : 'e-Transfer');

function withCouple(handler) {
  return (req, res) => {
    try {
      const c = coupleOf(req.params.coupleId);
      if (!c) return res.status(404).json({ error: 'Couple not found' });
      return handler(req, res, c);
    } catch (err) {
      console.error('[damage-deposit]', err);
      return res.status(500).json({ error: 'Something went wrong with the damage deposit' });
    }
  };
}

// Every deposit, for the Payments page; ?format=csv for the bookkeeper.
router.get('/', authenticateToken, (req, res) => {
  const all = dd.allDeposits();
  const held = all.filter(d => d.status === 'held' || d.status === 'refund_due');
  const totals = {
    held_now: dd.r2(held.reduce((s, d) => s + (d.status === 'held' ? d.received : d.refund_due), 0)),
    held_count: held.length,
    kept: dd.r2(all.reduce((s, d) => s + d.kept, 0)),
  };
  if (req.query.format === 'csv') {
    return sendCsv(res, `damage-deposits-${albertaToday()}.csv`,
      ['Couple', 'Check-in', 'Check-out', 'Status', 'Agreed', 'Received', 'Received on', 'Method', 'Reference', 'Inspected on', 'Deductions', 'Kept by venue', 'Refunded', 'Refunded on', 'Refund reference', 'Charged beyond deposit'],
      all.map(d => [d.couple_names, d.check_in || '', d.check_out || '', d.status.replace('_', ' '), d.expected?.toFixed(2) || '',
        d.record.received_at ? d.received.toFixed(2) : '', d.record.received_at || '', d.record.received_method || '', d.record.received_reference || '',
        d.record.inspected_at || '', d.deducted.toFixed(2), d.kept.toFixed(2), d.refunded ? d.refunded.toFixed(2) : '', d.record.refunded_at || '',
        d.record.refund_reference || '', d.excess ? d.excess.toFixed(2) : '']));
  }
  res.json({ deposits: all.map(({ record, ...d }) => ({ ...d, received_at: record.received_at, refunded_at: record.refunded_at })), totals });
});

router.get('/couple/:coupleId', authenticateToken, withCouple((req, res, c) => res.json(dd.view(c.id))));

// The amount expected, before it is received (for a contract that set another).
router.put('/couple/:coupleId/amount', authenticateToken, withCouple((req, res, c) => {
  const rec = dd.ensureRecord(c.id);
  if (rec.received_at) return res.status(409).json({ error: 'The deposit has already been received. Undo that first to change the amount.' });
  const amount = dd.moneyIn(req.body.amount);
  if (!amount || amount <= 0 || amount > 100000) return res.status(400).json({ error: 'Enter the deposit amount' });
  db.prepare("UPDATE damage_deposits SET amount = ?, updated_at = datetime('now') WHERE id = ?").run(amount, rec.id);
  res.json(dd.view(c.id));
}));

// Step 1: received at check-in.
router.post('/couple/:coupleId/received', authenticateToken, withCouple((req, res, c) => {
  const rec = dd.ensureRecord(c.id);
  if (rec.received_at) return res.status(409).json({ error: 'Already recorded as received' });
  const amount = req.body.amount == null || req.body.amount === '' ? rec.amount : dd.moneyIn(req.body.amount);
  if (!amount || amount <= 0 || amount > 100000) return res.status(400).json({ error: 'Enter the amount received' });
  const day = dayOr(req.body.date, albertaToday());
  if (day > albertaToday()) return res.status(400).json({ error: 'The date received cannot be in the future' });
  const m = method(req.body.method);
  db.prepare(`UPDATE damage_deposits SET received_at = ?, received_amount = ?, received_method = ?, received_reference = ?, received_by = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(day, amount, m, String(req.body.reference || '').trim().slice(0, 200) || null, who(req), rec.id);
  logActivity(req, { action: 'damage_deposit.received', entity: 'damage_deposit', entityId: rec.id, coupleId: c.id,
    summary: `Damage deposit of ${money(amount)} received ${day} by ${m}` });
  res.json(dd.view(c.id));
}));

// Step 2: the inspection, with any deductions. Can be corrected until the
// refund is recorded.
router.post('/couple/:coupleId/inspection', authenticateToken, withCouple((req, res, c) => {
  const rec = dd.ensureRecord(c.id);
  if (rec.refunded_at) return res.status(409).json({ error: 'The refund has been recorded, so the inspection is closed.' });
  if (rec.excess_invoice_id) return res.status(409).json({ error: 'An invoice was made for charges beyond the deposit. Undo it first to change the inspection.' });
  const { deductions, errors } = dd.cleanDeductions(req.body.deductions);
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const day = dayOr(req.body.date, albertaToday());
  if (day > albertaToday()) return res.status(400).json({ error: 'The inspection date cannot be in the future' });
  const first = !rec.inspected_at;
  db.prepare(`UPDATE damage_deposits SET inspected_at = ?, inspected_by = ?, inspection_notes = ?, deductions = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(day, who(req), String(req.body.notes || '').trim().slice(0, 4000) || null, JSON.stringify(deductions), rec.id);
  const v = dd.view(c.id);
  logActivity(req, { action: first ? 'damage_deposit.inspected' : 'damage_deposit.inspection_changed', entity: 'damage_deposit', entityId: rec.id, coupleId: c.id,
    summary: `${first ? 'Recorded' : 'Changed'} the damage deposit inspection: ${deductions.length ? `${money(v.deducted)} in deductions` : 'no deductions'}; ${v.refund_due > 0 ? `${money(v.refund_due)} to refund` : 'nothing to refund'}`,
    detail: first ? null : { before: rec.deductions } });
  res.json(v);
}));

// Step 3: the refund sent. The amount is worked out, not typed.
router.post('/couple/:coupleId/refund', authenticateToken, withCouple((req, res, c) => {
  const rec = dd.recordFor(c.id);
  const v = dd.view(c.id);
  if (!rec?.inspected_at) return res.status(400).json({ error: 'Record the inspection first' });
  if (rec.refunded_at) return res.status(409).json({ error: 'The refund is already recorded' });
  if (!(v.refund_due > 0)) return res.status(400).json({ error: 'Nothing is left to refund after the deductions' });
  const day = dayOr(req.body.date, albertaToday());
  if (day > albertaToday()) return res.status(400).json({ error: 'The refund date cannot be in the future' });
  const m = method(req.body.method);
  db.prepare(`UPDATE damage_deposits SET refund_amount = ?, refunded_at = ?, refund_method = ?, refund_reference = ?, refunded_by = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(v.refund_due, day, m, String(req.body.reference || '').trim().slice(0, 200) || null, who(req), rec.id);
  logActivity(req, { action: 'damage_deposit.refunded', entity: 'damage_deposit', entityId: rec.id, coupleId: c.id,
    summary: `Damage deposit refund of ${money(v.refund_due)} sent ${day} by ${m}` });
  res.json(dd.view(c.id));
}));

// Charges beyond the deposit (say, two trees cut) become an ordinary invoice,
// once, when staff choose.
router.post('/couple/:coupleId/excess-invoice', authenticateToken, withCouple((req, res, c) => {
  const rec = dd.recordFor(c.id);
  const v = dd.view(c.id);
  if (!(v.excess > 0)) return res.status(400).json({ error: 'The deductions do not go beyond the deposit' });
  if (rec.excess_invoice_id) return res.json(v);
  const booking = db.prepare('SELECT id FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(c.id);
  const notes = [...rec.deductions.map(d => `${d.label}: ${d.description} — ${money(d.amount)}`), `Less the damage deposit received: −${money(v.received)}`].join('\n');
  db.transaction(() => {
    const id = db.prepare('INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(c.id, booking?.id || null, 'Damage charges beyond the damage deposit (Section 4.2)', v.excess, albertaToday(), notes).lastInsertRowid;
    db.prepare("UPDATE damage_deposits SET excess_invoice_id = ?, updated_at = datetime('now') WHERE id = ?").run(id, rec.id);
  })();
  logActivity(req, { action: 'damage_deposit.excess_invoiced', entity: 'damage_deposit', entityId: rec.id, coupleId: c.id,
    summary: `Invoiced ${money(v.excess)} in damage charges beyond the deposit` });
  res.json(dd.view(c.id));
}));

// Email the couple where their deposit stands. Staff press this; it is never
// sent on its own.
router.post('/couple/:coupleId/statement', authenticateToken, withCouple(async (req, res, c) => {
  try {
    const v = dd.view(c.id);
    if (!v.record?.inspected_at) return res.status(400).json({ error: 'Record the inspection first' });
    const to = [...new Set([c.email, c.partner2_email].filter(Boolean))];
    if (!to.length) return res.status(400).json({ error: 'The couple has no email address on file' });
    const r = await email.sendDepositStatement({
      to, coupleId: c.id, coupleNames: names(c), received: v.received, receivedAt: v.record.received_at,
      deductions: v.record.deductions, refund: v.record.refunded_at ? v.refunded : v.refund_due,
      refundedAt: v.record.refunded_at, refundMethod: v.record.refund_method, excess: v.excess,
    });
    if (r.delivered) db.prepare("UPDATE damage_deposits SET statement_sent_at = datetime('now') WHERE id = ?").run(v.record.id);
    logActivity(req, { action: 'damage_deposit.statement', entity: 'damage_deposit', entityId: v.record.id, coupleId: c.id,
      summary: r.delivered ? 'Emailed the couple their damage deposit statement' : `Damage deposit statement not sent: ${r.error || 'email failed'}` });
    res.json({ ...dd.view(c.id), emailed: r });
  } catch (err) {
    console.error('[damage-deposit] statement', err);
    res.status(500).json({ error: 'Could not send the statement' });
  }
}));

// Undo the latest step entered by mistake. Admin only and logged with what was
// there. An unpaid excess invoice is withdrawn; a paid one blocks the undo.
router.post('/couple/:coupleId/undo', authenticateToken, requireAdmin, withCouple((req, res, c) => {
  const rec = dd.recordFor(c.id);
  if (!rec) return res.status(400).json({ error: 'Nothing to undo' });
  let step;
  if (rec.refunded_at) {
    step = 'refund';
    db.prepare(`UPDATE damage_deposits SET refund_amount = NULL, refunded_at = NULL, refund_method = NULL, refund_reference = NULL, refunded_by = NULL, updated_at = datetime('now') WHERE id = ?`).run(rec.id);
  } else if (rec.excess_invoice_id) {
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(rec.excess_invoice_id);
    if (inv?.paid) return res.status(409).json({ error: 'The invoice for charges beyond the deposit is paid, so it cannot be undone here.' });
    step = 'excess invoice';
    db.transaction(() => {
      if (inv) db.prepare('DELETE FROM invoices WHERE id = ?').run(inv.id);
      db.prepare("UPDATE damage_deposits SET excess_invoice_id = NULL, updated_at = datetime('now') WHERE id = ?").run(rec.id);
    })();
  } else if (rec.inspected_at) {
    step = 'inspection';
    db.prepare(`UPDATE damage_deposits SET inspected_at = NULL, inspected_by = NULL, inspection_notes = NULL, deductions = '[]', updated_at = datetime('now') WHERE id = ?`).run(rec.id);
  } else if (rec.received_at) {
    step = 'received';
    db.prepare(`UPDATE damage_deposits SET received_at = NULL, received_amount = NULL, received_method = NULL, received_reference = NULL, received_by = NULL, updated_at = datetime('now') WHERE id = ?`).run(rec.id);
  } else {
    return res.status(400).json({ error: 'Nothing to undo' });
  }
  logActivity(req, { action: 'damage_deposit.undo', entity: 'damage_deposit', entityId: rec.id, coupleId: c.id,
    summary: `Undid the damage deposit ${step}${req.body?.reason ? `: ${String(req.body.reason).slice(0, 200)}` : ''}`, detail: { record: rec } });
  res.json(dd.view(c.id));
}));

module.exports = router;
