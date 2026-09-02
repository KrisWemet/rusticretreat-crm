const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, stopServer, call } = require('./helpers');

// The venue hosts one wedding per weekend. These tests pin that rule down at
// every point a booking can be created, and pin the weekend maths itself —
// the previous offsets blocked the *following* weekend, which quietly hid
// sellable dates on the public inquiry form.

let s, T;
const SEEDED = { start: '2026-09-19', end: '2026-09-21' }; // Sat–Mon, couple 1

before(async () => {
  s = await startServer();
  const login = await call(s.base, 'POST', '/api/auth/login', {
    body: { email: 'admin@rusticretreat.com', password: 'admin123' },
  });
  assert.strictEqual(login.status, 200);
  T = login.data.token;
});
after(() => stopServer(s));

const book = (body) => call(s.base, 'POST', '/api/bookings', { token: T, body });
const del = (id) => call(s.base, 'DELETE', `/api/bookings/${id}`, { token: T });

test('every day of a taken weekend is refused to another couple', async () => {
  for (const date of ['2026-09-18', '2026-09-19', '2026-09-20']) { // Fri, Sat, Sun
    const r = await book({ couple_id: 3, event_date: date });
    assert.strictEqual(r.status, 409, `${date} should clash`);
    assert.match(r.data.error, /not available/i);
  }
});

test('the following weekend is still bookable', async () => {
  // The old rule projected a Sun/Mon booking forward onto the next weekend.
  const r = await book({ couple_id: 3, event_date: '2026-09-26' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  await del(r.data.id);
});

test('a midweek date blocks only itself', async () => {
  const wed = await book({ couple_id: 3, event_date: '2026-07-15' });
  assert.strictEqual(wed.status, 201, JSON.stringify(wed.data));
  // The Friday of that same week must remain free.
  const fri = await book({ couple_id: 4, event_date: '2026-07-17' });
  assert.strictEqual(fri.status, 201, JSON.stringify(fri.data));
  await del(wed.data.id);
  await del(fri.data.id);
});

test("a couple never clashes with its own booking", async () => {
  const r = await book({ couple_id: 1, event_date: SEEDED.start });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  await del(r.data.id);
});

test('force:true is a deliberate override', async () => {
  const r = await book({ couple_id: 3, event_date: SEEDED.start, force: true });
  assert.strictEqual(r.status, 201);
  await del(r.data.id);
});

test('moving a booking onto a taken weekend is refused', async () => {
  const made = await book({ couple_id: 3, event_date: '2026-06-13' });
  assert.strictEqual(made.status, 201);
  const moved = await call(s.base, 'PUT', `/api/bookings/${made.data.id}`, {
    token: T, body: { event_date: SEEDED.start },
  });
  assert.strictEqual(moved.status, 409);

  // Editing without moving the dates must still work.
  const same = await call(s.base, 'PUT', `/api/bookings/${made.data.id}`, {
    token: T, body: { guest_count: 42 },
  });
  assert.strictEqual(same.status, 200);
  await del(made.data.id);
});

test('a blocked date is refused', async () => {
  const b = await call(s.base, 'POST', '/api/calendar/block', {
    token: T, body: { date: '2026-06-24', reason: 'maintenance' },
  });
  assert.ok([200, 201].includes(b.status));
  const r = await book({ couple_id: 3, event_date: '2026-06-24' });
  assert.strictEqual(r.status, 409);
  assert.match(r.data.error, /maintenance/);
});

test('the public availability list matches what bookings refuse', async () => {
  const av = await call(s.base, 'GET', '/api/inquire/availability');
  assert.strictEqual(av.status, 200);
  const unavailable = new Set(av.data.unavailableDates);

  // Advertised as taken → must be refused.
  assert.ok(unavailable.has('2026-09-18'), 'Friday of a booked weekend is listed');
  // Advertised as free → must be accepted.
  assert.ok(!unavailable.has('2026-09-26'), 'next weekend is not listed as taken');
  const r = await book({ couple_id: 3, event_date: '2026-09-26' });
  assert.strictEqual(r.status, 201);
  await del(r.data.id);
});

test('accepting a proposal for a weekend taken since it was sent is refused', async () => {
  const p = await call(s.base, 'POST', '/api/proposals', {
    token: T, body: { couple_id: 3, title: 'Clash', event_date: '2026-09-20' },
  });
  assert.strictEqual(p.status, 201, JSON.stringify(p.data));
  await call(s.base, 'POST', `/api/proposals/${p.data.id}/send`, { token: T });
  const full = await call(s.base, 'GET', `/api/proposals/${p.data.id}`, { token: T });

  const acc = await call(s.base, 'POST', `/api/proposals/public/${full.data.public_token}/accept`, {
    body: { accepted_name: 'Amanda Tremblay' },
  });
  assert.strictEqual(acc.status, 409);
  assert.match(acc.data.error, /no longer available/i);
  await call(s.base, 'DELETE', `/api/proposals/${p.data.id}`, { token: T });
});

test('accepting a proposal for a free weekend books it and raises invoices', async () => {
  const p = await call(s.base, 'POST', '/api/proposals', {
    token: T, body: { couple_id: 3, title: 'Clean', event_date: '2026-07-11', deposit_pct: 25 },
  });
  await call(s.base, 'POST', `/api/proposals/${p.data.id}/send`, { token: T });
  const full = await call(s.base, 'GET', `/api/proposals/${p.data.id}`, { token: T });

  const before = await call(s.base, 'GET', '/api/bookings/couple/3', { token: T });
  const acc = await call(s.base, 'POST', `/api/proposals/public/${full.data.public_token}/accept`, {
    body: { accepted_name: 'Amanda Tremblay' },
  });
  assert.strictEqual(acc.status, 200, JSON.stringify(acc.data));

  const after = await call(s.base, 'GET', '/api/bookings/couple/3', { token: T });
  assert.strictEqual(after.data.length, before.data.length + 1, 'a booking was created');
  const invoices = await call(s.base, 'GET', '/api/invoices/couple/3', { token: T });
  assert.ok(invoices.data.length >= 2, 'deposit + balance invoices exist');

  // That weekend is now taken for everyone else.
  const clash = await book({ couple_id: 4, event_date: '2026-07-11' });
  assert.strictEqual(clash.status, 409);

  const made = after.data.find(b => b.event_date === '2026-07-11');
  if (made) await del(made.id);
});
