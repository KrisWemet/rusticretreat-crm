// Card payments with the fee passed on, and the QuickBooks export.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-card-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-card';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test';
delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET;

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const card = require('../services/cardPayments');
const app = express();
app.use(express.json());
app.use('/api/payments', require('../routes/payments'));
app.use('/api/reports', require('../routes/reports'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const tok = (role) => 'Bearer ' + jwt.sign({ userId: adminId, email: 'x@t', name: 'X', role }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const call = async (method, url, body, auth) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
};
const couple = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Ana', 'Ben', 'ab@t.test', 'ba@t.test', 'booked')").run().lastInsertRowid;
const invoice = db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Final Balance (50%)', 3412.50, '2031-04-24')").run(couple).lastInsertRowid;

test('the card fee is 2.4% by default, admin-set, never above the Canadian cap', async () => {
  assert.deepEqual(card.cardQuote(3412.5), { amount: 3412.5, fee_pct: 2.4, fee: 81.9, total: 3494.4 });
  assert.equal((await call('PUT', '/api/payments/card-settings', { fee_pct: 2 }, tok('staff'))).status, 403);
  assert.equal((await call('PUT', '/api/payments/card-settings', { fee_pct: 3 }, tok('admin'))).status, 400);
  assert.equal((await call('PUT', '/api/payments/card-settings', { fee_pct: 2 }, tok('admin'))).body.fee_pct, 2);
  await call('PUT', '/api/payments/card-settings', { fee_pct: 2.4 }, tok('admin'));
});

test('an invoice pay link works without a login and shows e-Transfer; card is off until Stripe is set up', async () => {
  const link = await call('POST', `/api/payments/invoice/${invoice}/pay-link`, {}, tok('staff'));
  assert.match(link.body.url, /^https:\/\/crm\.example\.test\/pay\/[a-f0-9]{48}$/);
  assert.equal(link.body.card_enabled, false);
  const again = await call('POST', `/api/payments/invoice/${invoice}/pay-link`, {}, tok('staff'));
  assert.equal(again.body.url, link.body.url, 'the same link each time');
  const t = link.body.url.split('/').pop();
  const page = await call('GET', `/api/payments/public/${t}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.card.enabled, false);
  assert.equal(page.body.card.total, 3494.4);
  assert.ok(page.body.etransfer_email);
  assert.equal(page.body.couple, 'Ana & Ben');
  assert.equal((await call('POST', `/api/payments/public/${t}/checkout`)).status, 503);
  assert.equal((await call('GET', '/api/payments/public/not-a-token')).status, 404);
  assert.equal((await call('POST', `/api/payments/invoice/${invoice}/pay-link`, {})).status, 401, 'staff only');
});

test('QuickBooks export: one line per payment, the card fee on its own line, DD/MM/YYYY, no BOM', async () => {
  db.prepare("UPDATE invoices SET paid = 1, paid_at = '2031-03-02', payment_method = 'Credit card', payment_reference = 'pi_123', card_fee = 81.9 WHERE id = ?").run(invoice);
  const res = await fetch(`${base}/api/reports/quickbooks.csv?from=2031-01-01&to=2031-12-31`, { headers: { authorization: tok('staff') } });
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.notEqual(bytes[0], 0xef, 'no byte-order mark');
  const lines = bytes.toString('utf8').trim().split(/\r?\n/);
  assert.equal(lines[0], 'Date,Description,Amount');
  assert.equal(lines[1], '02/03/2031,Ana & Ben: Final Balance (50%) (Credit card ref pi_123),3412.50');
  assert.equal(lines[2], '02/03/2031,Ana & Ben: credit card fee on Final Balance (50%),81.90');
});
