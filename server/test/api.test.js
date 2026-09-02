const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, stopServer, call } = require('./helpers');

let s, T;

before(async () => {
  s = await startServer();
  const login = await call(s.base, 'POST', '/api/auth/login', {
    body: { email: 'admin@rusticretreat.com', password: 'admin123' },
  });
  assert.strictEqual(login.status, 200, JSON.stringify(login.data));
  T = login.data.token;
});
after(() => stopServer(s));

test('a wrong password is rejected', async () => {
  const r = await call(s.base, 'POST', '/api/auth/login', {
    body: { email: 'admin@rusticretreat.com', password: 'nope' },
  });
  assert.strictEqual(r.status, 401);
});

test('staff routes require a token', async () => {
  for (const p of ['/api/couples', '/api/bookings', '/api/invoices', '/api/contracts', '/api/analytics/summary']) {
    const r = await call(s.base, 'GET', p);
    assert.ok([401, 403].includes(r.status), `${p} answered ${r.status}`);
  }
});

test('couples CRUD', async () => {
  const create = await call(s.base, 'POST', '/api/couples', { token: T, body: {
    partner1_name: 'Test A', partner2_name: 'Test B',
    email: 'crud@test.example', partner2_email: 'crud2@test.example',
    wedding_date: '2027-06-12', status: 'lead',
  }});
  assert.ok([200, 201].includes(create.status), JSON.stringify(create.data));
  const id = create.data.id;

  const get = await call(s.base, 'GET', `/api/couples/${id}`, { token: T });
  assert.strictEqual(get.data.partner1_name, 'Test A');

  const upd = await call(s.base, 'PUT', `/api/couples/${id}`, { token: T, body: { ...get.data, phone: '555-1234' } });
  assert.strictEqual(upd.status, 200);

  const stage = await call(s.base, 'PATCH', `/api/couples/${id}/stage`, { token: T, body: { stage: 'tour' } });
  assert.strictEqual(stage.status, 200);

  const gone = await call(s.base, 'DELETE', `/api/couples/${id}`, { token: T });
  assert.strictEqual(gone.status, 200);
  const after = await call(s.base, 'GET', `/api/couples/${id}`, { token: T });
  assert.strictEqual(after.status, 404);
});

test('a public inquiry creates a lead', async () => {
  const r = await call(s.base, 'POST', '/api/inquire', { body: {
    partner1_name: 'Lead A', partner2_name: 'Lead B', email: 'lead@test.example',
    wedding_date: '2027-08-14', guest_count: 30, message: 'hello',
  }});
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
});

test('the venue signs first and that locks the contract', async () => {
  // A couple with a distinct address per partner — signing requires it.
  const c = await call(s.base, 'POST', '/api/couples', { token: T, body: {
    partner1_name: 'Sign A', partner2_name: 'Sign B',
    email: 'signa@test.example', partner2_email: 'signb@test.example',
    wedding_date: '2027-07-10',
  }});
  const coupleId = c.data.id;

  const con = await call(s.base, 'POST', '/api/contracts', { token: T, body: {
    couple_id: coupleId, title: 'Test Agreement', content: 'Terms go here.',
    wedding_date: '2027-07-10',
  }});
  assert.ok([200, 201].includes(con.status), JSON.stringify(con.data));
  const id = con.data.id;

  const venue = await call(s.base, 'POST', `/api/contracts/${id}/sign-venue`, { token: T, body: {
    signature_data: 'data:image/png;base64,iVBORw0KGgo', signer_name: 'Rustic Retreat', agreed: true,
  }});
  assert.strictEqual(venue.status, 200, JSON.stringify(venue.data));

  // The venue signature builds the chain: venue, then each partner in turn.
  const signers = await call(s.base, 'GET', `/api/contracts/${id}/signers`, { token: T });
  assert.strictEqual(signers.status, 200);
  assert.strictEqual(signers.data.length, 3, 'venue + two partners');
  assert.strictEqual(signers.data[0].role, 'venue');
  assert.strictEqual(signers.data[0].status, 'signed');
  assert.notStrictEqual(signers.data[1].status, 'signed', 'partner 1 still owes a signature');

  // Signing twice must not be possible.
  const again = await call(s.base, 'POST', `/api/contracts/${id}/sign-venue`, { token: T, body: {
    signature_data: 'data:image/png;base64,iVBORw0KGgo', signer_name: 'Rustic Retreat', agreed: true,
  }});
  assert.strictEqual(again.status, 400);

  // Consent is not optional.
  const c2 = await call(s.base, 'POST', '/api/contracts', { token: T, body: {
    couple_id: coupleId, title: 'Second', content: 'Terms.',
  }});
  const noConsent = await call(s.base, 'POST', `/api/contracts/${c2.data.id}/sign-venue`, { token: T, body: {
    signature_data: 'data:image/png;base64,x', signer_name: 'X', agreed: false,
  }});
  assert.strictEqual(noConsent.status, 400);
});

test('signing links reject a bad token', async () => {
  const r = await call(s.base, 'GET', '/api/contracts/sign/deadbeefdeadbeef');
  assert.strictEqual(r.status, 404);
});

test('a contract can be generated from a proposal', async () => {
  const p = await call(s.base, 'POST', '/api/proposals', { token: T, body: {
    couple_id: 1, title: 'For contract', event_date: '2027-09-11', deposit_pct: 25,
    items: [{ label: 'Venue fee', quantity: 1, unit_price: 8000, kind: 'package' }],
  }});
  const con = await call(s.base, 'POST', `/api/contracts/from-proposal/${p.data.id}`, { token: T });
  assert.ok([200, 201].includes(con.status), JSON.stringify(con.data));
  assert.ok(con.data.id);
  await call(s.base, 'DELETE', `/api/proposals/${p.data.id}`, { token: T });
});

test('an unsigned Stripe webhook is rejected', async () => {
  const r = await call(s.base, 'POST', '/api/payments/webhook', { body: { type: 'x' } });
  assert.ok([400, 401, 503].includes(r.status), `answered ${r.status}`);
});

test('every analytics endpoint responds', async () => {
  for (const ep of ['summary', 'funnel', 'referrals', 'occupancy', 'packages', 'proposals', 'attention', 'revenue']) {
    const r = await call(s.base, 'GET', `/api/analytics/${ep}`, { token: T });
    assert.strictEqual(r.status, 200, `analytics/${ep} answered ${r.status}`);
  }
});

test('an unknown API path answers JSON, not the SPA shell', async () => {
  const r = await call(s.base, 'GET', '/api/definitely-not-a-route', { token: T });
  assert.strictEqual(r.status, 404);
  assert.deepStrictEqual(r.data, { error: 'Not found' });
});
