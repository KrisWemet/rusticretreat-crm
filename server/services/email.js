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

module.exports = {
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
