// The couple portal: one switch turns it on, couples get in through a one-time
// setup link, one login per couple (either email), staff can withdraw access,
// couples see only what is theirs and what staff share.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-portal-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-portal';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test';
delete process.env.ENABLE_COUPLE_PORTAL;

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/portal', require('../routes/portal'));
app.use('/api/timeline', require('../routes/timeline'));
app.use('/api/couple-files', require('../routes/coupleFiles'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const staff = 'Bearer ' + jwt.sign({ userId: adminId, email: 's@t', name: 'Shannon', role: 'staff' }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const call = async (method, url, body, auth) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
};
const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Ivy', 'Noah', 'ivy@x.test', 'noah@x.test', 'booked')").run().lastInsertRowid;
const other = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Zed', 'Amy', 'zed@x.test', 'amy@x.test', 'booked')").run().lastInsertRowid;
db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Booking Deposit (25%)', 1706.25, '2031-01-10')").run(id);
db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Someone else', 99, '2031-01-10')").run(other);
db.prepare("INSERT INTO timeline_events (couple_id, day_date, time, title) VALUES (?, '2031-07-05', '15:30', 'Ceremony')").run(id);
const fileId = (shared, couple = id) => db.prepare("INSERT INTO couple_files (couple_id, filename, mime_type, size, data, shared_with_couple) VALUES (?, ?, 'text/plain', 3, ?, ?)").run(couple, shared ? 'menu.txt' : 'staff-notes.txt', Buffer.from('abc'), shared ? 1 : 0).lastInsertRowid;
let tokenFromUrl = (u) => u.split('/').pop();

test('with the portal switched off, nothing lets a couple in', async () => {
  assert.equal((await call('POST', `/api/portal/invite/${id}`, {}, staff)).status, 409);
  assert.equal((await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'whatever-123' })).status, 403);
  const t = 'Bearer ' + jwt.sign({ coupleId: id }, process.env.JWT_SECRET);
  assert.equal((await call('GET', '/api/portal/invoices', null, t)).status, 401, 'an old token stops working');
  assert.equal((await call('GET', `/api/portal/access/${id}`, null, staff)).body.enabled, false);
});

test('switched on: setup link → own password → signed in; either email works; the link works once', async () => {
  process.env.ENABLE_COUPLE_PORTAL = '1';
  const inv = await call('POST', `/api/portal/invite/${id}`, { send_email: false }, staff);
  assert.equal(inv.status, 200);
  assert.match(inv.body.url, /^https:\/\/crm\.example\.test\/portal\/setup\/[a-f0-9]{48}$/);
  assert.ok(inv.body.invite_pending);
  const tok = tokenFromUrl(inv.body.url);
  assert.ok(!db.prepare('SELECT 1 FROM portal_invites WHERE token_hash = ?').get(tok), 'the raw token is never stored');
  assert.equal((await call('GET', `/api/portal/setup/${tok}`)).body.couple, 'Ivy & Noah');
  assert.equal((await call('POST', `/api/portal/setup/${tok}`, { password: 'short' })).status, 400);
  const done = await call('POST', `/api/portal/setup/${tok}`, { password: 'our-wedding-2031' });
  assert.equal(done.status, 201);
  assert.ok(done.body.token);
  assert.equal((await call('POST', `/api/portal/setup/${tok}`, { password: 'another-one-99' })).status, 404, 'once only');
  for (const e of ['ivy@x.test', 'NOAH@x.test ']) {
    assert.equal((await call('POST', '/api/auth/couple-login', { email: e, password: 'our-wedding-2031' })).status, 200, e);
  }
  const acc = await call('GET', `/api/portal/access/${id}`, null, staff);
  assert.equal(acc.body.has_login, true);
  assert.ok(acc.body.last_login_at);
});

test('couples see their own invoices with pay links, next steps, shared files only, and a read-only schedule', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  const invoices = (await call('GET', '/api/portal/invoices', null, t)).body;
  assert.equal(invoices.length, 1, 'only their own');
  assert.match(invoices[0].pay_url, /\/pay\/[a-f0-9]{48}$/);
  const steps = (await call('GET', '/api/portal/next-steps', null, t)).body;
  assert.ok(steps.some(s => s.kind === 'payment' && /Booking Deposit/.test(s.title)));

  const shared = fileId(true), hidden = fileId(false), theirs = fileId(true, other);
  const files = (await call('GET', '/api/portal/files', null, t)).body.map(f => f.id);
  assert.deepEqual(files, [shared]);
  assert.equal((await fetch(`${base}/api/portal/files/${hidden}`, { headers: { authorization: t } })).status, 404);
  assert.equal((await fetch(`${base}/api/portal/files/${theirs}`, { headers: { authorization: t } })).status, 404);
  assert.equal(await (await fetch(`${base}/api/portal/files/${shared}`, { headers: { authorization: t } })).text(), 'abc');
  // Staff choose what is shared.
  assert.equal((await call('PATCH', `/api/couple-files/${hidden}/share`, { shared: true }, staff)).body.shared_with_couple, 1);
  assert.equal((await call('GET', '/api/portal/files', null, t)).body.length, 2);

  const sched = (await call('GET', '/api/portal/schedule', null, t)).body;
  assert.equal(sched[0].title, 'Ceremony');
  assert.equal((await call('POST', '/api/timeline/portal', { time: '10:00', title: 'Brunch' }, t)).status, 403);
  assert.equal((await call('PUT', `/api/timeline/${sched[0].id}`, { title: 'Changed' }, t)).status, 403);
  assert.equal((await call('DELETE', `/api/timeline/${sched[0].id}`, null, t)).status, 403);
});

test('withdrawing access signs the couple out at once', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  assert.equal((await call('DELETE', `/api/portal/access/${id}`, null, staff)).body.has_login, false);
  assert.equal((await call('GET', '/api/portal/invoices', null, t)).status, 401);
  assert.equal((await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).status, 401);
});

test('forgot password: same reply for any address; a couple with a login gets a fresh link', async () => {
  // Give Ivy & Noah a login again.
  const tok = tokenFromUrl((await call('POST', `/api/portal/invite/${id}`, { send_email: false }, staff)).body.url);
  await call('POST', `/api/portal/setup/${tok}`, { password: 'our-wedding-2031' });
  const a = await call('POST', '/api/auth/couple-forgot-password', { email: 'nobody@x.test' });
  const b = await call('POST', '/api/auth/couple-forgot-password', { email: 'Noah@x.test' });
  assert.deepEqual(a.body, b.body);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_invites WHERE couple_id = ? AND used_at IS NULL').get(id).n, 1);
});
