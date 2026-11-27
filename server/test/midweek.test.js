// Midweek elopements and vow renewals: day use on a Tuesday, Wednesday or
// Thursday, at most 20 guests, paid 50/50 (owner, Nov 2026).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-mw-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-mw';
process.env.NODE_ENV = 'test';

const db = require('../db');
const { assertBookable, packageKind, defaultEndDate } = require('../services/bookingRules');
const { buildPaymentSchedule } = require('../services/paymentSchedule');
test.after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const NAME = 'Midweek Elopement & Vow Renewal';
const ok = (b) => assertBookable(db, { package_name: NAME, ...b });

test('the package is added switched off, for 20 guests, with no price yet', () => {
  const p = db.prepare("SELECT * FROM packages WHERE name = ?").get(NAME);
  assert.ok(p);
  assert.equal(p.is_active, 0);
  assert.equal(p.max_guests, 20);
  assert.equal(p.price, 0);
});

test('one Tuesday, Wednesday or Thursday, day use only', () => {
  assert.equal(packageKind(NAME), 'midweek');
  for (const d of ['2031-07-08', '2031-07-09', '2031-07-10']) assert.doesNotThrow(() => ok({ event_date: d, end_date: d }), d); // Tue, Wed, Thu
  for (const d of ['2031-07-07', '2031-07-11', '2031-07-12']) assert.throws(() => ok({ event_date: d, end_date: d }), /Tuesday, Wednesday or Thursday/, d);
  assert.throws(() => ok({ event_date: '2031-07-08', end_date: '2031-07-09' }), /single Tuesday/, 'not overnight');
  assert.equal(defaultEndDate('2031-07-08', NAME), '2031-07-08');
});

test('at most 20 guests', () => {
  assert.doesNotThrow(() => ok({ event_date: '2031-07-15', guest_count: 20 }));
  assert.throws(() => ok({ event_date: '2031-07-15', guest_count: 21 }), /at most 20 guests/);
});

test('paid half at booking, half 30 days before', () => {
  const s = buildPaymentSchedule({ total: 3150, checkIn: '2031-07-08', depositDue: '2031-01-10', packageName: NAME });
  assert.deepEqual(s.map(p => [p.amount, p.due_date]), [[1575, '2031-01-10'], [1575, '2031-06-08']]);
  const late = buildPaymentSchedule({ total: 1000, checkIn: '2031-07-08', depositDue: '2031-06-20', packageName: NAME });
  assert.equal(late[1].due_date, '2031-06-20', 'a balance date already passed is due with the deposit');
  assert.equal(buildPaymentSchedule({ total: 6825, checkIn: '2031-07-04', packageName: '3-Day Weekend' }).length, 3, 'weddings keep 25/25/50');
});

test('weddings are unchanged', () => {
  assert.doesNotThrow(() => assertBookable(db, { package_name: '3-Day Weekend', event_date: '2031-08-01', end_date: '2031-08-03', guest_count: 90 }));
});
