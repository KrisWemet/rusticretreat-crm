// "Mark as done" for something staff handled outside the CRM — a phone call,
// a text, an email from their own inbox. Staff may say what they did and which
// day they did it; both are optional.
const { albertaToday } = require('./schedule');

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Reads { note, done_on } from a request body. Returns { error } or
// { note, doneOn, at } where `at` is the timestamp to store (UTC, SQLite
// format). A past day is stored at noon Alberta time so it shows as that day.
function readDone(body = {}) {
  const today = albertaToday();
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null;
  const doneOn = body.done_on ? String(body.done_on) : today;
  if (!DAY.test(doneOn) || Number.isNaN(Date.parse(doneOn))) return { error: 'The date it was done is not a valid date' };
  if (doneOn > today) return { error: 'The date it was done cannot be in the future' };
  const at = doneOn === today
    ? new Date().toISOString().slice(0, 19).replace('T', ' ')
    : `${doneOn} 18:00:00`;
  return { note, doneOn, at, today };
}

// " — called them (on Oct 9)" for the activity history.
function describeDone({ note, doneOn, today }) {
  const when = doneOn === today ? '' : ` on ${new Date(doneOn + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return `${note ? ` — ${note}` : ''}${when ? ` (done${when})` : ''}`;
}

module.exports = { readDone, describeDone };
