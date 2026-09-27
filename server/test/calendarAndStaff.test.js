// Phase 4b: the calendar (holds, ranges, cancelled couples), keeping the
// pipeline column in step with the status, and staff logins.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-cal-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-cal';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const app = express();
app.use(express.json());
for (const r of ['calendar', 'couples', 'auth']) app.use(`/api/${r}`, require(`../routes/${r}`));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const tok = (userId, role, name) => 'Bearer ' + jwt.sign({ userId, email: `${name}@t`, name, role }, process.env.JWT_SECRET);
const admin = tok(adminId, 'admin', 'Kris');
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth = admin) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: auth } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const couple = (status = 'booked') => db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('A', 'B', ?, ?)")
  .run(`k${Math.random()}@test.invalid`, status).lastInsertRowid;

test('the calendar shows stays with their end date, holds, and leaves out cancelled couples', async () => {
  const live = couple(), gone = couple('cancelled'), quoting = couple('inquiry'), signing = couple('inquiry');
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2032-07-02', '3-Day Weekend')").run(live);
  db.prepare("INSERT INTO bookings (couple_id, event_date) VALUES (?, '2032-07-09')").run(gone);
  db.prepare("INSERT INTO proposals (couple_id, title, status, event_date, package_name) VALUES (?, 'Q', 'sent', '2032-08-06', '5-Day Experience')").run(quoting);
  db.prepare("INSERT INTO contracts (couple_id, title, content, status, wedding_date) VALUES (?, 'C', 'x', 'sent', '2032-08-20')").run(signing);
  db.prepare("INSERT INTO date_holds(couple_id,event_date,end_date,expires_at,reason) VALUES (?,'2032-08-06','2032-08-10',datetime('now','+7 days'),'Quote under review')").run(quoting);
  const { body } = await call('GET', '/api/calendar');
  const b = body.booked.find(x => x.couple_id === live);
  assert.equal(b.end_date, '2032-07-04', 'a 3-day stay ends two days later');
  assert.ok(!body.booked.some(x => x.couple_id === gone), 'cancelled couples hold nothing');
  const hold = body.holds.find(h => h.couple_id === quoting);
  assert.equal(hold.kind, 'hold');
  assert.equal(hold.end_date, '2032-08-10');
  assert.ok(!body.holds.some(h=>h.couple_id===signing),'Sending a document alone does not create an inventory hold');
});

test('a range of dates can be blocked at once, within reason', async () => {
  const r = await call('POST', '/api/calendar/block-range', { from: '2032-09-01', to: '2032-09-05', reason: 'Family trip' });
  assert.equal(r.status, 201);
  assert.equal(r.body.blocked, 5);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM blocked_dates WHERE date BETWEEN '2032-09-01' AND '2032-09-05'").get().n, 5);
  assert.equal((await call('POST', '/api/calendar/block-range', { from: '2032-09-05', to: '2032-09-01' })).status, 400);
  assert.equal((await call('POST', '/api/calendar/block-range', { from: '2032-01-01', to: '2032-12-31' })).status, 400);
});

test('changing a couple\'s status moves their pipeline card to match', async () => {
  const id = couple('inquiry');
  db.prepare("UPDATE couples SET pipeline_stage = 'proposal' WHERE id = ?").run(id);
  assert.equal((await call('PUT', `/api/couples/${id}`, { status: 'booked' })).status, 409);
  db.prepare("INSERT INTO bookings (couple_id, event_date) VALUES (?, '2031-07-05')").run(id);
  await call('PUT', `/api/couples/${id}`, { status: 'booked' });
  assert.equal(db.prepare('SELECT pipeline_stage FROM couples WHERE id = ?').get(id).pipeline_stage, 'booked');
  assert.equal((await call('PUT', `/api/couples/${id}`, { status: 'cancelled' })).status, 409);
  await call('POST', `/api/couples/${id}/cancel`, { reason: 'Changed plans' });
  assert.equal(db.prepare('SELECT pipeline_stage FROM couples WHERE id = ?').get(id).pipeline_stage, 'lost');
});

test('staff can change their own password; the admin manages logins', async () => {
  // Add a staff login.
  const add = await call('POST', '/api/auth/users', { name: 'Jo', email: 'jo@venue.test', role: 'staff', password: 'jo-first-password' });
  assert.equal(add.status, 201, JSON.stringify(add.body));
  assert.equal((await call('POST', '/api/auth/users', { name: 'Jo2', email: 'JO@venue.test', password: 'another-long-one' })).status, 409);
  assert.equal((await call('POST', '/api/auth/users', { name: 'Short', email: 's@venue.test', password: 'short' })).status, 400);
  const jo = tok(add.body.id, 'staff', 'Jo');

  // Staff cannot manage logins.
  assert.equal((await call('GET', '/api/auth/users', null, jo)).status, 403);

  // Jo changes their password.
  assert.equal((await call('POST', '/api/auth/change-password', { current_password: 'wrong', new_password: 'jo-second-password' }, jo)).status, 400);
  assert.equal((await call('POST', '/api/auth/change-password', { current_password: 'jo-first-password', new_password: 'jo-second-password' }, jo)).status, 200);
  const hash = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(add.body.id).password_hash;
  assert.ok(bcrypt.compareSync('jo-second-password', hash));

  // The admin cannot remove themselves or the last admin, but can remove Jo.
  assert.equal((await call('DELETE', `/api/auth/users/${adminId}`)).status, 400);
  assert.equal((await call('DELETE', `/api/auth/users/${add.body.id}`)).status, 200);
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'user.removed'").get());
});
