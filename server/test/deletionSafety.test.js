// Phase 1b: archiving instead of deleting, guarded deletes, the activity log,
// and the hardened health check and error handler.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-del-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-deletion';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');

const app = express();
app.use(express.json());
app.use('/api/couples', require('../routes/couples'));
app.use('/api/contracts', require('../routes/contracts'));
app.use('/api/invoices', require('../routes/invoices'));
let server, base;
const token = role => 'Bearer ' + jwt.sign({ userId: role === 'admin' ? 1 : 2, email: `${role}@test`, name: role === 'admin' ? 'Kris' : 'Sam', role }, process.env.JWT_SECRET);
const admin = token('admin'), staff = token('staff');
test.before(() => new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const call = async (method, url, auth = admin, body) => {
  const res = await fetch(base + url, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), authorization: auth } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
let n = 0;
const couple = () => db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('Ava', 'Ben', ?, 'booked')")
  .run(`d${++n}@test.invalid`).lastInsertRowid;

test('delete archives: hidden from lists, records kept, restorable, and logged', async () => {
  const id = couple();
  db.prepare("INSERT INTO invoices (couple_id, description, amount, paid) VALUES (?, 'Deposit', 100, 1)").run(id);
  const r = await call('DELETE', `/api/couples/${id}`, staff);
  assert.equal(r.status, 200);
  assert.equal(r.body.archived, true);
  assert.ok(db.prepare('SELECT archived_at FROM couples WHERE id = ?').get(id).archived_at);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE couple_id = ?').get(id).n, 1, 'records kept');

  const list = await call('GET', '/api/couples');
  assert.ok(!list.body.some(c => c.id === id), 'hidden from the normal list');
  const archived = await call('GET', '/api/couples?archived=1');
  assert.ok(archived.body.some(c => c.id === id));

  const log = await call('GET', `/api/couples/${id}/activity`);
  assert.equal(log.body[0].action, 'couple.archived');
  assert.equal(log.body[0].user_name, 'Sam');

  assert.equal((await call('PATCH', `/api/couples/${id}/restore`, staff)).status, 200);
  assert.equal(db.prepare('SELECT archived_at FROM couples WHERE id = ?').get(id).archived_at, null);
});

test('permanent delete is admin-only, needs archiving first, and keeps couples with money or signatures', async () => {
  const id = couple();
  assert.equal((await call('DELETE', `/api/couples/${id}?permanent=1`, staff)).status, 403);
  assert.equal((await call('DELETE', `/api/couples/${id}?permanent=1`)).status, 409, 'not archived yet');
  await call('DELETE', `/api/couples/${id}`);
  db.prepare("INSERT INTO invoices (couple_id, description, amount, paid) VALUES (?, 'Deposit', 100, 1)").run(id);
  const refused = await call('DELETE', `/api/couples/${id}?permanent=1`);
  assert.equal(refused.status, 409);
  assert.match(refused.body.error, /1 paid invoice/);

  const clean = couple();
  await call('DELETE', `/api/couples/${clean}`);
  assert.equal((await call('DELETE', `/api/couples/${clean}?permanent=1`)).status, 200);
  assert.equal(db.prepare('SELECT 1 FROM couples WHERE id = ?').get(clean), undefined);
  const entry = db.prepare("SELECT * FROM activity_log WHERE action = 'couple.deleted' AND entity_id = ?").get(clean);
  assert.ok(entry, 'the deletion is logged');
  assert.equal(JSON.parse(entry.detail).email, `d${n}@test.invalid`, 'with a snapshot of what was removed');
  assert.ok(!('password_hash' in JSON.parse(entry.detail)));
});

test('a paid invoice cannot be deleted; an unpaid one can, and is logged', async () => {
  const id = couple();
  const paid = db.prepare("INSERT INTO invoices (couple_id, description, amount, paid) VALUES (?, 'Deposit', 100, 1)").run(id).lastInsertRowid;
  const r = await call('DELETE', `/api/invoices/${paid}`, staff);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /Mark it unpaid first/);
  const unpaid = db.prepare("INSERT INTO invoices (couple_id, description, amount) VALUES (?, 'Balance', 300)").run(id).lastInsertRowid;
  assert.equal((await call('DELETE', `/api/invoices/${unpaid}`, staff)).status, 200);
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'invoice.deleted' AND entity_id = ?").get(unpaid));
});

test('marking an invoice paid is logged with who did it', async () => {
  const id = couple();
  const inv = db.prepare("INSERT INTO invoices (couple_id, description, amount) VALUES (?, 'Deposit', 250)").run(id).lastInsertRowid;
  assert.equal((await call('PATCH', `/api/invoices/${inv}/paid`, staff, { paid: true })).status, 200);
  const e = db.prepare("SELECT * FROM activity_log WHERE action = 'invoice.paid' AND entity_id = ?").get(inv);
  assert.equal(e.user_name, 'Sam');
  assert.equal(e.couple_id, id);
});

test('a signed contract can only be deleted by an admin who confirms it', async () => {
  const id = couple();
  const c = db.prepare("INSERT INTO contracts (couple_id, title, content, status) VALUES (?, 'Agreement', 'x', 'signed')").run(id).lastInsertRowid;
  assert.equal((await call('DELETE', `/api/contracts/${c}`, staff)).status, 403);
  const ask = await call('DELETE', `/api/contracts/${c}`);
  assert.equal(ask.status, 409);
  assert.equal(ask.body.needs_confirm, true);
  assert.equal((await call('DELETE', `/api/contracts/${c}?confirm=signed`)).status, 200);
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'contract.deleted' AND entity_id = ?").get(c));

  const draft = db.prepare("INSERT INTO contracts (couple_id, title, content, status) VALUES (?, 'Draft', 'x', 'draft')").run(id).lastInsertRowid;
  assert.equal((await call('DELETE', `/api/contracts/${draft}`, staff)).status, 200, 'drafts delete as before');
});

test('archived couples get no payment reminders and leave the follow-up list', async () => {
  const { needsFollowUp } = require('../services/leadNurture');
  const lead = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('L', 'M', 'lead-arch@test.invalid', 'inquiry')").run().lastInsertRowid;
  assert.ok(needsFollowUp().some(c => c.id === lead));
  db.prepare("UPDATE couples SET archived_at = datetime('now') WHERE id = ?").run(lead);
  assert.ok(!needsFollowUp().some(c => c.id === lead));
});
