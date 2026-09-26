// Contracts signed outside the CRM, attached files, and editing free-text drafts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-cx-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-contract-extras';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const app = express();
app.use(express.json());
app.use('/api/contracts', require('../routes/contracts'));
let server, base;
const staff = 'Bearer ' + jwt.sign({ userId: 1, email: 'a@test', name: 'Kris', role: 'admin' }, process.env.JWT_SECRET);
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, body, auth = staff) => {
  const isForm = body instanceof FormData;
  const res = await fetch(base + url, {
    method, body: isForm ? body : body ? JSON.stringify(body) : undefined,
    headers: { ...(isForm || !body ? {} : { 'content-type': 'application/json' }), ...(auth ? { authorization: auth } : {}) },
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};
const couple = () => db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('A', 'B', ?, 'booked')")
  .run(`cx${Math.random()}@test.invalid`).lastInsertRowid;
const PDF = Buffer.from('%PDF-1.4\n% signed agreement\n%%EOF');

test('a contract signed elsewhere is recorded as signed and locked, with its file', async () => {
  const id = couple();
  const form = new FormData();
  Object.entries({ couple_id: String(id), title: 'Rental Agreement (paper)', signed_date: '2026-09-20', signed_by: 'A & B',
    wedding_date: '2027-07-23', package_name: '3-Day Weekend', total_price: '6825', guest_count: '80' }).forEach(([k, v]) => form.append(k, v));
  form.append('file', new Blob([PDF], { type: 'application/pdf' }), 'signed.pdf');
  const r = await call('POST', '/api/contracts/external', form);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const c = db.prepare('SELECT * FROM contracts WHERE id = ?').get(r.body.id);
  assert.equal(c.status, 'signed');
  assert.equal(c.source, 'external');
  assert.ok(c.locked_at);
  assert.equal(c.signed_at.slice(0, 10), '2026-09-20');
  assert.equal(c.total_price, 6825);

  const files = await call('GET', `/api/contracts/${c.id}/files`);
  assert.deepEqual(files.body.map(f => [f.filename, f.mime_type, f.size, f.uploaded_by]), [['signed.pdf', 'application/pdf', PDF.length, 'Kris']]);
  const dl = await call('GET', `/api/contracts/${c.id}/files/${files.body[0].id}`);
  assert.equal(dl.status, 200);
  assert.equal(dl.type, 'application/pdf');
  assert.ok(dl.body.equals(PDF));
  assert.equal((await call('GET', `/api/contracts/${c.id}/files/${files.body[0].id}`, null, null)).status, 401, 'files need a staff login');

  const list = await call('GET', '/api/contracts');
  const row = list.body.find(x => x.id === c.id);
  assert.equal(row.source, 'external');
  assert.equal(row.file_count, 1);

  // It never enters the e-signing flow.
  assert.equal((await call('POST', `/api/contracts/${c.id}/send`)).status, 400);
  assert.equal((await call('POST', `/api/contracts/${c.id}/sign-venue`, { signature_data: 'x' })).status, 400);
});

test('uploads refuse missing details and unsupported files', async () => {
  const id = couple();
  const noDate = new FormData(); noDate.append('couple_id', String(id)); noDate.append('title', 'X');
  assert.match((await call('POST', '/api/contracts/external', noDate)).body.error, /date it was signed/);
  const bad = new FormData(); bad.append('couple_id', String(id)); bad.append('title', 'X'); bad.append('signed_date', '2026-09-01');
  bad.append('file', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
  const r = await call('POST', '/api/contracts/external', bad);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /PDF, JPG, PNG/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM contracts WHERE couple_id = ?").get(id).n, 0);
});

test('files can be attached to and removed from any contract', async () => {
  const id = couple();
  const c = (await call('POST', '/api/contracts', { couple_id: id, title: 'Custom', content: 'Terms' })).body;
  const form = new FormData(); form.append('file', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'page1.jpg');
  const added = await call('POST', `/api/contracts/${c.id}/files`, form);
  assert.equal(added.status, 201);
  assert.equal((await call('DELETE', `/api/contracts/${c.id}/files/${added.body.id}`)).status, 200);
  assert.equal((await call('GET', `/api/contracts/${c.id}/files`)).body.length, 0);
});

test('a free-text draft can be edited until the venue signs; the standard agreement wording cannot', async () => {
  const id = couple();
  const c = (await call('POST', '/api/contracts', { couple_id: id, title: 'Custom', content: 'Old terms', guest_count: 50 })).body;
  const r = await call('PUT', `/api/contracts/${c.id}`, { title: 'Custom v2', content: 'New terms', guest_count: 70, package_name: '5-Day Experience', total_price: 8925 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual([r.body.title, r.body.content, r.body.guest_count, r.body.package_name, r.body.total_price],
    ['Custom v2', 'New terms', 70, '5-Day Experience', 8925]);
  assert.equal((await call('PUT', `/api/contracts/${c.id}`, { content: '   ' })).status, 400);

  db.prepare('UPDATE contracts SET locked_at = CURRENT_TIMESTAMP WHERE id = ?').run(c.id);
  assert.equal((await call('PUT', `/api/contracts/${c.id}`, { content: 'Sneaky change' })).status, 400);

  const t = (await call('POST', '/api/contracts', { couple_id: id, title: 'Agreement', template_packet: 'rental-2027', wedding_date: '2027-07-23' })).body;
  const tr = await call('PUT', `/api/contracts/${t.id}`, { content: 'Rewritten' });
  assert.equal(tr.status, 400);
  assert.match(tr.body.error, /wording is fixed/);
});
