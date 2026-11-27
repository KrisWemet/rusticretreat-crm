// {placeholders} in email templates, filled from a couple's record. A known
// placeholder with nothing on file is left blank and reported, so staff see
// "no wedding date on file" before sending rather than after.

const db = require('../db');
const { ETRANSFER_EMAIL } = require('../venue');
const { defaultEndDate } = require('./bookingRules');

const PLACEHOLDERS = {
  first_names: 'Both first names, e.g. “Sarah & Jake”',
  couple_names: 'Both full names',
  partner1_name: 'Partner 1’s full name',
  partner2_name: 'Partner 2’s full name',
  wedding_date: 'Wedding (check-in) date, written out',
  check_in: 'Check-in day',
  check_out: 'Check-out day',
  package: 'Package name',
  guest_count: 'Guest count on the booking',
  total: 'Total of their invoices',
  amount_paid: 'Paid so far',
  balance_owing: 'Still owing',
  next_payment_amount: 'Next unpaid invoice amount',
  next_payment_due: 'Next unpaid invoice due date',
  etransfer_email: 'Where e-Transfers go',
  staff_name: 'Your name',
};

const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d) => (d ? new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z')) : '');
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function mergeContext(coupleId, { staffName = '' } = {}) {
  const c = db.prepare('SELECT * FROM couples WHERE id = ?').get(coupleId);
  if (!c) return null;
  const b = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(coupleId);
  const inv = db.prepare('SELECT amount, paid, due_date FROM invoices WHERE couple_id = ? ORDER BY due_date').all(coupleId);
  const total = inv.reduce((s, i) => s + (i.amount || 0), 0);
  const paid = inv.filter(i => i.paid).reduce((s, i) => s + (i.amount || 0), 0);
  const next = inv.find(i => !i.paid);
  const checkIn = b?.event_date || c.wedding_date || null;
  const checkOut = b?.end_date || (checkIn ? defaultEndDate(checkIn, b?.package_name || c.venue_package) : null) || null;
  return {
    first_names: [first(c.partner1_name), first(c.partner2_name)].filter(Boolean).join(' & '),
    couple_names: [c.partner1_name, c.partner2_name].filter(Boolean).join(' & '),
    partner1_name: c.partner1_name || '',
    partner2_name: c.partner2_name || '',
    wedding_date: day(checkIn),
    check_in: day(checkIn),
    check_out: day(checkOut),
    package: b?.package_name || c.venue_package || '',
    guest_count: b?.guest_count ? String(b.guest_count) : '',
    total: inv.length ? money(total) : '',
    amount_paid: inv.length ? money(paid) : '',
    balance_owing: inv.length ? money(Math.max(0, total - paid)) : '',
    next_payment_amount: next ? money(next.amount) : '',
    next_payment_due: next?.due_date ? day(next.due_date) : '',
    etransfer_email: ETRANSFER_EMAIL,
    staff_name: staffName || '',
  };
}

function fill(text, ctx) {
  const missing = new Set();
  const out = String(text || '').replace(/\{([a-z0-9_]+)\}/g, (whole, key) => {
    if (!(key in PLACEHOLDERS)) return whole;
    const v = ctx[key];
    if (!v) { missing.add(key); return ''; }
    return v;
  });
  return { text: out, missing: [...missing] };
}

module.exports = { PLACEHOLDERS, mergeContext, fill };
