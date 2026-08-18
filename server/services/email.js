const nodemailer = require('nodemailer');

const SMTP_HOST    = process.env.SMTP_HOST;
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER    = process.env.SMTP_USER;
const SMTP_PASS    = process.env.SMTP_PASS;
const SMTP_FROM    = process.env.SMTP_FROM || 'Rustic Retreat <noreply@rusticretreat.com>';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
const BASE_URL     = process.env.BASE_URL || 'http://localhost:5173';

// Resend's HTTP API is the preferred transport on a hosted platform: it is a
// plain HTTPS call, so it works anywhere outbound web traffic does, whereas
// SMTP ports are blocked or throttled on a lot of hosts. SMTP stays supported
// for anyone pointing this at their own mail server.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
// Overridable so the send path can be exercised against a local stub, and so a
// deployment behind an outbound proxy can point at it. Defaults to Resend.
const RESEND_API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';

const smtpConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
const configured = !!(RESEND_API_KEY || smtpConfigured);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function sendViaResend({ to, subject, html, text }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: SMTP_FROM, to: [to], subject, html, text }),
  });
  // Read the body exactly once. A response body is a single-use stream, so
  // parsing it as JSON and then falling back to text() on failure throws
  // "Body has already been read" and buries the real reason for the refusal.
  const raw = await res.text();
  if (!res.ok) {
    // Resend explains refusals in the body — an unverified domain, a bad key, a
    // suppressed address. Surfacing that beats a bare status code, because each
    // one needs a different fix.
    throw new Error(`Resend rejected the message (HTTP ${res.status}): ${raw}`);
  }
  try { return JSON.parse(raw); } catch { return { raw }; }
}

// Returns { delivered: boolean, error?: string } rather than throwing.
//
// Callers fall into two camps and both are served by this shape. A contract
// signing link is the whole point of the request, so its caller checks the
// result and tells staff when delivery failed — reporting "sent" for a mail
// that never left is how a couple ends up waiting on a link that is not coming.
// Incidental notifications just ignore the result and carry on, since a failed
// courtesy email must not roll back a signature that is already recorded.
async function send({ to, subject, html, text }) {
  if (!to) return { delivered: false, error: 'No recipient address' };
  if (!configured) {
    console.log(`[EMAIL – not configured] To: ${to} | Subject: ${subject}`);
    return { delivered: false, error: 'Email is not configured on this server' };
  }
  try {
    if (RESEND_API_KEY) await sendViaResend({ to, subject, html, text });
    else await transporter.sendMail({ from: SMTP_FROM, to, subject, html, text });
    return { delivered: true };
  } catch (err) {
    console.error('[EMAIL send error]', to, err.message);
    return { delivered: false, error: err.message };
  }
}

// ── Contract sent to couple ──────────────────────────────────────────────────
async function sendContractLink({ to, coupleNames, contractTitle, signingUrl, signerName }) {
  const fullUrl = `${BASE_URL}/sign/${signingUrl.replace('/sign/', '')}`;
  // Each partner signs separately and gets their own link, so address the person
  // whose turn it is. A mail headed with both names reads as already handled by
  // the other partner, and the second signature never arrives.
  const greeting = signerName || coupleNames;
  const note = 'This link is for you personally — your partner receives their own once you have signed.';
  // Returned, not swallowed: the caller needs to know whether the link actually
  // went out before it tells staff the couple has been notified.
  return send({
    to,
    subject: `Your contract is ready to sign — ${contractTitle}`,
    text: `Hi ${greeting},\n\nYour contract "${contractTitle}" from Rustic Retreat is ready for your review and digital signature.\n\nSign here: ${fullUrl}\n\n${note}\n\nIf you have any questions, please reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${greeting}</strong>,</p>
<p>Your contract <strong>"${contractTitle}"</strong> from Rustic Retreat is ready for your review and digital signature.</p>
<p style="color:#64748b;font-size:14px">${note}</p>
<p style="margin:24px 0"><a href="${fullUrl}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review & Sign Contract</a></p>
<p>Or copy this link: <a href="${fullUrl}">${fullUrl}</a></p>
<p>If you have any questions, just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Contract signed — confirmation to couple ─────────────────────────────────
async function sendContractSignedCouple({ to, coupleNames, contractTitle, portalUrl, portalEnabled }) {
  const url = portalUrl || `${BASE_URL}/portal/login`;
  // Only point couples at the portal when it is actually running. Sending a
  // "log in here" button to a portal that is switched off invites a support
  // call on the happiest email the venue sends.
  const portalBlock = portalEnabled
    ? {
        text: `\n\nLog in to your wedding planning portal to start planning: ${url}`,
        html: `<p style="margin:24px 0"><a href="${url}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Wedding Portal</a></p>`,
      }
    : {
        text: '\n\nWe will be in touch shortly with your next steps.',
        html: '<p>We will be in touch shortly with your next steps.</p>',
      };
  await send({
    to,
    subject: `Contract signed — welcome to Rustic Retreat! 🎉`,
    text: `Hi ${coupleNames},\n\nThank you for signing "${contractTitle}". Your booking with Rustic Retreat is now confirmed!${portalBlock.text}\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>Thank you for signing <strong>"${contractTitle}"</strong>. Your booking with Rustic Retreat is now officially confirmed! 🎉</p>
${portalBlock.html}
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Contract signed — admin notification ─────────────────────────────────────
async function sendContractSignedAdmin({ coupleNames, contractTitle, signerName, signedAt }) {
  if (!ADMIN_EMAIL) return;
  await send({
    to: ADMIN_EMAIL,
    subject: `Contract signed by ${signerName} — ${coupleNames}`,
    text: `${signerName} has signed "${contractTitle}" for ${coupleNames} at ${signedAt}.`,
    html: `<p><strong>${signerName}</strong> has signed <strong>"${contractTitle}"</strong> for ${coupleNames}.</p><p>Signed at: ${signedAt}</p>`,
  });
}

// ── New message notification to couple ───────────────────────────────────────
async function sendNewMessageCouple({ to, coupleNames, senderName, preview }) {
  const url = `${BASE_URL}/portal/messages`;
  await send({
    to,
    subject: `New message from ${senderName} — Rustic Retreat`,
    text: `Hi ${coupleNames},\n\n${senderName} sent you a message:\n\n"${preview}"\n\nReply here: ${url}`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p><strong>${senderName}</strong> sent you a message:</p>
<blockquote style="border-left:3px solid #e11d48;padding:8px 16px;color:#555;margin:16px 0">${preview}</blockquote>
<p><a href="${url}" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reply in Portal</a></p>`,
  });
}

// ── New inquiry lead ─────────────────────────────────────────────────────────
async function sendNewLeadAdmin({ coupleNames, email, phone, weddingDate, guestCount, message }) {
  if (!ADMIN_EMAIL) return;
  await send({
    to: ADMIN_EMAIL,
    subject: `New inquiry from ${coupleNames}`,
    text: `New lead:\n\nCouple: ${coupleNames}\nEmail: ${email}\nPhone: ${phone || '—'}\nWedding Date: ${weddingDate || '—'}\nGuests: ${guestCount || '—'}\n\nMessage:\n${message || '—'}`,
    html: `<p><strong>New inquiry received!</strong></p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Couple:</td><td><strong>${coupleNames}</strong></td></tr>
<tr><td style="color:#666">Email:</td><td>${email}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${phone || '—'}</td></tr>
<tr><td style="color:#666">Wedding Date:</td><td>${weddingDate || '—'}</td></tr>
<tr><td style="color:#666">Guest Count:</td><td>${guestCount || '—'}</td></tr>
</table>
${message ? `<p><strong>Message:</strong><br>${message}</p>` : ''}`,
  });
}

// ── Payment reminder to couple ───────────────────────────────────────────────
async function sendPaymentReminder({ to, coupleNames, description, amount, dueDate, daysUntilDue }) {
  const url = `${BASE_URL}/portal/payments`;
  const urgency = daysUntilDue <= 1 ? 'tomorrow' : `in ${daysUntilDue} days`;
  await send({
    to,
    subject: `Payment reminder: ${description} due ${urgency}`,
    text: `Hi ${coupleNames},\n\nThis is a friendly reminder that your payment "${description}" of $${amount.toLocaleString()} is due ${urgency} (${dueDate}).\n\nLog in to your wedding portal to view your payment schedule: ${url}\n\nIf you have questions, please contact your coordinator.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>This is a friendly reminder that your payment is coming up:</p>
<table cellpadding="8" style="border-collapse:collapse;background:#fdf2f8;border-radius:8px;width:100%;max-width:400px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${description}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#e11d48">$${amount.toLocaleString()}</strong></td></tr>
<tr><td style="color:#888">Due Date:</td><td><strong>${dueDate}</strong></td></tr>
</table>
<p style="margin:24px 0"><a href="${url}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Payment Portal</a></p>
<p>If you have any questions, please don't hesitate to reach out to your coordinator.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Payment receipt to couple ────────────────────────────────────────────────
async function sendPaymentReceipt({ to, coupleNames, description, amount, paymentMethod, paidDate, balance }) {
  const url = `${BASE_URL}/portal/payments`;
  const balanceLine = balance > 0
    ? `Remaining balance: $${balance.toLocaleString()} CAD`
    : 'Your balance is paid in full — thank you!';
  await send({
    to,
    subject: `Payment received — ${description} (Rustic Retreat)`,
    text: `Hi ${coupleNames},\n\nThis confirms we've received your payment. Thank you!\n\nPayment: ${description}\nAmount: $${amount.toLocaleString()} CAD\nMethod: ${paymentMethod}\nDate: ${paidDate}\n\n${balanceLine}\n\nView your full payment schedule: ${url}\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>This confirms we've received your payment — thank you! 🎉</p>
<table cellpadding="8" style="border-collapse:collapse;background:#f0fdf4;border-radius:8px;width:100%;max-width:420px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${description}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#16a34a">$${amount.toLocaleString()} CAD</strong></td></tr>
<tr><td style="color:#888">Method:</td><td>${paymentMethod}</td></tr>
<tr><td style="color:#888">Date:</td><td>${paidDate}</td></tr>
<tr><td style="color:#888">Balance:</td><td><strong>${balance > 0 ? '$' + balance.toLocaleString() + ' CAD' : 'Paid in full ✓'}</strong></td></tr>
</table>
<p style="margin:24px 0"><a href="${url}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Payment Portal</a></p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Site tour request — admin notification ───────────────────────────────────
async function sendTourRequestAdmin({ coupleNames, email: coupleEmail, phone, preferredDate }) {
  if (!ADMIN_EMAIL) return;
  await send({
    to: ADMIN_EMAIL,
    subject: `Site tour requested — ${coupleNames}`,
    text: `${coupleNames} requested a site tour.\n\nEmail: ${coupleEmail}\nPhone: ${phone || '—'}\nPreferred date: ${preferredDate || 'Flexible'}\n\nFollow up to confirm a time.`,
    html: `<p><strong>${coupleNames}</strong> requested a site tour.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Email:</td><td>${coupleEmail}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${phone || '—'}</td></tr>
<tr><td style="color:#666">Preferred date:</td><td>${preferredDate || 'Flexible'}</td></tr>
</table>
<p>Follow up to confirm a time.</p>`,
  });
}

// ── Cold-lead nurture follow-up to couple ────────────────────────────────────
async function sendLeadNurture({ to, coupleNames }) {
  const url = `${BASE_URL}/inquire`;
  await send({
    to,
    subject: `Still dreaming of a Rustic Retreat wedding?`,
    text: `Hi ${coupleNames},\n\nWe wanted to follow up on your inquiry about hosting your wedding at Rustic Retreat. We'd love to answer any questions and check our availability for your dates — our June–September weekends book up quickly.\n\nJust reply to this email or reach out any time. We'd be honoured to host your celebration.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>We wanted to follow up on your inquiry about hosting your wedding at Rustic Retreat. We'd love to answer any questions and check availability for your dates — our June–September weekends book up quickly.</p>
<p>Just reply to this email or reach out any time. We'd be honoured to host your celebration. 🌲</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Cold-lead alert to admin (no response after a week) ──────────────────────
async function sendColdLeadAdmin({ coupleNames, email: coupleEmail, phone, daysOld }) {
  if (!ADMIN_EMAIL) return;
  await send({
    to: ADMIN_EMAIL,
    subject: `Lead going cold — ${coupleNames} (${daysOld} days, no booking)`,
    text: `${coupleNames} inquired ${daysOld} days ago and hasn't booked.\n\nEmail: ${coupleEmail}\nPhone: ${phone || '—'}\n\nConsider a personal call or message before this lead goes cold.`,
    html: `<p><strong>${coupleNames}</strong> inquired <strong>${daysOld} days ago</strong> and hasn't booked yet.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Email:</td><td>${coupleEmail}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${phone || '—'}</td></tr>
</table>
<p>Consider a personal call or message before this lead goes cold.</p>`,
  });
}

// ── Proposal sent to couple (online accept link) ─────────────────────────────
async function sendProposal({ to, coupleNames, title, total, token }) {
  const url = `${BASE_URL}/proposal/${token}`;
  await send({
    to,
    subject: `Your proposal from Rustic Retreat — ${title}`,
    text: `Hi ${coupleNames},\n\nYour personalized proposal "${title}" is ready to review.\n\nTotal: $${total.toLocaleString()} CAD (incl. GST)\n\nReview and accept online here: ${url}\n\nQuestions? Just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>Your personalized proposal <strong>"${title}"</strong> is ready to review.</p>
<table cellpadding="8" style="border-collapse:collapse;background:#fdf2f8;border-radius:8px;width:100%;max-width:400px;margin:16px 0">
<tr><td style="color:#888">Total (incl. GST):</td><td><strong style="color:#e11d48">$${total.toLocaleString()} CAD</strong></td></tr>
</table>
<p style="margin:24px 0"><a href="${url}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; Accept Proposal</a></p>
<p>Or copy this link: <a href="${url}">${url}</a></p>
<p>Questions? Just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Proposal accepted — admin notification ───────────────────────────────────
async function sendProposalAcceptedAdmin({ coupleNames, title, total, acceptedName }) {
  if (!ADMIN_EMAIL) return;
  await send({
    to: ADMIN_EMAIL,
    subject: `🎉 Proposal accepted — ${coupleNames}`,
    text: `${acceptedName} accepted "${title}" for ${coupleNames}.\n\nTotal: $${total.toLocaleString()} CAD\n\nA booking and deposit invoice have been created automatically.`,
    html: `<p><strong>${acceptedName}</strong> accepted <strong>"${title}"</strong> for ${coupleNames}! 🎉</p>
<p>Total: <strong>$${total.toLocaleString()} CAD</strong></p>
<p>A booking and deposit invoice have been created automatically.</p>`,
  });
}

module.exports = {
  sendProposal,
  sendProposalAcceptedAdmin,
  sendContractLink,
  sendContractSignedCouple,
  sendContractSignedAdmin,
  sendNewMessageCouple,
  sendNewLeadAdmin,
  sendPaymentReminder,
  sendPaymentReceipt,
  sendTourRequestAdmin,
  sendLeadNurture,
  sendColdLeadAdmin,
};
