// Phase 4: recording payments properly, editing invoices, reminders on demand,
// the printable statement, tour confirmations, booking payment status, the
// extra-guest add-on, and forms awaiting return.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-pages-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-pages';
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 're_test';
process.env.ADMIN_EMAIL = 'venue@test.invalid';
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
  const app = express();
  app.use(express.json());
  for (const r of ['invoices', 'tours', 'bookings', 'forms']) app.use(`/api/${r}`, require(`../routes/${r}`));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); stub.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: staff } });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, body: type.includes('json') ? await res.json() : await res.text() };
};
const couple = (f = {}) => {
  const v = { partner1_name: 'Ava', partner2_name: 'Ben', email: `c${Math.random()}@test.invalid`, status: 'booked', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};
const invoice = (coupleId, f = {}) => {
  const v = { couple_id: coupleId, description: 'Deposit', amount: 1706.25, due_date: '2031-07-01', ...f };
  return db.prepare(`INSERT INTO invoices (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};

test('recording a payment keeps its date, method and reference, and the receipt is optional', async () => {
  const id = couple();
  const inv = invoice(id);
  sent = [];
  const r = await call('PATCH', `/api/invoices/${inv}/paid`, { paid: true, paid_at: '2031-06-20', payment_method: 'Cheque', reference: '#1042', send_receipt: false });
  assert.equal(r.status, 200);
  assert.equal(r.body.paid, 1);
  assert.equal(r.body.paid_at, '2031-06-20');
  assert.equal(r.body.payment_method, 'Cheque');
  assert.equal(r.body.payment_reference, '#1042');
  assert.equal(r.body.receipt_sent, null, 'no receipt asked for');
  assert.equal(sent.length, 0);
  const log = db.prepare("SELECT summary FROM activity_log WHERE action = 'invoice.paid' AND entity_id = ?").get(inv);
  assert.match(log.summary, /paid by Cheque \(ref #1042\)/);

  const inv2 = invoice(id, { description: 'Second' });
  const r2 = await call('PATCH', `/api/invoices/${inv2}/paid`, { paid: true, payment_method: 'E-Transfer' });
  assert.equal(r2.body.receipt_sent, true, 'receipt by default');
  assert.match(sent[0].subject, /^Payment received — Second/);
});

test('editing an invoice is logged with what changed', async () => {
  const id = couple();
  const inv = invoice(id);
  const r = await call('PUT', `/api/invoices/${inv}`, { amount: 1800, due_date: '2031-08-01' });
  assert.equal(r.status, 200);
  const e = db.prepare("SELECT * FROM activity_log WHERE action = 'invoice.updated' AND entity_id = ?").get(inv);
  assert.deepEqual(JSON.parse(e.detail).amount, { from: 1706.25, to: 1800 });
});

test('a reminder can be sent on demand, but not for a paid invoice', async () => {
  const id = couple({ partner2_email: 'b2@test.invalid' });
  const inv = invoice(id);
  sent = [];
  const r = await call('POST', `/api/invoices/${inv}/remind`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(sent.length, 1);
  assert.ok(sent[0].to.includes('b2@test.invalid'));
  db.prepare('UPDATE invoices SET paid = 1 WHERE id = ?').run(inv);
  assert.equal((await call('POST', `/api/invoices/${inv}/remind`)).status, 400);
});

test('the printable statement lists payments and the balance, escaped', async () => {
  const id = couple({ partner1_name: '<Ava>' });
  invoice(id, { amount: 1000, paid: 1, paid_at: '2031-01-02' });
  invoice(id, { description: 'Balance', amount: 500 });
  const r = await call('GET', `/api/invoices/couple/${id}/statement/print`);
  assert.equal(r.status, 200);
  assert.match(r.body, /&lt;Ava&gt;/);
  assert.match(r.body, /Balance owing<\/td><td class="r">\$500\.00/);
  assert.match(r.body, /Interac e-Transfer/);
});

test('scheduling a tour emails a confirmation only when asked', async () => {
  const id = couple({ email: 'tour@test.invalid' });
  const t = db.prepare("INSERT INTO tours (couple_id, name, email, status) VALUES (?, 'Ava & Ben', 'tour@test.invalid', 'requested')").run(id).lastInsertRowid;
  sent = [];
  await call('PUT', `/api/tours/${t}`, { scheduled_at: '2031-06-14T10:30', status: 'scheduled' });
  assert.equal(sent.length, 0, 'no email unless ticked');
  const r = await call('PUT', `/api/tours/${t}`, { scheduled_at: '2031-06-14T10:30', status: 'scheduled', notify: true });
  assert.equal(r.body.confirmation_sent, true);
  assert.deepEqual(sent[0].to, ['tour@test.invalid'], 'one email even though the couple has the same address');
  assert.match(sent[0].text, /Saturday, June 14, 2031 at 10:30 am/);
});

test('a booking\'s payment status follows its invoices', async () => {
  const mk = () => { const id = couple(); db.prepare("INSERT INTO bookings (couple_id, event_date) VALUES (?, '2031-07-04')").run(id); return id; };
  const none = mk(), partial = mk(), paid = mk(), late = mk();
  invoice(partial, { amount: 100, paid: 1 }); invoice(partial, { amount: 100, due_date: '2099-01-01' });
  invoice(paid, { amount: 100, paid: 1 });
  invoice(late, { amount: 100, due_date: '2020-01-01' });
  const { body } = await call('GET', '/api/bookings');
  const st = id => body.find(b => b.couple_id === id).payment_status;
  assert.equal(st(none), 'pending');
  assert.equal(body.find(b => b.couple_id === none).payment_schedule_missing, true);
  assert.equal(st(partial), 'partial');
  assert.equal(st(paid), 'paid');
  assert.equal(st(late), 'overdue');
});

test('the extra-guest add-on counts guests over 80, as the agreement does', () => {
  const a = db.prepare("SELECT name FROM addons WHERE unit = 'per_guest'").all().map(r => r.name);
  assert.ok(a.includes('Extra Guest (over 80)'));
  assert.ok(!a.includes('Extra Guest (over 60)'));
});

test('forms sent but not returned are listed, and archived couples are left out', async () => {
  const id = couple(), gone = couple();
  const f = db.prepare("INSERT INTO forms (title) VALUES ('Details')").run().lastInsertRowid;
  const a1 = db.prepare("INSERT INTO form_assignments (form_id, couple_id, link_sent_at) VALUES (?, ?, datetime('now'))").run(f, id).lastInsertRowid;
  db.prepare("INSERT INTO form_assignments (form_id, couple_id) VALUES (?, ?)").run(f, couple()); // never sent
  db.prepare("INSERT INTO form_assignments (form_id, couple_id, link_sent_at) VALUES (?, ?, datetime('now'))").run(f, gone);
  db.prepare("UPDATE couples SET archived_at = datetime('now') WHERE id = ?").run(gone);
  const r = await call('GET', '/api/forms/awaiting');
  assert.deepEqual(r.body.map(x => x.id), [a1]);
});
