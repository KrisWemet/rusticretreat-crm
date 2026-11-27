// The damage deposit (rental agreement Section 4.2): received at check-in,
// inspected within 48 hours of check-out, refunded less deductions. Held money,
// so never an invoice, and never in the payment or GST reports.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-dd-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-dd';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const dd = require('../services/damageDeposit');
const { todaySummary, itemCount } = require('../services/today');
const { buildEventOrder, renderEventOrder } = require('../services/eventOrder');

const app = express();
app.use(express.json());
app.use('/api/damage-deposits', require('../routes/damageDeposits'));
app.use('/api/reports', require('../routes/reports'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const tok = (role, name) => 'Bearer ' + jwt.sign({ userId: adminId, email: `${name}@t`, name, role }, process.env.JWT_SECRET);
const admin = tok('admin', 'Shannon');
const staff = tok('staff', 'Jo');
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth = staff) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
};

let n = 0;
function couple(checkIn = '2026-07-03', checkOut = '2026-07-05') {
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Ivy', 'Noah', ?, ?, 'booked')")
    .run(`dd${++n}a@couple.test`, `dd${n}b@couple.test`).lastInsertRowid;
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, '3-Day Weekend')").run(id, checkIn, checkOut);
  return id;
}
const url = (id, step = '') => `/api/damage-deposits/couple/${id}${step ? `/${step}` : ''}`;

test('the amount comes from the signed agreement, else $1,000', () => {
  const plain = couple();
  assert.equal(dd.agreedAmount(plain), 1000);
  const custom = couple();
  const ct = db.prepare("INSERT INTO contracts (couple_id, title, content, status, template_key) VALUES (?, 'Rental agreement', '', 'signed', 'rental-agreement-2027')").run(custom).lastInsertRowid;
  db.prepare("INSERT INTO contract_field_values (contract_id, field_key, value, filled_by) VALUES (?, 'damage_deposit', '1,500.00', 'venue')").run(ct);
  assert.equal(dd.agreedAmount(custom), 1500);
});

test('received → inspected with deductions → refund of the rest', async () => {
  const id = couple();
  assert.equal((await call('GET', url(id), null, null)).status, 401, 'staff only');
  const v0 = (await call('GET', url(id))).body;
  assert.equal(v0.status, 'to_collect');
  assert.equal(v0.agreed_amount, 1000);
  assert.equal(v0.inspection_due, '2026-07-07', '48 hours after check-out');

  assert.equal((await call('POST', url(id, 'refund'), {})).status, 400, 'no refund before an inspection');
  assert.equal((await call('POST', url(id, 'received'), { date: '2999-01-01' })).status, 400, 'not in the future');
  const got = await call('POST', url(id, 'received'), { date: '2026-07-03', method: 'e-Transfer', reference: 'CA1234' });
  assert.equal(got.body.status, 'held');
  assert.equal(got.body.received, 1000);
  assert.equal((await call('POST', url(id, 'received'), {})).status, 409, 'recorded once');
  assert.equal((await call('PUT', url(id, 'amount'), { amount: 900 })).status, 409, 'amount locked once received');

  // Deductions need a reason, a description and an amount; trees are $500+.
  const bad = [
    [{ category: 'nope', description: 'x', amount: 10 }],
    [{ category: 'damage', description: '', amount: 10 }],
    [{ category: 'damage', description: 'Chair', amount: 0 }],
    [{ category: 'tree', description: 'Birch by the fire pit', amount: 300 }],
    [{ category: 'tree', description: 'Two spruce', amount: 800, quantity: 2 }],
  ];
  for (const deductions of bad) assert.equal((await call('POST', url(id, 'inspection'), { deductions })).status, 400, JSON.stringify(deductions));

  const insp = await call('POST', url(id, 'inspection'), { date: '2026-07-06', notes: 'Walked the site with Ivy',
    deductions: [{ category: 'damage', description: 'Broken lantern', amount: 45 }, { category: 'cleaning', description: 'Extra cleaning of the cookhouse', amount: 80 }] });
  assert.equal(insp.status, 200);
  assert.equal(insp.body.status, 'refund_due');
  assert.equal(insp.body.deducted, 125);
  assert.equal(insp.body.refund_due, 875);
  assert.equal(insp.body.kept, 125);

  // The inspection can be corrected until the refund is sent.
  const fixed = await call('POST', url(id, 'inspection'), { date: '2026-07-06', deductions: [{ category: 'damage', description: 'Broken lantern', amount: 45 }] });
  assert.equal(fixed.body.refund_due, 955);

  const ref = await call('POST', url(id, 'refund'), { date: '2026-07-08', reference: 'REF99', amount: 1 });
  assert.equal(ref.body.status, 'refunded');
  assert.equal(ref.body.refunded, 955, 'the refund is worked out, not typed');
  assert.equal((await call('POST', url(id, 'inspection'), { deductions: [] })).status, 409, 'closed once refunded');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n, 0, 'a deposit is never an invoice');
});

test('no deductions refunds it all; deductions over the deposit can be invoiced once', async () => {
  const clean = couple();
  await call('POST', url(clean, 'received'), { date: '2026-07-03' });
  const v = (await call('POST', url(clean, 'inspection'), { date: '2026-07-06', deductions: [] })).body;
  assert.equal(v.refund_due, 1000);

  const id = couple();
  await call('POST', url(id, 'received'), { date: '2026-07-03' });
  const insp = (await call('POST', url(id, 'inspection'), { date: '2026-07-06',
    deductions: [{ category: 'tree', description: 'Three spruce cut for firewood', amount: 1500, quantity: 3 }] })).body;
  assert.equal(insp.status, 'kept', 'nothing to refund closes it');
  assert.equal(insp.excess, 500);
  assert.equal((await call('POST', url(id, 'refund'), {})).status, 400, 'nothing to refund');
  const inv = await call('POST', url(id, 'excess-invoice'), {});
  assert.equal(inv.body.excess_invoice.amount, 500);
  await call('POST', url(id, 'excess-invoice'), {});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n, 1, 'invoiced once');
  assert.equal((await call('POST', url(id, 'inspection'), { deductions: [] })).status, 409, 'undo the invoice before changing the inspection');
});

test('only an admin can undo, one step at a time, and not a paid excess invoice', async () => {
  const id = couple();
  await call('POST', url(id, 'received'), { date: '2026-07-03' });
  await call('POST', url(id, 'inspection'), { date: '2026-07-06', deductions: [{ category: 'missing', description: 'Two camp chairs', amount: 1200 }] });
  await call('POST', url(id, 'excess-invoice'), {});
  assert.equal((await call('POST', url(id, 'undo'), {}, staff)).status, 403);
  const invId = dd.recordFor(id).excess_invoice_id;
  db.prepare('UPDATE invoices SET paid = 1 WHERE id = ?').run(invId);
  assert.equal((await call('POST', url(id, 'undo'), {}, admin)).status, 409);
  db.prepare('UPDATE invoices SET paid = 0 WHERE id = ?').run(invId);
  assert.equal((await call('POST', url(id, 'undo'), { reason: 'wrong amount' }, admin)).body.excess_invoice, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE id = ?').get(invId).n, 0, 'the unpaid invoice is withdrawn');
  assert.equal((await call('POST', url(id, 'undo'), {}, admin)).body.status, 'held', 'then the inspection');
  assert.equal((await call('POST', url(id, 'undo'), {}, admin)).body.status, 'to_collect', 'then the receipt');
  assert.equal((await call('POST', url(id, 'undo'), {}, admin)).status, 400, 'nothing left');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM activity_log WHERE action = 'damage_deposit.undo' AND couple_id = ?").get(id).n, 3);
});

test('the dashboard reminds the venue: collect, inspect, refund', async () => {
  const today = '2031-06-10';
  const arriving = couple('2031-06-13', '2031-06-15');
  const left = couple('2031-06-06', '2031-06-08');
  const refundOwed = couple('2031-05-30', '2031-06-01');
  const longAgo = couple('2031-03-01', '2031-03-03');
  db.prepare("INSERT INTO damage_deposits (couple_id, amount, received_at, received_amount, inspected_at, deductions) VALUES (?, 1000, '2031-05-30', 1000, '2031-06-02', '[]')").run(refundOwed);

  const s = todaySummary(today);
  assert.ok(s.deposits.collect.some(d => d.couple_id === arriving && d.amount === 1000), 'collect at check-in this week');
  const insp = s.deposits.inspect.find(d => d.couple_id === left);
  assert.ok(insp, 'inspection after check-out');
  assert.equal(insp.due, '2031-06-10');
  assert.equal(insp.overdue, false);
  assert.ok(s.deposits.refund.some(d => d.couple_id === refundOwed && d.amount === 1000), 'refund to send');
  assert.ok(!JSON.stringify(s.deposits).includes(`"couple_id":${longAgo},`), 'old stays with nothing recorded are not chased');
  assert.ok(itemCount(s) >= 3);
  assert.equal(todaySummary('2031-06-11').deposits.inspect.find(d => d.couple_id === left).overdue, true, 'overdue after 48 hours');
});

test('the event order shows it, and it never reaches the payments report', async () => {
  const id = couple('2026-08-07', '2026-08-09');
  assert.match(renderEventOrder(buildEventOrder(id)), /\$1,000\.00 to collect at check-in/);
  await call('POST', url(id, 'received'), { date: '2026-08-07', reference: 'X1' });
  assert.match(renderEventOrder(buildEventOrder(id)), /\$1,000\.00 received Fri, Aug\.? 7 by e-Transfer/);
  assert.doesNotMatch(renderEventOrder(buildEventOrder(id), { financials: false }), /Damage deposit/);

  const rep = await call('GET', '/api/reports/payments?from=2026-01-01&to=2026-12-31');
  assert.ok(!rep.body.rows.some(r => r.couple_id === id || /damage deposit/i.test(r.description)), 'held deposits are not income');
  const list = await call('GET', '/api/damage-deposits');
  assert.ok(list.body.totals.held_now >= 1000);
  const csv = await call('GET', '/api/damage-deposits?format=csv');
  assert.match(csv.body, /Couple,Check-in,Check-out,Status/);
});
