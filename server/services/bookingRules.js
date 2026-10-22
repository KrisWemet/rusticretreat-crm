// Rustic Retreat books one wedding at a time, and every booking path — staff
// creating or editing a booking, a couple accepting a proposal online, the venue
// countersigning a contract — must agree on what "available" means. Before this
// module each path trusted its input, so two couples holding proposals for the
// same weekend could both click Accept and both be booked.
//
// The rules, from the current public offer:
//   • A booking occupies its dates and the following day, which is kept free to
//     reset the property. Owner-blocked dates occupy only themselves.
//   • 3-Day Weekend runs Friday–Sunday.
//   • 5-Day Experience runs Wednesday–Sunday, Thursday–Monday or Friday–Tuesday.
//     Staff can override either with custom dates (custom_dates = 1), which
//     skips only the weekday pattern; clashes and blocked dates still apply.
//   • The 2-Day Weekday Escape is no longer offered for new bookings.
//   • The reception is capped at 100 guests (80 included; 81–100 are overage,
//     priced on the proposal).
//
// Existing records are never rewritten. Callers validate only what is being
// created or changed, so a legacy booking that predates a rule can still be
// edited in ways that do not touch it.

const DAY_MS = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_RECEPTION_GUESTS = 100;

class BookingRuleError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.status = status;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Dates are calendar days, not instants: parse as UTC midnight so a server in
// any timezone agrees on the weekday.
function toDay(value) {
  if (!value || !ISO_DATE.test(String(value).slice(0, 10))) return null;
  const t = Date.parse(String(value).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(t) ? null : t / DAY_MS;
}

function fromDay(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function weekday(day) {
  return new Date(day * DAY_MS).getUTCDay();
}

function fmt(day) {
  const d = new Date(day * DAY_MS);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

// Package names are free text (the packages table, proposals and contracts all
// copy the name), so recognise the offer by its length in days.
function packageKind(name) {
  if (!name) return null;
  if (/\b2[-\s]?day\b/i.test(name)) return 'two_day';
  if (/\b3[-\s]?day\b/i.test(name)) return 'three_day';
  if (/\b5[-\s]?day\b/i.test(name)) return 'five_day';
  return null;
}

const PACKAGE_LENGTH = { three_day: 3, five_day: 5 };
const ALLOWED_STARTS = {
  three_day: { days: [5], label: 'Friday to Sunday' },
  five_day: { days: [3, 4, 5], label: 'Wednesday–Sunday, Thursday–Monday or Friday–Tuesday' },
};

// Last occupied day of a booking. Older rows may lack end_date; for a known
// package, assume its full length rather than a single day, so availability
// errs towards "taken".
function lastDay(start, end, kind) {
  if (end != null && end >= start) return end;
  return start + (PACKAGE_LENGTH[kind] || 1) - 1;
}

/**
 * Check a proposed booking against the venue rules.
 *
 * @param db              better-sqlite3 handle
 * @param booking         { event_date, end_date, package_name, guest_count, custom_dates }
 * @param options.excludeBookingId   the booking being edited, if any
 * @param options.excludeCoupleId    ignore this couple's own bookings (a signed
 *                                   contract updates the booking its accepted
 *                                   proposal already created)
 * @param options.checkPackage       enforce the retired-package and date-window
 *                                   rules (default true). Off when an edit does
 *                                   not touch the package or dates.
 * @param options.checkWindow        enforce the weekday pattern (default true).
 *                                   Off for contracts, whose single wedding date
 *                                   may be the ceremony day rather than arrival.
 * @throws BookingRuleError with a message staff and couples can act on
 */
function assertBookable(db, booking, options = {}) {
  const { excludeBookingId = null, excludeCoupleId = null, checkPackage = true, checkWindow = true } = options;

  const start = toDay(booking.event_date);
  if (start == null) throw new BookingRuleError('A valid start date (YYYY-MM-DD) is required.', 400);
  const rawEnd = booking.end_date ? toDay(booking.end_date) : null;
  if (booking.end_date && rawEnd == null) throw new BookingRuleError('The end date is not a valid date (YYYY-MM-DD).', 400);
  if (rawEnd != null && rawEnd < start) throw new BookingRuleError('The end date is before the start date.', 400);

  const kind = packageKind(booking.package_name);

  if (checkPackage) {
    if (kind === 'two_day') {
      throw new BookingRuleError('The 2-Day Weekday Escape is no longer offered. Choose the 3-Day Weekend or the 5-Day Experience.', 400);
    }
    const rule = ALLOWED_STARTS[kind];
    if (rule && checkWindow && !Number(booking.custom_dates)) {
      const length = PACKAGE_LENGTH[kind];
      const end = rawEnd ?? start + length - 1;
      if (!rule.days.includes(weekday(start)) || end - start + 1 !== length) {
        throw new BookingRuleError(
          `${booking.package_name} must run ${rule.label} (${length} days). ` +
          `${fmt(start)} to ${fmt(end)} does not fit. To use other days, tick "Custom dates".`, 400);
      }
    }
  }

  const guests = booking.guest_count == null || booking.guest_count === '' ? null : Number(booking.guest_count);
  if (guests != null && (!Number.isFinite(guests) || guests < 0)) {
    throw new BookingRuleError('Guest count must be a positive number.', 400);
  }
  if (guests != null && guests > MAX_RECEPTION_GUESTS) {
    throw new BookingRuleError(`The reception holds at most ${MAX_RECEPTION_GUESTS} guests.`, 400);
  }

  const end = lastDay(start, rawEnd, kind);
  // The new booking needs its own dates plus its reset day clear.
  const occupiedUntil = end + 1;

  const others = db.prepare(`
    SELECT b.id, b.event_date, b.end_date, b.package_name, b.couple_id,
           c.partner1_name, c.partner2_name
    FROM bookings b
    JOIN couples c ON c.id = b.couple_id
    WHERE c.status != 'cancelled'
      AND b.event_date IS NOT NULL
      AND (? IS NULL OR b.id != ?)
      AND (? IS NULL OR b.couple_id != ?)
  `).all(excludeBookingId, excludeBookingId, excludeCoupleId, excludeCoupleId);

  for (const other of others) {
    const oStart = toDay(other.event_date);
    if (oStart == null) continue;
    const oEnd = lastDay(oStart, toDay(other.end_date), packageKind(other.package_name));
    // Each side occupies [start, end + 1 reset day]; any shared day is a clash.
    if (start <= oEnd + 1 && oStart <= occupiedUntil) {
      const who = [other.partner1_name, other.partner2_name].filter(Boolean).join(' & ') || 'another couple';
      throw new BookingRuleError(
        `Those dates are not available: ${who} ${oStart === oEnd ? 'is booked on' : 'are booked'} ` +
        `${oStart === oEnd ? fmt(oStart) : `${fmt(oStart)} to ${fmt(oEnd)}`}, ` +
        'and the day after every wedding is kept free to reset the property.');
    }
  }

  const blocked = db.prepare('SELECT date, reason FROM blocked_dates WHERE date BETWEEN ? AND ? ORDER BY date LIMIT 1')
    .get(fromDay(start), fromDay(end));
  if (blocked) {
    throw new BookingRuleError(`Those dates are not available: ${fmt(toDay(blocked.date))} is blocked${blocked.reason ? ` (${blocked.reason})` : ''}.`);
  }
}

// Express helper: send a rule failure as JSON, rethrow anything else.
function sendRuleError(res, err) {
  if (err instanceof BookingRuleError) {
    res.status(err.status).json({ error: err.message, booking_rule: true });
    return true;
  }
  return false;
}

// The last day of a stay that only has a start date: a 3-Day Weekend runs
// three days, a 5-Day Experience five. Null for anything else.
function defaultEndDate(eventDate, packageName) {
  const start = toDay(eventDate);
  const length = PACKAGE_LENGTH[packageKind(packageName)];
  if (start == null || !length) return null;
  return fromDay(start + length - 1);
}

module.exports = { assertBookable, BookingRuleError, sendRuleError, packageKind, defaultEndDate, MAX_RECEPTION_GUESTS };
