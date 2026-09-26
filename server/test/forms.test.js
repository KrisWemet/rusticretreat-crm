// Forms: staff entry, private links for couples, and website submissions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-forms-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-forms';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/forms', require('../routes/forms'));
app.use('/api/inquire', require('../routes/inquire'));
let server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Shannon', role: 'admin' }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function call(method, url, body, auth = staff) {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) } });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const couple = (email) => db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('Jo', 'Max', ?, 'booked')").run(email).lastInsertRowid;

async function makeForm() {
  const f = await call('POST', '/api/forms', { title: 'Day-of details', fields: [
    { label: 'Ceremony time', field_type: 'text', required: true },
    { label: 'Pets?', field_type: 'checkbox' },
    { label: 'Notes', field_type: 'textarea' },
  ] });
  assert.equal(f.status, 201);
  return f.body;
}

test('editing a form keeps the answers already given', async () => {
  const form = await makeForm();
  const cid = couple('keep@test.invalid');
  const a = (await call('POST', `/api/forms/${form.id}/assign`, { couple_id: cid })).body;
  const [time, pets, notes] = form.fields;
  assert.equal((await call('PUT', `/api/forms/assignments/${a.id}/responses`, { answers: { [time.id]: '4 pm', [pets.id]: 'Yes', [notes.id]: 'Bring lanterns' } })).status, 200);

  // Rename one question, drop another, add a new one.
  await call('PUT', `/api/forms/${form.id}`, { title: form.title, fields: [
    { id: time.id, label: 'Ceremony start time', field_type: 'text', required: true },
    { id: notes.id, label: 'Notes', field_type: 'textarea' },
    { label: 'Rain plan', field_type: 'text' },
  ] });
  const full = (await call('GET', `/api/forms/assignments/${a.id}`)).body;
  assert.deepEqual(full.fields.map(f => [f.label, f.value]), [['Ceremony start time', '4 pm'], ['Notes', 'Bring lanterns'], ['Rain plan', null]]);
});

test('staff can fill in and correct answers; required questions are checked only when complete', async () => {
  const form = await makeForm();
  const a = (await call('POST', `/api/forms/${form.id}/assign`, { couple_id: couple('staff@test.invalid') })).body;
  const [time, pets] = form.fields;
  const partial = await call('PUT', `/api/forms/assignments/${a.id}/responses`, { answers: { [pets.id]: 'No' }, complete: false });
  assert.equal(partial.status, 200);
  assert.equal(partial.body.assignment.status, 'pending');
  const incomplete = await call('PUT', `/api/forms/assignments/${a.id}/responses`, { answers: { [pets.id]: 'No' } });
  assert.equal(incomplete.status, 400);
  assert.match(incomplete.body.error, /Ceremony time/);
  const done = await call('PUT', `/api/forms/assignments/${a.id}/responses`, { answers: { [time.id]: '3 pm', [pets.id]: 'No' } });
  assert.equal(done.body.assignment.status, 'completed');
  assert.equal(done.body.assignment.filled_by, 'staff: Shannon');
  assert.equal(done.body.assignment.updated_by, 'staff: Shannon');
  assert.equal((await call('PUT', `/api/forms/assignments/${a.id}/responses`, { answers: {} }, null)).status, 401);
});

test('a couple can fill in a form from a private link, and a new link replaces the old one', async () => {
  const form = await makeForm();
  const cid = couple('link@test.invalid');
  const a = (await call('POST', `/api/forms/${form.id}/assign`, { couple_id: cid })).body;
  const link = await call('POST', `/api/forms/assignments/${a.id}/link`, { send: false });
  assert.equal(link.status, 200);
  const token = link.body.path.replace('/form/', '');
  assert.match(token, /^[a-f0-9]{48}$/);

  const view = await call('GET', `/api/forms/public/${token}`, null, null);
  assert.equal(view.status, 200);
  assert.equal(view.body.form.title, 'Day-of details');
  assert.equal(view.body.couple, 'Jo & Max');
  assert.ok(!('couple_email' in view.body), 'the public page shows no contact details');

  const [time] = form.fields;
  assert.equal((await call('POST', `/api/forms/public/${token}`, { answers: {} }, null)).status, 400, 'required questions still apply');
  assert.equal((await call('POST', `/api/forms/public/${token}`, { answers: { [time.id]: '5 pm' } }, null)).status, 200);
  const full = (await call('GET', `/api/forms/assignments/${a.id}`)).body;
  assert.equal(full.assignment.status, 'completed');
  assert.equal(full.assignment.filled_by, 'couple');
  assert.equal(full.fields[0].value, '5 pm');

  const again = await call('POST', `/api/forms/assignments/${a.id}/link`, { send: false });
  assert.equal((await call('GET', `/api/forms/public/${token}`, null, null)).status, 404, 'the old link stops working');
  assert.equal((await call('GET', `/api/forms/public/${again.body.path.slice(6)}`, null, null)).status, 200);

  db.prepare("UPDATE form_assignments SET token_expires_at = '2000-01-01T00:00:00Z' WHERE id = ?").run(a.id);
  assert.equal((await call('GET', `/api/forms/public/${again.body.path.slice(6)}`, null, null)).status, 404, 'expired links stop working');
  assert.equal((await call('GET', '/api/forms/public/not-a-token', null, null)).status, 404);
});

test('website enquiries and booking requests are saved as editable form responses', async () => {
  const send = (url, fields) => fetch(`${base}${url}`, { method: 'POST', body: new URLSearchParams(fields) });
  await send('/api/inquire/website', { partner1FirstName: 'Ada', partner1LastName: 'Moss', partner2FirstName: 'Ben', partner2LastName: 'Ray',
    email: 'ada@test.invalid', weddingDate: 'Summer 2027', guestCount: '60', message: 'Hello there' });
  await send('/api/inquire/booking-request', { bookingForm: '2027', client1Name: 'Ada Moss', client2Name: 'Ben Ray', email: 'ada@test.invalid',
    package: '3-Day Weekend ($6,500)', checkinDate: '2027-07-09', dj: 'Yes — hiring a DJ' });

  const cid = db.prepare("SELECT id FROM couples WHERE email = 'ada@test.invalid'").get().id;
  const list = (await call('GET', `/api/forms/couple/${cid}`)).body;
  assert.deepEqual(list.map(a => [a.title, a.status, a.filled_by]).sort(), [
    ['Website booking request', 'completed', 'website'],
    ['Website enquiry (contact page)', 'completed', 'website'],
  ]);
  const enquiry = (await call('GET', `/api/forms/assignments/${list.find(a => a.system_key === 'website-enquiry').id}`)).body;
  const answer = (label) => enquiry.fields.find(f => f.label === label)?.value;
  assert.equal(answer('Wedding date'), 'Summer 2027');
  assert.equal(answer('Message'), 'Hello there');

  const booking = (await call('GET', `/api/forms/assignments/${list.find(a => a.system_key === 'booking-request').id}`)).body;
  const dj = booking.fields.find(f => f.label === 'DJ or band?');
  assert.equal(dj.value, 'Yes — hiring a DJ');
  // Staff can correct a website answer like any other.
  const fixed = await call('PUT', `/api/forms/assignments/${booking.assignment.id}/responses`, { answers: { ...Object.fromEntries(booking.fields.filter(f => f.value).map(f => [f.id, f.value])), [dj.id]: 'Live band' } });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.fields.find(f => f.id === dj.id).value, 'Live band');
  assert.equal(fixed.body.assignment.filled_by, 'website');
  assert.equal(fixed.body.assignment.updated_by, 'staff: Shannon');

  // The website forms are created once and reused.
  assert.equal(db.prepare("SELECT COUNT(*) n FROM forms WHERE system_key = 'website-enquiry'").get().n, 1);
});
