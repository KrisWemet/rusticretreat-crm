// Sign-up invites: the admin creates a private link, the person chooses their
// own password from it, and the link works exactly once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-inv-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-inv';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test/';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const tok = (userId, role, name) => 'Bearer ' + jwt.sign({ userId, email: `${name}@t`, name, role }, process.env.JWT_SECRET);
const admin = tok(adminId, 'admin', 'Kris');
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('an invited person sets their own password once and can then log in', async () => {
  const inv = await call('POST', '/api/auth/invites', { name: 'Shannon', email: 'Shannon@Venue.test', role: 'admin' }, admin);
  assert.equal(inv.status, 201);
  assert.match(inv.body.url, /^https:\/\/crm\.example\.test\/signup\/[a-f0-9]{48}$/);
  assert.equal(inv.body.emailed, null, 'not emailed unless asked');
  const token = inv.body.url.split('/').pop();
  assert.ok(!db.prepare('SELECT 1 FROM user_invites WHERE token_hash = ?').get(token), 'the raw token is never stored');

  assert.equal((await call('GET', '/api/auth/invites', null, admin)).body.length, 1);
  const peek = await call('GET', `/api/auth/invite/${token}`);
  assert.equal(peek.status, 200);
  assert.equal(peek.body.email, 'shannon@venue.test');

  assert.equal((await call('POST', `/api/auth/invite/${token}`, { password: 'short' })).status, 400);
  const done = await call('POST', `/api/auth/invite/${token}`, { name: 'Shannon Ouimet', password: 'shannons-password' });
  assert.equal(done.status, 201);
  assert.equal(done.body.user.role, 'admin');
  assert.equal(done.body.user.name, 'Shannon Ouimet');
  assert.ok(done.body.token);

  assert.equal((await call('POST', `/api/auth/invite/${token}`, { password: 'another-password' })).status, 404, 'the link works once');
  assert.equal((await call('GET', `/api/auth/invite/${token}`)).status, 404);
  assert.equal((await call('GET', '/api/auth/invites', null, admin)).body.length, 0);

  const login = await call('POST', '/api/auth/login', { email: 'shannon@venue.test', password: 'shannons-password' });
  assert.equal(login.status, 200);
  assert.equal((await call('POST', '/api/auth/invites', { name: 'S', email: 'shannon@venue.test' }, admin)).status, 409);
});

test('only the admin can invite; cancelled, replaced and expired links stop working', async () => {
  const staff = tok(adminId, 'staff', 'Jo');
  assert.equal((await call('POST', '/api/auth/invites', { name: 'X', email: 'x@venue.test' }, staff)).status, 403);
  assert.equal((await call('POST', '/api/auth/invites', { name: 'X', email: 'x@venue.test' })).status, 401);

  const first = (await call('POST', '/api/auth/invites', { name: 'Pat', email: 'pat@venue.test' }, admin)).body;
  const second = (await call('POST', '/api/auth/invites', { name: 'Pat', email: 'pat@venue.test' }, admin)).body;
  assert.equal((await call('GET', `/api/auth/invite/${first.url.split('/').pop()}`)).status, 404, 'a newer invite replaces the old link');
  assert.equal(second.role, 'staff');
  assert.equal((await call('DELETE', `/api/auth/invites/${second.id}`, null, admin)).status, 200);
  assert.equal((await call('GET', `/api/auth/invite/${second.url.split('/').pop()}`)).status, 404);

  const third = (await call('POST', '/api/auth/invites', { name: 'Pat', email: 'pat@venue.test' }, admin)).body;
  db.prepare("UPDATE user_invites SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(third.id);
  assert.equal((await call('POST', `/api/auth/invite/${third.url.split('/').pop()}`, { password: 'pats-password-1' })).status, 404);
  assert.equal((await call('GET', '/api/auth/invite/not-a-token')).status, 404);
});

test('a login added with capitals in the email can sign in however it is typed', async () => {
  const add = await call('POST', '/api/auth/users', { name: 'Sam', email: 'Sam.Owner@Venue.test', role: 'admin', password: 'sams-password-1' }, admin);
  assert.equal(add.status, 201);
  for (const typed of ['Sam.Owner@Venue.test', 'sam.owner@venue.test', ' SAM.OWNER@VENUE.TEST ']) {
    assert.equal((await call('POST', '/api/auth/login', { email: typed, password: 'sams-password-1' })).status, 200, typed);
  }
  assert.equal((await call('POST', '/api/auth/login', { email: 'sam.owner@venue.test', password: 'wrong-password' })).status, 401);
  // The password stays case-sensitive.
  assert.equal((await call('POST', '/api/auth/login', { email: 'sam.owner@venue.test', password: 'SAMS-PASSWORD-1' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'sam.owner@venue.test', password: 'Sams-password-1' })).status, 401);
});

test('an existing login can be sent a link to choose a new password', async () => {
  const add = await call('POST', '/api/auth/users', { name: 'Robin', email: 'robin@venue.test', role: 'staff', password: 'robins-old-password' }, admin);
  const staff = tok(add.body.id, 'staff', 'Robin');
  assert.equal((await call('POST', `/api/auth/users/${add.body.id}/password-link`, {}, staff)).status, 403, 'admin only');

  const link = await call('POST', `/api/auth/users/${add.body.id}/password-link`, {}, admin);
  assert.equal(link.status, 201);
  assert.equal(link.body.user_id, add.body.id);
  const token = link.body.url.split('/').pop();
  assert.equal((await call('GET', `/api/auth/invite/${token}`)).body.reset, true);
  assert.ok((await call('GET', '/api/auth/invites', null, admin)).body.some(i => i.user_id === add.body.id));

  // The old password keeps working until the link is used.
  assert.equal((await call('POST', '/api/auth/login', { email: 'robin@venue.test', password: 'robins-old-password' })).status, 200);

  const done = await call('POST', `/api/auth/invite/${token}`, { password: 'robins-new-password' });
  assert.equal(done.status, 201);
  assert.equal(done.body.user.id, add.body.id, 'same login, not a new one');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'robin@venue.test'").get().n, 1);
  assert.equal((await call('POST', '/api/auth/login', { email: 'robin@venue.test', password: 'robins-old-password' })).status, 401);
  assert.equal((await call('POST', '/api/auth/login', { email: 'Robin@venue.test', password: 'robins-new-password' })).status, 200);
  assert.equal((await call('POST', `/api/auth/invite/${token}`, { password: 'another-password-x' })).status, 404, 'works once');

  // A newer link replaces the older one, and a removed login's link is dead.
  const a = (await call('POST', `/api/auth/users/${add.body.id}/password-link`, {}, admin)).body.url.split('/').pop();
  const b = (await call('POST', `/api/auth/users/${add.body.id}/password-link`, {}, admin)).body.url.split('/').pop();
  assert.equal((await call('GET', `/api/auth/invite/${a}`)).status, 404);
  assert.equal((await call('DELETE', `/api/auth/users/${add.body.id}`, null, admin)).status, 200);
  assert.equal((await call('POST', `/api/auth/invite/${b}`, { password: 'robins-third-password' })).status, 404);
});
