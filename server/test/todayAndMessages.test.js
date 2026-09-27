// Phase 3: the "today and this week" list, the morning summary email, the
// couple overview, and emailing a couple from Messages.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-today-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-today';
process.env.NODE_ENV = 'production';
process.env.RESEND_API_KEY = 're_test';
process.env.ADMIN_EMAIL = 'venue@test.invalid';
process.env.BASE_URL = 'https://crm.example.test';
delete process.env.ENABLE_COUPLE_PORTAL;

let sent = [];
const stub = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => { sent.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}'); });
});

const express = require('express');
const jwt = require('jsonwebtoken');
let db, server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Kris', role: 'admin' }, process.env.JWT_SECRET);

test.before(async () => {
  await new Promise(r => stub.listen(0, r));
  process.env.RESEND_API_URL = `http://127.0.0.1:${stub.address().port}/emails`;
  db = require('../db');
  // A clean slate: only this test's records.
  for (const t of ['tasks', 'tours', 'invoices', 'bookings', 'contracts', 'form_assignments', 'messages', 'proposals', 'couples']) db.prepare(`DELETE FROM ${t}`).run();
  const app = express();
  app.use(express.json());
  app.use('/api/couples', require('../routes/couples'));
  app.use('/api/messages', require('../routes/messages'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server?.close(); stub.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: staff } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const couple = (f = {}) => {
  const v = { partner1_name: 'Ava', partner2_name: 'Ben', email: `c${Math.random()}@test.invalid`, status: 'booked', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};

const TODAY = '2031-07-10';

test('the today list covers tours, tasks, payments, contracts, forms and weddings, on the right dates', () => {
  const { todaySummary, itemCount } = require('../services/today');
  const a = couple(), gone = couple({ status: 'cancelled' });
  db.prepare("INSERT INTO tours (couple_id, name, status, scheduled_at) VALUES (?, 'Today tour', 'scheduled', '2031-07-10T10:00')").run(a);
  db.prepare("INSERT INTO tours (couple_id, name, status, scheduled_at) VALUES (?, 'Friday tour', 'scheduled', '2031-07-12T14:30')").run(a);
  db.prepare("INSERT INTO tours (couple_id, name, status, scheduled_at) VALUES (?, 'Far tour', 'scheduled', '2031-07-30T10:00')").run(a);
  db.prepare("INSERT INTO tasks (title, couple_id, due_date) VALUES ('Late task', ?, '2031-07-01')").run(a);
  db.prepare("INSERT INTO tasks (title, couple_id, due_date) VALUES ('Today task', ?, '2031-07-10')").run(a);
  db.prepare("INSERT INTO tasks (title, couple_id, due_date) VALUES ('Next week', ?, '2031-07-20')").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Deposit', 100, '2031-07-15')").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Old', 50, '2031-07-01')").run(a);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Cancelled couple', 50, '2031-07-12')").run(gone);
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2031-07-08', '5-Day Experience')").run(a);
  const s = todaySummary(TODAY);
  assert.deepEqual(s.tours_today.map(t => t.name), ['Today tour']);
  assert.deepEqual(s.tours_week.map(t => t.name), ['Friday tour']);
  assert.deepEqual(s.tasks_due.map(t => [t.title, t.overdue]), [['Late task', true], ['Today task', false]]);
  assert.deepEqual(s.payments_due.map(p => [p.description, p.overdue]), [['Old', true], ['Deposit', false]]);
  assert.equal(s.weddings_week.length, 1);
  assert.equal(s.weddings_week[0].on_site, true, 'a 5-day stay that began two days ago is on site');
  assert.ok(itemCount(s) >= 7);
});

test('the morning summary lists each section with links, and flags what is overdue', async () => {
  const { todaySummary } = require('../services/today');
  const email = require('../services/email');
  sent = [];
  const r = await email.sendMorningSummary(todaySummary(TODAY));
  assert.equal(r.delivered, true);
  const m = sent[0];
  assert.deepEqual(m.to, ['venue@test.invalid']);
  assert.match(m.subject, /^Today at Rustic Retreat: Thu, Jul 10/);
  assert.match(m.text, /TOURS TODAY\n• 10:00 am — Today tour/);
  assert.match(m.text, /TASKS DUE\n• OVERDUE Late task — Ava & Ben/);
  assert.match(m.html, /<strong style="color:#dc2626">Overdue<\/strong> Late task/);
  assert.match(m.text, /https:\/\/crm\.example\.test\/payments/);
});

test('the couple overview gathers their records, balance and history', async () => {
  const id = couple({ partner2_email: 'p2@test.invalid' });
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Deposit', 1706.25, '2031-01-01', 1)").run(id);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Balance', 5118.75, '2031-04-01')").run(id);
  db.prepare("INSERT INTO email_log (couple_id, kind, to_addr, subject, delivered) VALUES (?, 'proposal', 'x', 'Your proposal', 1)").run(id);
  const r = await call('GET', `/api/couples/${id}/overview`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.balance, { total: 6825, paid: 1706.25, balance: 5118.75 });
  assert.equal(r.body.invoices.length, 2);
  assert.equal(r.body.emails[0].subject, 'Your proposal');
  assert.ok(Array.isArray(r.body.activity));
  assert.equal((await call('GET', '/api/couples/999999/overview')).status, 404);
});

test('staff can email a couple from Messages: both partners, reply to the venue, saved in the thread', async () => {
  const id = couple({ email: 'mia@test.invalid', partner2_email: 'sam@test.invalid' });
  const cfg = await call('GET', '/api/messages/config');
  assert.deepEqual(cfg.body, { portal_enabled: false, sms_enabled: false, email_enabled: true });

  sent = [];
  const r = await call('POST', `/api/messages/${id}`, { channel: 'email', subject: 'Your tour', content: 'Hi Mia & Sam,\nSee you <Saturday>!' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.channel, 'email');
  assert.equal(r.body.delivery_status, 'sent');
  const m = sent[0];
  assert.deepEqual(m.to, ['mia@test.invalid', 'sam@test.invalid']);
  assert.equal(m.reply_to, 'venue@test.invalid');
  assert.equal(m.subject, 'Your tour');
  assert.match(m.html, /See you &lt;Saturday&gt;!/);
  assert.ok(db.prepare("SELECT 1 FROM email_log WHERE couple_id = ? AND kind = 'message'").get(id), 'logged on their record');

  // With no channel given and the portal off, email is the default.
  sent = [];
  const d = await call('POST', `/api/messages/${id}`, { content: 'Default channel' });
  assert.equal(d.body.channel, 'email');
  assert.equal(sent.length, 1);

  // A portal message while the portal is off would never be seen.
  const p = await call('POST', `/api/messages/${id}`, { channel: 'portal', content: 'x' });
  assert.equal(p.status, 400);
  assert.match(p.body.error, /portal is switched off/);
});
