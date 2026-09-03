const crypto = require('crypto');

// Which provider the number lives on. The venue's own phone is an iPhone, and
// iOS does not let an app send or read SMS, so texting has to run through a
// provider number rather than the handset. Which provider is a deployment
// choice, not an application one — the two supported here differ only in how a
// request is signed and shaped, so both are wrapped and the rest of the app
// never learns which is in use.
const PROVIDER = (process.env.SMS_PROVIDER || 'telnyx').toLowerCase();

// The venue's number, in E.164. Every message is sent from this one.
const SMS_FROM = process.env.SMS_FROM_NUMBER;

const TELNYX_API_KEY    = process.env.TELNYX_API_KEY;
// Base64 Ed25519 key from the Telnyx portal, used to verify inbound webhooks.
const TELNYX_PUBLIC_KEY = process.env.TELNYX_PUBLIC_KEY;

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN  = process.env.TWILIO_AUTH_TOKEN;

// Overridable for the same reason RESEND_API_URL is in email.js: it lets the
// real send path be exercised against a local stub, so outbound SMS can be
// tested before anyone has bought a number or spent a cent.
const SMS_API_URL = process.env.SMS_API_URL || (
  PROVIDER === 'twilio'
    ? `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    : 'https://api.telnyx.com/v2/messages'
);

const configured = !!(SMS_FROM && (
  PROVIDER === 'twilio' ? (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) : TELNYX_API_KEY
));

// Say so at boot rather than letting it surface later as a text that silently
// never arrived. Unconfigured is a legitimate state — the feature ships before
// the number is bought — so this warns and carries on rather than throwing.
if (!configured && process.env.NODE_ENV === 'production') {
  console.warn(
    `[SMS] No ${PROVIDER} credentials or SMS_FROM_NUMBER — outbound texting is DISABLED. ` +
    'Messages will still be recorded in the CRM, but nothing will reach a phone.'
  );
}

// ── Phone numbers ────────────────────────────────────────────────────────────
// Numbers reach us three ways — typed into the CRM by staff, typed into the
// enquiry form by a couple, and handed over by the provider on an inbound text
// — and only the last is already E.164. Matching an inbound "+17805551234"
// against a stored "(780) 555-1234" is a string comparison that fails, and the
// couple's reply lands attached to nobody. So every number is normalised to
// E.164 before it is ever compared or sent to.
//
// Returns null rather than a guess when the digits cannot be resolved
// confidently: attaching a message to the wrong couple is worse than flagging
// it as unmatched.
function normalizePhone(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Already international and explicitly marked as such.
  if (hasPlus) return digits.length >= 8 ? `+${digits}` : null;
  // North American 10-digit, which is what almost every number here will be.
  if (digits.length === 10) return `+1${digits}`;
  // 11 digits with the North American country code already on the front.
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // Anything else is ambiguous without a country: an 8- or 9-digit string could
  // belong to several plans, and picking one would silently misroute a message.
  return null;
}

// ── Sending ──────────────────────────────────────────────────────────────────
async function sendViaTelnyx({ to, body }) {
  const res = await fetch(SMS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TELNYX_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: SMS_FROM, to, text: body }),
  });
  // Read the body exactly once — it is a single-use stream, and parsing it as
  // JSON then falling back to text() throws "Body has already been read" and
  // buries the actual reason for the refusal.
  const raw = await res.text();
  if (!res.ok) throw new Error(`Telnyx rejected the message (HTTP ${res.status}): ${raw}`);
  try { return { sid: JSON.parse(raw)?.data?.id || null }; } catch { return { sid: null }; }
}

async function sendViaTwilio({ to, body }) {
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const res = await fetch(SMS_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: SMS_FROM, To: to, Body: body }).toString(),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Twilio rejected the message (HTTP ${res.status}): ${raw}`);
  try { return { sid: JSON.parse(raw)?.sid || null }; } catch { return { sid: null }; }
}

// Returns { delivered, sid?, to?, error? } rather than throwing, matching the
// shape email.js uses. A staff member sending a text wants to be told it did
// not go out; a courtesy notification must not roll back the message row that
// is already saved. Both are served by a result the caller may inspect or
// ignore.
async function sendSms({ to, body }) {
  const normalized = normalizePhone(to);
  if (!normalized) return { delivered: false, error: 'No usable phone number' };
  if (!body || !body.trim()) return { delivered: false, error: 'Message body is empty' };
  if (!configured) {
    console.log(`[SMS – not configured] To: ${normalized} | ${body.slice(0, 60)}`);
    return { delivered: false, to: normalized, error: 'SMS is not configured on this server' };
  }
  try {
    const { sid } = PROVIDER === 'twilio'
      ? await sendViaTwilio({ to: normalized, body })
      : await sendViaTelnyx({ to: normalized, body });
    return { delivered: true, sid, to: normalized };
  } catch (err) {
    console.error('[SMS send error]', normalized, err.message);
    return { delivered: false, to: normalized, error: err.message };
  }
}

// ── Inbound webhook verification ─────────────────────────────────────────────
// The inbound endpoint is public by necessity — the provider has no session and
// cannot hold the preview-gate cookie. Without a signature check anyone who
// finds the URL could POST a message that appears in a couple's thread as if
// they had sent it. So an unverified request is refused outright.

// Telnyx signs `${timestamp}|${rawBody}` with Ed25519. Node needs the key as
// DER SPKI, and the portal hands out the bare 32 bytes base64-encoded, so the
// standard Ed25519 SPKI header is prepended before importing it.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function verifyTelnyxSignature({ rawBody, signature, timestamp, toleranceSec = 300 }) {
  if (!TELNYX_PUBLIC_KEY || !signature || !timestamp) return false;
  // Reject stale requests so a captured webhook cannot be replayed later.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSec) return false;
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(TELNYX_PUBLIC_KEY, 'base64')]),
      format: 'der',
      type: 'spki',
    });
    const signed = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');
    return crypto.verify(null, signed, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}

// Twilio signs the full request URL concatenated with its POST parameters
// sorted by key, HMAC-SHA1 under the auth token.
function verifyTwilioSignature({ url, params, signature }) {
  if (!TWILIO_AUTH_TOKEN || !signature) return false;
  try {
    const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url);
    const expected = crypto.createHmac('sha1', TWILIO_AUTH_TOKEN)
      .update(Buffer.from(data, 'utf8')).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    // Compare in constant time, and only when the lengths already match —
    // timingSafeEqual throws on a length mismatch rather than returning false.
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Normalises the two providers' inbound payloads into one shape so the route
// handling a text does not have to care which service delivered it.
function parseInbound({ rawBody, contentType }) {
  if (PROVIDER === 'twilio' || (contentType || '').includes('application/x-www-form-urlencoded')) {
    const p = Object.fromEntries(new URLSearchParams(rawBody));
    return { from: p.From, to: p.To, text: p.Body || '', providerSid: p.MessageSid || null, params: p };
  }
  const p = JSON.parse(rawBody);
  const payload = p?.data?.payload || {};
  return {
    from: payload.from?.phone_number,
    to: Array.isArray(payload.to) ? payload.to[0]?.phone_number : payload.to?.phone_number,
    text: payload.text || '',
    providerSid: payload.id || null,
    eventType: p?.data?.event_type || null,
    params: p,
  };
}

module.exports = {
  sendSms,
  normalizePhone,
  verifyTelnyxSignature,
  verifyTwilioSignature,
  parseInbound,
  isConfigured: () => configured,
  provider: PROVIDER,
};
