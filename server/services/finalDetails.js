// The Final Details Form, as Section 2.3 of the rental agreement describes it:
// final guest, overnight-camper, tent and RV counts plus extras, submitted 7
// days before check-in, locked at submission, reviewed by the venue, and any
// overage invoiced and payable by the same date.
//
// The rates default to the agreement's own table and can be changed in
// Settings. Prices are worked out here only — the public page asks the server
// for every quote — so the couple and the venue always see the same figure.

const db = require('../db');
const { defaultEndDate } = require('./bookingRules');
const { addDays, daysBetween } = require('./planning');
const { albertaToday } = require('./schedule');

// Rental agreement 2027, Section 2.3 "Guest Capacity & Overage Fees".
const DEFAULT_RATES = {
  included_guests: 80,      // ceremony & reception
  guest_fee: 25,            // per guest above the included number
  max_guests: 100,          // hard cap, anyone on the property at once
  included_campers: 60,     // overnight guests; no per-person fee
  included_tents: 12,
  tent_fee_per_night: 25,
  included_rvs: 8,
  rv_fee_per_night: 35,
  max_rvs: 15,
  tents_per_extra_rv: 3,    // unused tent slots that become one more included RV
  gst_rate: 5,              // percent, added to overages (package prices are before GST)
  deadline_days: 7,         // before check-in
};
const RATE_LABELS = {
  included_guests: 'Guests included', guest_fee: 'Fee per extra guest ($)', max_guests: 'Most guests allowed',
  included_campers: 'Overnight campers included', included_tents: 'Tents included',
  tent_fee_per_night: 'Fee per extra tent, per night ($)', included_rvs: 'RVs included',
  rv_fee_per_night: 'Fee per extra RV, per night ($)', max_rvs: 'Most RVs allowed',
  tents_per_extra_rv: 'Unused tent slots per extra RV', gst_rate: 'GST on overages (%)',
  deadline_days: 'Due this many days before check-in',
};

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `$${Number(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function getRates() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'final_details_rates'").get();
  let saved = {};
  try { saved = row ? JSON.parse(row.value) : {}; } catch { saved = {}; }
  const out = { ...DEFAULT_RATES };
  for (const k of Object.keys(DEFAULT_RATES)) if (Number.isFinite(Number(saved[k]))) out[k] = Number(saved[k]);
  return out;
}

function setRates(input) {
  const next = getRates();
  for (const [k, v] of Object.entries(input || {})) {
    if (!(k in DEFAULT_RATES)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw new Error(`${RATE_LABELS[k]} must be a number of 0 or more`);
    next[k] = /fee|rate/.test(k) ? round2(n) : Math.round(n);
  }
  if (next.tents_per_extra_rv < 1) throw new Error('Unused tent slots per extra RV must be at least 1');
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('final_details_rates', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(next));
  return next;
}

// The stay the form is for: the latest booking, else the couple's wedding date.
function stayFor(coupleId) {
  const couple = db.prepare('SELECT wedding_date, venue_package FROM couples WHERE id = ?').get(coupleId);
  if (!couple) return null;
  const b = db.prepare('SELECT event_date, end_date, package_name FROM bookings WHERE couple_id = ? ORDER BY event_date DESC, id DESC').get(coupleId);
  const checkIn = b?.event_date || couple.wedding_date || null;
  const pkg = b?.package_name || couple.venue_package || null;
  const checkOut = b?.end_date || (checkIn ? defaultEndDate(checkIn, pkg) : null) || null;
  const nights = checkIn && checkOut && checkOut > checkIn ? daysBetween(checkIn, checkOut) : null;
  return { check_in: checkIn, check_out: checkOut, package_name: pkg, nights };
}

const deadlineFor = (checkIn, rates = getRates()) => (checkIn ? addDays(checkIn, -rates.deadline_days) : null);

// Extras the couple may choose: active add-ons marked for the form.
function offeredExtras() {
  return db.prepare(`SELECT id, name, description, price, unit FROM addons
    WHERE is_active = 1 AND COALESCE(on_final_form, 1) = 1 ORDER BY name COLLATE NOCASE`).all();
}

const COUNT_FIELDS = ['guests', 'campers', 'tents', 'rvs'];

// Reads what was typed. `require` makes every count mandatory (for submitting).
function cleanInput(body = {}, { offered = offeredExtras(), require = false } = {}) {
  const value = {}, errors = [];
  for (const f of COUNT_FIELDS) {
    const raw = body[f];
    if (raw === '' || raw == null) {
      value[f] = null;
      if (require) errors.push(`Enter the number of ${f === 'rvs' ? 'RVs' : f === 'campers' ? 'overnight campers' : f} (0 if none)`);
      continue;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 10000) { errors.push(`The number of ${f === 'rvs' ? 'RVs' : f} must be a whole number of 0 or more`); value[f] = null; continue; }
    value[f] = n;
  }
  value.rv_over_30ft = body.rv_over_30ft ? 1 : 0;
  value.notes = body.notes ? String(body.notes).slice(0, 4000) : null;
  const byId = new Map(offered.map(a => [a.id, a]));
  value.extras = [];
  for (const e of Array.isArray(body.extras) ? body.extras : []) {
    const a = byId.get(Number(e.addon_id));
    const q = Number(e.quantity);
    if (!a || !Number.isInteger(q) || q <= 0) continue;
    if (q > 1000) { errors.push(`${a.name}: at most 1,000`); continue; }
    value.extras.push({ addon_id: a.id, name: a.name, unit: a.unit, unit_price: Number(a.price), quantity: q });
  }
  return { value, errors };
}

// Price a set of counts. Hard caps come back as errors; things the venue must
// approve or the couple should know come back as notes.
function compute(v, { rates = getRates(), nights } = {}) {
  const n = nights && nights > 0 ? nights : 1;
  const lines = [], errors = [], notes = [];
  const g = v.guests ?? 0, c = v.campers ?? 0, t = v.tents ?? 0, r = v.rvs ?? 0;
  if (g > rates.max_guests) errors.push(`The property holds at most ${rates.max_guests} guests.`);
  if (c > rates.max_guests) errors.push(`At most ${rates.max_guests} people can stay overnight.`);
  if (r > rates.max_rvs) errors.push(`At most ${rates.max_rvs} RVs fit on the property.`);

  const extraGuests = Math.max(0, g - rates.included_guests);
  if (extraGuests) {
    lines.push({ label: `${plural(extraGuests, 'guest')} over ${rates.included_guests} × ${money(rates.guest_fee)}`, amount: round2(extraGuests * rates.guest_fee) });
    notes.push(`More than ${rates.included_guests} guests needs the venue's written approval, and seating is sized for ${rates.included_guests} (Section 2.3).`);
  }
  const unusedTents = Math.max(0, rates.included_tents - t);
  const convertedRvs = Math.floor(unusedTents / rates.tents_per_extra_rv);
  const includedRvs = rates.included_rvs + convertedRvs;
  const extraTents = Math.max(0, t - rates.included_tents);
  if (extraTents) {
    lines.push({ label: `${plural(extraTents, 'extra tent')} × ${plural(n, 'night')} × ${money(rates.tent_fee_per_night)}`, amount: round2(extraTents * n * rates.tent_fee_per_night) });
  }
  const extraRvs = Math.max(0, r - includedRvs);
  if (extraRvs) {
    lines.push({ label: `${plural(extraRvs, 'extra RV')} × ${plural(n, 'night')} × ${money(rates.rv_fee_per_night)}`, amount: round2(extraRvs * n * rates.rv_fee_per_night) });
  }
  if (c > rates.included_campers) notes.push(`${c} overnight campers is more than the ${rates.included_campers} included; there is no per-person fee, but tents and RVs are charged as above.`);
  if (v.rv_over_30ft) notes.push('RVs over 30 feet must use the alternate exit route (Schedule A, Sections 3 and 4).');
  for (const e of v.extras || []) {
    lines.push({ label: `${e.name} × ${e.quantity}`, amount: round2(e.unit_price * e.quantity) });
  }
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const gst = round2(subtotal * rates.gst_rate / 100);
  return {
    lines, subtotal, gst, gst_rate: rates.gst_rate, total: round2(subtotal + gst), nights: n,
    allowance: { guests: rates.included_guests, campers: rates.included_campers, tents: rates.included_tents,
      rvs: includedRvs, converted_rvs: convertedRvs },
    errors, notes,
  };
}

const parse = (row) => row && ({
  ...row,
  extras: JSON.parse(row.extras || '[]'),
  quote: row.quote ? JSON.parse(row.quote) : null,
  rv_over_30ft: !!row.rv_over_30ft,
});

const recordFor = (coupleId) => parse(db.prepare('SELECT * FROM final_details WHERE couple_id = ?').get(coupleId));
const recordForToken = (token) => (/^[a-f0-9]{48}$/.test(String(token || ''))
  ? parse(db.prepare("SELECT * FROM final_details WHERE access_token = ? AND (token_expires_at IS NULL OR token_expires_at > datetime('now'))").get(token))
  : null);

function ensureRecord(coupleId) {
  let rec = recordFor(coupleId);
  if (!rec) {
    db.prepare('INSERT INTO final_details (couple_id, nights) VALUES (?, ?)').run(coupleId, stayFor(coupleId)?.nights || null);
    rec = recordFor(coupleId);
  }
  return rec;
}

// Everything a screen needs: the record, the stay, the deadline, the rates,
// the extras on offer, and the price — frozen once submitted, live before.
function view(coupleId, rec = recordFor(coupleId)) {
  const rates = getRates();
  const stay = stayFor(coupleId);
  const nights = rec?.nights || stay?.nights || null;
  const quote = rec?.submitted_at && rec.quote ? rec.quote : compute(rec || {}, { rates, nights });
  const deadline = deadlineFor(stay?.check_in, rates);
  return {
    record: rec || null, stay, nights, rates, deadline,
    overdue: !!(deadline && !rec?.submitted_at && deadline < albertaToday()),
    offered: offeredExtras(), quote,
  };
}

module.exports = {
  DEFAULT_RATES, RATE_LABELS, getRates, setRates, stayFor, deadlineFor, offeredExtras,
  cleanInput, compute, recordFor, recordForToken, ensureRecord, view, COUNT_FIELDS,
};
