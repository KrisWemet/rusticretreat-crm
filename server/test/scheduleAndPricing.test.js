// Payment schedule, season prices and the 2028 agreement.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-sched-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-schedule';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { buildPaymentSchedule, normaliseCustomSchedule } = require('../services/paymentSchedule');
const { priceFor, normaliseSeasonPrices } = require('../services/packagePricing');
const tpl = require('../services/contractTemplate');

const app = express();
app.use(express.json());
app.use('/api/proposals', require('../routes/proposals'));
app.use('/api/packages', require('../routes/packages'));
app.use('/api/contracts', require('../routes/contracts'));
app.use('/api/invoices', require('../routes/invoices'));
app.use('/api/couples', require('../routes/couples'));
app.use('/api/auth', require('../routes/auth'));
let server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Admin', role: 'admin' }, process.env.JWT_SECRET);
async function call(method, url, body, auth = staff) {
  const res = await fetch(base + url, {
    method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('schedule is 25% now, 25% at 180 days, 50% at 90 days before check-in', () => {
  const s = buildPaymentSchedule({ total: 7875, checkIn: '2028-07-07', depositDue: '2026-10-01' });
  assert.deepEqual(s.map(p => [p.amount, p.due_date]), [
    [1968.75, '2026-10-01'],
    [1968.75, '2028-01-09'],   // 180 days before 7 July 2028
    [3937.5, '2028-04-08'],    // 90 days before
  ]);
  assert.equal(s.reduce((a, p) => a + p.amount, 0), 7875);
});

test('amounts always add up to the total, even with odd cents', () => {
  const s = buildPaymentSchedule({ total: 6825.01, checkIn: '2028-07-07', depositDue: '2026-10-01' });
  assert.equal(Math.round(s.reduce((a, p) => a + p.amount, 0) * 100), 682501);
});

test('a late booking makes past milestones due with the deposit', () => {
  const s = buildPaymentSchedule({ total: 8000, checkIn: '2027-01-15', depositDue: '2026-10-01' });
  assert.equal(s[1].due_date, '2026-10-01'); // 180 days before is already past
  assert.equal(s[2].due_date, '2026-10-17'); // 90 days before is still ahead
});

test('season prices: 2028 price for a 2028 wedding, default otherwise', () => {
  const pkg = { price: 6500, season_prices: '{"2028":7500}' };
  assert.equal(priceFor(pkg, '2028-06-02'), 7500);
  assert.equal(priceFor(pkg, '2027-06-04'), 6500);
  assert.equal(priceFor(pkg, null), 6500);
  assert.throws(() => normaliseSeasonPrices({ 28: 100 }), /not a valid year/);
  assert.throws(() => normaliseSeasonPrices({ 2028: -5 }), /positive/);
});

test('the seeded 3-Day and 5-Day packages carry the 2028 prices', async () => {
  const r = await call('GET', '/api/packages');
  const byName = Object.fromEntries(r.body.map(p => [p.name, p]));
  assert.deepEqual(byName['3-Day Weekend'].season_prices, { 2028: 7500 });
  assert.deepEqual(byName['5-Day Experience'].season_prices, { 2028: 8500 });
  assert.equal(byName['2-Day Weekday Escape'].is_active, 0, 'the retired 2-Day package is switched off');
});

test('staff can edit season prices and bad input is refused', async () => {
  const pkg = (await call('GET', '/api/packages')).body.find(p => p.name === '3-Day Weekend');
  const ok = await call('PUT', `/api/packages/${pkg.id}`, { season_prices: { 2028: 7500, 2029: 8000 } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.season_prices, { 2028: 7500, 2029: 8000 });
  const bad = await call('PUT', `/api/packages/${pkg.id}`, { season_prices: { 2029: 'lots' } });
  assert.equal(bad.status, 400);
});

test('the 2028 agreement differs from 2027 only in its prices', () => {
  const p27 = tpl.getPacket('rental-2027'), p28 = tpl.getPacket('rental-2028');
  const [a27, a28] = [p27.documents[0], p28.documents[0]];
  const pkg = doc => doc.sections.flatMap(s => s.blocks).find(b => b.t === 'choice' && b.key === 'package');
  assert.deepEqual(pkg(a28).options.map(o => [o.value, o.price]), [['3-day', 7500], ['5-day', 8500]]);
  // Everything else — every clause, initials block and the payment schedule — is identical.
  const strip = doc => JSON.stringify({ ...doc, key: 0, subtitle: 0, sections: doc.sections.map(s => ({ ...s, blocks: s.blocks.filter(b => !(b.t === 'choice' && b.key === 'package')) })) });
  assert.equal(strip(a28), strip(a27));
  assert.deepEqual(a28.paymentSchedule, a27.paymentSchedule);
  // 2-Day is retired: marked in 2027, absent in 2028.
  assert.equal(pkg(a27).options.find(o => o.value === '2-day').retired, true);
  assert.equal(pkg(a28).options.some(o => o.value === '2-day'), false);
});

test('a contract for a 2028 wedding must use the 2028 agreement', async () => {
  const couple = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email) VALUES ('Y', 'Z', 'yz@test.invalid')").run().lastInsertRowid;
  const wrong = await call('POST', '/api/contracts', { couple_id: couple, title: 'Agreement', template_packet: 'rental-2027', wedding_date: '2028-06-02' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /2028/);
  const right = await call('POST', '/api/contracts', { couple_id: couple, title: 'Agreement', template_packet: 'rental-2028', wedding_date: '2028-06-02' });
  assert.equal(right.status, 201, JSON.stringify(right.body));
});

test('accepting a proposal creates the three agreement instalments', async () => {
  const couple = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('P', 'Q', 'pq@test.invalid', 'inquiry')").run().lastInsertRowid;
  db.prepare(`INSERT INTO proposals (couple_id, title, package_name, event_date, end_date, guest_count, subtotal, tax, total, status, public_token)
              VALUES (?, 'x', '3-Day Weekend', '2028-06-02', '2028-06-04', 70, 7500, 375, 7875, 'sent', 'tok_sched_1')`).run(couple);
  const r = await call('POST', '/api/proposals/public/tok_sched_1/accept', { accepted_name: 'P' }, null);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const inv = db.prepare('SELECT description, amount, due_date FROM invoices WHERE couple_id = ? ORDER BY id').all(couple);
  assert.equal(inv.length, 3);
  assert.deepEqual(inv.slice(1).map(i => [i.amount, i.due_date]), [[1968.75, '2027-12-05'], [3937.5, '2028-03-04']]);
  assert.match(inv[1].description, /180 days/);
  assert.match(inv[2].description, /90 days/);
});

test('a custom plan must add up to the total, and every row must be valid', () => {
  const split = [
    { description: 'Deposit — part 1 of 2', amount: 853.13, due_date: '2026-10-01' },
    { description: 'Deposit — part 2 of 2', amount: 853.12, due_date: '2026-10-15' },
    { description: 'Second', amount: 1706.25, due_date: '2027-01-24' },
    { description: 'Balance', amount: 3412.5, due_date: '2027-04-24' },
  ];
  assert.equal(normaliseCustomSchedule(split, 6825).length, 4);
  assert.throws(() => normaliseCustomSchedule(split.slice(1), 6825), /add up to \$5971\.87 but the total is \$6825\.00/);
  assert.throws(() => normaliseCustomSchedule([{ ...split[0], description: ' ' }, ...split.slice(1)], 6825), /Payment 1 needs a description/);
  assert.throws(() => normaliseCustomSchedule([{ ...split[0], amount: 0 }], 6825), /above \$0/);
  assert.throws(() => normaliseCustomSchedule([{ ...split[0], due_date: '2026-13-40' }], 6825), /invalid due date/);
  assert.throws(() => normaliseCustomSchedule([], 6825), /at least one/);
  // With the deposit already paid, the plan covers only what is left.
  assert.equal(normaliseCustomSchedule(split.slice(2), 6825, 1706.25).length, 2);
});

test('staff can save a split-deposit schedule; paid invoices stay and a bad plan changes nothing', async () => {
  const couple = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('S', 'T', 'st@test.invalid', 'booked')").run().lastInsertRowid;
  const rows = () => db.prepare('SELECT description, amount, due_date, paid FROM invoices WHERE couple_id = ? ORDER BY due_date, id').all(couple);

  const preview = await call('POST', '/api/invoices/schedule-preview', { total_price: 6825, wedding_date: '2027-07-23' });
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.map(p => p.amount), [1706.25, 1706.25, 3412.5]);

  const items = [
    { description: 'Deposit — part 1 of 2', amount: 853.13, due_date: '2026-10-01' },
    { description: 'Deposit — part 2 of 2', amount: 853.12, due_date: '2026-10-15' },
    { description: preview.body[1].label, amount: 1706.25, due_date: preview.body[1].due_date },
    { description: preview.body[2].label, amount: 3412.5, due_date: preview.body[2].due_date },
  ];
  const saved = await call('POST', `/api/invoices/schedule/${couple}`, { total_price: 6825, wedding_date: '2027-07-23', items });
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.deepEqual(rows().map(r => [r.amount, r.due_date]), [[853.13, '2026-10-01'], [853.12, '2026-10-15'], [1706.25, '2027-01-24'], [3412.5, '2027-04-24']]);

  // First half of the deposit comes in; the rest is re-planned around it.
  db.prepare("UPDATE invoices SET paid = 1 WHERE couple_id = ? AND due_date = '2026-10-01'").run(couple);
  const short = await call('POST', `/api/invoices/schedule/${couple}`, { total_price: 6825, items: items.slice(2) });
  assert.equal(short.status, 400);
  assert.match(short.body.error, /still owed after \$853\.13 already paid is \$5971\.87/);
  assert.equal(rows().length, 4, 'a refused plan leaves the invoices alone');

  const rest = await call('POST', `/api/invoices/schedule/${couple}`, { total_price: 6825, items: items.slice(1) });
  assert.equal(rest.status, 201, JSON.stringify(rest.body));
  assert.deepEqual(rows().map(r => [r.amount, r.paid]), [[853.13, 1], [853.12, 0], [1706.25, 0], [3412.5, 0]]);
});

test('staff can record how a couple heard about us, and list staff for task assignment', async () => {
  const made = await call('POST', '/api/couples', {
    partner1_name: 'H', partner2_name: 'J', email: 'h@test.invalid', partner2_email: 'j@test.invalid',
    venue_package: '3-Day Weekend', referral_source: 'Friend or Family Referral',
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.referral_source, 'Friend or Family Referral');
  const edited = await call('PUT', `/api/couples/${made.body.id}`, { referral_source: 'Google Search' });
  assert.equal(edited.body.referral_source, 'Google Search');
  const untouched = await call('PUT', `/api/couples/${made.body.id}`, { notes: 'x' });
  assert.equal(untouched.body.referral_source, 'Google Search', 'an edit without the field keeps it');

  const staffList = await call('GET', '/api/auth/staff');
  assert.equal(staffList.status, 200);
  assert.ok(staffList.body.length > 0 && staffList.body.every(u => u.name && !('password_hash' in u) && !('email' in u)));
  assert.equal((await call('GET', '/api/auth/staff', null, null)).status, 401);
});

// Separate processes: the demo clean-up runs at boot, and only in production.
test('demo couples are removed once in production, real couples are kept, dev keeps its demo data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-demo-'));
  const run = (nodeEnv, script) => {
    const r = spawnSync(process.execPath, ['-e', `const db = require('./db'); ${script}`], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8',
      env: { ...process.env, DB_PATH: path.join(dir, 'd.db'), JWT_SECRET: 'x', NODE_ENV: nodeEnv },
    });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const count = "console.log('COUNT', db.prepare(\"SELECT COUNT(*) n FROM couples WHERE email LIKE '%@example.com'\").get().n, db.prepare(\"SELECT COUNT(*) n FROM couples WHERE email = 'real@couple.test'\").get().n, db.prepare('SELECT COUNT(*) n FROM bookings').get().n)";
  // Development boot: seeded, demo kept. Add a real couple with a booking.
  const dev = run('development', `db.prepare("INSERT INTO couples (partner1_name, partner2_name, email) VALUES ('Real','Couple','real@couple.test')").run();
    db.prepare("INSERT INTO bookings (couple_id, event_date) VALUES ((SELECT id FROM couples WHERE email='real@couple.test'), '2029-01-05')").run(); ${count}`);
  assert.match(dev, /COUNT 4 1 3/);
  // Production boot: demo couples and their bookings go; the real couple stays.
  assert.match(run('production', count), /COUNT 0 1 1/);
  assert.match(run('production', "console.log(db.prepare(\"SELECT COUNT(*) n FROM app_migrations WHERE name='remove-demo-couples-2026-09'\").get().n)"), /^1/m);
  fs.rmSync(dir, { recursive: true, force: true });
});
