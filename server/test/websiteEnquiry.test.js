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
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tours WHERE couple_id = ?').get(rows[0].id).n, 1, 'no tour without dates');
});

test('bots that fill the hidden field are ignored, and bad input is refused', async () => {
  const before = db.prepare('SELECT COUNT(*) n FROM couples').get().n;
  const bot = await send({ ...form, email: 'bot@test.invalid', _gotcha: 'http://spam.example' });
  assert.equal(bot.status, 201);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM couples').get().n, before);
  assert.equal((await send({ ...form, email: 'not-an-email' })).status, 400);
  assert.equal((await send({ ...form, partner2FirstName: '', partner2LastName: '' })).status, 400);
});
