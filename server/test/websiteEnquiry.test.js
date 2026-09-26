// The website's contact form, copied into the CRM as an inquiry client.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-web-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-website';
process.env.NODE_ENV = 'test';

const express = require('express');
const db = require('../db');
const { parseWeddingDate } = require('../services/websiteEnquiry');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/inquire', require('../routes/inquire'));
let server, base;
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// The website sends the form as URL-encoded fields, exactly as named there.
const send = (fields) => fetch(`${base}/api/inquire/website`, { method: 'POST', body: new URLSearchParams(fields) })
  .then(async r => ({ status: r.status, body: await r.json() }));
const form = {
  partner1FirstName: 'Riley', partner1LastName: 'Hart', partner2FirstName: 'Sam', partner2LastName: 'Quinn',
  email: 'Riley.Hart@Test.invalid', phone: '780-555-0199', preferredContact: 'text',
  weddingDate: 'August 14th, 2027', tourDates: 'Oct 4 or Oct 11', guestCount: '70-80', message: 'Forest ceremony please',
};

test('wedding dates are read only when they are unambiguous', () => {
  assert.equal(parseWeddingDate('August 14th, 2027'), '2027-08-14');
  assert.equal(parseWeddingDate('Aug 14 2027'), '2027-08-14');
  assert.equal(parseWeddingDate('14 August 2027'), '2027-08-14');
  assert.equal(parseWeddingDate('2027-08-14'), '2027-08-14');
  assert.equal(parseWeddingDate('Summer 2027'), null);
  assert.equal(parseWeddingDate('August 2027'), null);
  assert.equal(parseWeddingDate('February 30, 2027'), null);
});

test('a website enquiry becomes an inquiry client with a follow-up task and a tour request', async () => {
  const r = await send(form);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = db.prepare("SELECT * FROM couples WHERE email = 'riley.hart@test.invalid'").get();
  assert.equal(c.status, 'inquiry');
  assert.equal(c.partner1_name, 'Riley Hart');
  assert.equal(c.partner2_name, 'Sam Quinn');
  assert.equal(c.wedding_date, '2027-08-14');
  assert.match(c.notes, /Guests: 70-80/);
  assert.match(c.notes, /Forest ceremony please/);
  const task = db.prepare('SELECT * FROM tasks WHERE couple_id = ?').get(c.id);
  assert.equal(task.title, 'Follow up on website enquiry and book their tour');
  assert.equal(task.priority, 'high');
  const tour = db.prepare('SELECT * FROM tours WHERE couple_id = ?').get(c.id);
  assert.equal(tour.status, 'requested');
  assert.match(tour.notes, /Oct 4 or Oct 11/);
});

test('a repeat enquiry adds to the same client instead of making a duplicate', async () => {
  const r = await send({ ...form, email: 'riley.hart@test.invalid', tourDates: '', message: 'Second note' });
  assert.equal(r.status, 201);
  const rows = db.prepare("SELECT * FROM couples WHERE LOWER(email) = 'riley.hart@test.invalid'").all();
  assert.equal(rows.length, 1);
  assert.match(rows[0].notes, /Forest ceremony please[\s\S]*Second note/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tasks WHERE couple_id = ?').get(rows[0].id).n, 2);
  const tours = db.prepare('SELECT * FROM tours WHERE couple_id = ?').all(rows[0].id);
  assert.equal(tours.length, 1, 'a repeat enquiry reuses the open tour request');
  assert.match(tours[0].notes, /Oct 4 or Oct 11\nRequested on the website; no dates suggested yet\./);
});

test('an enquiry without tour dates is still a requested tour', async () => {
  const r = await send({ ...form, email: 'nodates@test.invalid', tourDates: '' });
  assert.equal(r.status, 201);
  const c = db.prepare("SELECT id FROM couples WHERE email = 'nodates@test.invalid'").get();
  const tour = db.prepare('SELECT * FROM tours WHERE couple_id = ?').get(c.id);
  assert.equal(tour.status, 'requested');
  assert.equal(tour.notes, 'Requested on the website; no dates suggested yet.');
  assert.equal(db.prepare('SELECT title FROM tasks WHERE couple_id = ?').get(c.id).title, 'Follow up on website enquiry and book their tour');
});

test('once the tour is done, a new enquiry opens a new tour request', async () => {
  const c = db.prepare("SELECT id FROM couples WHERE email = 'nodates@test.invalid'").get();
  db.prepare("UPDATE tours SET status = 'completed' WHERE couple_id = ?").run(c.id);
  await send({ ...form, email: 'nodates@test.invalid', tourDates: 'Any Saturday in May' });
  const tours = db.prepare('SELECT status, notes FROM tours WHERE couple_id = ? ORDER BY id').all(c.id);
  assert.deepEqual(tours.map(t => t.status), ['completed', 'requested']);
  assert.match(tours[1].notes, /Any Saturday in May/);
});

test('bots that fill the hidden field are ignored, and bad input is refused', async () => {
  const before = db.prepare('SELECT COUNT(*) n FROM couples').get().n;
  const bot = await send({ ...form, email: 'bot@test.invalid', _gotcha: 'http://spam.example' });
  assert.equal(bot.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM couples').get().n, before);
  assert.equal((await send({ ...form, email: 'not-an-email' })).status, 400);
  assert.equal((await send({ ...form, partner2FirstName: '', partner2LastName: '' })).status, 400);
});

// ── Booking requests (2026 / 2027 booking-request pages) ─────────────────────
const { parseDayFirst } = require('../services/websiteEnquiry');
const sendBooking = (fields) => fetch(`${base}/api/inquire/booking-request`, { method: 'POST', body: new URLSearchParams(fields) })
  .then(async r => ({ status: r.status, body: await r.json() }));
const booking = {
  bookingForm: '2027', client1Name: 'Taylor Brooks', client2Name: 'Alex Rowe',
  client1Phone: '780-555-0111', client2Phone: '780-555-0122', email: 'Taylor@Test.invalid',
  contactPref: 'Text message', eventDate: '14/08/2027', checkinDate: '2027-08-13', checkoutDate: '2027-08-15',
  package: '5-Day Weekend ($7,500)', guestCount: '75', overnightGuests: '40', dj: 'Yes — hiring a DJ',
  heardAbout: 'Instagram', vision: 'Barefoot ceremony in the trees', unexpectedField: 'ignored',
};

test('booking-form dates are read day first', () => {
  assert.equal(parseDayFirst('14/08/2027'), '2027-08-14');
  assert.equal(parseDayFirst('4/8/2027'), '2027-08-04');
  assert.equal(parseDayFirst('2027-08-13'), '2027-08-13');
  assert.equal(parseDayFirst('31/02/2027'), null);
});

test('a booking request becomes an inquiry with its answers, package and a proposal task', async () => {
  const r = await sendBooking(booking);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = db.prepare("SELECT * FROM couples WHERE email = 'taylor@test.invalid'").get();
  assert.equal(c.status, 'inquiry');
  assert.equal(c.partner1_name, 'Taylor Brooks');
  assert.equal(c.phone, '780-555-0111');
  assert.equal(c.partner2_phone, '780-555-0122');
  assert.equal(c.wedding_date, '2027-08-14');
  assert.equal(c.venue_package, '5-Day Experience');
  assert.equal(c.referral_source, 'Instagram');
  assert.match(c.notes, /^Website booking request \(2027 form\)/);
  assert.match(c.notes, /Overnight camping guests: 40/);
  assert.match(c.notes, /Their vision: Barefoot ceremony in the trees/);
  assert.doesNotMatch(c.notes, /ignored/);
  const task = db.prepare('SELECT * FROM tasks WHERE couple_id = ?').get(c.id);
  assert.equal(task.title, 'Review booking request and send proposal');
  assert.match(task.description, /5-Day Weekend \(\$7,500\), check-in 2027-08-13, 75 guests/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tours WHERE couple_id = ?').get(c.id).n, 0);
});

test('a lead who sends a booking request becomes an inquiry without losing their record', async () => {
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status, notes, venue_package) VALUES ('L', 'M', 'lead@test.invalid', 'lead', 'Met at the fair', '3-Day Weekend')").run().lastInsertRowid;
  assert.equal((await sendBooking({ ...booking, email: 'lead@test.invalid' })).status, 201);
  const c = db.prepare('SELECT * FROM couples WHERE id = ?').get(id);
  assert.equal(c.status, 'inquiry');
  assert.equal(c.partner1_name, 'L', 'names already on file are kept');
  assert.equal(c.venue_package, '3-Day Weekend', 'a package already chosen is kept');
  assert.match(c.notes, /^Met at the fair\n\nWebsite booking request/);
  db.prepare("UPDATE couples SET status = 'booked' WHERE id = ?").run(id);
  await sendBooking({ ...booking, email: 'lead@test.invalid' });
  assert.equal(db.prepare('SELECT status FROM couples WHERE id = ?').get(id).status, 'booked', 'later stages are left alone');
});

test('booking-request bots and bad input are handled like the contact form', async () => {
  const before = db.prepare('SELECT COUNT(*) n FROM couples').get().n;
  assert.equal((await sendBooking({ ...booking, email: 'bot2@test.invalid', _gotcha: 'x' })).status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM couples').get().n, before);
  assert.equal((await sendBooking({ ...booking, client2Name: '' })).status, 400);
  assert.equal((await sendBooking({ ...booking, email: 'nope' })).status, 400);
});
