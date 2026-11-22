// The private calendar feed (iCalendar) and the Reports page's data and CSVs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-feed-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-feed';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test';

const express = require('express');
const jwt = require('jsonwebtoken');
let db, server, base;
const admin = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Kris', role: 'admin' }, process.env.JWT_SECRET);
const staffOnly = 'Bearer ' + jwt.sign({ userId: 2, email: 's@test', name: 'Sam', role: 'staff' }, process.env.JWT_SECRET);

test.before(async () => {
  db = require('../db');
  for (const t of ['tasks', 'tours', 'invoices', 'bookings', 'contracts', 'proposals', 'couples', 'blocked_dates']) db.prepare(`DELETE FROM ${t}`).run();
  const app = express();
  app.use(express.json());
  app.use('/api/calendar', require('../routes/calendar'));
  app.use('/api/reports', require('../routes/reports'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, auth = admin) {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  const bytes = Buffer.from(await res.arrayBuffer());
  const text = bytes.toString('utf8');
  let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json, text, bytes, headers: res.headers };
}
const couple = (f = {}) => {
  const v = { partner1_name: 'Sarah Larsson', partner2_name: 'Jake Novak', email: `c${Math.random()}@test.invalid`, status: 'booked', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};

test('iCalendar helpers: Alberta wall time to UTC, folding, escaping', () => {
  const { albertaToUtc, fold, text } = require('../services/icsFeed');
  const utc = albertaToUtc('2027-07-04T14:30');
  // Read back in Alberta time rather than assuming an offset (tzdata changes).
  const back = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(utc);
  assert.equal(back.replace(',', ''), '2027-07-04 14:30');
  const winter = albertaToUtc('2027-01-15T09:00');
  assert.equal(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(winter), '09:00');
  const long = 'SUMMARY:' + 'Wedding: Émilie & Zoë — '.repeat(6);
  const folded = fold(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, 'every line within 75 octets');
  assert.equal(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join(''), long, 'unfolds to the original');
  assert.equal(text('a, b; c\nd\\e'), 'a\\, b\\; c\\nd\\\\e');
});

test('calendar feed: off until an admin turns it on, private by address, and a new address retires the old', async () => {
  assert.equal((await call('GET', '/api/calendar/feed/whatever.ics', null, null)).status, 404);
  assert.equal((await call('POST', '/api/calendar/feed-settings', { action: 'enable' }, staffOnly)).status, 403, 'staff cannot publish it');
  let r = await call('POST', '/api/calendar/feed-settings', { action: 'enable' });
  assert.equal(r.status, 200);
  assert.match(r.body.url, /^https:\/\/crm\.example\.test\/api\/calendar\/feed\/[0-9a-f]{48}\.ics$/);
  const url1 = new URL(r.body.url).pathname;
  const c = couple();
  db.prepare(`INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count) VALUES (?, '2027-08-13', '2027-08-15', '3-Day Weekend', 72)`).run(c);
  db.prepare(`INSERT INTO tours (couple_id, name, status, scheduled_at) VALUES (?, 'Kayla, Jordan', 'scheduled', '2027-06-10T14:00')`).run(couple({ status: 'inquiry' }));
  db.prepare(`INSERT INTO blocked_dates (date, reason) VALUES ('2027-09-01', 'Family holiday')`).run();
  r = await call('GET', url1, null, null);
  assert.equal(r.status, 200, 'calendar apps send no login');
  assert.match(r.headers.get('content-type'), /text\/calendar/);
  assert.ok(r.text.startsWith('BEGIN:VCALENDAR\r\n') && r.text.trimEnd().endsWith('END:VCALENDAR'));
  assert.ok(r.text.includes('DTSTART;VALUE=DATE:20270813') && r.text.includes('DTEND;VALUE=DATE:20270816'), 'all-day through check-out');
  assert.ok(r.text.includes('SUMMARY:Wedding: Sarah Larsson & Jake Novak (3-Day Weekend)'));
  assert.ok(r.text.includes('SUMMARY:Site tour: Kayla\\, Jordan'), 'commas escaped');
  assert.ok(r.text.includes('SUMMARY:Blocked: Family holiday'));
  assert.ok(r.text.includes(`URL:https://crm.example.test/clients/${c}`));
  const wrong = url1.replace(/([0-9a-f])(?=\.ics)/, (ch) => (ch === '0' ? '1' : '0'));
  assert.equal((await call('GET', wrong, null, null)).status, 404, 'a wrong address finds nothing');
  r = await call('POST', '/api/calendar/feed-settings', { action: 'enable' });
  assert.equal(new URL(r.body.url).pathname, url1, 'enabling again keeps the same address');
  r = await call('POST', '/api/calendar/feed-settings', { action: 'regenerate' });
  assert.notEqual(new URL(r.body.url).pathname, url1);
  assert.equal((await call('GET', url1, null, null)).status, 404, 'the old address stops working');
  await call('POST', '/api/calendar/feed-settings', { action: 'disable' });
  assert.equal((await call('GET', '/api/calendar/feed-settings')).body.enabled, false);
});

test('reports: payments with GST, what is owed by lateness, bookings, and leads by source', async () => {
  for (const t of ['invoices', 'bookings', 'couples']) db.prepare(`DELETE FROM ${t}`).run();
  const a = couple({ referral_source: 'Instagram', created_at: '2027-02-01 12:00:00' });
  const b = couple({ partner1_name: '=cmd', status: 'cancelled', referral_source: 'Instagram', created_at: '2027-02-03 12:00:00' });
  couple({ status: 'inquiry', referral_source: 'Google Search', created_at: '2027-03-01 12:00:00' });
  db.prepare(`INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count, total_price) VALUES (?, '2027-08-13', '2027-08-15', '3-Day Weekend', 70, 6825)`).run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid, paid_at, payment_method) VALUES (?, 'Deposit', 1706.25, '2027-02-10', 1, '2027-02-09', 'E-Transfer')").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Second', 1706.25, '2000-01-01', 0)").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Final', 3412.50, '2999-01-01', 0)").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Cancelled couple', 500, '2000-01-01', 0)").run(b);

  let r = await call('GET', '/api/reports/payments?from=2027-01-01&to=2027-12-31');
  assert.equal(r.body.total, 1706.25);
  assert.equal(r.body.gst, 81.25, 'the GST inside a GST-inclusive amount is 5/105');
  assert.deepEqual(r.body.by_month.map(m => m.month), ['2027-02']);
  r = await call('GET', '/api/reports/payments?from=2027-03-01&to=2027-12-31');
  assert.equal(r.body.rows.length, 0, 'outside the range');

  r = await call('GET', '/api/reports/outstanding');
  assert.equal(r.body.total, 5118.75, 'a cancelled couple’s invoice is not chased');
  const byBucket = Object.fromEntries(r.body.buckets.map(x => [x.bucket, x.amount]));
  assert.equal(byBucket['Over 90 days late'], 1706.25);
  assert.equal(byBucket['Not yet due'], 3412.5);

  r = await call('GET', '/api/reports/bookings?year=2027');
  assert.equal(r.body.count, 1);
  assert.equal(r.body.rows[0].balance, 5118.75);

  r = await call('GET', '/api/reports/leads?from=2027-01-01&to=2027-12-31');
  assert.equal(r.body.total, 3);
  const insta = r.body.sources.find(s => s.source === 'Instagram');
  assert.deepEqual([insta.leads, insta.won, insta.lost, insta.conversion], [2, 1, 1, 50]);

  const csv = await call('GET', '/api/reports/leads?from=2027-01-01&to=2027-12-31&format=csv');
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="leads-2027-01-01-to-2027-12-31\.csv"/);
  assert.deepEqual([...csv.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM so Excel reads UTF-8');
  assert.ok(csv.text.includes('Enquired,Couple'));
  assert.ok(csv.text.includes("'=cmd & Jake Novak"), 'formula-looking names are exported as text');
  const contacts = await call('GET', '/api/reports/couples.csv');
  assert.equal(contacts.status, 200);
  assert.ok(contacts.text.includes('Partner 1,Partner 1 email'));
});
