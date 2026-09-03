const db = require('../db');
const sms = require('../services/sms');
const email = require('../services/email');

// Carriers require these to work regardless of what the application wants, and
// a couple typing "stop" in lower case means exactly the same thing as one
// shouting it. ARRET/AIDE are the French equivalents, which matter in Canada.
const STOP_WORDS  = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'ARRET']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);
const HELP_WORDS  = new Set(['HELP', 'INFO', 'AIDE']);

// Phone numbers are stored as somebody typed them — "(780) 555-1234",
// "780.555.1234", "+1 780 555 1234" — so comparing them in SQL against the
// E.164 the provider sends would miss most of the time and the couple's reply
// would arrive attached to nobody. Normalising both sides in JS is exact. At
// this scale (tens of couples) the scan costs nothing; if the client list ever
// reaches the thousands, add a normalised column and index that instead.
function findCoupleByPhone(e164) {
  if (!e164) return null;
  const rows = db.prepare(`
    SELECT id, partner1_name, partner2_name, phone, partner2_phone, sms_opted_out_at
    FROM couples
    WHERE phone IS NOT NULL OR partner2_phone IS NOT NULL
  `).all();
  for (const c of rows) {
    if (sms.normalizePhone(c.phone) === e164) return { couple: c, partner: 1 };
    if (sms.normalizePhone(c.partner2_phone) === e164) return { couple: c, partner: 2 };
  }
  return null;
}

function recordMessage({ coupleId, senderName, content, fromNumber, providerSid }) {
  const result = db.prepare(`
    INSERT INTO messages (couple_id, sender_type, sender_name, content, channel, from_number, provider_sid)
    VALUES (?, 'couple', ?, ?, 'sms', ?, ?)
  `).run(coupleId, senderName, content, fromNumber, providerSid);
  return result.lastInsertRowid;
}

// A delivery receipt arrives on the same webhook as an inbound text. It is not
// a message from anyone — it is the provider reporting what happened to one we
// sent — so it updates the existing row rather than creating a new one.
function applyDeliveryReceipt({ providerSid, status }) {
  if (!providerSid || !status) return false;
  const r = db.prepare('UPDATE messages SET delivery_status = ? WHERE provider_sid = ?')
    .run(status, providerSid);
  return r.changes > 0;
}

// Mounted directly in index.js with express.raw(), before the JSON body parser,
// for the same reason the Stripe webhook is: the signature covers the bytes as
// sent, and a parsed-then-restringified body is not necessarily the same bytes.
async function inboundHandler(req, res) {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const contentType = req.headers['content-type'] || '';

  // This endpoint is public by necessity — the provider has no session and
  // cannot hold the preview-gate cookie. Without this check anyone who found
  // the URL could post a message that appears in a couple's thread as though
  // they had sent it, so an unverified request is refused outright.
  let verified;
  if (sms.provider === 'twilio') {
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    // Twilio signs the URL it was configured with. Behind Railway's proxy the
    // request arrives as http internally, so the public https URL is rebuilt.
    const url = process.env.SMS_WEBHOOK_URL
      || `https://${req.get('host')}${req.originalUrl}`;
    verified = sms.verifyTwilioSignature({ url, params, signature: req.get('X-Twilio-Signature') });
  } else {
    verified = sms.verifyTelnyxSignature({
      rawBody,
      signature: req.get('telnyx-signature-ed25519'),
      timestamp: req.get('telnyx-timestamp'),
    });
  }
  if (!verified) {
    console.warn('[SMS inbound] rejected — signature did not verify');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  let parsed;
  try {
    parsed = sms.parseInbound({ rawBody, contentType });
  } catch (err) {
    console.error('[SMS inbound] unparseable payload:', err.message);
    // 400, not 500: the payload is the problem, and retrying it will not help.
    return res.status(400).json({ error: 'Malformed payload' });
  }

  // Delivery receipts, both providers. Answer 200 either way — a receipt for a
  // message we no longer hold is not an error worth making the provider retry.
  const twilioStatus = parsed.params?.MessageStatus || parsed.params?.SmsStatus;
  const telnyxIsReceipt = parsed.eventType && parsed.eventType !== 'message.received';
  if (twilioStatus || telnyxIsReceipt) {
    const status = twilioStatus
      || parsed.params?.data?.payload?.to?.[0]?.status
      || parsed.eventType;
    applyDeliveryReceipt({ providerSid: parsed.providerSid, status });
    return res.status(200).json({ ok: true });
  }

  const from = sms.normalizePhone(parsed.from);
  const text = (parsed.text || '').trim();
  const match = findCoupleByPhone(from);

  // Keyword handling first: a couple who texts STOP has to be honoured whether
  // or not we can work out who they are.
  const keyword = text.toUpperCase().replace(/[^A-Z]/g, '');
  if (STOP_WORDS.has(keyword) || START_WORDS.has(keyword)) {
    const optingOut = STOP_WORDS.has(keyword);
    if (match) {
      db.prepare('UPDATE couples SET sms_opted_out_at = ? WHERE id = ?')
        .run(optingOut ? new Date().toISOString() : null, match.couple.id);
      // Recorded in the thread too, so staff can see why texting stopped
      // working for this couple rather than assuming the feature is broken.
      recordMessage({
        coupleId: match.couple.id,
        senderName: partnerName(match),
        content: text,
        fromNumber: from,
        providerSid: parsed.providerSid,
      });
    }
    console.log(`[SMS inbound] ${optingOut ? 'opt-out' : 'opt-in'} from ${from}`);
    return res.status(200).json({ ok: true });
  }

  if (HELP_WORDS.has(keyword)) {
    await sms.sendSms({
      to: from,
      body: 'Rustic Retreat Alberta. Reply STOP to stop receiving texts. For help call or email us at rusticretreatalberta@gmail.com',
    });
    return res.status(200).json({ ok: true });
  }

  if (!match) {
    // Most likely a real person — a lead texting the number from the website,
    // or a couple on a phone we never recorded. Alerting beats discarding.
    console.warn(`[SMS inbound] no couple matches ${from}`);
    email.sendUnmatchedSmsAdmin({
      fromNumber: from || 'unknown',
      text,
      receivedAt: new Date().toISOString(),
    }).catch(err => console.error('[SMS inbound] alert failed:', err.message));
    return res.status(200).json({ ok: true, matched: false });
  }

  recordMessage({
    coupleId: match.couple.id,
    senderName: partnerName(match),
    content: text,
    fromNumber: from,
    providerSid: parsed.providerSid,
  });
  console.log(`[SMS inbound] message from ${from} filed to couple ${match.couple.id}`);
  return res.status(200).json({ ok: true, matched: true });
}

// Name the partner who actually sent it, not the couple as a unit, so a thread
// with two phones in it reads as a conversation rather than one voice.
function partnerName(match) {
  const { couple, partner } = match;
  return partner === 2 ? couple.partner2_name : couple.partner1_name;
}

module.exports = { inboundHandler, findCoupleByPhone, applyDeliveryReceipt };
