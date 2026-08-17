#!/usr/bin/env node
/**
 * Clear the demo data and start keeping real books.
 *
 * The CRM ships seeded with sample couples, bookings, invoices and contracts so
 * every screen has something to show while you click through it. None of that
 * should still be in the database on the day you start entering real bookings —
 * the seeded couples carry fake revenue, and they would quietly land in your
 * analytics and revenue totals alongside genuine ones.
 *
 * This wipes the business records and keeps the things you configured: your
 * staff logins, and (unless you ask otherwise) the packages, add-ons, vendors
 * and form templates, which are real venue setup rather than demo filler.
 *
 *   node reset-data.js --yes                  clear bookings, keep venue setup
 *   node reset-data.js --yes --everything     clear venue setup too
 *
 * Requires --yes, so an accidental run does nothing. On a hosted deploy, set
 * DB_PATH the same way the server does or you will reset a different database
 * than the one your app is using.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const everything = args.includes('--everything');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'rusticretreat.db');

if (!confirmed) {
  console.error(`
Refusing to run without --yes.

This permanently deletes every couple, booking, invoice, payment, contract and
message in:

    ${DB_PATH}

Signed contracts are business records — take a copy of the database file before
running this if there is any chance you still need them.

    node reset-data.js --yes                  clear bookings, keep venue setup
    node reset-data.js --yes --everything     clear venue setup too
`);
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH}.`);
  console.error('Set DB_PATH to the database your server is actually using.');
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

// Ordered so children go before parents: several of these also cascade from
// couples, but the explicit order keeps the script correct even where a table
// was created without ON DELETE CASCADE.
const BOOKING_DATA = [
  'form_responses', 'form_assignments',
  'proposal_items', 'proposals',
  'timeline_events', 'checklist_items', 'budget_items', 'guests', 'documents',
  // vendors is each couple's own supplier list (couple_id NOT NULL), not the
  // venue's preferred-vendor directory — it belongs with the booking data.
  'vendors',
  'messages', 'tasks', 'tours', 'contracts', 'invoices', 'bookings',
  'blocked_dates', 'couples',
];

// Venue configuration — real setup work, not demo filler, so it survives by
// default. --everything clears it for a genuinely blank slate.
const VENUE_SETUP = ['form_fields', 'forms', 'addons', 'packages'];

const tables = everything ? [...BOOKING_DATA, ...VENUE_SETUP] : BOOKING_DATA;

const existing = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
);

let total = 0;
const wipe = db.transaction(() => {
  for (const t of tables) {
    if (!existing.has(t)) continue;
    const n = db.prepare(`DELETE FROM "${t}"`).run().changes;
    if (n > 0) console.log(`  cleared ${String(n).padStart(4)} from ${t}`);
    total += n;
  }
  // Reset AUTOINCREMENT counters so the first real booking is #1 rather than
  // continuing the demo numbering — these ids show up on invoices.
  if (existing.has('sqlite_sequence')) {
    const names = tables.map(() => '?').join(',');
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${names})`).run(...tables);
  }
});

console.log(`Resetting ${DB_PATH}`);
wipe();

const users = db.prepare('SELECT email, role FROM users ORDER BY id').all();
console.log(`\nDeleted ${total} demo record(s).`);
console.log(`Kept ${users.length} staff login(s): ${users.map(u => `${u.email} (${u.role})`).join(', ')}`);
if (!everything) {
  const kept = VENUE_SETUP.filter(t => existing.has(t))
    .map(t => `${t}=${db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c}`);
  console.log(`Kept venue setup: ${kept.join(', ')}`);
  console.log('Re-run with --everything to clear those too.');
}
console.log('\nDone. The CRM is ready for real bookings.');
db.close();
