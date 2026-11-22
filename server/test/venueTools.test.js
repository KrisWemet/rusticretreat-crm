// Venue-wide tools: the vendor directory, checklist templates (and their
// automatic use on enquiry and booking), and email templates with placeholders.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-venuetools-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-venuetools';
process.env.NODE_ENV = 'test';
delete process.env.ENABLE_COUPLE_PORTAL;
delete process.env.ETRANSFER_EMAIL;

const express = require('express');
const jwt = require('jsonwebtoken');
let db, server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Shannon', role: 'admin' }, process.env.JWT_SECRET);

test.before(async () => {
  db = require('../db');
  const app = express();
  app.use(express.json());
  app.use('/api/vendor-directory', require('../routes/vendorDirectory'));
  app.use('/api/vendors', require('../routes/vendors'));
  app.use('/api/task-templates', require('../routes/taskTemplates'));
  app.use('/api/email-templates', require('../routes/emailTemplates'));
  app.use('/api/bookings', require('../routes/bookings'));
  app.use('/api/couples', require('../routes/couples'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body) {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: staff } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const couple = (f = {}) => {
  const v = { partner1_name: 'Sarah Larsson', partner2_name: 'Jake Novak', email: `c${Math.random()}@test.invalid`, status: 'inquiry', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};

test('vendor directory: add, copy onto a couple once, and editing it never rewrites the copy', async () => {
  let r = await call('POST', '/api/vendor-directory', { category: 'Catering', business_name: 'Okonkwo Catering', phone: '780-555-0000', insurance_expires: '2027-04-30' });
  assert.equal(r.status, 201);
  const v = r.body;
  assert.equal((await call('POST', '/api/vendor-directory', { business_name: 'No category' })).status, 400);
  assert.equal((await call('POST', '/api/vendor-directory', { category: 'Catering', business_name: 'X', insurance_expires: 'soon' })).status, 400);
  const c = couple();
  r = await call('POST', `/api/vendor-directory/${v.id}/assign`, { couple_id: c });
  assert.equal(r.status, 201);
  assert.equal(r.body.directory_id, v.id);
  assert.equal(r.body.vendor_type, 'Catering');
  assert.equal((await call('POST', `/api/vendor-directory/${v.id}/assign`, { couple_id: c })).status, 409, 'not added twice');
  await call('PUT', `/api/vendor-directory/${v.id}`, { phone: '780-555-9999' });
  assert.equal((await call('GET', `/api/vendors/couple/${c}`)).body[0].phone, '780-555-0000', 'the couple keeps the details they were given');
  r = await call('GET', '/api/vendor-directory');
  assert.equal(r.body[0].weddings, 1);
  r = await call('PUT', `/api/vendors/${(await call('GET', `/api/vendors/couple/${c}`)).body[0].id}`, { arrival_time: 'Sat 2 PM' });
  assert.equal(r.body.arrival_time, 'Sat 2 PM');
  await call('DELETE', `/api/vendor-directory/${v.id}`);
  const copy = (await call('GET', `/api/vendors/couple/${c}`)).body[0];
  assert.equal(copy.business_name, 'Okonkwo Catering', 'deleting from the directory keeps the couple’s vendor');
  assert.equal(copy.directory_id, null);
});

test('the seeded checklist follows the agreement’s deadlines and applies once', async () => {
  const tpl = (await call('GET', '/api/task-templates')).body.find(t => t.name === 'Booked wedding: venue checklist');
  assert.ok(tpl, 'seeded');
  assert.equal(tpl.auto_apply, 'none', 'off until the owner switches it on');
  const c = couple({ status: 'booked' });
  db.prepare(`INSERT INTO bookings (couple_id, event_date, end_date, package_name, created_at) VALUES (?, '2027-08-13', '2027-08-15', '3-Day Weekend', '2027-01-10 18:00:00')`).run(c);
  let r = await call('POST', `/api/task-templates/${tpl.id}/apply`, { couple_id: c });
  assert.equal(r.status, 200);
  const due = Object.fromEntries(r.body.created.map(t => [t.title, t.due_date]));
  assert.equal(due['Collect Final Details Form, day-of timeline and power requirements'], '2027-08-06', '7 days before check-in');
  assert.equal(due['Confirm temporary structures and their placement'], '2027-08-08', '5 days before');
  assert.equal(due['Collect the $1,000 damage deposit at check-in'], '2027-08-13');
  assert.equal(due['Post-event inspection and damage deposit decision'], '2027-08-16', 'the day after check-out');
  assert.equal(due['Confirm the deposit arrived'], '2027-01-17', 'a week after booking (Alberta day)');
  r = await call('POST', `/api/task-templates/${tpl.id}/apply`, { couple_id: c });
  assert.equal(r.body.created.length, 0, 'applying again adds nothing');
  assert.equal(r.body.skipped.length, tpl.items.length);
  const lead = couple({ status: 'lead' });
  r = await call('POST', `/api/task-templates/${tpl.id}/apply`, { couple_id: lead });
  assert.equal(r.body.created.length, 0);
  assert.ok(r.body.skipped.every(s => /no wedding date|not booked/.test(s.reason)), 'nothing is guessed without a date');
});

test('checklists: edits keep item identity, and auto-apply fires on booking and enquiry only when set', async () => {
  let r = await call('POST', '/api/task-templates', { name: 'Enquiry follow-ups', auto_apply: 'on_enquiry', items: [
    { title: 'Call them', anchor: 'enquiry', offset_days: 1, priority: 'high' },
    { title: '', anchor: 'enquiry' },
  ] });
  assert.equal(r.status, 201);
  assert.equal(r.body.items.length, 1, 'blank rows are dropped');
  const itemId = r.body.items[0].id;
  r = await call('PUT', `/api/task-templates/${r.body.id}`, { items: [{ id: itemId, title: 'Call them back', anchor: 'enquiry', offset_days: 2 }, { title: 'Send pricing', anchor: 'enquiry', offset_days: 0 }] });
  assert.equal(r.body.items[0].id, itemId, 'an edited item keeps its id');
  assert.equal(r.body.items.length, 2);
  r = await call('POST', '/api/couples', { partner1_name: 'Ava', partner2_name: 'Ben', email: 'ava@test.invalid', partner2_email: 'ben@test.invalid', status: 'lead' });
  assert.equal(r.status, 201);
  const tasks = db.prepare('SELECT title FROM tasks WHERE couple_id = ? ORDER BY title').all(r.body.id).map(t => t.title);
  assert.deepEqual(tasks, ['Call them back', 'Send pricing']);

  const booked = (await call('POST', '/api/task-templates', { name: 'On booking', auto_apply: 'on_booking', items: [{ title: 'Welcome pack', anchor: 'checkin', offset_days: -60 }] })).body;
  const c = couple();
  r = await call('POST', '/api/bookings', { couple_id: c, event_date: '2028-06-09', package_name: '3-Day Weekend' });
  assert.equal(r.status, 201);
  const t = db.prepare("SELECT due_date FROM tasks WHERE couple_id = ? AND title = 'Welcome pack'").get(c);
  assert.equal(t?.due_date, '2028-04-10', '60 days before check-in, added automatically');
  r = await call('DELETE', `/api/task-templates/${booked.id}`);
  assert.equal(db.prepare("SELECT template_item_id FROM tasks WHERE couple_id = ? AND title = 'Welcome pack'").get(c).template_item_id, null, 'tasks stay when the checklist goes');
});

test('email templates: placeholders fill from the record, and gaps are reported rather than sent blank', async () => {
  const list = (await call('GET', '/api/email-templates')).body;
  assert.ok(list.length >= 8, 'starting templates are seeded');
  const c = couple();
  db.prepare(`INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count) VALUES (?, '2027-07-09', '2027-07-11', '3-Day Weekend', 64)`).run(c);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Deposit', 1706.25, '2027-01-01', 1)").run(c);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Second', 1706.25, '2027-01-10', 0)").run(c);
  const reminder = list.find(t => t.name === 'Payment reminder');
  let r = await call('POST', '/api/email-templates/render', { template_id: reminder.id, couple_id: c });
  assert.equal(r.status, 200);
  assert.match(r.body.body, /^Hi Sarah & Jake,/);
  assert.ok(r.body.body.includes('$1,706.25') && r.body.body.includes('Sunday, January 10, 2027'));
  assert.ok(r.body.body.includes('rusticretreatalberta@gmail.com'));
  assert.ok(r.body.body.includes('Shannon'), 'signed by whoever is sending');
  assert.equal(r.body.subject, 'Your next payment for Friday, July 9, 2027');
  assert.deepEqual(r.body.missing, []);
  const bare = couple();
  r = await call('POST', '/api/email-templates/render', { couple_id: bare, subject: 'For {wedding_date}', body: 'Hi {first_names}, {unknown} stays. Owing {balance_owing}.' });
  assert.equal(r.body.subject, 'For ');
  assert.ok(r.body.body.includes('{unknown} stays'), 'an unknown placeholder is left as typed');
  assert.deepEqual(r.body.missing.sort(), ['balance_owing', 'wedding_date']);
  r = await call('POST', '/api/email-templates', { name: 'Tour thanks', subject: 'Thanks', body: 'Hi {first_names}' });
  assert.equal(r.status, 201);
  assert.equal((await call('POST', '/api/email-templates', { name: 'Empty', body: '  ' })).status, 400);
  await call('PUT', `/api/email-templates/${r.body.id}`, { body: 'Hello {first_names}' });
  await call('DELETE', `/api/email-templates/${r.body.id}`);
  assert.ok(!(await call('GET', '/api/email-templates')).body.some(t => t.name === 'Tour thanks'));
});
