// The couple portal: one switch turns it on, couples get in through a one-time
// setup link, one login per couple (either email), staff can withdraw access,
// couples see only what is theirs and what staff share.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-portal-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-portal';
process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'https://crm.example.test';
delete process.env.ENABLE_COUPLE_PORTAL;

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = express();
app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/portal', require('../routes/portal'));
app.use('/api/timeline', require('../routes/timeline'));
app.use('/api/couple-files', require('../routes/coupleFiles'));
let server, base;
const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
const staff = 'Bearer ' + jwt.sign({ userId: adminId, email: 's@t', name: 'Shannon', role: 'staff' }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });
const call = async (method, url, body, auth) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: res.status, body: j };
};
const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Ivy', 'Noah', 'ivy@x.test', 'noah@x.test', 'booked')").run().lastInsertRowid;
const other = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Zed', 'Amy', 'zed@x.test', 'amy@x.test', 'booked')").run().lastInsertRowid;
db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Booking Deposit (25%)', 1706.25, '2031-01-10')").run(id);
db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Someone else', 99, '2031-01-10')").run(other);
db.prepare("INSERT INTO timeline_events (couple_id, day_date, time, title) VALUES (?, '2031-07-05', '15:30', 'Ceremony')").run(id);
const fileId = (shared, couple = id) => db.prepare("INSERT INTO couple_files (couple_id, filename, mime_type, size, data, shared_with_couple) VALUES (?, ?, 'text/plain', 3, ?, ?)").run(couple, shared ? 'menu.txt' : 'staff-notes.txt', Buffer.from('abc'), shared ? 1 : 0).lastInsertRowid;
let tokenFromUrl = (u) => u.split('/').pop();

test('with the portal switched off, nothing lets a couple in', async () => {
  assert.equal((await call('POST', `/api/portal/invite/${id}`, {}, staff)).status, 409);
  assert.equal((await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'whatever-123' })).status, 403);
  const t = 'Bearer ' + jwt.sign({ coupleId: id }, process.env.JWT_SECRET);
  assert.equal((await call('GET', '/api/portal/invoices', null, t)).status, 401, 'an old token stops working');
  assert.equal((await call('GET', `/api/portal/access/${id}`, null, staff)).body.enabled, false);
});

test('switched on: setup link → own password → signed in; either email works; the link works once', async () => {
  process.env.ENABLE_COUPLE_PORTAL = '1';
  const inv = await call('POST', `/api/portal/invite/${id}`, { send_email: false }, staff);
  assert.equal(inv.status, 200);
  assert.match(inv.body.url, /^https:\/\/crm\.example\.test\/portal\/setup\/[a-f0-9]{48}$/);
  assert.ok(inv.body.invite_pending);
  const tok = tokenFromUrl(inv.body.url);
  assert.ok(!db.prepare('SELECT 1 FROM portal_invites WHERE token_hash = ?').get(tok), 'the raw token is never stored');
  assert.equal((await call('GET', `/api/portal/setup/${tok}`)).body.couple, 'Ivy & Noah');
  assert.equal((await call('POST', `/api/portal/setup/${tok}`, { password: 'short' })).status, 400);
  const done = await call('POST', `/api/portal/setup/${tok}`, { password: 'our-wedding-2031' });
  assert.equal(done.status, 201);
  assert.ok(done.body.token);
  assert.equal((await call('POST', `/api/portal/setup/${tok}`, { password: 'another-one-99' })).status, 404, 'once only');
  for (const e of ['ivy@x.test', 'NOAH@x.test ']) {
    assert.equal((await call('POST', '/api/auth/couple-login', { email: e, password: 'our-wedding-2031' })).status, 200, e);
  }
  const acc = await call('GET', `/api/portal/access/${id}`, null, staff);
  assert.equal(acc.body.has_login, true);
  assert.ok(acc.body.last_login_at);
});

test('couples see their own invoices with pay links, next steps and shared files only', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  const invoices = (await call('GET', '/api/portal/invoices', null, t)).body;
  assert.equal(invoices.length, 1, 'only their own');
  assert.match(invoices[0].pay_url, /\/pay\/[a-f0-9]{48}$/);
  const steps = (await call('GET', '/api/portal/next-steps', null, t)).body;
  assert.ok(steps.some(s => s.kind === 'payment' && /Booking Deposit \(25%\): \$1,706\.25/.test(s.title)), JSON.stringify(steps));

  const shared = fileId(true), hidden = fileId(false), theirs = fileId(true, other);
  const files = (await call('GET', '/api/portal/files', null, t)).body.map(f => f.id);
  assert.deepEqual(files, [shared]);
  assert.equal((await fetch(`${base}/api/portal/files/${hidden}`, { headers: { authorization: t } })).status, 404);
  assert.equal((await fetch(`${base}/api/portal/files/${theirs}`, { headers: { authorization: t } })).status, 404);
  assert.equal(await (await fetch(`${base}/api/portal/files/${shared}`, { headers: { authorization: t } })).text(), 'abc');
  // Staff choose what is shared.
  assert.equal((await call('PATCH', `/api/couple-files/${hidden}/share`, { shared: true }, staff)).body.shared_with_couple, 1);
  assert.equal((await call('GET', '/api/portal/files', null, t)).body.length, 2);

});

test('the weekend schedule is one plan: couples add, change and remove items; locked ones stay put; staff see who did what', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  const first = (await call('GET', '/api/portal/schedule', null, t)).body;
  assert.equal(first.items[0].title, 'Ceremony');
  const ceremony = first.items[0].id;

  // Staff add check-in and lock it.
  const checkIn = await call('POST', `/api/timeline/couple/${id}`, { day_date: '2031-07-04', time: '12:00 PM', title: 'Check-in', locked: true }, staff);
  assert.equal(checkIn.status, 201);
  assert.equal(checkIn.body.locked, 1);
  assert.equal(checkIn.body.added_by, 'Shannon');

  // The couple adds their own item, then changes it, and moves the ceremony.
  const brunch = await call('POST', '/api/timeline/portal', { day_date: '2031-07-06', time: '10:00 AM', title: 'Farewell brunch', location: 'Lodge' }, t);
  assert.equal(brunch.status, 201);
  assert.equal(brunch.body.added_by, 'couple');
  const moved = await call('PUT', `/api/timeline/${brunch.body.id}`, { time: '10:30 AM' }, t);
  assert.equal(moved.status, 200);
  assert.equal(moved.body.time, '10:30 AM');
  assert.equal(moved.body.title, 'Farewell brunch', 'fields not sent are kept');
  assert.equal((await call('PUT', `/api/timeline/${ceremony}`, { time: '4:00 PM' }, t)).body.time, '4:00 PM');

  // Locked: readable, not changeable or removable by the couple, and they cannot unlock it.
  const sched = (await call('GET', '/api/portal/schedule', null, t)).body;
  const lockedItem = sched.items.find(i => i.title === 'Check-in');
  assert.equal(lockedItem.locked, true);
  assert.equal(sched.items.find(i => i.title === 'Farewell brunch').by_couple, true);
  const refused = await call('PUT', `/api/timeline/${checkIn.body.id}`, { time: '9:00 AM', locked: false }, t);
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Rustic Retreat has set this one/);
  assert.equal((await call('DELETE', `/api/timeline/${checkIn.body.id}`, null, t)).status, 403);
  const stillLocked = db.prepare('SELECT time, locked FROM timeline_events WHERE id = ?').get(checkIn.body.id);
  assert.deepEqual({ ...stillLocked }, { time: '12:00 PM', locked: 1 });

  // A couple never touches another couple's schedule.
  const theirs = db.prepare("INSERT INTO timeline_events (couple_id, day_date, time, title) VALUES (?, '2031-08-01', '2:00 PM', 'Theirs')").run(other).lastInsertRowid;
  assert.equal((await call('PUT', `/api/timeline/${theirs}`, { title: 'Mine now' }, t)).status, 403);
  assert.equal((await call('DELETE', `/api/timeline/${theirs}`, null, t)).status, 403);

  // Staff can still change a locked item, and unlock it.
  assert.equal((await call('PUT', `/api/timeline/${checkIn.body.id}`, { time: '1:00 PM', locked: false }, staff)).body.locked, 0);

  // A template saved from this schedule is the venue's standard: the couple's
  // own items are left out and locks are kept. Replacing from a template
  // never deletes what the couple added.
  const keep = await call('POST', '/api/timeline/portal', { day_date: '2031-07-05', time: '2:30 PM', title: 'First look by the creek' }, t);
  const tpl = await call('POST', '/api/timeline/templates', { name: 'Standard weekend', couple_id: id }, staff);
  assert.equal(tpl.status, 201);
  assert.ok(!tpl.body.items.some(i => i.title === 'Farewell brunch' || i.title === 'First look by the creek'));
  assert.equal(tpl.body.items.find(i => i.title === 'Check-in').locked, undefined, 'unlocked above, so saved unlocked');
  await call('PUT', `/api/timeline/${checkIn.body.id}`, { locked: true }, staff);
  const tpl2 = await call('POST', '/api/timeline/templates', { name: 'Standard weekend 2', couple_id: id }, staff);
  assert.equal(tpl2.body.items.find(i => i.title === 'Check-in').locked, true);
  const applied = await call('POST', `/api/timeline/couple/${id}/apply-template`, { template_id: tpl2.body.id, start_date: '2031-07-04', replace: true }, staff);
  assert.equal(applied.status, 200);
  const titles = applied.body.map(i => i.title);
  assert.ok(titles.includes('First look by the creek') && titles.includes('Farewell brunch'), 'couple items kept');
  assert.equal(titles.filter(x => x === 'Check-in').length, 1, 'venue items replaced, not doubled');
  assert.equal(applied.body.find(i => i.title === 'Check-in').locked, 1, 'lock carried by the template');
  await call('DELETE', `/api/timeline/${keep.body.id}`, null, t);

  // The couple removes their brunch; every couple change is on the activity record.
  assert.equal((await call('DELETE', `/api/timeline/${brunch.body.id}`, null, t)).status, 200);
  const log = db.prepare("SELECT summary FROM activity_log WHERE couple_id = ? AND action = 'schedule.couple_change' ORDER BY id").all(id).map(r => r.summary);
  assert.equal(log.length, 6);
  assert.match(log[0], /added "Farewell brunch"/);
  assert.match(log[2], /changed "Ceremony" \(15:30, 2031-07-05\) to "Ceremony" \(4:00 PM, 2031-07-05\)/);
  assert.match(log[3], /added "First look by the creek"/);
  assert.match(log[5], /removed "Farewell brunch"/);
});

test('"Our weekend" snapshot and the couple\'s plans and notes, shared with staff', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count, ceremony_location) VALUES (?, '2031-07-04', '2031-07-06', 'Full Weekend', 120, 'The meadow')").run(id);
  db.prepare("INSERT INTO vendors (couple_id, vendor_type, business_name, booked, arrival_time) VALUES (?, 'Photographer', 'Lens & Light', 1, '1:00 PM')").run(id);
  db.prepare("INSERT INTO vendors (couple_id, vendor_type, business_name) VALUES (?, 'Florist', 'Not theirs')").run(other);
  const inv = db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date) VALUES (?, 'Extras', 84, '2031-06-01')").run(id).lastInsertRowid;
  db.prepare("INSERT INTO invoice_items (invoice_id, kind, label, quantity, unit_price, amount, addon_id) VALUES (?, 'item', 'Extra firewood', 2, 15, 30, 1)").run(inv);
  db.prepare("INSERT INTO invoice_items (invoice_id, kind, label, quantity, unit_price, amount) VALUES (?, 'gst', 'GST', 1, 1.5, 1.5)").run(inv);

  let w = (await call('GET', '/api/portal/weekend', null, t)).body;
  assert.equal(w.couple, 'Ivy & Noah');
  assert.deepEqual(w.stay, { check_in: '2031-07-04', check_out: '2031-07-06', package_name: 'Full Weekend', nights: 2 });
  assert.deepEqual(w.guests, { guests: 120, final: false }, 'booking estimate until Final Details are in');
  assert.equal(w.ceremony_location, 'The meadow');
  assert.deepEqual(w.vendors.map(v => v.business_name), ['Lens & Light']);
  assert.equal(w.vendors[0].arrival_time, '1:00 PM');
  assert.deepEqual(w.extras_ordered, [{ label: 'Extra firewood', quantity: 2 }]);
  assert.ok(w.schedule.some(s => s.title === 'Ceremony'));

  db.prepare("INSERT INTO final_details (couple_id, guests, campers, tents, rvs, submitted_at) VALUES (?, 112, 40, 12, 3, datetime('now'))").run(id);
  w = (await call('GET', '/api/portal/weekend', null, t)).body;
  assert.deepEqual(w.guests, { guests: 112, campers: 40, tents: 12, rvs: 3, final: true });

  // Notes: the couple writes, staff read and edit the same text.
  const saved = await call('PUT', '/api/portal/notes', { text: 'First look by the creek at 2.\nGrandma needs a chair at the ceremony.' }, t);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.updated_by, 'couple');
  const staffView = (await call('GET', `/api/portal/notes/${id}`, null, staff)).body;
  assert.match(staffView.text, /Grandma needs a chair/);
  assert.equal((await call('PUT', `/api/portal/notes/${id}`, { text: staffView.text + '\nVenue: chair set out.' }, staff)).body.updated_by, 'Shannon');
  // A save started from an older version is refused, with the newer text.
  const stale = await call('PUT', '/api/portal/notes', { text: 'overwrite', base_updated_at: '2000-01-01 00:00:00' }, t);
  assert.equal(stale.status, 409);
  assert.match(stale.body.current.text, /Venue: chair set out/);
  assert.equal((await call('GET', '/api/portal/notes', null, t)).body.updated_by, 'Shannon');
  w = (await call('GET', '/api/portal/weekend', null, t)).body;
  assert.match(w.notes.text, /Venue: chair set out\./);
  assert.equal(w.notes.updated_by, 'Shannon');
  assert.equal((await call('GET', `/api/portal/notes/${id}`)).status, 401, 'staff route needs a staff login');
  assert.equal((await call('PUT', `/api/portal/notes/${id}`, { text: 'x' }, t)).status, 403, 'a couple cannot use the staff route');

  // The notes print on the event order.
  const { buildEventOrder, renderEventOrder } = require('../services/eventOrder');
  const html = renderEventOrder(buildEventOrder(id));
  assert.match(html, /The couple's plans and notes/);
  assert.match(html, /Grandma needs a chair/);
});

test('withdrawing access signs the couple out at once', async () => {
  const t = 'Bearer ' + (await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).body.token;
  assert.equal((await call('DELETE', `/api/portal/access/${id}`, null, staff)).body.has_login, false);
  assert.equal((await call('GET', '/api/portal/invoices', null, t)).status, 401);
  assert.equal((await call('POST', '/api/auth/couple-login', { email: 'ivy@x.test', password: 'our-wedding-2031' })).status, 401);
});

test('forgot password: same reply for any address; a couple with a login gets a fresh link', async () => {
  // Give Ivy & Noah a login again.
  const tok = tokenFromUrl((await call('POST', `/api/portal/invite/${id}`, { send_email: false }, staff)).body.url);
  await call('POST', `/api/portal/setup/${tok}`, { password: 'our-wedding-2031' });
  const a = await call('POST', '/api/auth/couple-forgot-password', { email: 'nobody@x.test' });
  const b = await call('POST', '/api/auth/couple-forgot-password', { email: 'Noah@x.test' });
  assert.deepEqual(a.body, b.body);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM portal_invites WHERE couple_id = ? AND used_at IS NULL').get(id).n, 1);
});
