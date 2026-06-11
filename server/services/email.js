const nodemailer = require('nodemailer');

const SMTP_HOST    = process.env.SMTP_HOST;
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER    = process.env.SMTP_USER;
const SMTP_PASS    = process.env.SMTP_PASS;
const SMTP_FROM    = process.env.SMTP_FROM || 'Rustic Retreat <noreply@rusticretreat.com>';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
const BASE_URL     = process.env.BASE_URL || 'http://localhost:5173';

const configured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function send({ to, subject, html, text }) {
  if (!configured) {
    console.log(`[EMAIL – not configured] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, html, text });
  } catch (err) {
    console.error('[EMAIL send error]', err.message);
  }
}

// ── Contract sent to couple ──────────────────────────────────────────────────
async function sendContractLink({ to, coupleNames, contractTitle, signingUrl }) {
  const fullUrl = `${BASE_URL}/sign/${signingUrl.replace('/sign/', '')}`;
  await send({
    to,
    subject: `Your contract is ready to sign — ${contractTitle}`,
    text: `Hi ${coupleNames},\n\nYour contract "${contractTitle}" from Rustic Retreat is ready for your review and digital signature.\n\nSign here: ${fullUrl}\n\nIf you have any questions, please reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>Your contract <strong>"${contractTitle}"</strong> from Rustic Retreat is ready for your review and digital signature.</p>
<p style="margin:24px 0"><a href="${fullUrl}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review & Sign Contract</a></p>
<p>Or copy this link: <a href="${fullUrl}">${fullUrl}</a></p>
<p>If you have any questions, just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Contract signed — confirmation to couple ─────────────────────────────────
async function sendContractSignedCouple({ to, coupleNames, contractTitle, portalUrl }) {
  const url = portalUrl || `${BASE_URL}/portal/login`;
  await send({
    to,
    subject: `Contract signed — welcome to Rustic Retreat! 🎉`,
    text: `Hi ${coupleNames},\n\nThank you for signing "${contractTitle}". Your booking with Rustic Retreat is now confirmed!\n\nLog in to your wedding planning portal to start planning: ${url}\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${coupleNames}</strong>,</p>
<p>Thank you for signing <strong>"${contractTitle}"</strong>. Your booking with Rustic Retreat is now officially confirmed! 🎉</p>
<p style="margin:24px 0"><a href="${url}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open Wedding Portal</a></p>
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

module.exports = {
  sendContractLink,
  sendContractSignedCouple,
  sendContractSignedAdmin,
  sendNewMessageCouple,
  sendNewLeadAdmin,
};
