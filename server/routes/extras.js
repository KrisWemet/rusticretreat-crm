const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const extras = require('../services/extras');
const { stayFor, getRates } = require('../services/finalDetails');
const { addDays } = require('../services/planning');
const { albertaToday } = require('../services/schedule');
const { logActivity } = require('../services/activity');

// Extras billed to a couple after booking — propane phoned in, consumables
// counted at check-out, the linen laundry fee. Each order is its own invoice,
// one line per extra plus GST, so the signed payment schedule is untouched.

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const coupleOf = (id) => db.prepare('SELECT id, partner1_name, partner2_name FROM couples WHERE id = ?').get(id);

// When an extras invoice is due unless staff say otherwise: two weeks out, but
// no later than the Final Details deadline (7 days before check-in) while the
// stay is still ahead.
function defaultDue(stay, today = albertaToday()) {
  const twoWeeks = addDays(today, 14);
  if (!stay?.check_in || stay.check_in <= today) return twoWeeks;
  const deadline = addDays(stay.check_in, -getRates().deadline_days);
  return deadline > today && deadline < twoWeeks ? deadline : deadline <= today ? today : twoWeeks;
}

function viewFor(coupleId) {
  const stay = stayFor(coupleId);
  const invoices = db.prepare(`SELECT i.* FROM invoices i WHERE i.couple_id = ? AND EXISTS (SELECT 1 FROM invoice_items it WHERE it.invoice_id = i.id)
    ORDER BY i.created_at DESC, i.id DESC`).all(coupleId);
  const items = extras.itemsByInvoice(invoices.map(i => i.id));
  return {
    stay, gst_rate: getRates().gst_rate, default_due: defaultDue(stay),
    catalog: extras.catalog(stay?.check_in || null),
    invoices: invoices.map(i => ({ ...i, items: items[i.id] || [] })),
  };
}

router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  if (!coupleOf(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  res.json(viewFor(Number(req.params.coupleId)));
});

// Price lines without saving (for the running total while staff type).
router.post('/couple/:coupleId/quote', authenticateToken, (req, res) => {
  if (!coupleOf(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  const stay = stayFor(req.params.coupleId);
  const { lines, errors } = extras.cleanExtraLines(req.body.items, { checkIn: stay?.check_in || null });
  res.json({ ...extras.withGstLine(lines, getRates().gst_rate), errors });
});

router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  try {
    const c = coupleOf(req.params.coupleId);
    if (!c) return res.status(404).json({ error: 'Couple not found' });
    const stay = stayFor(c.id);
    const { lines, errors } = extras.cleanExtraLines(req.body.items, { checkIn: stay?.check_in || null });
    if (errors.length) return res.status(400).json({ error: errors.join('. ') });
    const due = isDay(req.body.due_date) ? req.body.due_date : defaultDue(stay);
    const priced = extras.withGstLine(lines, getRates().gst_rate);
    const booking = db.prepare('SELECT id FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(c.id);
    const description = String(req.body.description || '').trim().slice(0, 200) || 'Extras';
    const inv = extras.createItemisedInvoice({ coupleId: c.id, bookingId: booking?.id || null, description, dueDate: due,
      notes: String(req.body.notes || '').trim().slice(0, 2000) || null, lines: priced.lines });
    logActivity(req, { action: 'extras.invoiced', entity: 'invoice', entityId: inv.id, coupleId: c.id,
      summary: `Invoiced extras: ${lines.map(l => `${l.label} × ${l.quantity}`).join(', ')} — $${inv.total.toFixed(2)} incl. GST, due ${due}` });
    res.status(201).json({ invoice_id: inv.id, total: inv.total, ...viewFor(c.id) });
  } catch (err) {
    console.error('[extras]', err);
    res.status(500).json({ error: 'Could not create the extras invoice' });
  }
});

module.exports = router;
