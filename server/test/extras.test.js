// Extras: the owner's add-on list with prices by year, placeholder prices that
// can never reach a couple or an invoice by accident, and itemised invoices.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ex-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-ex';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const fd = require('../services/finalDetails');
const extras = require('../services/extras');
const { buildEventOrder, renderEventOrder } = require('../services/eventOrder');

const app = express();
app.use(express.json());
app.use('/api/addons', require('../routes/addons'));
app.use('/api/extras', require('../routes/extras'));
app.use('/api/invoices', require('../routes/invoices'));
app.use('/api/final-details', require('../routes/finalDetails'));
app.use('/api/damage-deposits', require('../routes/damageDeposits'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const staff = 'Bearer ' + jwt.sign({ userId: adminId, email: 'jo@t', name: 'Jo', role: 'staff' }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: staff } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const addon = (name) => db.prepare('SELECT * FROM addons WHERE name = ?').get(name);
let n = 0;
function couple(checkIn = '2027-07-02', checkOut = '2027-07-04') {
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Lou', 'Max', ?, ?, 'booked')")
    .run(`ex${++n}a@t.test`, `ex${n}b@t.test`).lastInsertRowid;
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, '3-Day Weekend')").run(id, checkIn, checkOut);
  return id;
}

test('the missing extras are added once, with placeholder prices', () => {
  for (const name of ['Propane tank', 'Extra firewood', 'Signage', 'Linen laundry fee', 'Décor consumables']) {
    const a = addon(name);
    assert.ok(a, name);
    assert.equal(a.price_placeholder, 1, `${name} is a placeholder`);
  }
  assert.equal(addon('Décor consumables').on_final_form, 0, 'consumables are counted at check-out, not chosen on the form');
  assert.equal(addon('Propane tank').unit_label, 'per 20 lb tank');
});

test('placeholder prices never reach the couple’s Final Details Form', () => {
  const names = fd.offeredExtras('2027-07-02').map(a => a.name);
  assert.ok(!names.includes('Propane tank'));
  assert.ok(names.includes('Generator Rental'));
});

test('setting a price clears the placeholder; prices can differ by wedding year', async () => {
  const p = addon('Propane tank');
  const r = await call('PUT', `/api/addons/${p.id}`, { price: 45, season_prices: { 2028: 50 } });
  assert.equal(r.status, 200);
  assert.equal(r.body.price_placeholder, false, 'a real price replaces the placeholder');
  assert.deepEqual(r.body.season_prices, { 2028: 50 });
  assert.equal((await call('PUT', `/api/addons/${p.id}`, { season_prices: { 20: 5 } })).status, 400, 'bad year');
  const offered = (y) => fd.offeredExtras(`${y}-07-02`).find(a => a.name === 'Propane tank').price;
  assert.equal(offered(2027), 45);
  assert.equal(offered(2028), 50, 'the 2028 price for a 2028 wedding');
  // The couple's form prices it for their year.
  const c28 = couple('2028-07-07', '2028-07-09');
  const v = fd.view(c28);
  assert.equal(v.offered.find(a => a.name === 'Propane tank').price, 50);
  const { value } = fd.cleanInput({ guests: 80, campers: 0, tents: 12, rvs: 8, extras: [{ addon_id: p.id, quantity: 2 }] }, { coupleId: c28 });
  assert.equal(value.extras[0].unit_price, 50);
  // Put it back to a placeholder for the next tests.
  await call('PUT', `/api/addons/${p.id}`, { price_placeholder: true, season_prices: null });
});

test('billing extras makes a separate, itemised invoice with GST', async () => {
  const id = couple();
  const gen = addon('Generator Rental');
  const prop = addon('Propane tank');
  const before = db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n;

  const refused = await call('POST', `/api/extras/couple/${id}`, { items: [{ addon_id: prop.id, quantity: 3 }] });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /placeholder price/);

  const r = await call('POST', `/api/extras/couple/${id}`, { due_date: '2027-06-25', items: [
    { addon_id: gen.id, quantity: 1 },
    { addon_id: prop.id, quantity: 3, unit_price: 42 },
    { label: 'Extra trash run', quantity: 1, unit_price: 30 },
  ] });
  assert.equal(r.status, 201);
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(r.body.invoice_id);
  assert.equal(inv.amount, 373.8, '(200 + 126 + 30) × 1.05');
  assert.equal(inv.due_date, '2027-06-25');
  const items = extras.itemsFor(inv.id);
  assert.deepEqual(items.map(i => [i.label, i.quantity, i.amount, i.kind]), [
    ['Generator Rental', 1, 200, 'item'],
    ['Propane tank (per 20 lb tank)', 3, 126, 'item'],
    ['Extra trash run', 1, 30, 'item'],
    ['GST 5%', 1, 17.8, 'gst'],
  ]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n, before + 1, 'one new invoice; the schedule is untouched');

  const list = (await call('GET', `/api/invoices/couple/${id}`)).body;
  assert.equal(list.find(i => i.id === inv.id).items.length, 4, 'the invoice list carries the lines');
  assert.equal((await call('PUT', `/api/invoices/${inv.id}`, { amount: 100 })).status, 409, 'an itemised total cannot be typed over');
  assert.equal((await call('PUT', `/api/invoices/${inv.id}`, { due_date: '2027-06-20' })).status, 200, 'other fields can change');

  const eo = renderEventOrder(buildEventOrder(id));
  assert.match(eo, /Extras ordered/);
  assert.match(eo, /Propane tank \(per 20 lb tank\) × 3/);
  assert.doesNotMatch(eo, /Extra trash run/, 'only catalog extras are things to set out');
  assert.doesNotMatch(renderEventOrder(buildEventOrder(id), { financials: false }), /\$126\.00/, 'no prices on the vendor copy');

  await call('DELETE', `/api/invoices/${inv.id}`);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoice_items WHERE invoice_id = ?').get(inv.id).n, 0, 'lines go with the invoice');
});

test('bad lines are refused with a reason', async () => {
  const id = couple();
  for (const items of [[], [{ label: '', quantity: 1, unit_price: 5 }], [{ label: 'x', quantity: 0, unit_price: 5 }], [{ label: 'x', quantity: 1 }], [{ addon_id: 99999, quantity: 1 }]]) {
    assert.equal((await call('POST', `/api/extras/couple/${id}`, { items })).status, 400, JSON.stringify(items));
  }
});

test('the default due date: two weeks out, but by the Final Details deadline before the stay', () => {
  const id = couple('2031-07-04', '2031-07-06');
  // Far ahead: two weeks from today (the deadline is later).
  const due = require('../services/schedule').albertaToday();
  const view = require('../routes/extras');
  assert.ok(view);
  const twoWeeks = require('../services/planning').addDays(due, 14);
  return call('GET', `/api/extras/couple/${id}`).then(r => assert.equal(r.body.default_due, twoWeeks));
});

test('the Final Details overage invoice and the deposit excess invoice are itemised', async () => {
  const id = couple('2026-08-07', '2026-08-09');
  const sub = await call('POST', `/api/final-details/couple/${id}/submit`, { guests: 82, campers: 10, tents: 12, rvs: 8, confirmed_by: 'Lou' });
  assert.equal(sub.status, 200, JSON.stringify(sub.body).slice(0, 300));
  const ok = await call('POST', `/api/final-details/couple/${id}/approve`, {});
  const items = extras.itemsFor(ok.body.invoice.id);
  assert.deepEqual(items.map(i => [i.amount, i.kind]), [[50, 'item'], [2.5, 'gst']]);
  assert.equal(ok.body.invoice.amount, 52.5, 'the total is the sum of the lines');

  await call('POST', `/api/damage-deposits/couple/${id}/received`, { date: '2026-08-07' });
  await call('POST', `/api/damage-deposits/couple/${id}/inspection`, { date: '2026-08-09', deductions: [{ category: 'tree', description: 'Three spruce', amount: 1500, quantity: 3 }] });
  const dd = await call('POST', `/api/damage-deposits/couple/${id}/excess-invoice`, {});
  const lines = extras.itemsFor(dd.body.excess_invoice.id);
  assert.deepEqual(lines.map(l => [l.amount, l.kind]), [[1500, 'item'], [-1000, 'credit']]);
  assert.equal(dd.body.excess_invoice.amount, 500);
});

test('the couple’s form shows each extra’s own unit (“per 20 lb tank”)', async () => {
  const p = addon('Propane tank');
  await call('PUT', `/api/addons/${p.id}`, { price: 44 });
  const id = couple('2027-09-03', '2027-09-05');
  const link = (await call('POST', `/api/final-details/couple/${id}/link`, {})).body.link;
  const res = await fetch(`${base}/api/final-details/public/${link.split('/').pop()}`);
  const page = await res.json();
  const offered = page.offered.find(a => a.name === 'Propane tank');
  assert.equal(offered.price, 44);
  assert.equal(offered.unit_label, 'per 20 lb tank');
});

// Day-of coordination (agreement Section 5.4) must exist after the update,
// whatever the live database holds — added only when no coordination add-on
// exists under any name, never duplicated, never touching the owner's own.
test('Day-of Coordination is kept if present and added if missing, never twice', () => {
  const { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-coord-'));
  const boot = (code) => execFileSync(process.execPath, ['-e', code], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8',
    env: { ...process.env, DB_PATH: path.join(dir, 'c.db'), JWT_SECRET: 'x', NODE_ENV: 'test' },
  });
  const count = "const db = require('./db'); process.stdout.write(JSON.stringify(db.prepare(\"SELECT name, price_placeholder FROM addons WHERE LOWER(name) LIKE '%coordinat%'\").all()));";
  try {
    // A fresh database already has it from the starting list: still one.
    const present = JSON.parse(boot(count).trim().split('\n').pop());
    assert.equal(present.length, 1);
    assert.equal(present[0].price_placeholder, 0, 'the owner’s existing one is not changed');
    // Deleted by the owner and the update not yet applied: it comes back, as a placeholder.
    boot("const db = require('./db'); db.prepare(\"DELETE FROM addons WHERE name = 'Day-of Coordination'\").run(); db.prepare(\"DELETE FROM app_migrations WHERE name = 'extras-list-2027'\").run();");
    const added = JSON.parse(boot(count).trim().split('\n').pop());
    assert.deepEqual(added, [{ name: 'Day-of Coordination', price_placeholder: 1 }]);
    // Renamed by the owner ("Wedding day coordination"): left alone, no duplicate.
    boot("const db = require('./db'); db.prepare(\"UPDATE addons SET name = 'Wedding day coordination' WHERE name = 'Day-of Coordination'\").run(); db.prepare(\"DELETE FROM app_migrations WHERE name = 'extras-list-2027'\").run();");
    const renamed = JSON.parse(boot(count).trim().split('\n').pop());
    assert.deepEqual(renamed.map(r => r.name), ['Wedding day coordination']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
