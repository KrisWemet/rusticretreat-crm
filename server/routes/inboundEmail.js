const crypto = require('crypto');
const db = require('../db');
const email = require('../services/email');

// Mail sent to any address at the venue's domain (hello@, a reply to
// noreply@, …) is received by Resend, which calls this endpoint. The domain
// has no mailbox of its own, so each message is forwarded to the venue Gmail,
// with Reply-To set to the original sender so answering it from Gmail goes
// straight back to them.
//
// Resend posts only a summary; the body and attachments are fetched from its
// API. Resend keeps every received message too, so nothing is lost if a
// forward fails — the request is answered 500 and Resend retries it.

const RESEND_API = process.env.RESEND_API_BASE || 'https://api.resend.com';
const forwardTo = () => process.env.INBOUND_FORWARD_TO || process.env.REPLY_TO_EMAIL || process.env.ADMIN_EMAIL;

db.exec(`
  CREATE TABLE IF NOT EXISTS inbound_email_log (
    email_id TEXT PRIMARY KEY,
    at DATETIME DEFAULT CURRENT_TIMESTAMP,
    from_addr TEXT,
    to_addr TEXT,
    subject TEXT,
    forwarded INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );
`);

// Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body",
// keyed with the base64 part of the whsec_ secret. The endpoint is public, so
// without this anyone could make the CRM send mail to the venue inbox.
function verifySignature({ rawBody, id, timestamp, signature, secret = process.env.RESEND_WEBHOOK_SECRET, now = Date.now(), toleranceSec = 300 }) {
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSec) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  // The header can carry several space-separated "v1,<base64>" signatures
  // while a secret is being rotated; any one matching is enough.
  return String(signature).split(' ').some(part => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const given = Buffer.from(sig, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

async function resendGet(path) {
  const res = await fetch(`${RESEND_API}${path}`, { headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Resend ${path} answered HTTP ${res.status}: ${raw.slice(0, 300)}`);
  return JSON.parse(raw);
}

// "Jane Doe <jane@x.com>" → { name: 'Jane Doe', address: 'jane@x.com' }
function parseAddress(v) {
  const s = String(v || '').trim();
  const m = /^(.*?)\s*<([^>]+)>$/.exec(s);
  return m ? { name: m[1].replace(/^"|"$/g, '').trim(), address: m[2].trim() } : { name: '', address: s };
}

// The address the forward is sent from: the CRM's own sender address, so it
// passes the domain's DKIM/SPF checks. Only the display name changes.
function senderAddress() {
  return parseAddress(process.env.SMTP_FROM || 'noreply@rusticretreatalberta.ca').address;
}

async function forwardReceived(summary) {
  const id = summary.email_id || summary.id;
  const full = await resendGet(`/emails/receiving/${encodeURIComponent(id)}`);
  let attachments = [];
  if ((full.attachments || summary.attachments || []).length) {
    const list = await resendGet(`/emails/receiving/${encodeURIComponent(id)}/attachments`);
    attachments = (list.data || []).filter(a => a.download_url)
      .map(a => ({ filename: a.filename || 'attachment', path: a.download_url }));
  }
  const from = parseAddress(full.from || summary.from);
  const toList = [].concat(full.to || summary.to || []).join(', ');
  const who = from.name ? `${from.name} <${from.address}>` : from.address;
  const subject = full.subject || summary.subject || '(no subject)';
  const note = `Forwarded from ${toList} — sent by ${who}. Reply normally and it goes back to them.`;
  const esc = email.esc;
  const result = await email.send({
    kind: 'inbound-forward',
    from: `${(from.name || from.address).replace(/[<>"]/g, '')} via Rustic Retreat <${senderAddress()}>`,
    to: forwardTo(),
    replyTo: from.address || undefined,
    subject,
    text: `${note}\n\n${full.text || ''}`,
    html: `<p style="color:#64748b;font-size:13px;border-bottom:1px solid #e2e8f0;padding-bottom:8px;margin-bottom:16px">${esc(note)}</p>${full.html || `<pre style="white-space:pre-wrap;font-family:inherit">${esc(full.text || '')}</pre>`}`,
    attachments,
  });
  return { from: from.address, to: toList, subject, result };
}

async function inboundEmailHandler(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const ok = verifySignature({
    rawBody,
    id: req.get('svix-id'),
    timestamp: req.get('svix-timestamp'),
    signature: req.get('svix-signature'),
  });
  if (!ok) {
    if (!process.env.RESEND_WEBHOOK_SECRET) console.error('[inbound-email] RESEND_WEBHOOK_SECRET is not set — cannot accept received mail');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return res.status(400).json({ error: 'Bad JSON' }); }
  if (event.type !== 'email.received') return res.json({ ignored: true });

  const id = event.data?.email_id || event.data?.id;
  if (!id) return res.status(400).json({ error: 'No email id' });
  // Resend retries until it gets a 2xx, so a message already forwarded is
  // acknowledged without sending a second copy.
  const seen = db.prepare('SELECT forwarded FROM inbound_email_log WHERE email_id = ?').get(id);
  if (seen?.forwarded) return res.json({ duplicate: true });
  if (!forwardTo()) {
    console.error('[inbound-email] no INBOUND_FORWARD_TO / REPLY_TO_EMAIL / ADMIN_EMAIL — nowhere to forward to');
    return res.status(500).json({ error: 'No forwarding address configured' });
  }

  try {
    const f = await forwardReceived(event.data);
    db.prepare(`INSERT INTO inbound_email_log (email_id, from_addr, to_addr, subject, forwarded, error) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(email_id) DO UPDATE SET forwarded = excluded.forwarded, error = excluded.error, at = CURRENT_TIMESTAMP`)
      .run(id, f.from, f.to, f.subject, f.result.delivered ? 1 : 0, f.result.error || null);
    if (!f.result.delivered) {
      console.error('[inbound-email] forward failed', id, f.result.error);
      return res.status(500).json({ error: 'Forward failed' });
    }
    res.json({ forwarded: true });
  } catch (err) {
    console.error('[inbound-email]', id, err.message);
    db.prepare(`INSERT INTO inbound_email_log (email_id, forwarded, error) VALUES (?, 0, ?)
                ON CONFLICT(email_id) DO UPDATE SET error = excluded.error, at = CURRENT_TIMESTAMP`).run(id, err.message);
    res.status(500).json({ error: 'Forward failed' });
  }
}

module.exports = { inboundEmailHandler, verifySignature, parseAddress };
