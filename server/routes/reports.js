const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { sendCsv } = require('../services/planning');
const { albertaToday } = require('../services/schedule');
const { defaultEndDate } = require('../services/bookingRules');

// Reports for the books and for the business, each also as a CSV for a
// spreadsheet or the accountant. Totals in this CRM include 5% GST (the
// venue's rule), so the GST inside an amount is 5/105 of it.

const GST_SHARE = 5 / 105;
const r2 = (n) => Math.round(n * 100) / 100;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
// paid_at is a plain day when staff record it, or a UTC timestamp from a card
// payment; either way the day that counts is Alberta's.
const paidDay = (v) => (!v ? null : (String(v).length === 10 ? v : albertaToday(new Date(String(v).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z')))));
const names = (r) => `${r.partner1_name} & ${r.partner2_name}`;

function range(req) {
  const today = albertaToday();
  const from = isDay(req.query.from) ? req.query.from : `${today.slice(0, 4)}-01-01`;
  const to = isDay(req.query.to) ? req.query.to : today;
  return { from, to };
}

// Money received in a date range, with the GST inside it, by month too.
router.get('/payments', authenticateToken, (req, res) => {
  const { from, to } = range(req);
  const rows = db.prepare(`SELECT i.id, i.description, i.amount, i.paid_at, i.payment_method, i.payment_reference, c.id AS couple_id, c.partner1_name, c.partner2_name
    FROM invoices i JOIN couples c ON c.id = i.couple_id WHERE i.paid = 1`).all()
    .map(r => ({ ...r, day: paidDay(r.paid_at) }))
    .filter(r => r.day && r.day >= from && r.day <= to)
    .sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id)
    .map(r => ({ date: r.day, couple_id: r.couple_id, couple: names(r), description: r.description, method: r.payment_method || '',
      reference: r.payment_reference || '', amount: r2(r.amount), gst: r2(r.amount * GST_SHARE) }));
  const months = {};
  for (const r of rows) { const m = r.date.slice(0, 7); months[m] = months[m] || { month: m, amount: 0, gst: 0, count: 0 }; months[m].amount += r.amount; months[m].gst += r.gst; months[m].count++; }
  const total = r2(rows.reduce((s, r) => s + r.amount, 0));
  if (req.query.format === 'csv') {
    return sendCsv(res, `payments-${from}-to-${to}.csv`, ['Date', 'Couple', 'Description', 'Method', 'Reference', 'Amount', 'GST included'],
      rows.map(r => [r.date, r.couple, r.description, r.method, r.reference, r.amount.toFixed(2), r.gst.toFixed(2)]));
  }
  res.json({ from, to, rows, total, gst: r2(total * GST_SHARE), by_month: Object.values(months).map(m => ({ ...m, amount: r2(m.amount), gst: r2(m.gst) })) });
});

// Everything still owed, oldest first, grouped by how late it is.
router.get('/outstanding', authenticateToken, (req, res) => {
  const today = albertaToday();
  const bucket = (due) => {
    if (!due || due >= today) return 'Not yet due';
    const late = Math.round((Date.parse(today) - Date.parse(due)) / 86400000);
    return late <= 30 ? '1–30 days late' : late <= 60 ? '31–60 days late' : late <= 90 ? '61–90 days late' : 'Over 90 days late';
  };
  const rows = db.prepare(`SELECT i.id, i.description, i.amount, i.due_date, c.id AS couple_id, c.partner1_name, c.partner2_name, c.email
    FROM invoices i JOIN couples c ON c.id = i.couple_id
    WHERE i.paid = 0 AND c.status != 'cancelled' AND c.archived_at IS NULL
    ORDER BY (i.due_date IS NULL), i.due_date, i.id`).all()
    .map(r => ({ couple_id: r.couple_id, couple: names(r), email: r.email, description: r.description, due_date: r.due_date || '',
      amount: r2(r.amount), status: bucket(r.due_date) }));
  const order = ['Over 90 days late', '61–90 days late', '31–60 days late', '1–30 days late', 'Not yet due'];
  const buckets = order.map(b => ({ bucket: b, amount: r2(rows.filter(r => r.status === b).reduce((s, r) => s + r.amount, 0)), count: rows.filter(r => r.status === b).length }));
  if (req.query.format === 'csv') {
    return sendCsv(res, `outstanding-${today}.csv`, ['Couple', 'Email', 'Description', 'Due', 'Status', 'Amount'],
      rows.map(r => [r.couple, r.email, r.description, r.due_date, r.status, r.amount.toFixed(2)]));
  }
  res.json({ as_of: today, rows, buckets, total: r2(rows.reduce((s, r) => s + r.amount, 0)) });
});

// Weddings in a year: dates, package, guests, and where the money stands.
router.get('/bookings', authenticateToken, (req, res) => {
  const year = /^\d{4}$/.test(req.query.year || '') ? req.query.year : albertaToday().slice(0, 4);
  const rows = db.prepare(`SELECT b.id, b.event_date, b.end_date, b.package_name, b.guest_count, b.total_price,
      c.id AS couple_id, c.partner1_name, c.partner2_name, c.status, c.referral_source,
      (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE couple_id = c.id) AS invoiced,
      (SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE couple_id = c.id AND paid = 1) AS paid
    FROM bookings b JOIN couples c ON c.id = b.couple_id
    WHERE substr(b.event_date, 1, 4) = ? AND c.archived_at IS NULL ORDER BY b.event_date`).all(year)
    .map(r => ({ couple_id: r.couple_id, couple: names(r), check_in: r.event_date,
      check_out: r.end_date || defaultEndDate(r.event_date, r.package_name) || r.event_date, package: r.package_name || '',
      guests: r.guest_count || '', status: r.status, source: r.referral_source || '', total: r2(r.total_price || 0),
      invoiced: r2(r.invoiced), paid: r2(r.paid), balance: r2(Math.max(0, r.invoiced - r.paid)) }));
  const live = rows.filter(r => r.status !== 'cancelled');
  if (req.query.format === 'csv') {
    return sendCsv(res, `bookings-${year}.csv`, ['Couple', 'Check-in', 'Check-out', 'Package', 'Guests', 'Status', 'Heard about us', 'Booking total', 'Invoiced', 'Paid', 'Balance'],
      rows.map(r => [r.couple, r.check_in, r.check_out, r.package, r.guests, r.status, r.source, r.total.toFixed(2), r.invoiced.toFixed(2), r.paid.toFixed(2), r.balance.toFixed(2)]));
  }
  res.json({ year, rows, count: live.length, booked_value: r2(live.reduce((s, r) => s + r.total, 0)),
    paid: r2(live.reduce((s, r) => s + r.paid, 0)), balance: r2(live.reduce((s, r) => s + r.balance, 0)) });
});

// Enquiries in a date range by where they heard about the venue, and how many booked.
router.get('/leads', authenticateToken, (req, res) => {
  const { from, to } = range(req);
  const rows = db.prepare(`SELECT c.id, c.partner1_name, c.partner2_name, c.email, c.status, c.pipeline_stage, c.referral_source, c.created_at, c.wedding_date,
      (SELECT COALESCE(SUM(total_price), 0) FROM bookings WHERE couple_id = c.id) AS value
    FROM couples c`).all()
    .map(r => ({ ...r, day: paidDay(r.created_at) }))
    .filter(r => r.day && r.day >= from && r.day <= to)
    .map(r => ({ couple_id: r.id, couple: names(r), email: r.email, enquired: r.day, source: r.referral_source || 'Not recorded',
      status: r.status, outcome: ['booked', 'completed'].includes(r.status) ? 'Won' : (r.status === 'cancelled' || r.pipeline_stage === 'lost') ? 'Lost' : 'Open',
      wedding_date: r.wedding_date || '', value: r2(r.value) }))
    .sort((a, b) => a.enquired.localeCompare(b.enquired));
  const bySource = {};
  for (const r of rows) {
    const s = bySource[r.source] = bySource[r.source] || { source: r.source, leads: 0, won: 0, lost: 0, open: 0, value: 0 };
    s.leads++; s[r.outcome.toLowerCase()]++; if (r.outcome === 'Won') s.value += r.value;
  }
  const sources = Object.values(bySource).map(s => ({ ...s, value: r2(s.value), conversion: s.leads ? Math.round((s.won / s.leads) * 100) : 0 }))
    .sort((a, b) => b.leads - a.leads);
  if (req.query.format === 'csv') {
    return sendCsv(res, `leads-${from}-to-${to}.csv`, ['Enquired', 'Couple', 'Email', 'Heard about us', 'Status', 'Outcome', 'Wedding date', 'Booked value'],
      rows.map(r => [r.enquired, r.couple, r.email, r.source, r.status, r.outcome, r.wedding_date, r.value.toFixed(2)]));
  }
  const won = rows.filter(r => r.outcome === 'Won').length;
  res.json({ from, to, rows, sources, total: rows.length, won, conversion: rows.length ? Math.round((won / rows.length) * 100) : 0 });
});

// Every couple's contact details, for a mailing list or an accountant.
router.get('/couples.csv', authenticateToken, (req, res) => {
  const rows = db.prepare(`SELECT * FROM couples ${req.query.archived === '1' ? '' : 'WHERE archived_at IS NULL'} ORDER BY created_at`).all();
  sendCsv(res, `couples-${albertaToday()}.csv`,
    ['Partner 1', 'Partner 1 email', 'Partner 1 phone', 'Partner 2', 'Partner 2 email', 'Partner 2 phone', 'Wedding date', 'Package', 'Status', 'Heard about us', 'Added'],
    rows.map(c => [c.partner1_name, c.email, c.phone, c.partner2_name, c.partner2_email, c.partner2_phone, c.wedding_date, c.venue_package, c.status, c.referral_source, paidDay(c.created_at)]));
});

module.exports = router;
