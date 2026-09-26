// The CRM emailing the venue about website submissions, and who may call it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-notify-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-notify';
process.env.NODE_ENV = 'test';
process.env.RESEND_API_KEY = 're_test';
process.env.ADMIN_EMAIL = 'venue@test.invalid';
process.env.BASE_URL = 'https://crm.example.test';

// A stand-in for Resend that records what it was sent.
let sent = [], failNext = false;
const stub = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c);
  req.on('end', () => {
    if (failNext) { failNext = false; res.writeHead(500); return res.end('down'); }
    sent.push(JSON.parse(body)); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}');
  });
});

let server, base;
test.before(async () => {
  await new Promise(r => stub.listen(0, r));
  process.env.RESEND_API_URL = `http://127.0.0.1:${stub.address().port}/emails`;
  const express = require('express');
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use('/api/inquire', require('../routes/inquire'));
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); stub.close(); require('../db').close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const post = (url, fields) => fetch(base + url, { method: 'POST', body: new URLSearchParams(fields) }).then(async r => ({ status: r.status, body: await r.json() }));
const enquiry = { partner1FirstName: 'Mia', partner1LastName: 'Cole', partner2FirstName: 'Sam', partner2LastName: 'Hart',
  email: 'mia@test.invalid', guestCount: '65', message: 'Is <August> free?' };

test('with _notify the CRM emails the venue every answer and says so', async () => {
  sent = [];
  const r = await post('/api/inquire/website', { ...enquiry, _notify: '1' });
  assert.equal(r.status, 201);
  assert.equal(r.body.notified, true);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, ['venue@test.invalid']);
  assert.equal(m.reply_to, 'mia@test.invalid', 'replying answers the couple');
  assert.equal(m.subject, 'New website enquiry: Mia Cole & Sam Hart');
  assert.match(m.text, /Guests: 65/);
  assert.match(m.html, /Is &lt;August&gt; free\?/, 'answers are escaped');
  const id = require('../db').prepare("SELECT id FROM couples WHERE email = 'mia@test.invalid'").get().id;
  assert.match(m.text, new RegExp(`https://crm.example.test/clients/${id}`));
});

test('without _notify (older site versions) no email is sent', async () => {
  sent = [];
  const r = await post('/api/inquire/website', { ...enquiry, email: 'old@test.invalid' });
  assert.equal(r.status, 201);
  assert.equal(r.body.notified, false);
  assert.equal(sent.length, 0);
});

test('if the email fails the couple is still saved and the site is told to fall back', async () => {
  sent = []; failNext = true;
  const r = await post('/api/inquire/booking-request', { _notify: '1', bookingForm: '2027', client1Name: 'Pat Lee', client2Name: 'Kim Fox',
    email: 'pat@test.invalid', package: '3-Day Weekend ($6,500)' });
  assert.equal(r.status, 201);
  assert.equal(r.body.notified, false);
  assert.ok(require('../db').prepare("SELECT id FROM couples WHERE email = 'pat@test.invalid'").get());
  // A working mail lists the booking answers.
  const ok = await post('/api/inquire/booking-request', { _notify: '1', bookingForm: '2027', client1Name: 'Pat Lee', client2Name: 'Kim Fox',
    email: 'pat@test.invalid', package: '3-Day Weekend ($6,500)', guestCount: '90' });
  assert.equal(ok.body.notified, true);
  assert.equal(sent[0].subject, 'New booking request: Pat Lee & Kim Fox');
  assert.match(sent[0].text, /Package: 3-Day Weekend \(\$6,500\)[\s\S]*Ceremony & reception guests: 90/);
});

test('a bot tripping the honeypot is not emailed about and needs no fallback', async () => {
  sent = [];
  const r = await post('/api/inquire/website', { ...enquiry, email: 'bot@test.invalid', _gotcha: 'x', _notify: '1' });
  assert.equal(r.body.notified, true);
  assert.equal(sent.length, 0);
});

test('only the website may read replies from the two form endpoints', () => {
  const { corsPolicy } = require('../middleware/corsPolicy');
  const policy = corsPolicy({ nodeEnv: 'production', baseUrl: 'https://crm.rusticretreatalberta.ca' });
  const ask = (p, origin) => { let out; policy({ path: p, header: () => origin }, (e, o) => { out = o; }); return out; };
  assert.deepEqual(ask('/api/inquire/website', 'https://www.rusticretreatalberta.ca'), { origin: true, credentials: false, methods: ['POST'] });
  assert.deepEqual(ask('/api/inquire/booking-request', 'https://rusticretreatalberta.ca').origin, true);
  assert.deepEqual(ask('/api/couples', 'https://www.rusticretreatalberta.ca'), { origin: ['https://crm.rusticretreatalberta.ca'], credentials: true });
  assert.deepEqual(ask('/api/inquire/website', 'https://evil.example').origin, ['https://crm.rusticretreatalberta.ca']);
  assert.equal(ask('/api/inquire/website', 'http://localhost:5174').origin.length, 1, 'dev origins are not allowed in production');
});
