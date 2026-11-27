const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const email = require('../services/email');
const fd = require('../services/finalDetails');
const extras = require('../services/extras');
const { logActivity } = require('../services/activity');
const { albertaToday } = require('../services/schedule');

// The Final Details Form (rental agreement Section 2.3). Staff send the couple
// a private link (or fill it in for them), the couple submits, the counts lock,
// and the venue reviews it and creates the overage invoice.

const LINK_DAYS = 120;
const baseUrl = () => (process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
const linkFor = (token) => (token ? `${baseUrl()}/final-details/${token}` : null);
const coupleOf = (id) => db.prepare('SELECT id, partner1_name, partner2_name, email, partner2_email FROM couples WHERE id = ?').get(id);
const names = (c) => `${c.partner1_name} & ${c.partner2_name}`;
const staffView = (coupleId) => {
  const v = fd.view(coupleId);
  const rec = v.record;
  const invoice = rec?.invoice_id ? db.prepare('SELECT id, amount, due_date, paid FROM invoices WHERE id = ?').get(rec.invoice_id) || null : null;
  return { ...v, link: linkFor(rec?.access_token), invoice };
};

// Submitting is the same whether the couple or staff do it: priced on the
// server, frozen, and locked. The transaction refuses a second submission.
function submit(rec, value, { by, name, ip, ua }) {
  const v = fd.view(rec.couple_id, rec);
  const quote = fd.compute(value, { rates: v.rates, nights: v.nights });
  if (quote.errors.length) return { error: quote.errors.join(' ') };
  const frozen = { ...quote, rates: v.rates, submitted_on: albertaToday() };
  const ok = db.prepare(`UPDATE final_details SET guests = ?, campers = ?, tents = ?, rvs = ?, rv_over_30ft = ?, extras = ?, notes = ?,
      quote = ?, submitted_at = datetime('now'), submitted_name = ?, submitted_by = ?, submitted_ip = ?, submitted_user_agent = ?,
      updated_at = datetime('now')
    WHERE id = ? AND submitted_at IS NULL`).run(value.guests, value.campers, value.tents, value.rvs, value.rv_over_30ft,
    JSON.stringify(value.extras), value.notes, JSON.stringify(frozen), name, by, ip || null, ua || null, rec.id).changes;
  if (!ok) return { locked: true };
  return { quote: frozen };
}

// ── Staff ────────────────────────────────────────────────────────────────────
router.get('/rates', authenticateToken, (req, res) => res.json({ rates: fd.getRates(), defaults: fd.DEFAULT_RATES, labels: fd.RATE_LABELS }));

router.put('/rates', authenticateToken, requireAdmin, (req, res) => {
  try {
    const before = fd.getRates();
    const rates = fd.setRates(req.body || {});
    logActivity(req, { action: 'final_details.rates_changed', entity: 'settings', summary: 'Changed the Final Details Form rates', detail: { before, after: rates } });
    res.json({ rates });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  if (!coupleOf(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  res.json(staffView(req.params.coupleId));
});

// Create (or renew) the couple's private link, and email it to both partners
// if asked. Renewing replaces the old link.
router.post('/couple/:coupleId/link', authenticateToken, async (req, res) => {
  try {
    const c = coupleOf(req.params.coupleId);
    if (!c) return res.status(404).json({ error: 'Couple not found' });
    const rec = fd.ensureRecord(c.id);
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare(`UPDATE final_details SET access_token = ?, token_expires_at = datetime('now', ?), updated_at = datetime('now') WHERE id = ?`)
      .run(token, `+${LINK_DAYS} days`, rec.id);
    let emailed = null;
    if (req.body?.send_email) {
      const to = [...new Set([c.email, c.partner2_email].filter(Boolean))];
      emailed = await email.sendFinalDetailsLink({ to, coupleId: c.id, coupleNames: names(c), url: linkFor(token), deadline: fd.view(c.id).deadline });
      if (emailed.delivered) db.prepare(`UPDATE final_details SET link_sent_at = datetime('now') WHERE id = ?`).run(rec.id);
    }
    logActivity(req, { action: 'final_details.link', entity: 'final_details', entityId: rec.id, coupleId: c.id,
      summary: emailed?.delivered ? 'Emailed the Final Details Form link' : 'Created a Final Details Form link' });
    res.json({ ...staffView(c.id), emailed });
  } catch (err) {
    res.status(500).json({ error: 'Could not create the link' });
  }
});

// A price for counts staff are typing in (taken by phone); nothing is saved.
router.post('/couple/:coupleId/quote', authenticateToken, (req, res) => {
  if (!coupleOf(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  const v = fd.view(req.params.coupleId);
  const { value } = fd.cleanInput(req.body, { offered: v.offered });
  res.json(fd.compute(value, { rates: v.rates, nights: v.nights }));
});

// Staff edit before submission: the number of nights, or counts taken by phone.
router.put('/couple/:coupleId', authenticateToken, (req, res) => {
  const c = coupleOf(req.params.coupleId);
  if (!c) return res.status(404).json({ error: 'Couple not found' });
  const rec = fd.ensureRecord(c.id);
  if (rec.submitted_at) return res.status(409).json({ error: 'This form has been submitted and is locked. An admin can unlock it if it must change.' });
  const { value, errors } = fd.cleanInput({ ...rec, ...req.body }, { coupleId: c.id });
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  let nights = rec.nights;
  if (req.body.nights !== undefined) {
    const n = Number(req.body.nights);
    if (!Number.isInteger(n) || n < 1 || n > 30) return res.status(400).json({ error: 'Nights must be a whole number from 1 to 30' });
    nights = n;
  }
  db.prepare(`UPDATE final_details SET nights = ?, guests = ?, campers = ?, tents = ?, rvs = ?, rv_over_30ft = ?, extras = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(nights, value.guests, value.campers, value.tents, value.rvs, value.rv_over_30ft, JSON.stringify(value.extras), value.notes, rec.id);
  res.json(staffView(c.id));
});

// Staff submit on the couple's behalf (for a form taken over the phone). The
// name of whoever confirmed the counts is recorded, as the couple's would be.
router.post('/couple/:coupleId/submit', authenticateToken, (req, res) => {
  const c = coupleOf(req.params.coupleId);
  if (!c) return res.status(404).json({ error: 'Couple not found' });
  const rec = fd.ensureRecord(c.id);
  if (rec.submitted_at) return res.status(409).json({ error: 'Already submitted' });
  const confirmedBy = String(req.body.confirmed_by || '').trim();
  if (!confirmedBy) return res.status(400).json({ error: 'Enter who confirmed these counts' });
  const { value, errors } = fd.cleanInput(req.body, { coupleId: c.id, require: true });
  if (errors.length) return res.status(400).json({ error: errors.join('. ') });
  const r = submit(rec, value, { by: `staff (${req.user?.name || 'staff'})`, name: confirmedBy, ip: req.ip, ua: req.get('user-agent') });
  if (r.error) return res.status(400).json({ error: r.error });
  if (r.locked) return res.status(409).json({ error: 'Already submitted' });
  logActivity(req, { action: 'final_details.submitted', entity: 'final_details', entityId: rec.id, coupleId: c.id,
    summary: `Submitted the Final Details Form for ${names(c)} (confirmed by ${confirmedBy}); overages ${r.quote.total.toFixed(2)}` });
  res.json(staffView(c.id));
});

// The venue reviews the submission and, if anything is owed, creates the
// overage invoice — due on the form's deadline (today if that has passed).
router.post('/couple/:coupleId/approve', authenticateToken, (req, res) => {
  const c = coupleOf(req.params.coupleId);
  if (!c) return res.status(404).json({ error: 'Couple not found' });
  const rec = fd.recordFor(c.id);
  if (!rec?.submitted_at) return res.status(400).json({ error: 'The form has not been submitted yet' });
  if (rec.reviewed_at) return res.json(staffView(c.id));
  const v = fd.view(c.id, rec);
  const q = rec.quote;
  const today = albertaToday();
  const due = v.deadline && v.deadline > today ? v.deadline : today;
  const booking = db.prepare('SELECT id FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(c.id);
  db.transaction(() => {
    let invoiceId = null;
    if (q.total > 0) {
      // One invoice line per overage or extra, then GST, so the couple sees
      // exactly what they are paying for.
      const lines = [
        ...q.lines.map(l => ({ label: l.label, quantity: 1, unit_price: l.amount, amount: l.amount })),
        ...(q.gst > 0 ? [{ label: `GST ${q.gst_rate}%`, quantity: 1, unit_price: q.gst, amount: q.gst, kind: 'gst' }] : []),
      ];
      invoiceId = extras.createItemisedInvoice({ coupleId: c.id, bookingId: booking?.id || null, description: 'Final Details overages (Section 2.3)',
        dueDate: due, notes: 'Overage fees are non-refundable regardless of final counts.', lines }).id;
    }
    db.prepare(`UPDATE final_details SET reviewed_at = datetime('now'), reviewed_by = ?, invoice_id = ? WHERE id = ?`)
      .run(req.user?.name || 'staff', invoiceId, rec.id);
  })();
  logActivity(req, { action: 'final_details.approved', entity: 'final_details', entityId: rec.id, coupleId: c.id,
    summary: q.total > 0 ? `Approved the Final Details Form; overage invoice $${q.total.toFixed(2)} due ${due}` : 'Approved the Final Details Form; nothing owing' });
  res.json(staffView(c.id));
});

// The agreement says submitted counts cannot be revised, but a venue can still
// choose to reopen one (a typo, a mistake it agrees to fix). Admin only, logged,
// and refused once the overage invoice is paid; an unpaid one is withdrawn.
router.post('/couple/:coupleId/unlock', authenticateToken, requireAdmin, (req, res) => {
  const c = coupleOf(req.params.coupleId);
  if (!c) return res.status(404).json({ error: 'Couple not found' });
  const rec = fd.recordFor(c.id);
  if (!rec?.submitted_at) return res.status(400).json({ error: 'The form is not locked' });
  const invoice = rec.invoice_id ? db.prepare('SELECT * FROM invoices WHERE id = ?').get(rec.invoice_id) : null;
  if (invoice?.paid) return res.status(409).json({ error: 'The overage invoice is already paid, so the form cannot be reopened. Record any change as a new invoice instead.' });
  db.transaction(() => {
    if (invoice) db.prepare('DELETE FROM invoices WHERE id = ?').run(invoice.id);
    db.prepare(`UPDATE final_details SET submitted_at = NULL, submitted_name = NULL, submitted_by = NULL, quote = NULL,
      reviewed_at = NULL, reviewed_by = NULL, invoice_id = NULL, updated_at = datetime('now') WHERE id = ?`).run(rec.id);
  })();
  logActivity(req, { action: 'final_details.unlocked', entity: 'final_details', entityId: rec.id, coupleId: c.id,
    summary: `Reopened the Final Details Form${invoice ? ' and withdrew its unpaid overage invoice' : ''}${req.body?.reason ? `: ${String(req.body.reason).slice(0, 200)}` : ''}`,
    detail: { record: rec, invoice } });
  res.json(staffView(c.id));
});

// ── Public: the couple's private link ────────────────────────────────────────
const publicLimit = rateLimit({ windowMs: 900000, max: 120, name: 'final-details-public' });
const submitLimit = rateLimit({ windowMs: 900000, max: 10, name: 'final-details-submit' });

function publicView(rec) {
  const c = coupleOf(rec.couple_id);
  const v = fd.view(rec.couple_id, rec);
  const r = v.rates;
  return {
    couple: { partner1_name: c.partner1_name, partner2_name: c.partner2_name },
    stay: v.stay, nights: v.nights, deadline: v.deadline, overdue: v.overdue,
    rates: { included_guests: r.included_guests, guest_fee: r.guest_fee, max_guests: r.max_guests, included_campers: r.included_campers,
      included_tents: r.included_tents, tent_fee_per_night: r.tent_fee_per_night, included_rvs: r.included_rvs,
      rv_fee_per_night: r.rv_fee_per_night, max_rvs: r.max_rvs, tents_per_extra_rv: r.tents_per_extra_rv, gst_rate: r.gst_rate },
    offered: v.offered.map(a => ({ id: a.id, name: a.name, description: a.description, price: a.price, unit: a.unit, unit_label: a.unit_label || null })),
    values: { guests: rec.guests, campers: rec.campers, tents: rec.tents, rvs: rec.rvs, rv_over_30ft: rec.rv_over_30ft, notes: rec.notes,
      extras: rec.extras.map(e => ({ addon_id: e.addon_id, quantity: e.quantity, name: e.name })) },
    quote: v.quote,
    submitted: rec.submitted_at ? { at: rec.submitted_at, name: rec.submitted_name } : null,
  };
}

const NOT_FOUND = 'This link has expired or is no longer valid. Please ask Rustic Retreat for a new one.';

router.get('/public/:token', publicLimit, (req, res) => {
  const rec = fd.recordForToken(req.params.token);
  if (!rec) return res.status(404).json({ error: NOT_FOUND });
  res.json(publicView(rec));
});

// A price for what is typed so far; nothing is saved.
router.post('/public/:token/quote', publicLimit, (req, res) => {
  const rec = fd.recordForToken(req.params.token);
  if (!rec) return res.status(404).json({ error: NOT_FOUND });
  if (rec.submitted_at) return res.json(rec.quote);
  const v = fd.view(rec.couple_id, rec);
  const { value } = fd.cleanInput(req.body, { offered: v.offered });
  res.json(fd.compute(value, { rates: v.rates, nights: v.nights }));
});

router.post('/public/:token/submit', submitLimit, async (req, res) => {
  try {
    const rec = fd.recordForToken(req.params.token);
    if (!rec) return res.status(404).json({ error: NOT_FOUND });
    if (rec.submitted_at) return res.status(409).json({ error: 'This form has already been submitted and is locked. Contact Rustic Retreat if something is wrong.' });
    const name = String(req.body.signer_name || '').trim();
    if (!name) return res.status(400).json({ error: 'Type your full name to submit' });
    if (req.body.agreed !== true) return res.status(400).json({ error: 'Please confirm you understand the counts are final once submitted' });
    const { value, errors } = fd.cleanInput(req.body, { coupleId: rec.couple_id, require: true });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const r = submit(rec, value, { by: 'couple', name, ip: req.ip, ua: req.get('user-agent') });
    if (r.error) return res.status(400).json({ error: r.error });
    if (r.locked) return res.status(409).json({ error: 'This form has already been submitted and is locked.' });
    const c = coupleOf(rec.couple_id);
    logActivity(null, { action: 'final_details.submitted', entity: 'final_details', entityId: rec.id, coupleId: c.id,
      summary: `${name} submitted the Final Details Form; overages $${r.quote.total.toFixed(2)}` });
    // A failed courtesy email must not undo a submission already recorded.
    Promise.resolve(email.sendFinalDetailsSubmittedAdmin({ coupleId: c.id, coupleNames: names(c), total: r.quote.total })).catch(() => {});
    res.json(publicView(fd.recordFor(rec.couple_id)));
  } catch (err) {
    res.status(500).json({ error: 'Something went wrong saving the form. Please try again.' });
  }
});

module.exports = router;
