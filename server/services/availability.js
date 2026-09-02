const db = require('../db');

// Rustic Retreat hosts weddings June through September only.
const SEASON_MONTHS = [6, 7, 8, 9];

// Add a YYYY-MM-DD date string to a set, offset by N days.
function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Fri–Sat–Sun weekend a date belongs to. A midweek date belongs to no
// weekend and blocks only itself.
//
// The previous version of this rule offset every day by (5-dow, 6-dow, 7-dow).
// That lands on the right weekend only for a Friday or Saturday: from a Sunday
// or Monday it points at the *following* weekend, so a Sat–Mon booking marked
// the next weekend unavailable too and the inquiry form hid dates the venue
// could actually sell.
function weekendFor(dateStr) {
  const dow = new Date(dateStr + 'T00:00:00').getDay(); // 0 Sun … 6 Sat
  if (dow === 5) return [dateStr, shiftDate(dateStr, 1), shiftDate(dateStr, 2)];
  if (dow === 6) return [shiftDate(dateStr, -1), dateStr, shiftDate(dateStr, 1)];
  if (dow === 0) return [shiftDate(dateStr, -2), shiftDate(dateStr, -1), dateStr];
  return [dateStr];
}

// Every date one booking makes unavailable: each day of its span, plus the
// rest of any weekend those days fall in, because the venue hosts one wedding
// per weekend rather than one per day.
function datesForBooking(b) {
  const dates = [];
  const end = b.end_date || b.event_date;
  let cursor = b.event_date;
  let guard = 0;
  while (cursor <= end && guard < 60) {
    dates.push(...weekendFor(cursor));
    cursor = shiftDate(cursor, 1);
    guard++;
  }
  return dates;
}

// Map of unavailable date → why. One source of truth for both the public
// inquiry form and the booking guards, so the form can never advertise a date
// the booking endpoints would refuse (or the reverse).
//
// `excludeCoupleId` drops a couple's own bookings, so re-accepting a proposal,
// signing a contract, or editing a booking never collides with itself.
// `excludeBookingId` additionally drops one specific row being edited.
function unavailabilityMap({ excludeBookingId, excludeCoupleId } = {}) {
  const map = new Map();

  const bookings = db.prepare(`
    SELECT b.id, b.couple_id, b.event_date, b.end_date,
           c.partner1_name, c.partner2_name
    FROM bookings b LEFT JOIN couples c ON c.id = b.couple_id
    WHERE b.event_date IS NOT NULL
  `).all();

  for (const b of bookings) {
    if (b.id === excludeBookingId) continue;
    if (excludeCoupleId != null && b.couple_id === excludeCoupleId) continue;
    for (const date of datesForBooking(b)) {
      if (!map.has(date)) map.set(date, { type: 'booking', booking: b });
    }
  }

  for (const row of db.prepare('SELECT id, date, reason FROM blocked_dates').all()) {
    if (!map.has(row.date)) map.set(row.date, { type: 'blocked', blocked: row });
  }

  return map;
}

// Sorted list of unavailable dates — what the public inquiry form asks for.
function buildUnavailableDates(opts) {
  return [...unavailabilityMap(opts).keys()].sort();
}

// Does the requested span hit anything unavailable?
function findConflicts(event_date, end_date, opts = {}) {
  const map = unavailabilityMap(opts);
  const hits = [];
  const end = end_date || event_date;
  let cursor = event_date;
  let guard = 0;
  while (cursor <= end && guard < 60) {
    if (map.has(cursor)) hits.push({ date: cursor, ...map.get(cursor) });
    cursor = shiftDate(cursor, 1);
    guard++;
  }
  return { hits, hasConflict: hits.length > 0 };
}

// Human-readable one-liner for API errors and staff tasks.
function describeConflicts({ hits }) {
  const seen = new Set();
  const parts = [];
  for (const h of hits) {
    if (h.type === 'booking') {
      const key = 'b' + h.booking.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const names = h.booking.partner1_name
        ? `${h.booking.partner1_name} & ${h.booking.partner2_name}`
        : 'another booking';
      const span = h.booking.end_date
        ? `${h.booking.event_date}–${h.booking.end_date}`
        : h.booking.event_date;
      parts.push(`${names} (${span}, same weekend)`);
    } else {
      const key = 'd' + h.blocked.id;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(`blocked date ${h.blocked.date}${h.blocked.reason ? ` (${h.blocked.reason})` : ''}`);
    }
  }
  return parts.join(', ');
}

module.exports = {
  SEASON_MONTHS,
  shiftDate,
  unavailabilityMap,
  buildUnavailableDates,
  findConflicts,
  describeConflicts,
};
