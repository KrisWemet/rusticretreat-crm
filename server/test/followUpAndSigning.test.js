// Phase 1a: no automatic nudges to couples, honest payment reminders, and the
// signing / proposal fixes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-fu-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-followup';
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 're_test';
process.env.ADMIN_EMAIL = 'venue@test.invalid';
process.env.BASE_URL = 'https://crm.example.test';
delete process.env.ENABLE_COUPLE_PORTAL;

// A stand-in for Resend that records what it was sent.
let sent = [], failAll = false;
const stub = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    if (failAll) { res.writeHead(500); return res.end('down'); }
    sent.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}');
  });
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
  app.use('/api/contracts', require('../routes/contracts'));
  app.use('/api/proposals', require('../routes/proposals'));
  app.use('/api/couples', require('../routes/couples'));
  app.use('/api/inquire', require('../routes/inquire'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); stub.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth = staff) => {
  const res = await fetch(base + url, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let n = 0;
const couple = (fields = {}) => {
  const f = { partner1_name: 'Ava', partner2_name: 'Ben', email: `c${++n}@test.invalid`, status: 'inquiry', ...fields };
  const cols = Object.keys(f);
  return db.prepare(`INSERT INTO couples (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(f)).lastInsertRowid;
};
const age = (id, days) => db.prepare(`UPDATE couples SET created_at = datetime('now', ?) WHERE id = ?`).run(`-${days} days`, id);

test('the pipeline back-fill is recorded as a one-time migration', () => {
  assert.ok(db.prepare("SELECT 1 FROM app_migrations WHERE name = 'pipeline-backfill-v1'").get());
});

test('an enquiry needs a follow-up until it has a tour, proposal, booking or contacted mark', async () => {
  const { needsFollowUp } = require('../services/leadNurture');
  const ids = { plain: couple(), toured: couple(), proposed: couple(), booked: couple(), contacted: couple(), requestedOnly: couple() };
  db.prepare("INSERT INTO tours (couple_id, name, status) VALUES (?, 'x', 'scheduled')").run(ids.toured);
  db.prepare("INSERT INTO tours (couple_id, name, status) VALUES (?, 'x', 'requested')").run(ids.requestedOnly);
  db.prepare("INSERT INTO proposals (couple_id, title, status) VALUES (?, 'P', 'sent')").run(ids.proposed);
  db.prepare("INSERT INTO bookings (couple_id, event_date) VALUES (?, '2030-07-05')").run(ids.booked);
  const r = await call('PATCH', `/api/couples/${ids.contacted}/contacted`, { contacted: true });
  assert.equal(r.status, 200);
  assert.ok(r.body.contacted_at);

  const waiting = new Set(needsFollowUp().map(c => c.id));
  assert.ok(waiting.has(ids.plain));
  assert.ok(waiting.has(ids.requestedOnly), 'a tour request nobody has scheduled still needs a follow-up');
  for (const k of ['toured', 'proposed', 'booked', 'contacted']) assert.ok(!waiting.has(ids[k]), k);

  const list = await call('GET', '/api/couples/follow-ups');
  assert.equal(list.status, 200);
  assert.ok(list.body.some(c => c.id === ids.plain));

  await call('PATCH', `/api/couples/${ids.contacted}/contacted`, { contacted: false });
  assert.ok(needsFollowUp().some(c => c.id === ids.contacted), 'undoing the mark puts it back');
});

test('couples are never nudged; the venue is alerted once, after a week', async () => {
  db.prepare("UPDATE couples SET contacted_at = datetime('now') WHERE status IN ('lead', 'inquiry')").run();
  const fresh = couple(); age(fresh, 3);
  const old = couple(); age(old, 8);
  const { checkFollowUps } = require('../services/leadNurture');

  sent = [];
  await checkFollowUps();
  assert.equal(sent.length, 1, 'only the week-old enquiry is flagged');
  assert.deepEqual(sent[0].to, ['venue@test.invalid'], 'the alert goes to the venue, never the couple');
  assert.match(sent[0].subject, /^Needs a follow-up — Ava & Ben \(8 days/);
  assert.match(sent[0].text, new RegExp(`/clients/${old}`));

  sent = [];
  await checkFollowUps();
  assert.equal(sent.length, 0, 'once only');

  // A failed alert is retried the next day.
  const other = couple(); age(other, 9);
  failAll = true; await checkFollowUps(); failAll = false;
  assert.equal(db.prepare('SELECT nurture_7d_sent FROM couples WHERE id = ?').get(other).nurture_7d_sent, 0);
  sent = []; await checkFollowUps();
  assert.equal(sent.length, 1);
});

test('payment reminders give e-Transfer details, reach both partners, and only count once delivered', async () => {
  const { checkAndSendReminders } = require('../services/paymentReminder');
  db.prepare('DELETE FROM invoices').run();
  const id = couple({ status: 'booked', partner2_email: 'ben@test.invalid' });
  const gone = couple({ status: 'cancelled' });
  const inDays = d => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
  const inv = db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Second Payment (25%)', 1706.25, ?)").run(id, inDays(5)).lastInsertRowid;
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Deposit', 500, ?)").run(gone, inDays(5));

  failAll = true;
  let r = await checkAndSendReminders();
  failAll = false;
  assert.equal(r.failed, 1, 'the cancelled couple is skipped');
  assert.equal(db.prepare('SELECT reminder_7d_sent FROM invoices WHERE id = ?').get(inv).reminder_7d_sent, 0, 'not marked sent when the email failed');

  sent = [];
  r = await checkAndSendReminders();
  assert.equal(r.sent, 1);
  const m = sent[0];
  assert.deepEqual(m.to, [db.prepare('SELECT email FROM couples WHERE id = ?').get(id).email, 'ben@test.invalid']);
  assert.match(m.text, /\$1,706\.25 CAD/);
  assert.match(m.text, /Interac e-Transfer to rusticretreatalberta@gmail\.com/);
  assert.doesNotMatch(m.html, /portal/i, 'no link to the switched-off portal');
  const flags = db.prepare('SELECT reminder_14d_sent, reminder_7d_sent, reminder_1d_sent FROM invoices WHERE id = ?').get(inv);
  assert.deepEqual({ ...flags }, { reminder_14d_sent: 1, reminder_7d_sent: 1, reminder_1d_sent: 0 });

  sent = [];
  await checkAndSendReminders();
  assert.equal(sent.length, 0, 'not sent twice');
});

test('reminder wording covers a payment due today', () => {
  const { dueWording } = require('../services/email');
  assert.equal(dueWording(0), 'today');
  assert.equal(dueWording(1), 'tomorrow');
  assert.equal(dueWording(7), 'in 7 days');
});

test('a proposal emailed to nobody is not reported as delivered', async () => {
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('No', 'Mail', '', 'inquiry')").run().lastInsertRowid;
  const p = db.prepare("INSERT INTO proposals (couple_id, title, total, status) VALUES (?, 'Quote', 100, 'draft')").run(id).lastInsertRowid;
  const r = await call('POST', `/api/proposals/${p}/send`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.delivered, false);
});

test('an accepted proposal cannot be declined from its public link', async () => {
  const id = couple();
  db.prepare("INSERT INTO proposals (couple_id, title, total, status, public_token) VALUES (?, 'Q', 100, 'accepted', 'tok-accepted')").run(id);
  const r = await call('POST', '/api/proposals/public/tok-accepted/decline', {}, null);
  assert.equal(r.status, 409);
  assert.equal(db.prepare("SELECT status FROM proposals WHERE public_token = 'tok-accepted'").get().status, 'accepted');
  db.prepare("INSERT INTO proposals (couple_id, title, total, status, public_token) VALUES (?, 'Q2', 100, 'sent', 'tok-sent')").run(id);
  assert.equal((await call('POST', '/api/proposals/public/tok-sent/decline', {}, null)).status, 200);
});

test('public availability matches the booking rules: stay plus reset day, cancelled couples ignored', async () => {
  const live = couple({ status: 'booked' });
  const cancelled = couple({ status: 'cancelled' });
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2031-07-04', '3-Day Weekend')").run(live);
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date) VALUES (?, '2031-08-01', '2031-08-03')").run(cancelled);
  const { body } = await call('GET', '/api/inquire/availability', null, null);
  const u = new Set(body.unavailableDates);
  for (const d of ['2031-07-04', '2031-07-05', '2031-07-06', '2031-07-07']) assert.ok(u.has(d), d);
  assert.ok(!u.has('2031-07-08'));
  assert.ok(!u.has('2031-08-01'), 'a cancelled couple holds nothing');
});

async function signedChain({ total = 6825, date = '2032-07-02' } = {}) {
  const id = couple({ partner2_email: `p2-${n}@test.invalid` });
  const c = await call('POST', '/api/contracts', {
    couple_id: id, title: 'Rental Agreement', content: 'Terms.', wedding_date: date,
    package_name: '3-Day Weekend', total_price: total, guest_count: 80,
  });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const cid = c.body.id;
  const v = await call('POST', `/api/contracts/${cid}/sign-venue`, { signature_data: 'data:image/png;base64,AA', signer_name: 'Kris', agreed: true });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  return { id, cid };
}
const signAs = async (cid, order, name) => {
  const tok = db.prepare('SELECT signing_token FROM contract_signers WHERE contract_id = ? AND sign_order = ?').get(cid, order).signing_token;
  return call('POST', `/api/contracts/sign/${tok}`, { signer_name: name, signature_data: 'data:image/png;base64,AA', agreed: true }, null);
};

test('resending a contract link starts a fresh signing window', async () => {
  const { cid } = await signedChain();
  db.prepare("UPDATE contracts SET signing_expires_at = datetime('now', '-1 day') WHERE id = ?").run(cid);
  const r = await call('POST', `/api/contracts/${cid}/send`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const exp = db.prepare('SELECT signing_expires_at FROM contracts WHERE id = ?').get(cid).signing_expires_at;
  assert.ok(new Date(exp.replace(' ', 'T') + 'Z') > new Date(Date.now() + 40 * 86400000));
});

test('the last signature books the stay with its check-out date and the standard payment schedule', async () => {
  const { id, cid } = await signedChain();
  assert.equal((await signAs(cid, 2, 'Ava')).status, 200);
  const r = await signAs(cid, 3, 'Ben');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.fully_signed, true);
  const b = db.prepare('SELECT * FROM bookings WHERE couple_id = ?').get(id);
  assert.equal(b.event_date, '2032-07-02');
  assert.equal(b.end_date, '2032-07-04');
  const inv = db.prepare('SELECT amount, due_date FROM invoices WHERE couple_id = ? ORDER BY id').all(id);
  assert.deepEqual(inv.map(i => i.amount), [1706.25, 1706.25, 3412.5]);
  assert.equal(inv[1].due_date, '2032-01-04', '180 days before check-in');
  const cp = db.prepare('SELECT status, pipeline_stage FROM couples WHERE id = ?').get(id);
  assert.deepEqual({ ...cp }, { status: 'booked', pipeline_stage: 'booked' });
});

test('if the date was taken meanwhile, the signatures stand and staff get a task instead of a double booking', async () => {
  const { id, cid } = await signedChain({ date: '2033-07-01' });
  await signAs(cid, 2, 'Ava');
  // Another couple books the same weekend before partner 2 signs.
  const rival = couple({ status: 'booked' });
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2033-07-01', '3-Day Weekend')").run(rival);
  const r = await signAs(cid, 3, 'Ben');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(db.prepare('SELECT status FROM contracts WHERE id = ?').get(cid).status, 'signed');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE couple_id = ?').get(id).n, 0);
  assert.ok(db.prepare("SELECT 1 FROM tasks WHERE couple_id = ? AND title = 'Date clash on a signed contract'").get(id));
});
