// "Mark as done" for work handled outside the CRM: tasks, enquiry follow-ups
// and unanswered proposals, each with an optional note and date that land in
// the couple's history.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-done-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-done';
process.env.NODE_ENV = 'test';
delete process.env.RESEND_API_KEY;
delete process.env.ENABLE_COUPLE_PORTAL;

const express = require('express');
const jwt = require('jsonwebtoken');
let db, server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'shannon@test', name: 'Shannon', role: 'staff' }, process.env.JWT_SECRET);

test.before(async () => {
  db = require('../db');
  for (const t of ['tasks', 'tours', 'invoices', 'bookings', 'contracts', 'proposals', 'activity_log', 'couples']) db.prepare(`DELETE FROM ${t}`).run();
  const app = express();
  app.use(express.json());
  app.use('/api/tasks', require('../routes/tasks'));
  app.use('/api/couples', require('../routes/couples'));
  app.use('/api/proposals', require('../routes/proposals'));
  app.use('/api/analytics', require('../routes/analytics'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: staff } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const couple = (f = {}) => {
  const v = { partner1_name: 'Ava', partner2_name: 'Ben', email: `c${Math.random()}@test.invalid`, status: 'inquiry', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};
const history = (id) => db.prepare('SELECT action, summary, user_name FROM activity_log WHERE couple_id = ? ORDER BY id').all(id);
const { albertaToday } = require('../services/schedule');
const daysAgo = (n) => { const d = new Date(albertaToday() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

test('a task handled outside the CRM can be marked done with a note and an earlier date, and undone', async () => {
  const c = couple();
  const task = db.prepare("INSERT INTO tasks (title, couple_id, due_date) VALUES ('Follow up after tour', ?, ?)").run(c, daysAgo(3)).lastInsertRowid;

  const r = await call('PATCH', `/api/tasks/${task}/done`, { note: 'Called them', done_on: daysAgo(2) });
  assert.equal(r.status, 200);
  assert.equal(r.body.completed, 1);
  assert.equal(r.body.completion_note, 'Called them');
  assert.equal(r.body.completed_at.slice(0, 10), daysAgo(2));
  const h = history(c);
  assert.equal(h.at(-1).action, 'task.done');
  assert.match(h.at(-1).summary, /Follow up after tour.*Called them.*done on/);
  assert.equal(h.at(-1).user_name, 'Shannon');

  // It no longer shows as due.
  const { todaySummary } = require('../services/today');
  assert.equal(todaySummary(albertaToday()).tasks_due.filter(t => t.id === task).length, 0);

  const undo = await call('PATCH', `/api/tasks/${task}/done`, { done: false });
  assert.equal(undo.body.completed, 0);
  assert.equal(undo.body.completion_note, null);
  assert.equal(undo.body.completed_at, null);
  assert.equal(history(c).at(-1).action, 'task.reopened');
});

test('note and date are optional; a future or nonsense date is refused', async () => {
  const task = db.prepare("INSERT INTO tasks (title) VALUES ('Order firewood')").run().lastInsertRowid;
  assert.equal((await call('PATCH', `/api/tasks/${task}/done`, { done_on: '2999-01-01' })).status, 400);
  assert.equal((await call('PATCH', `/api/tasks/${task}/done`, { done_on: 'yesterday' })).status, 400);
  const r = await call('PATCH', `/api/tasks/${task}/done`, {});
  assert.equal(r.status, 200);
  assert.equal(r.body.completed, 1);
  assert.equal(r.body.completion_note, null);
  assert.equal((await call('PATCH', '/api/tasks/99999/done', {})).status, 404);
});

test('marking an enquiry followed up takes it off "Needs a follow-up" and records how', async () => {
  const c = couple();
  const listed = async () => (await call('GET', '/api/analytics/attention')).body.needs_follow_up.some(x => x.id === c);
  assert.ok(await listed());

  const r = await call('PATCH', `/api/couples/${c}/contacted`, { note: 'Texted Ava', done_on: daysAgo(1) });
  assert.equal(r.status, 200);
  assert.equal(r.body.contacted_at.slice(0, 10), daysAgo(1));
  assert.equal(await listed(), false);
  assert.match(history(c).at(-1).summary, /followed up — Texted Ava/);

  await call('PATCH', `/api/couples/${c}/contacted`, { contacted: false });
  assert.ok(await listed());
});

test('recording a follow-up on an unanswered proposal holds it off "No response" for two weeks', async () => {
  const c = couple({ status: 'lead' });
  const p = db.prepare("INSERT INTO proposals (couple_id, title, status, sent_at) VALUES (?, 'Weekend package', 'sent', ?)").run(c, daysAgo(20)).lastInsertRowid;
  const stalled = async () => (await call('GET', '/api/analytics/attention')).body.stalled_proposals.some(x => x.id === p);
  assert.ok(await stalled());

  const r = await call('PATCH', `/api/proposals/${p}/followed-up`, { note: 'Called, still deciding' });
  assert.equal(r.status, 200);
  assert.equal(await stalled(), false);
  assert.match(history(c).at(-1).summary, /Followed up on proposal "Weekend package" — Called, still deciding/);

  // Two weeks after that follow-up, with still no answer, it is back.
  db.prepare('UPDATE proposals SET followed_up_at = ? WHERE id = ?').run(`${daysAgo(15)} 18:00:00`, p);
  assert.ok(await stalled());
});
