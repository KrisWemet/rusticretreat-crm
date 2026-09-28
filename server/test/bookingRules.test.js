// Booking rules, exercised through the real routes against a throwaway database.
// Run with: npm test --prefix server
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// db.js and middleware/auth.js read these at require time.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-rules-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-for-booking-rules';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const app = express();
app.use(express.json());
app.use('/api/bookings', require('../routes/bookings'));
app.use('/api/proposals', require('../routes/proposals'));

let server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'admin@test', name: 'Admin', role: 'admin' }, process.env.JWT_SECRET);

async function call(method, url, body, auth = staff) {
  const res = await fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

let seq = 0;
function couple(status = 'inquiry') {
  seq += 1;
  return db.prepare(`INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES (?, ?, ?, ?)`)
    .run(`Test${seq}`, `Partner${seq}`, `rules${seq}@test.invalid`, status).lastInsertRowid;
}

function proposal(coupleId, { event_date, end_date, package_name = '3-Day Weekend', status = 'sent', valid_until = null, guest_count = 70 }) {
  const token = `tok_${++seq}_${Date.now()}`;
  const id = db.prepare(`
    INSERT INTO proposals (couple_id, title, package_name, event_date, end_date, guest_count, subtotal, tax, total, status, public_token, valid_until)
    VALUES (?, 'Test', ?, ?, ?, ?, 6500, 325, 6825, ?, ?, ?)
  `).run(coupleId, package_name, event_date, end_date, guest_count, status, token, valid_until).lastInsertRowid;
  return { id, token };
}

// 2029 dates stay clear of the seeded demo bookings.
// 2029-06-01 is a Friday.
const FRI = '2029-06-01', SUN = '2029-06-03', MON = '2029-06-04';

test.before(() => new Promise(resolve => {
  server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
}));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('creates a valid 3-Day Weekend booking', async () => {
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: FRI, end_date: SUN, package_name: '3-Day Weekend', guest_count: 80 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('refuses an overlapping booking and names the couple for staff', async () => {
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-06-02', end_date: '2029-06-02', package_name: 'Custom', guest_count: 20 });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /not available/);
  assert.match(r.body.error, /Test\d+ & Partner\d+/);
});

test('refuses a booking on the reset day after a wedding', async () => {
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: MON, end_date: MON, package_name: 'Custom' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /reset/);
});

test('allows the day after the reset day', async () => {
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-06-05', end_date: '2029-06-05', package_name: 'Custom' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('refuses a booking whose own reset day lands on another wedding', async () => {
  // 2029-06-08 is a Friday; book it, then try the Thursday before.
  assert.equal((await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-06-08', end_date: '2029-06-10', package_name: '3-Day Weekend' })).status, 201);
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-06-07', end_date: '2029-06-07', package_name: 'Custom' });
  assert.equal(r.status, 409);
});

test('ignores bookings of cancelled couples', async () => {
  const cancelled = couple('cancelled');
  db.prepare('INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, ?)').run(cancelled, '2029-07-06', '2029-07-08', '3-Day Weekend');
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-07-06', end_date: '2029-07-08', package_name: '3-Day Weekend' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
});

test('refuses owner-blocked dates', async () => {
  db.prepare('INSERT INTO blocked_dates (date, reason) VALUES (?, ?)').run('2029-08-04', 'Family event');
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-08-03', end_date: '2029-08-05', package_name: '3-Day Weekend' });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /blocked \(Family event\)/);
});

test('enforces the 3-Day Weekend window', async () => {
  const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-09-06', end_date: '2029-09-08', package_name: '3-Day Weekend' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /Friday to Sunday/);
});

test('accepts every allowed 5-Day window and refuses others', async () => {
  // Wed 2029-09-12 → Sun 16, Thu 2029-10-04 → Mon 08, Fri 2029-11-02 → Tue 06
  for (const [s, e] of [['2029-09-12', '2029-09-16'], ['2029-10-04', '2029-10-08'], ['2029-11-02', '2029-11-06']]) {
    const r = await call('POST', '/api/bookings', { couple_id: couple(), event_date: s, end_date: e, package_name: '5-Day Experience' });
    assert.equal(r.status, 201, `${s}: ${JSON.stringify(r.body)}`);
  }
  const bad = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-11-19', end_date: '2029-11-23', package_name: '5-Day Experience' });
  assert.equal(bad.status, 400);
});

test('refuses the retired 2-Day package and more than 100 guests', async () => {
  const two = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-12-04', end_date: '2029-12-05', package_name: '2-Day Weekday Escape' });
  assert.equal(two.status, 400);
  assert.match(two.body.error, /no longer offered/);
  const big = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2029-12-07', end_date: '2029-12-09', package_name: '3-Day Weekend', guest_count: 101 });
  assert.equal(big.status, 400);
  assert.match(big.body.error, /100 guests/);
});

test('lets a legacy booking be edited when the edit does not touch its dates or package', async () => {
  // A 2-Day booking from before the package was retired.
  const id = db.prepare('INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, ?)')
    .run(couple(), '2029-12-11', '2029-12-12', '2-Day Weekday Escape').lastInsertRowid;
  const ok = await call('PUT', `/api/bookings/${id}`, { special_requests: 'Late arrival', deposit_paid: 500 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const moved = await call('PUT', `/api/bookings/${id}`, { event_date: '2029-12-18', end_date: '2029-12-19' });
  assert.equal(moved.status, 400);
});

test('moving a booking onto its own dates is not a clash with itself', async () => {
  const created = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2030-05-03', end_date: '2030-05-05', package_name: '3-Day Weekend', guest_count: 60 });
  assert.equal(created.status, 201);
  const r = await call('PUT', `/api/bookings/${created.body.id}`, { guest_count: 90 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('two couples accepting proposals for the same weekend: only the first is booked', async () => {
  const a = couple(), b = couple();
  const pa = proposal(a, { event_date: '2030-06-07', end_date: '2030-06-09' });
  const pb = proposal(b, { event_date: '2030-06-07', end_date: '2030-06-09' });

  const first = await call('POST', `/api/proposals/public/${pa.token}/accept`, { accepted_name: 'A' }, null);
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const second = await call('POST', `/api/proposals/public/${pb.token}/accept`, { accepted_name: 'B' }, null);
  assert.equal(second.status, 409);
  assert.match(second.body.error, /no longer available/);
  // The public message must not reveal who holds the weekend.
  assert.doesNotMatch(second.body.error, /Test|Partner/);

  assert.equal(db.prepare('SELECT COUNT(*) n FROM bookings WHERE couple_id = ?').get(b).n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(b).n, 0);
  assert.equal(db.prepare('SELECT status FROM proposals WHERE id = ?').get(pb.id).status, 'sent');
  assert.equal(db.prepare('SELECT status FROM couples WHERE id = ?').get(b).status, 'inquiry');
});

test('declined, draft and out-of-date proposals cannot be accepted', async () => {
  const declined = proposal(couple(), { event_date: '2030-07-05', end_date: '2030-07-07', status: 'declined' });
  const draft = proposal(couple(), { event_date: '2030-07-12', end_date: '2030-07-14', status: 'draft' });
  const stale = proposal(couple(), { event_date: '2030-07-19', end_date: '2030-07-21', valid_until: '2020-01-01' });
  for (const p of [declined, draft, stale]) {
    const r = await call('POST', `/api/proposals/public/${p.token}/accept`, { accepted_name: 'X' }, null);
    assert.equal(r.status, 400, JSON.stringify(r.body));
  }
});

test('staff cannot send a proposal for dates that are already taken', async () => {
  const p = proposal(couple(), { event_date: '2030-06-07', end_date: '2030-06-09', status: 'draft' });
  const r = await call('POST', `/api/proposals/${p.id}/send`);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /not available/);
});

test("a couple's own existing booking does not block their proposal", async () => {
  const c = couple();
  db.prepare('INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, ?)').run(c, '2030-08-02', '2030-08-04', '3-Day Weekend');
  const p = proposal(c, { event_date: '2030-08-02', end_date: '2030-08-04', status: 'draft' });
  const r = await call('POST', `/api/proposals/${p.id}/send`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

// ── Custom dates: staff can move a package off its usual days ────────────────
// 2031-05-03, -10, -17 and 2031-06-14 are Saturdays; 2031-06-06 is a Friday.

test('a Saturday–Monday 3-Day Weekend is refused unless custom dates are ticked', async () => {
  const plain = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-05-03', end_date: '2031-05-05', package_name: '3-Day Weekend' });
  assert.equal(plain.status, 400);
  assert.match(plain.body.error, /Custom dates/);

  const custom = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-05-03', end_date: '2031-05-05', package_name: '3-Day Weekend', custom_dates: 1 });
  assert.equal(custom.status, 201);
  assert.equal(custom.body.custom_dates, 1);
});

test('custom dates may change the length too, but still respect other weddings and blocked dates', async () => {
  const four = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-05-10', end_date: '2031-05-13', package_name: '3-Day Weekend', custom_dates: 1 });
  assert.equal(four.status, 201);

  // Overlaps the Sat 10 – Tue 13 stay (and its reset day, Wed 14).
  const clash = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-05-14', end_date: '2031-05-16', package_name: '3-Day Weekend', custom_dates: 1 });
  assert.equal(clash.status, 409);

  db.prepare('INSERT INTO blocked_dates (date, reason) VALUES (?, ?)').run('2031-05-18', 'Maintenance');
  const blocked = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-05-17', end_date: '2031-05-19', package_name: '3-Day Weekend', custom_dates: 1 });
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /blocked/);
});

test('turning custom dates off re-checks the usual days', async () => {
  const created = await call('POST', '/api/bookings', { couple_id: couple(), event_date: '2031-06-14', end_date: '2031-06-16', package_name: '3-Day Weekend', custom_dates: 1 });
  assert.equal(created.status, 201);
  const off = await call('PUT', `/api/bookings/${created.body.id}`, { custom_dates: 0 });
  assert.equal(off.status, 400);
  // Moving it to Friday–Sunday with custom off is fine.
  const moved = await call('PUT', `/api/bookings/${created.body.id}`, { event_date: '2031-06-06', end_date: '2031-06-08', custom_dates: 0 });
  assert.equal(moved.status, 200);
});

test('a proposal with custom dates can be sent and accepted, and the booking keeps the flag', async () => {
  const c = couple();
  const draft = await call('POST', '/api/proposals', {
    couple_id: c, title: 'Sat–Mon weekend', package_name: '3-Day Weekend',
    event_date: '2031-07-05', end_date: '2031-07-07', custom_dates: 1,
    items: [{ label: '3-Day Weekend', quantity: 1, unit_price: 6500, amount: 6500, kind: 'package' }],
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.custom_dates, 1);
  const sent = await call('POST', `/api/proposals/${draft.body.id}/send`);
  assert.ok(sent.status < 300, JSON.stringify(sent.body));
  const token = db.prepare('SELECT public_token FROM proposals WHERE id = ?').get(draft.body.id).public_token;
  const accepted = await call('POST', `/api/proposals/public/${token}/accept`, { accepted_name: 'Couple' }, null);
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const booking = db.prepare('SELECT event_date, end_date, custom_dates FROM bookings WHERE couple_id = ?').get(c);
  assert.deepEqual({ ...booking }, { event_date: '2031-07-05', end_date: '2031-07-07', custom_dates: 1 });
});
