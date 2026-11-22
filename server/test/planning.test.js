// Event planning on the staff side: run of show, guest list, floor plans and
// seating, files, notes and the event order. Also the proposal-expiry fix.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-planning-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-planning';
process.env.NODE_ENV = 'test';
delete process.env.ENABLE_COUPLE_PORTAL;

const express = require('express');
const jwt = require('jsonwebtoken');
let db, server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Kris', role: 'admin' }, process.env.JWT_SECRET);

test.before(async () => {
  db = require('../db');
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/timeline', require('../routes/timeline'));
  app.use('/api/guests', require('../routes/guests'));
  app.use('/api/floorplans', require('../routes/floorplans'));
  app.use('/api/couple-files', require('../routes/coupleFiles'));
  app.use('/api/notes', require('../routes/notes'));
  app.use('/api/event-order', require('../routes/eventOrder'));
  app.use('/api/proposals', require('../routes/proposals'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, { raw = false, auth = true } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(base + url, {
    method,
    body: body == null ? undefined : (isForm ? body : JSON.stringify(body)),
    headers: { ...(body != null && !isForm ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: staff } : {}) },
  });
  if (raw) return { status: res.status, headers: res.headers, text: await res.text() };
  return { status: res.status, body: await res.json().catch(() => null) };
}
const couple = (f = {}) => {
  const v = { partner1_name: 'Ava Stone', partner2_name: 'Ben Lake', email: `c${Math.random()}@test.invalid`, status: 'booked', ...f };
  return db.prepare(`INSERT INTO couples (${Object.keys(v)}) VALUES (${Object.keys(v).map(() => '?')})`).run(...Object.values(v)).lastInsertRowid;
};

test('clock times are read however they are typed, and the night runs past midnight', () => {
  const { parseTime, formatTime, sortRunOfShow } = require('../services/planning');
  assert.equal(parseTime('15:30'), 930);
  assert.equal(parseTime('3:30 pm'), 930);
  assert.equal(parseTime('3pm'), 900);
  assert.equal(parseTime('12:00 AM'), 0);
  assert.equal(parseTime('12 PM'), 720);
  assert.equal(parseTime('noon'), 720);
  assert.equal(parseTime('17'), null, 'a bare 17 is ambiguous');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('soon'), null);
  assert.equal(formatTime(930), '3:30 PM');
  assert.equal(formatTime(0), '12:00 AM');
  const sorted = sortRunOfShow([
    { id: 1, day_date: '2027-08-14', time: '12:30 AM' },
    { id: 2, day_date: '2027-08-14', time: '8:00 AM' },
    { id: 3, day_date: '2027-08-13', time: '11:00 PM' },
    { id: 4, day_date: '2027-08-14', time: '11:00 PM' },
    { id: 5, day_date: null, time: '9:00 AM' },
  ]).map(i => i.id);
  assert.deepEqual(sorted, [5, 3, 2, 4, 1], 'undated first, then by day; 12:30 AM ends the night');
});

test('run of show: multi-day items, templates that land on the same day of another weekend', async () => {
  const a = couple(), b = couple();
  let r = await call('POST', `/api/timeline/couple/${a}`, { time: '15:30', title: 'Ceremony', day_date: '2027-08-14', location: 'Forest Clearing', assigned_to: 'Officiant', category: 'Ceremony' });
  assert.equal(r.status, 201);
  assert.equal(r.body.time, '3:30 PM', 'stored the way existing rows are');
  await call('POST', `/api/timeline/couple/${a}`, { time: '8:00 AM', title: 'Check-in', day_date: '2027-08-13' });
  r = await call('POST', `/api/timeline/couple/${a}`, { time: 'whenever', title: 'Bad' });
  assert.equal(r.status, 400, 'an unreadable time cannot be put in order');
  r = await call('POST', `/api/timeline/couple/${a}`, { time: '9:00', title: 'Bad day', day_date: '2027-13-40' });
  assert.equal(r.status, 400);
  r = await call('GET', `/api/timeline/couple/${a}`);
  assert.deepEqual(r.body.map(i => i.title), ['Check-in', 'Ceremony']);

  r = await call('POST', '/api/timeline/templates', { name: '3-Day standard', couple_id: a });
  assert.equal(r.status, 201);
  const tpl = r.body;
  assert.deepEqual(tpl.items.map(i => [i.title, i.day_offset]), [['Check-in', 0], ['Ceremony', 1]]);
  r = await call('POST', `/api/timeline/couple/${b}/apply-template`, { template_id: tpl.id, start_date: '2028-06-09' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map(i => [i.title, i.day_date, i.time]), [['Check-in', '2028-06-09', '8:00 AM'], ['Ceremony', '2028-06-10', '3:30 PM']]);
  r = await call('POST', `/api/timeline/couple/${b}/apply-template`, { template_id: tpl.id, start_date: '2028-06-09', replace: true });
  assert.equal(r.body.length, 2, 'replace swaps rather than doubling up');
  r = await call('DELETE', `/api/timeline/templates/${tpl.id}`);
  assert.equal((await call('GET', '/api/timeline/templates')).body.length, 0);
});

test('guest list: CSV import maps common headers, skips repeats, and the export is spreadsheet-safe', async () => {
  const c = couple();
  const csv = 'Name,Email,RSVP,Meal,Dietary,Plus One,Household\r\n'
    + '"Lee, Jr Sam",sam@x.test,Yes,Beef,,yes,Lee family\r\n'
    + 'Grandma,,no,,,,\r\n'
    + '=HYPERLINK("http://bad"),,,,,,\r\n'
    + ',,,,,,\r\n';
  let r = await call('POST', `/api/guests/couple/${c}/import`, { csv });
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 3);
  const sam = r.body.guests.find(g => g.email === 'sam@x.test');
  assert.equal(sam.first_name, 'Lee,');
  assert.equal(sam.rsvp_status, 'accepted');
  assert.equal(sam.plus_one, 1);
  assert.equal(sam.party, 'Lee family');
  assert.equal(r.body.guests.find(g => g.first_name === 'Grandma').rsvp_status, 'declined');
  r = await call('POST', `/api/guests/couple/${c}/import`, { csv });
  assert.equal(r.body.added, 0, 'importing the same file twice adds nobody');
  r = await call('POST', `/api/guests/couple/${c}/import`, { csv: 'Email\r\na@b.c\r\n' });
  assert.equal(r.status, 400, 'a file with no name column is refused with a reason');
  const out = await call('GET', `/api/guests/couple/${c}/export`, null, { raw: true });
  assert.equal(out.status, 200);
  assert.match(out.headers.get('content-type'), /text\/csv/);
  assert.ok(out.text.includes(`"'=HYPERLINK(""http://bad"")"`), 'a formula-looking name is exported as text');
});

test('floor plans: elements are checked, guests are seated, and removing a table unseats them', async () => {
  const c = couple();
  let r = await call('POST', `/api/floorplans/couple/${c}`, { name: 'Reception', width_ft: 60, height_ft: 40 });
  assert.equal(r.status, 201);
  const plan = r.body;
  r = await call('PUT', `/api/floorplans/${plan.id}`, { items: [{ id: 'x', type: 'spaceship' }] });
  assert.equal(r.status, 400);
  r = await call('PUT', `/api/floorplans/${plan.id}`, { items: [
    { id: 't1', type: 'round', x: 10, y: 10, label: 'Table 1', seats: 8 },
    { id: 't2', type: 'round', x: 20, y: 10, label: 'Table 2', seats: 2 },
    { id: 'df', type: 'dancefloor', x: 30, y: 25, rotation: 405 },
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.find(i => i.id === 'df').rotation, 45, 'rotation is normalised');
  const g1 = db.prepare("INSERT INTO guests (couple_id, first_name, last_name) VALUES (?, 'Al', 'One')").run(c).lastInsertRowid;
  const g2 = db.prepare("INSERT INTO guests (couple_id, first_name, last_name, meal_preference) VALUES (?, 'Bo', 'Two', 'Veg')").run(c).lastInsertRowid;
  const other = db.prepare("INSERT INTO guests (couple_id, first_name, last_name) VALUES (?, 'Not', 'Ours')").run(couple()).lastInsertRowid;
  r = await call('PUT', `/api/floorplans/${plan.id}/seats`, { assignments: [{ guest_id: other, table: 't1' }] });
  assert.equal(r.status, 400, 'another couple’s guest cannot be seated here');
  r = await call('PUT', `/api/floorplans/${plan.id}/seats`, { assignments: [{ guest_id: g1, table: 'df' }] });
  assert.equal(r.status, 400, 'nobody sits on the dance floor');
  r = await call('PUT', `/api/floorplans/${plan.id}/seats`, { assignments: [{ guest_id: g1, table: 't1' }, { guest_id: g2, table: 't2' }] });
  assert.equal(r.status, 200);
  const print = await call('GET', `/api/floorplans/${plan.id}/print`, null, { raw: true });
  assert.equal(print.status, 200);
  assert.ok(print.text.includes('<svg') && print.text.includes('Bo Two'));
  const css = print.text.slice(print.text.indexOf('<style>'), print.text.indexOf('</style>'));
  assert.ok(css.lastIndexOf('@media print') > css.lastIndexOf('.bar'), 'the print rule comes last');
  assert.match(css, /\.noprint\s*\{\s*display:\s*none !important/);
  r = await call('PUT', `/api/floorplans/${plan.id}`, { items: [{ id: 't1', type: 'round', x: 10, y: 10, label: 'Table 1', seats: 8 }] });
  assert.equal(r.body.unseated, 1, 'the guest at the removed table is unseated');
  assert.equal(db.prepare('SELECT seat_table FROM guests WHERE id = ?').get(g2).seat_table, null);
  r = await call('POST', `/api/floorplans/${plan.id}/save-as-template`, { name: 'Gazebo reception' });
  assert.equal(r.status, 201);
  assert.equal(r.body.couple_id, null);
  r = await call('POST', `/api/floorplans/couple/${couple()}`, { name: 'Reception', copy_from: r.body.id });
  assert.equal(r.body.items.length, 1, 'a new plan can start from a saved layout');
  r = await call('DELETE', `/api/floorplans/${plan.id}`);
  assert.equal(db.prepare('SELECT seat_plan_id FROM guests WHERE id = ?').get(g1).seat_plan_id, null, 'deleting the plan unseats everyone');
});

test('files: stored on the couple, served to staff only, unsafe types refused', async () => {
  const c = couple();
  const fd = new FormData();
  fd.append('category', 'Insurance');
  fd.append('file', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'coi.pdf');
  let r = await call('POST', `/api/couple-files/couple/${c}`, fd);
  assert.equal(r.status, 201);
  assert.equal(r.body.category, 'Insurance');
  assert.equal(r.body.data, undefined, 'the list never carries file bytes');
  const id = r.body.id;
  const dl = await call('GET', `/api/couple-files/${id}`, null, { raw: true });
  assert.equal(dl.status, 200);
  assert.match(dl.headers.get('content-disposition'), /^inline/);
  assert.equal((await call('GET', `/api/couple-files/${id}`, null, { raw: true, auth: false })).status, 401);
  const bad = new FormData();
  bad.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'x.html');
  assert.equal((await call('POST', `/api/couple-files/couple/${c}`, bad)).status, 400);
  assert.equal((await call('DELETE', `/api/couple-files/${id}`)).status, 200);
  assert.equal((await call('GET', `/api/couple-files/couple/${c}`)).body.length, 0);
});

test('notes: dated, attributed, pinned notes come first', async () => {
  const c = couple();
  await call('POST', `/api/notes/couple/${c}`, { body: 'First call', kind: 'call' });
  const pin = (await call('POST', `/api/notes/couple/${c}`, { body: 'Gate code 1234' })).body;
  assert.equal(pin.author, 'Kris');
  await call('PUT', `/api/notes/${pin.id}`, { pinned: true });
  const list = (await call('GET', `/api/notes/couple/${c}`)).body;
  assert.equal(list[0].body, 'Gate code 1234');
  assert.equal(list[0].updated_at, null, 'pinning is not an edit');
  assert.equal((await call('POST', `/api/notes/couple/${c}`, { body: '   ' })).status, 400);
});

test('event order: gathers the weekend and leaves money off the vendor copy', async () => {
  const c = couple({ event_notes: 'Generator by the gazebo' });
  db.prepare(`INSERT INTO bookings (couple_id, event_date, end_date, package_name, guest_count, ceremony_location)
    VALUES (?, '2027-08-13', '2027-08-15', '3-Day Weekend', 72, 'Forest Clearing')`).run(c);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Deposit', 1000, '2027-01-01', 1)").run(c);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, due_date, paid) VALUES (?, 'Balance', 3000, '2027-05-01', 0)").run(c);
  db.prepare("INSERT INTO vendors (couple_id, vendor_type, business_name, booked, arrival_time) VALUES (?, 'Music/DJ', 'DJ Night', 0, 'Sat 4 PM')").run(c);
  db.prepare("INSERT INTO guests (couple_id, first_name, last_name, rsvp_status, plus_one, meal_preference, dietary_restrictions) VALUES (?, 'Cy', 'Three', 'accepted', 1, 'Fish', 'Nut allergy')").run(c);
  await call('POST', `/api/timeline/couple/${c}`, { time: '3:30 PM', title: 'Ceremony <b>', day_date: '2027-08-14' });
  const contract = db.prepare("INSERT INTO contracts (couple_id, title, content, status, template_key) VALUES (?, 'Agreement', '-', 'signed', 'rental-agreement-2027')").run(c).lastInsertRowid;
  for (const [k, v] of [['onsite1_name', 'Mia'], ['onsite1_phone', '780-555-0101'], ['setup_date', '2027-08-13'], ['setup_time', '08:00']]) {
    db.prepare("INSERT INTO contract_field_values (contract_id, field_key, value, filled_by) VALUES (?, ?, ?, 'venue')").run(contract, k, v);
  }
  const eo = (await call('GET', `/api/event-order/${c}`)).body;
  assert.equal(eo.check_in, '2027-08-13');
  assert.equal(eo.guests.expected, 2, 'one attending guest plus their plus-one');
  assert.equal(eo.onsite[0].name, 'Mia');
  assert.equal(eo.payments.balance, 3000);
  const ready = Object.fromEntries(eo.readiness.map(x => [x.key, x.done]));
  assert.equal(ready.contract, true);
  assert.equal(ready.deposit, true);
  assert.equal(ready.balance, false);
  assert.equal(ready.vendors, false, 'an unconfirmed vendor is not ready');
  const full = await call('GET', `/api/event-order/${c}/print`, null, { raw: true });
  assert.equal(full.status, 200);
  assert.ok(full.text.includes('Ceremony &lt;b&gt;'), 'everything printed is escaped');
  assert.ok(full.text.includes('8:00 AM') && full.text.includes('Mia') && full.text.includes('Generator by the gazebo'));
  assert.ok(full.text.includes('Balance'));
  const vendorCopy = await call('GET', `/api/event-order/${c}/print?financials=0`, null, { raw: true });
  assert.ok(!vendorCopy.text.includes('>Payments<') && !vendorCopy.text.includes('$3,000.00'), 'no money on the vendor copy');
  const r = await call('PUT', `/api/event-order/${c}/notes`, { event_notes: 'Open the gate at 7' });
  assert.equal(r.body.event_notes, 'Open the gate at 7');
});

test('a proposal is still open on its valid-until day', async () => {
  const { albertaToday } = require('../services/schedule');
  const c = couple({ status: 'inquiry' });
  const today = albertaToday();
  db.prepare("INSERT INTO proposals (couple_id, title, status, valid_until, public_token) VALUES (?, 'P', 'sent', ?, 'tok-today')").run(c, today);
  db.prepare("INSERT INTO proposals (couple_id, title, status, valid_until, public_token) VALUES (?, 'P', 'sent', '2020-01-01', 'tok-old')").run(c);
  let r = await call('GET', '/api/proposals/public/tok-today', null, { auth: false });
  assert.equal(r.body.status, 'sent', 'valid through the whole of that day in Alberta');
  assert.equal(r.body.portal_enabled, false, 'the page is told the portal is off');
  r = await call('GET', '/api/proposals/public/tok-old', null, { auth: false });
  assert.equal(r.body.status, 'expired');
});
