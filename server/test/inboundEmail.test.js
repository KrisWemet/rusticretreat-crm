// Mail received at the venue's domain is forwarded to the venue Gmail.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-inbound-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-inbound';
process.env.NODE_ENV = 'test';
const SECRET = 'whsec_' + crypto.randomBytes(24).toString('base64');
process.env.RESEND_WEBHOOK_SECRET = SECRET;
process.env.RESEND_API_KEY = 're_send_only';
process.env.RESEND_INBOUND_API_KEY = 're_full';
process.env.REPLY_TO_EMAIL = 'venue@gmail.test';
process.env.SMTP_FROM = 'Shannon at Rustic Retreat <hello@venue.test>';

// A stand-in for Resend: serves the received message and records sends.
const sent = [];
let failSends = false;
const stub = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'POST' && req.url === '/emails') {
      if (failSends) { res.statusCode = 500; return res.end('{"message":"down"}'); }
      sent.push(JSON.parse(body));
      return res.end('{"id":"sent_1"}');
    }
    // The send-only key cannot read received mail, as on the real Resend.
    if (req.url.startsWith('/emails/receiving/') && req.headers.authorization !== 'Bearer re_full') {
      res.statusCode = 401; return res.end('{"name":"restricted_api_key"}');
    }
    if (req.url === '/emails/receiving/rcv_1') {
      return res.end(JSON.stringify({ id: 'rcv_1', from: 'Carley Fortier <carley@client.test>', to: ['hello@venue.test'],
        subject: 'Re: August long weekend', text: 'Saturday works!', html: '<p>Saturday works!</p>', attachments: [{ id: 'a1' }] }));
    }
    if (req.url === '/emails/receiving/rcv_1/attachments') {
      return res.end(JSON.stringify({ data: [{ id: 'a1', filename: 'ideas.pdf', download_url: 'https://files.test/a1' }] }));
    }
    res.statusCode = 404; res.end('{}');
  });
});

let app, server, base;
test.before(async () => {
  await new Promise(r => stub.listen(0, r));
  const stubUrl = `http://127.0.0.1:${stub.address().port}`;
  process.env.RESEND_API_BASE = stubUrl;
  process.env.RESEND_API_URL = `${stubUrl}/emails`;
  const express = require('express');
  const { inboundEmailHandler } = require('../routes/inboundEmail');
  app = express();
  app.post('/api/email/inbound', express.raw({ type: '*/*' }), inboundEmailHandler);
  await new Promise(r => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
});
test.after(() => { server.close(); stub.close(); require('../db').close(); fs.rmSync(tmp, { recursive: true, force: true }); });

function signed(payload, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
  const body = JSON.stringify(payload);
  const id = 'msg_' + crypto.randomBytes(4).toString('hex');
  const sig = crypto.createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { body, headers: { 'content-type': 'application/json', 'svix-id': id, 'svix-timestamp': String(ts), 'svix-signature': `v1,${sig}` } };
}
const post = async ({ body, headers }) => {
  const r = await fetch(base + '/api/email/inbound', { method: 'POST', body, headers });
  return { status: r.status, body: await r.json() };
};
const received = { type: 'email.received', data: { email_id: 'rcv_1', from: 'carley@client.test', to: ['hello@venue.test'], subject: 'Re: August long weekend' } };

test('unsigned, wrongly signed or stale posts are refused and nothing is sent', async () => {
  assert.equal((await post({ body: JSON.stringify(received), headers: { 'content-type': 'application/json' } })).status, 401);
  const other = 'whsec_' + crypto.randomBytes(24).toString('base64');
  assert.equal((await post(signed(received, { secret: other }))).status, 401);
  assert.equal((await post(signed(received, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status, 401);
  assert.equal(sent.length, 0);
});

test('a failed forward is answered 500 so Resend retries', async () => {
  failSends = true;
  assert.equal((await post(signed(received))).status, 500);
  failSends = false;
  assert.equal(sent.length, 0);
});

test('received mail is forwarded to the venue Gmail, replying goes to the sender, and retries do not duplicate', async () => {
  const r = await post(signed(received));
  assert.equal(r.status, 200);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, ['venue@gmail.test']);
  assert.equal(m.reply_to, 'carley@client.test');
  assert.equal(m.from, 'Carley Fortier via Rustic Retreat <hello@venue.test>');
  assert.equal(m.subject, 'Re: August long weekend');
  assert.match(m.html, /Saturday works!/);
  assert.match(m.text, /sent by Carley Fortier <carley@client.test>/);
  assert.deepEqual(m.attachments, [{ filename: 'ideas.pdf', path: 'https://files.test/a1' }]);

  assert.equal((await post(signed(received))).body.duplicate, true);
  assert.equal(sent.length, 1, 'a retried delivery is not forwarded twice');
});

test('other event types are acknowledged and ignored', async () => {
  const r = await post(signed({ type: 'email.delivered', data: { email_id: 'x' } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.ignored, true);
});
