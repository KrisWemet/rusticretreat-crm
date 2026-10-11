// Entering bookings made before the CRM, through the real route against a
// throwaway database. Run with: npm test --prefix server
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-existing-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-for-existing-bookings';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { parseDate, rowsFromCsv } = require('../services/existingBookings');
const { needsFollowUp } = require('../services/leadNurture');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/bookings/existing', require('../routes/existingBookings'));

let server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'admin@test', name: 'Admin', role: 'admin' }, process.env.JWT_SECRET);

async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', authorization: staff },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.before(() => new Promise(resolve => {
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const count = (sql, ...p) => db.prepare(sql).get(...p).n;

test('dates: unambiguous forms are read, ambiguous slashes are refused', () => {
  assert.equal(parseDate('2030-06-14').date, '2030-06-14');
  assert.equal(parseDate('June 14, 2030').date, '2030-06-14');
  assert.equal(parseDate('Fri 14 Jun 2030').date, '2030-06-14');
  assert.equal(parseDate('14/06/2030').date, '2030-06-14');
  assert.equal(parseDate('06/14/2030').date, '2030-06-14');
  assert.match(parseDate('06/07/2030').error, /month\/day or day\/month/);
  assert.match(parseDate('2030-02-30').error, /not a real date/);
});

test('headers are matched loosely and blank lines ignored', () => {
  const { rows, missingColumns, unknownColumns } = rowsFromCsv(
    '﻿Partner 1 Name,PARTNER 2 NAME,Email,Date,Shoe size\r\n"Smith, Ann",Bo,a@x.test,2030-06-14,9\r\n,,,,\r\n');
  assert.deepEqual(missingColumns, []);
  assert.deepEqual(unknownColumns, ['Shoe size']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].partner1_name, 'Smith, Ann');
  assert.equal(rows[0].row, 2);
});

const CSV = [
  'Partner 1 name,Partner 2 name,Partner 1 email,Partner 2 email,Wedding date,Package,Guests,Total price,Paid so far',
  // 2030-06-07 is a Friday.
  'Avery,Blake,avery@existing.test,blake@existing.test,2030-06-07,3-Day Weekend,90,"$7,350.00",1837.50',
  'Casey,Drew,casey@existing.test,,June 21 2030,5-Day Experience,,9000,9000',
  'Ellis,Finn,,,2030-07-05,,,,',
  'Gray,Harper,gray@existing.test,,2030-06-08,,,,',
].join('\n');

test('preview checks every row and saves nothing', async () => {
  const before = count('SELECT COUNT(*) AS n FROM couples');
  const r = await call('POST', '/api/bookings/existing/preview', { csv: CSV });
  assert.equal(r.status, 200);
  const [a, c, e, g] = r.body.results;
  assert.equal(a.outcome, 'ready');
  assert.equal(a.end_date, '2030-06-09', 'a 3-Day Weekend fills in its last day');
  assert.equal(c.outcome, 'ready');
  assert.equal(e.outcome, 'error');
  assert.match(e.errors.join(), /email is missing/);
  // Gray's date falls inside Avery's weekend from the same file.
  assert.equal(g.outcome, 'error');
  assert.match(g.errors.join(), /Date clash: Avery & Blake/);
  assert.equal(count('SELECT COUNT(*) AS n FROM couples'), before, 'preview rolled back');
});

test('saving adds booked couples with no reminders, alerts or emails', async () => {
  const r = await call('POST', '/api/bookings/existing', { csv: CSV });
  assert.equal(r.status, 201);
  assert.equal(r.body.added, 2);

  const avery = db.prepare("SELECT * FROM couples WHERE email = 'avery@existing.test'").get();
  assert.equal(avery.status, 'booked');
  assert.equal(avery.pipeline_stage, 'booked');
  assert.equal(avery.wedding_date, '2030-06-07');
  const booking = db.prepare('SELECT * FROM bookings WHERE couple_id = ?').get(avery.id);
  assert.equal(booking.total_price, 7350);
  assert.equal(booking.deposit_paid, 1837.5);

  const invoices = db.prepare('SELECT * FROM invoices WHERE couple_id = ? ORDER BY paid DESC').all(avery.id);
  assert.deepEqual(invoices.map(i => [i.amount, i.paid, i.due_date]), [[1837.5, 1, null], [5512.5, 0, null]],
    'paid amount recorded, balance owing with no due date so no reminder fires');

  const casey = db.prepare("SELECT * FROM couples WHERE email = 'casey@existing.test'").get();
  assert.equal(casey.partner2_email, null, 'partner 2 email may be left blank');
  assert.equal(count('SELECT COUNT(*) AS n FROM invoices WHERE couple_id = ? AND paid = 0', casey.id), 0, 'paid in full');

  assert.equal(needsFollowUp().filter(c => [avery.id, casey.id].includes(c.id)).length, 0);
  assert.equal(count('SELECT COUNT(*) AS n FROM email_log'), 0);
  assert.equal(count("SELECT COUNT(*) AS n FROM activity_log WHERE action = 'couple.imported'"), 2);
});

test('running the same file again is caught as duplicates', async () => {
  const r = await call('POST', '/api/bookings/existing/preview', { csv: CSV });
  const [a] = r.body.results;
  assert.equal(a.outcome, 'error');
  assert.match(a.errors.join(), /already in the CRM for Avery & Blake/);
});

test('single entry: a past wedding is completed, a retired package is allowed, a blocked date is not a clash', async () => {
  db.prepare("INSERT INTO blocked_dates (date, reason) VALUES ('2031-05-03', 'Held for paper booking')").run();
  const r = await call('POST', '/api/bookings/existing', { rows: [
    { partner1_name: 'Indy', partner2_name: 'Jules', email: 'indy@existing.test', event_date: '2020-08-04', package_name: '2-Day Weekday Escape' },
    { partner1_name: 'Kai', partner2_name: 'Lee', email: 'kai@existing.test', event_date: '2031-05-03' },
  ] });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.results.map(x => x.outcome), ['added', 'added']);
  assert.equal(r.body.results[0].status, 'completed');
  assert.equal(r.body.results[1].status, 'booked');
  assert.match(r.body.results[1].warnings.join(), /2031-05-03 is blocked on the calendar/);
});

test('unticked rows are skipped', async () => {
  const r = await call('POST', '/api/bookings/existing', {
    csv: 'Partner 1 name,Partner 2 name,Email,Wedding date\nMo,Noa,mo@existing.test,2032-01-10\n',
    exclude: [2],
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.results[0].outcome, 'skipped');
  assert.equal(count("SELECT COUNT(*) AS n FROM couples WHERE email = 'mo@existing.test'"), 0);
});

test('a file without the needed columns is refused up front', async () => {
  const r = await call('POST', '/api/bookings/existing/preview', { csv: 'Name,Phone\nA,1\n' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /missing these columns/);
});
