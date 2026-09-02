const { test } = require('node:test');
const assert = require('node:assert');
const { startServer, stopServer, call } = require('./helpers');

// What a real deployment looks like: gated, no demo world, one admin created
// from the environment. These are the properties that go wrong silently, so
// they are asserted rather than trusted.

const GATE = 'testgatekey12345678';
const PROD = {
  NODE_ENV: 'production',
  CRM_GATE_KEY: GATE,
  ADMIN_BOOTSTRAP_PASSWORD: 'TestBootstrap123!',
};

test('a fresh production database has no demo data and no published login', async (t) => {
  const s = await startServer(PROD);
  t.after(() => stopServer(s));
  const gate = { Cookie: `crm_gate=${GATE}` };

  const seeded = await call(s.base, 'POST', '/api/auth/login', {
    headers: gate, body: { email: 'admin@rusticretreat.com', password: 'admin123' },
  });
  assert.strictEqual(seeded.status, 401, 'admin123 must not work in production');

  const admin = await call(s.base, 'POST', '/api/auth/login', {
    headers: gate, body: { email: 'admin@rusticretreat.com', password: 'TestBootstrap123!' },
  });
  assert.strictEqual(admin.status, 200, JSON.stringify(admin.data));

  for (const path of ['/api/couples', '/api/bookings', '/api/contracts', '/api/invoices']) {
    const r = await call(s.base, 'GET', path, { token: admin.data.token, headers: gate });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data, [], `no demo data at ${path}`);
  }
});

test('the preview gate hides everything until the key is presented', async (t) => {
  const s = await startServer(PROD);
  t.after(() => stopServer(s));

  assert.strictEqual((await call(s.base, 'GET', '/login')).status, 404, 'SPA hidden');
  assert.strictEqual((await call(s.base, 'GET', '/api/couples')).status, 404, 'API hidden');
  assert.strictEqual((await call(s.base, 'GET', '/?gate=wrong')).status, 404, 'wrong key stays out');

  // The healthcheck must stay reachable or the platform fails the deploy.
  assert.strictEqual((await call(s.base, 'GET', '/api/health')).status, 200);

  const entry = await call(s.base, 'GET', `/login?gate=${GATE}`);
  assert.strictEqual(entry.status, 302);
  assert.match(entry.headers.get('set-cookie') || '', /crm_gate=/);

  const inside = await call(s.base, 'GET', '/login', { headers: { Cookie: `crm_gate=${GATE}` } });
  assert.strictEqual(inside.status, 200);
});

test('production refuses to boot with an empty database and no admin password', async () => {
  await assert.rejects(
    () => startServer({ ...PROD, ADMIN_BOOTSTRAP_PASSWORD: '' }),
    /Database has no users|server exited/,
  );
});

test('production refuses to boot without a gate key', async () => {
  await assert.rejects(
    () => startServer({ ...PROD, CRM_GATE_KEY: '' }),
    /CRM_GATE_KEY|server exited/,
  );
});

test('SEED_DEMO=1 deliberately restores the demo world', async (t) => {
  const s = await startServer({ ...PROD, SEED_DEMO: '1' });
  t.after(() => stopServer(s));
  const gate = { Cookie: `crm_gate=${GATE}` };

  const admin = await call(s.base, 'POST', '/api/auth/login', {
    headers: gate, body: { email: 'admin@rusticretreat.com', password: 'TestBootstrap123!' },
  });
  assert.strictEqual(admin.status, 200);
  const couples = await call(s.base, 'GET', '/api/couples', { token: admin.data.token, headers: gate });
  assert.ok(couples.data.length > 0, 'demo couples present when asked for');

  // The bootstrap still retires the published logins on a seeded database.
  const seeded = await call(s.base, 'POST', '/api/auth/login', {
    headers: gate, body: { email: 'sarah@rusticretreat.com', password: 'staff123' },
  });
  assert.strictEqual(seeded.status, 401, 'second seeded staff login disabled');
});
