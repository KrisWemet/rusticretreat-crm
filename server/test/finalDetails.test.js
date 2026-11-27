// The Final Details Form (rental agreement Section 2.3) and self-service
// "forgot your password".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-fd-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-fd';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const fd = require('../services/finalDetails');

const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/final-details', require('../routes/finalDetails'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const tok = (userId, role, name) => 'Bearer ' + jwt.sign({ userId, email: `${name}@t`, name, role }, process.env.JWT_SECRET);
const admin = tok(adminId, 'admin', 'Shannon');
const staff = tok(adminId, 'staff', 'Jo');
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
};

let n = 0;
function bookedCouple(checkIn = '2031-07-04', checkOut = '2031-07-06') {
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('Ava', 'Ben', ?, 'booked')")
    .run(`fd${++n}@couple.test`).lastInsertRowid;
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date, package_name) VALUES (?, ?, ?, '3-Day Weekend')").run(id, checkIn, checkOut);
  return id;
}
const R = fd.DEFAULT_RATES;
const counts = (o = {}) => ({ guests: 80, campers: 40, tents: 12, rvs: 8, rv_over_30ft: false, extras: [], ...o });
const amount = (q, re) => q.lines.find(l => re.test(l.label))?.amount;

// ── Pricing ──────────────────────────────────────────────────────────────────
test('within the included numbers nothing is owed', () => {
  const q = fd.compute(counts(), { rates: R, nights: 2 });
  assert.deepEqual(q.lines, []);
  assert.equal(q.total, 0);
  assert.deepEqual(q.errors, []);
});

test('guests over 80 are $25 each, once, and need written approval', () => {
  const q = fd.compute(counts({ guests: 85 }), { rates: R, nights: 2 });
  assert.equal(amount(q, /guest/), 125);
  assert.equal(q.gst, 6.25);
  assert.equal(q.total, 131.25);
  assert.ok(q.notes.some(t => /written approval/.test(t)));
});

test('extra tents and RVs are charged per night', () => {
  const q = fd.compute(counts({ tents: 14, rvs: 10 }), { rates: R, nights: 2 });
  assert.equal(amount(q, /tent/), 2 * 2 * 25);
  assert.equal(amount(q, /RV/), 2 * 2 * 35);
  assert.equal(q.subtotal, 240);
  assert.equal(q.total, 252);
});

test('every 3 unused tent slots become one more included RV', () => {
  const six = fd.compute(counts({ tents: 6, rvs: 10 }), { rates: R, nights: 2 });
  assert.equal(six.allowance.rvs, 10, '6 unused slots = 2 more RVs');
  assert.equal(six.total, 0);
  const none = fd.compute(counts({ tents: 0, rvs: 12 }), { rates: R, nights: 2 });
  assert.equal(none.allowance.rvs, 12, '12 unused slots = 4 more RVs');
  assert.equal(none.total, 0);
  const seven = fd.compute(counts({ tents: 7, rvs: 10 }), { rates: R, nights: 2 });
  assert.equal(seven.allowance.rvs, 9, '5 unused slots = only 1 more RV');
  assert.equal(amount(seven, /RV/), 1 * 2 * 35);
});

test('the hard caps are refused, and long RVs get the exit-route note', () => {
  const q = fd.compute(counts({ guests: 101, rvs: 16, rv_over_30ft: true }), { rates: R, nights: 2 });
  assert.equal(q.errors.length, 2);
  assert.ok(q.notes.some(t => /alternate exit/.test(t)));
});

test('extras are priced from the add-on list, and GST follows the setting', () => {
  const q = fd.compute(counts({ extras: [{ name: 'Firewood bundle', unit_price: 12.5, quantity: 4 }] }), { rates: { ...R, gst_rate: 0 }, nights: 2 });
  assert.equal(q.total, 50);
  assert.equal(q.gst, 0);
});

test('admins can change the rates; bad values are refused', async () => {
  assert.equal((await call('PUT', '/api/final-details/rates', { guest_fee: 30 }, staff)).status, 403);
  assert.equal((await call('PUT', '/api/final-details/rates', { guest_fee: -1 }, admin)).status, 400);
  const ok = await call('PUT', '/api/final-details/rates', { guest_fee: 30 }, admin);
  assert.equal(ok.body.rates.guest_fee, 30);
  assert.equal(fd.compute(counts({ guests: 81 })).total, 31.5);
  await call('PUT', '/api/final-details/rates', { guest_fee: 25 }, admin);
});

// ── The couple's link ────────────────────────────────────────────────────────
test('the couple fills in the form from the link; once submitted it is locked', async () => {
  const id = bookedCouple();
  const addon = db.prepare("INSERT INTO addons (name, price, unit) VALUES ('Propane tank', 40, 'flat')").run().lastInsertRowid;
  const hidden = db.prepare("INSERT INTO addons (name, price, unit, on_final_form) VALUES ('Staff-only thing', 99, 'flat', 0)").run().lastInsertRowid;

  assert.equal((await call('POST', `/api/final-details/couple/${id}/link`, {})).status, 401, 'staff only');
  const link = await call('POST', `/api/final-details/couple/${id}/link`, {}, staff);
  assert.equal(link.status, 200);
  assert.match(link.body.link, /^https:\/\/crm\.example\.test\/final-details\/[a-f0-9]{48}$/);
  assert.equal(link.body.deadline, '2031-06-27', '7 days before check-in');
  assert.equal(link.body.nights, 2);
  const token = link.body.link.split('/').pop();

  const page = await call('GET', `/api/final-details/public/${token}`);
  assert.equal(page.status, 200);
  assert.equal(page.body.couple.partner1_name, 'Ava');
  assert.equal(page.body.couple.email, undefined, 'no contact details on the public page');
  assert.ok(page.body.offered.some(a => a.id === addon));
  assert.ok(!page.body.offered.some(a => a.id === hidden), 'add-ons can be kept off the form');

  const values = { guests: 85, campers: 50, tents: 14, rvs: 8, extras: [{ addon_id: addon, quantity: 2 }, { addon_id: hidden, quantity: 1 }] };
  const quote = await call('POST', `/api/final-details/public/${token}/quote`, values);
  assert.equal(quote.body.subtotal, 125 + 100 + 80);
  assert.equal((await call('GET', `/api/final-details/couple/${id}`, null, staff)).body.record.submitted_at, null, 'a quote saves nothing');

  assert.equal((await call('POST', `/api/final-details/public/${token}/submit`, { ...values, agreed: true })).status, 400, 'needs a name');
  assert.equal((await call('POST', `/api/final-details/public/${token}/submit`, { ...values, signer_name: 'Ava B' })).status, 400, 'needs the box ticked');
  assert.equal((await call('POST', `/api/final-details/public/${token}/submit`, { guests: 85, signer_name: 'Ava B', agreed: true })).status, 400, 'every count is required');
  assert.equal((await call('POST', `/api/final-details/public/${token}/submit`, { ...values, guests: 120, signer_name: 'Ava B', agreed: true })).status, 400, 'over the cap');

  const done = await call('POST', `/api/final-details/public/${token}/submit`, { ...values, signer_name: 'Ava B', agreed: true });
  assert.equal(done.status, 200);
  assert.equal(done.body.submitted.name, 'Ava B');
  assert.equal(done.body.quote.total, 320.25);
  assert.equal(done.body.values.extras.length, 1, 'the hidden add-on was ignored');

  const again = await call('POST', `/api/final-details/public/${token}/submit`, { ...values, guests: 80, signer_name: 'Ava B', agreed: true });
  assert.equal(again.status, 409);
  assert.equal((await call('PUT', `/api/final-details/couple/${id}`, { guests: 80 }, staff)).status, 409, 'staff cannot quietly edit it either');

  // A later rate change does not reprice a submitted form.
  await call('PUT', '/api/final-details/rates', { guest_fee: 50 }, admin);
  assert.equal((await call('GET', `/api/final-details/public/${token}`)).body.quote.total, 320.25);
  await call('PUT', '/api/final-details/rates', { guest_fee: 25 }, admin);
});

test('approving creates the overage invoice once; only an admin can reopen, and not after payment', async () => {
  const id = bookedCouple('2031-08-01', '2031-08-03');
  assert.equal((await call('POST', `/api/final-details/couple/${id}/approve`, {}, staff)).status, 400, 'nothing submitted yet');
  assert.equal((await call('POST', `/api/final-details/couple/${id}/submit`, counts({ guests: 82 }), staff)).status, 400, 'needs who confirmed');
  const sub = await call('POST', `/api/final-details/couple/${id}/submit`, { ...counts({ guests: 82 }), confirmed_by: 'Ben, by phone' }, staff);
  assert.equal(sub.status, 200);
  assert.match(sub.body.record.submitted_by, /^staff/);

  const ok = await call('POST', `/api/final-details/couple/${id}/approve`, {}, staff);
  assert.equal(ok.body.invoice.amount, 52.5);
  assert.equal(ok.body.invoice.due_date, '2031-07-25');
  await call('POST', `/api/final-details/couple/${id}/approve`, {}, staff);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n, 1, 'approving twice makes one invoice');

  assert.equal((await call('POST', `/api/final-details/couple/${id}/unlock`, {}, staff)).status, 403);
  db.prepare('UPDATE invoices SET paid = 1 WHERE id = ?').run(ok.body.invoice.id);
  assert.equal((await call('POST', `/api/final-details/couple/${id}/unlock`, {}, admin)).status, 409, 'paid: cannot reopen');
  db.prepare('UPDATE invoices SET paid = 0 WHERE id = ?').run(ok.body.invoice.id);
  const open = await call('POST', `/api/final-details/couple/${id}/unlock`, { reason: 'typo' }, admin);
  assert.equal(open.status, 200);
  assert.equal(open.body.record.submitted_at, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM invoices WHERE couple_id = ?').get(id).n, 0, 'the unpaid invoice is withdrawn');
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'final_details.unlocked' AND couple_id = ?").get(id));
});

test('nothing owed: approving creates no invoice', async () => {
  const id = bookedCouple('2031-09-05', '2031-09-07');
  await call('POST', `/api/final-details/couple/${id}/submit`, { ...counts(), confirmed_by: 'Ava' }, staff);
  const ok = await call('POST', `/api/final-details/couple/${id}/approve`, {}, staff);
  assert.ok(ok.body.record.reviewed_at);
  assert.equal(ok.body.invoice, null);
});

test('renewing the link retires the old one; bad and expired tokens are refused', async () => {
  const id = bookedCouple('2031-10-03', '2031-10-05');
  const first = (await call('POST', `/api/final-details/couple/${id}/link`, {}, staff)).body.link.split('/').pop();
  const second = (await call('POST', `/api/final-details/couple/${id}/link`, {}, staff)).body.link.split('/').pop();
  assert.equal((await call('GET', `/api/final-details/public/${first}`)).status, 404);
  assert.equal((await call('GET', `/api/final-details/public/${second}`)).status, 200);
  db.prepare("UPDATE final_details SET token_expires_at = datetime('now', '-1 minute') WHERE couple_id = ?").run(id);
  assert.equal((await call('GET', `/api/final-details/public/${second}`)).status, 404);
  assert.equal((await call('GET', '/api/final-details/public/not-a-token')).status, 404);
});

// ── Forgot password ──────────────────────────────────────────────────────────
test('forgot password: same reply for any address; a real login gets a one-time link', async () => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
  assert.equal((await call('POST', '/api/auth/forgot-password', { email: 'nope' })).status, 400);
  const unknown = await call('POST', '/api/auth/forgot-password', { email: 'nobody@nowhere.test' });
  const known = await call('POST', '/api/auth/forgot-password', { email: `  ${user.email.toUpperCase()} ` });
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body, 'the reply does not reveal who has a login');

  const inv = db.prepare('SELECT * FROM user_invites WHERE user_id = ? AND used_at IS NULL').all(user.id);
  assert.equal(inv.length, 1);
  const hours = (new Date(inv[0].expires_at + 'Z') - Date.now()) / 3600000;
  assert.ok(hours > 1.9 && hours <= 2, 'expires in 2 hours');
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'user.password_reset_requested'").get());

  // Asking again replaces the earlier link rather than piling them up.
  await call('POST', '/api/auth/forgot-password', { email: user.email });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM user_invites WHERE user_id = ? AND used_at IS NULL').get(user.id).n, 1);
});

test('forgot password: the reset link sets the new password, and the requests are rate limited', async () => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(adminId);
  // The raw token is only ever emailed, so plant a known one the same way.
  const crypto = require('crypto');
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('DELETE FROM user_invites WHERE user_id = ?').run(user.id);
  db.prepare(`INSERT INTO user_invites (token_hash, name, email, role, user_id, created_by, expires_at)
              VALUES (?, ?, ?, ?, ?, NULL, datetime('now', '+2 hours'))`)
    .run(crypto.createHash('sha256').update(token).digest('hex'), user.name, user.email, user.role, user.id);
  const peek = await call('GET', `/api/auth/invite/${token}`);
  assert.equal(peek.status, 200, 'the link opens the choose-a-password page');
  assert.equal(peek.body.reset, true);
  assert.equal((await call('POST', `/api/auth/invite/${token}`, { password: 'brand-new-password-1' })).status, 201);
  assert.equal((await call('POST', '/api/auth/login', { email: user.email, password: 'brand-new-password-1' })).status, 200);

  // Four requests were made by the test above; the limit is 5 per 15 minutes.
  assert.equal((await call('POST', '/api/auth/forgot-password', { email: 'a@b.test' })).status, 200);
  assert.equal((await call('POST', '/api/auth/forgot-password', { email: 'a@b.test' })).status, 429);
});
