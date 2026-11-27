// Entering couples who booked before the CRM was in use, one at a time from a
// form or many at once from a spreadsheet. Both go through importRows, so a
// row typed by hand and a row from a file are checked the same way.
//
// These couples are already booked, usually with a paper contract and money
// paid, so nothing here may treat them as new enquiries:
//   • status is booked (or completed, if the stay has ended) and the sales
//     board puts them in Booked, so no follow-up alert ever counts them;
//   • no email goes to anyone;
//   • money already paid is recorded as a paid invoice with no receipt, and any
//     balance as an unpaid invoice with NO due date — payment reminders only go
//     out for invoices with a due date, so none is sent until staff set one.
//
// A preview runs the whole import inside a transaction and rolls it back, so
// what the preview says is exactly what saving would do.

const db = require('../db');
const { assertBookable, BookingRuleError, defaultEndDate, MAX_RECEPTION_GUESTS } = require('./bookingRules');
const { albertaToday } = require('./schedule');
const { logActivity } = require('./activity');

// Column order of the downloadable template. Headers are matched loosely
// (case, spaces and punctuation ignored), with a few common alternatives.
const COLUMNS = [
  { key: 'partner1_name', header: 'Partner 1 name', aliases: ['partner 1', 'name 1', 'first partner', 'bride', 'client 1 name', 'client 1'] },
  { key: 'partner2_name', header: 'Partner 2 name', aliases: ['partner 2', 'name 2', 'second partner', 'groom', 'client 2 name', 'client 2'] },
  { key: 'email', header: 'Partner 1 email', aliases: ['email', 'email address', 'client 1 email'] },
  { key: 'partner2_email', header: 'Partner 2 email', aliases: ['client 2 email', 'second email'] },
  { key: 'phone', header: 'Phone', aliases: ['phone number', 'cell', 'mobile'] },
  { key: 'event_date', header: 'Wedding date', aliases: ['date', 'event date', 'start date', 'arrival date', 'check in', 'check-in'] },
  { key: 'end_date', header: 'Last day', aliases: ['end date', 'departure date', 'check out', 'check-out', 'last date'] },
  { key: 'package_name', header: 'Package', aliases: ['venue package', 'package name'] },
  { key: 'guest_count', header: 'Guests', aliases: ['guest count', 'number of guests', 'guest number'] },
  { key: 'total_price', header: 'Total price', aliases: ['total', 'price', 'contract total', 'amount'] },
  { key: 'amount_paid', header: 'Paid so far', aliases: ['paid', 'amount paid', 'deposit', 'deposit paid', 'payments received'] },
  { key: 'ceremony_location', header: 'Ceremony location', aliases: ['ceremony'] },
  { key: 'reception_location', header: 'Reception location', aliases: ['reception'] },
  { key: 'referral_source', header: 'How they heard about us', aliases: ['referral', 'referral source', 'source', 'heard about us'] },
  { key: 'notes', header: 'Notes', aliases: ['note', 'comments'] },
];

const squash = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const HEADER_LOOKUP = new Map();
for (const c of COLUMNS) {
  for (const name of [c.header, c.key, ...c.aliases]) HEADER_LOOKUP.set(squash(name), c.key);
}

function templateCsv() {
  return COLUMNS.map(c => c.header).join(',') + '\r\n';
}

// RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. Tab
// separated text (pasted straight from a spreadsheet) is accepted too.
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Spreadsheet text → row objects keyed by COLUMNS, each with its spreadsheet
// row number (the header is row 1). Columns that match nothing are reported
// rather than silently dropped.
function rowsFromCsv(text) {
  const table = parseCsv(text);
  if (!table.length) return { rows: [], unknownColumns: [], missingColumns: COLUMNS.slice(0, 2).map(c => c.header) };
  const header = table[0].map(h => HEADER_LOOKUP.get(squash(h)) || null);
  const unknownColumns = table[0].filter((h, i) => h.trim() && !header[i]).map(h => h.trim());
  const required = ['partner1_name', 'partner2_name', 'email', 'event_date'];
  const missingColumns = COLUMNS.filter(c => required.includes(c.key) && !header.includes(c.key)).map(c => c.header);
  const rows = [];
  table.slice(1).forEach((cells, i) => {
    if (cells.every(c => !String(c).trim())) return;
    const row = { row: i + 2 };
    header.forEach((key, j) => { if (key && cells[j] != null && String(cells[j]).trim()) row[key] = String(cells[j]).trim(); });
    rows.push(row);
  });
  return { rows, unknownColumns, missingColumns };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = n => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// Dates arrive however the spreadsheet wrote them. 2027-06-12 and "June 12,
// 2027" are unambiguous. 06/12/2027 could be June or December, so a slashed
// date is accepted only when one side is over 12; otherwise the row asks for
// the date to be written out.
function parseDate(value) {
  const v = String(value || '').trim();
  if (!v) return { date: null };
  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) {
    const date = validDate(+m[1], +m[2], +m[3]);
    return date ? { date } : { error: `"${v}" is not a real date` };
  }
  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (a > 12 && b <= 12) return validDate(y, b, a) ? { date: validDate(y, b, a) } : { error: `"${v}" is not a real date` };
    if (b > 12 && a <= 12) return validDate(y, a, b) ? { date: validDate(y, a, b) } : { error: `"${v}" is not a real date` };
    if (a === b) return validDate(y, a, b) ? { date: validDate(y, a, b) } : { error: `"${v}" is not a real date` };
    return { error: `"${v}" could be month/day or day/month. Write it as ${y}-MM-DD or like "June 12, ${y}"` };
  }
  // "June 12, 2027", "Jun 12 2027", "12 June 2027", optionally with a weekday.
  const words = v.toLowerCase().replace(/,/g, ' ').replace(/(\d)(st|nd|rd|th)\b/g, '$1').split(/\s+/)
    .filter(w => !/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/.test(w));
  const month = words.findIndex(w => MONTHS.includes(w.slice(0, 3)) && /^[a-z]+$/.test(w));
  const nums = words.filter(w => /^\d+$/.test(w)).map(Number);
  if (month !== -1 && nums.length === 2) {
    const [x, y] = nums[0] > 31 ? [nums[1], nums[0]] : [nums[0], nums[1]];
    const date = validDate(y, MONTHS.indexOf(words[month].slice(0, 3)) + 1, x);
    if (date) return { date };
  }
  return { error: `"${v}" is not a date this can read. Write it as YYYY-MM-DD, e.g. 2027-06-12` };
}

function parseMoney(value, label) {
  const v = String(value ?? '').trim();
  if (!v) return { amount: null };
  const n = Number(v.replace(/[$,\s]/g, '').replace(/^CAD/i, ''));
  if (!Number.isFinite(n) || n < 0) return { error: `${label} "${v}" is not an amount` };
  return { amount: Math.round(n * 100) / 100 };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Check one row and turn it into what will be saved. Problems that make the
// row unusable are errors; things worth a second look are warnings.
function normalise(raw, { packages }) {
  const errors = [], warnings = [];
  const s = k => (raw[k] == null ? '' : String(raw[k]).trim());

  const out = {
    partner1_name: s('partner1_name'), partner2_name: s('partner2_name'),
    email: s('email').toLowerCase(), partner2_email: s('partner2_email').toLowerCase() || null,
    phone: s('phone') || null,
    ceremony_location: s('ceremony_location') || null, reception_location: s('reception_location') || null,
    referral_source: s('referral_source') || null, notes: s('notes') || null,
  };

  if (!out.partner1_name) errors.push('Partner 1 name is missing');
  if (!out.partner2_name) errors.push('Partner 2 name is missing');
  if (!out.email) errors.push('Partner 1 email is missing');
  else if (!EMAIL.test(out.email)) errors.push(`Partner 1 email "${out.email}" does not look like an email address`);
  if (out.partner2_email && !EMAIL.test(out.partner2_email)) errors.push(`Partner 2 email "${out.partner2_email}" does not look like an email address`);
  if (out.partner2_email && out.partner2_email === out.email) {
    errors.push('Both partners have the same email. Leave Partner 2 email blank if they share one');
  }

  const start = parseDate(s('event_date'));
  if (start.error) errors.push(`Wedding date: ${start.error}`);
  else if (!start.date) errors.push('Wedding date is missing');
  out.event_date = start.date || null;

  const pkgText = s('package_name');
  const pkg = pkgText ? packages.find(p => squash(p.name) === squash(pkgText)) : null;
  out.package_name = pkg ? pkg.name : (pkgText || null);
  if (pkgText && !pkg) warnings.push(`"${pkgText}" is not one of your packages; it will be saved as written`);

  const end = parseDate(s('end_date'));
  if (end.error) errors.push(`Last day: ${end.error}`);
  out.end_date = end.date || (out.event_date ? defaultEndDate(out.event_date, out.package_name) : null);
  if (out.event_date && out.end_date && out.end_date < out.event_date) errors.push('Last day is before the wedding date');

  const guests = s('guest_count');
  if (guests) {
    const n = Number(guests.replace(/,/g, ''));
    if (!Number.isInteger(n) || n < 0) errors.push(`Guests "${guests}" is not a number`);
    else {
      out.guest_count = n;
      if (n > MAX_RECEPTION_GUESTS) warnings.push(`${n} guests is over the current ${MAX_RECEPTION_GUESTS}-guest limit`);
    }
  }
  out.guest_count = out.guest_count ?? null;

  const total = parseMoney(raw.total_price, 'Total price');
  const paid = parseMoney(raw.amount_paid, 'Paid so far');
  if (total.error) errors.push(total.error);
  if (paid.error) errors.push(paid.error);
  out.total_price = total.amount;
  out.amount_paid = paid.amount;
  if (out.total_price != null && out.amount_paid != null && out.amount_paid > out.total_price + 0.005) {
    errors.push(`Paid so far ($${out.amount_paid}) is more than the total price ($${out.total_price})`);
  }

  return { out, errors, warnings };
}

function names(c) {
  return `${c.partner1_name} & ${c.partner2_name}`;
}

// Things already in the CRM that this row may duplicate.
function duplicateChecks(out) {
  const errors = [], warnings = [];
  const byEmail = db.prepare(`SELECT id, partner1_name, partner2_name, archived_at FROM couples
                              WHERE LOWER(email) = ? OR LOWER(partner2_email) = ? LIMIT 1`);
  if (out.email) {
    const hit = byEmail.get(out.email, out.email);
    if (hit) errors.push(`${out.email} is already in the CRM for ${names(hit)}${hit.archived_at ? ' (archived)' : ''}. Add the booking from their client page instead`);
  }
  if (out.partner2_email) {
    const hit = byEmail.get(out.partner2_email, out.partner2_email);
    if (hit) warnings.push(`${out.partner2_email} is already used by ${names(hit)}`);
  }
  if (out.partner1_name && out.partner2_name) {
    const a = out.partner1_name.toLowerCase(), b = out.partner2_name.toLowerCase();
    const same = db.prepare(`SELECT id, partner1_name, partner2_name FROM couples
                             WHERE (LOWER(partner1_name) = ? AND LOWER(partner2_name) = ?)
                                OR (LOWER(partner1_name) = ? AND LOWER(partner2_name) = ?) LIMIT 1`).get(a, b, b, a);
    if (same) warnings.push(`Possible duplicate: ${names(same)} is already in the CRM`);
  }
  if (out.event_date) {
    // Often the owner blocked these dates by hand to hold the paper booking.
    const blocked = db.prepare('SELECT date FROM blocked_dates WHERE date BETWEEN ? AND ? ORDER BY date')
      .all(out.event_date, out.end_date || out.event_date).map(b => b.date);
    if (blocked.length) warnings.push(`${blocked.join(', ')} ${blocked.length > 1 ? 'are' : 'is'} blocked on the calendar. Once this booking is added you can remove the block`);
  }
  return { errors, warnings };
}

// Save one checked row. Throws BookingRuleError on a date clash; the caller
// runs it inside a savepoint so a failed row leaves nothing behind.
function saveRow(out, req) {
  assertBookable(db, { event_date: out.event_date, end_date: out.end_date, package_name: out.package_name, guest_count: null },
    // Booked under whatever rules applied at the time: only a clash with
    // another booking matters now.
    { checkPackage: false, checkBlocked: false });

  const lastDay = out.end_date || out.event_date;
  const status = lastDay < albertaToday() ? 'completed' : 'booked';

  const coupleId = db.prepare(`
    INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, phone, wedding_date, venue_package,
                         status, pipeline_stage, notes, referral_source, contacted_at, nurture_7d_sent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, datetime('now'), 1)
  `).run(out.partner1_name, out.partner2_name, out.email, out.partner2_email, out.phone, out.event_date,
    out.package_name, status, out.notes, out.referral_source).lastInsertRowid;

  const total = out.total_price || 0;
  const paid = out.amount_paid || 0;
  const bookingId = db.prepare(`
    INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count, ceremony_location,
                          reception_location, payment_status, deposit_paid, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(coupleId, out.event_date, out.end_date, out.package_name, out.guest_count, out.ceremony_location,
    out.reception_location, total && paid >= total - 0.005 ? 'paid' : paid > 0 ? 'partial' : 'pending',
    paid, total).lastInsertRowid;

  const invoice = db.prepare(`INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, paid, payment_method, notes)
                              VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`);
  if (paid > 0) {
    invoice.run(coupleId, bookingId, 'Paid before the CRM', paid, 1, 'Before the CRM',
      'Total of payments received before this booking was entered in the CRM.');
  }
  const balance = Math.round((total - paid) * 100) / 100;
  if (balance > 0) {
    invoice.run(coupleId, bookingId, 'Balance owing', balance, 0, null,
      'Entered from before the CRM. No due date yet, so no reminders are sent. Add a due date, or split it into a payment schedule.');
  }

  logActivity(req, {
    action: 'couple.imported', entity: 'couple', entityId: coupleId, coupleId,
    summary: `Added existing booking for ${names(out)} on ${out.event_date} (booked before the CRM)`,
  });
  return { couple_id: coupleId, booking_id: bookingId, status };
}

class Rollback extends Error {}

/**
 * Check and, unless dryRun, save existing bookings.
 *
 * @param rows     [{ row?, partner1_name, ... }] — row is the spreadsheet row number
 * @param options.dryRun    roll everything back afterwards (the preview)
 * @param options.exclude   row numbers the user unticked in the preview
 * @returns { results: [{ row, names, event_date, outcome: 'added'|'error'|'skipped', errors, warnings, couple_id? }], added }
 */
function importRows(rows, { req = null, dryRun = false, exclude = [] } = {}) {
  const packages = db.prepare('SELECT name FROM packages').all();
  const skip = new Set(exclude.map(Number));
  const seenEmails = new Map();
  const results = [];

  const run = db.transaction(() => {
    rows.forEach((raw, i) => {
      const rowNo = raw.row || i + 1;
      const { out, errors, warnings } = normalise(raw, { packages });
      const result = { row: rowNo, names: [out.partner1_name, out.partner2_name].filter(Boolean).join(' & '),
        event_date: out.event_date, end_date: out.end_date, package_name: out.package_name,
        total_price: out.total_price, amount_paid: out.amount_paid, errors, warnings };
      results.push(result);

      if (out.email && seenEmails.has(out.email)) {
        errors.push(`Same Partner 1 email as row ${seenEmails.get(out.email)}`);
      } else if (out.email) {
        seenEmails.set(out.email, rowNo);
        const dup = duplicateChecks(out);
        errors.push(...dup.errors);
        warnings.push(...dup.warnings);
      }

      if (errors.length) { result.outcome = 'error'; return; }
      if (skip.has(Number(rowNo))) { result.outcome = 'skipped'; return; }
      try {
        Object.assign(result, db.transaction(() => saveRow(out, req))(), { outcome: 'added' });
      } catch (err) {
        if (!(err instanceof BookingRuleError)) throw err;
        errors.push(err.message.replace('Those dates are not available: ', 'Date clash: '));
        result.outcome = 'error';
      }
    });
    if (dryRun) throw new Rollback();
  });

  try { run(); } catch (err) { if (!(err instanceof Rollback)) throw err; }
  if (dryRun) for (const r of results) { delete r.couple_id; delete r.booking_id; if (r.outcome === 'added') r.outcome = 'ready'; }
  return { results, added: results.filter(r => r.outcome === 'added').length };
}

module.exports = { importRows, rowsFromCsv, parseCsv, parseDate, templateCsv, COLUMNS };
