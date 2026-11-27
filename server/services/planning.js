// Small helpers shared by the event-planning routes: clock times, calendar
// days, CSV in and out.

// Minutes after midnight for a clock time typed any of the ways people type
// them: "15:30", "3:30 PM", "3pm", "noon", "midnight". null when unreadable.
function parseTime(value) {
  if (value == null) return null;
  const s = String(value).trim().toLowerCase().replace(/\./g, '');
  if (!s) return null;
  if (s === 'noon') return 12 * 60;
  if (s === 'midnight') return 0;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap.startsWith('a')) h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23 || (!m[2] && h > 12)) {
    // "17" alone is ambiguous enough to refuse; "17:00" is fine.
    if (!m[2]) return null;
    if (h > 23) return null;
  }
  return h * 60 + min;
}

// "3:30 PM": how the venue writes times, and how existing rows are stored.
function formatTime(minutes) {
  if (minutes == null) return '';
  const h24 = Math.floor(minutes / 60) % 24;
  const min = minutes % 60;
  const ap = h24 < 12 ? 'AM' : 'PM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(min).padStart(2, '0')} ${ap}`;
}

const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

// A wedding night runs past midnight: "12:30 AM fireworks" on Saturday's list
// happens after Saturday's 11 PM, not before its 8 AM. Times before 5 AM sort
// at the end of their day, which is how a venue's day actually runs.
const NIGHT_ENDS = 5 * 60;
const dayMinutes = (t) => {
  const m = parseTime(t);
  return m == null ? null : (m < NIGHT_ENDS ? m + 24 * 60 : m);
};

// Run-of-show order: by day (undated items first, as the portal always had
// them), then clock time, then the order they were entered.
function sortRunOfShow(items) {
  return [...items].sort((a, b) => {
    const da = a.day_date || '', dbb = b.day_date || '';
    if (da !== dbb) return da < dbb ? -1 : 1;
    const ta = dayMinutes(a.time), tb = dayMinutes(b.time);
    if (ta !== tb) return (ta ?? 9999) - (tb ?? 9999);
    return (a.order_index || 0) - (b.order_index || 0) || a.id - b.id;
  });
}

// RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true; // only a field's first character opens quotes
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(f => String(f).trim() !== ''));
}

// A cell that starts with = + - @ is run as a formula by spreadsheet apps; a
// guest named "=HYPERLINK(...)" must stay text. Prefixing a quote is the usual
// defence and is invisible in Excel and Google Sheets.
function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (header, rows) => [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

function sendCsv(res, filename, header, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '-')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  // The BOM tells Excel the file is UTF-8, so accented names survive.
  res.send('﻿' + toCsv(header, rows));
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

module.exports = { parseTime, formatTime, dayMinutes, isDay, addDays, daysBetween, sortRunOfShow, parseCsv, csvCell, toCsv, sendCsv, esc };
