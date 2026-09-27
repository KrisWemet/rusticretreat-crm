const nodemailer = require('nodemailer');

const SMTP_HOST    = process.env.SMTP_HOST;
const SMTP_PORT    = parseInt(process.env.SMTP_PORT || '587');
const SMTP_USER    = process.env.SMTP_USER;
const SMTP_PASS    = process.env.SMTP_PASS;
const SMTP_FROM    = process.env.SMTP_FROM || 'Rustic Retreat <noreply@rusticretreat.com>';
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
const BASE_URL     = process.env.BASE_URL || 'http://localhost:5173';
const { ETRANSFER_EMAIL } = require('../venue');

// The couple portal is switched off unless ENABLE_COUPLE_PORTAL=1, so emails to
// couples only link to it when it is actually running.
const portalEnabled = () => process.env.ENABLE_COUPLE_PORTAL === '1';

// Anything a person typed (names, messages, descriptions) is escaped before it
// goes into an HTML body.
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

// Signing links are emailed to each partner in turn, so with no transport the
// whole e-signature flow stalls after the venue signs. Say so at boot, in the
// deploy log, rather than letting it surface later as a failed contract send.
if (!configured && process.env.NODE_ENV === 'production') {
  console.warn(
    '[EMAIL] No RESEND_API_KEY and no SMTP settings — outbound email is DISABLED. ' +
    'Contract signing links will not reach couples; staff will have to send them by hand.'
  );
}

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

async function sendViaResend({ to, subject, html, text, replyTo }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: SMTP_FROM, to: Array.isArray(to) ? to : [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}) }),
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
// `to` may be one address or a list; replyTo, when given, is where a reply goes.
async function send({ to, subject, html, text, replyTo, coupleId, kind }) {
  if (Array.isArray(to)) to = to.filter(Boolean);
  let result;
  if (!to || to.length === 0) {
    result = { delivered: false, error: 'No recipient address' };
  } else if (!configured) {
    console.log(`[EMAIL – not configured] To: ${to} | Subject: ${subject}`);
    result = { delivered: false, error: 'Email is not configured on this server' };
  } else {
    try {
      if (RESEND_API_KEY) await sendViaResend({ to, subject, html, text, replyTo });
      else await transporter.sendMail({ from: SMTP_FROM, to, subject, html, text, ...(replyTo ? { replyTo } : {}) });
      result = { delivered: true };
    } catch (err) {
      console.error('[EMAIL send error]', to, err.message);
      result = { delivered: false, error: err.message };
    }
  }
  logEmail({ to, subject, coupleId, kind, result });
  return result;
}

// Record the attempt in email_log. The couple is taken from the caller when
// known, otherwise matched by recipient address, so a couple's page can list
// everything they were sent. Never throws.
function logEmail({ to, subject, coupleId, kind, result }) {
  try {
    const db = require('../db');
    const list = (Array.isArray(to) ? to : [to]).filter(Boolean).map(a => String(a).toLowerCase());
    let id = coupleId || null;
    if (!id && list.length) {
      const hit = db.prepare(`SELECT id FROM couples WHERE LOWER(email) IN (${list.map(() => '?').join(',')})
                              OR LOWER(partner2_email) IN (${list.map(() => '?').join(',')}) LIMIT 1`).get(...list, ...list);
      id = hit ? hit.id : null;
    }
    db.prepare('INSERT INTO email_log (couple_id, kind, to_addr, subject, delivered, error) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, kind || null, list.join(', ') || null, subject || null, result.delivered ? 1 : 0, result.error || null);
  } catch (err) {
    console.error('[EMAIL log]', err.message);
  }
}

// ── Site tour confirmation to the visitor (sent only when staff tick it) ────
async function sendTourConfirmation({ to, coupleId, name, scheduledAt }) {
  // Tour times are entered as Alberta local time, e.g. "2026-10-03T10:00".
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(scheduledAt || '');
  const day = m ? new Date(m[1] + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : scheduledAt;
  const h = m ? Number(m[2]) : null;
  const time = m ? `${((h + 11) % 12) + 1}:${m[3]} ${h < 12 ? 'am' : 'pm'}` : '';
  const when = `${day}${time ? ` at ${time}` : ''}`;
  return send({
    to, coupleId, kind: 'tour-confirmation',
    replyTo: process.env.REPLY_TO_EMAIL || ADMIN_EMAIL || undefined,
    subject: `Your site tour at Rustic Retreat — ${day}`,
    text: `Hi ${name},\n\nYour site tour of Rustic Retreat is booked for ${when}.\n\nIf that time no longer works, just reply to this email and we'll find another.\n\nWe look forward to showing you around!\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(name)}</strong>,</p>
<p>Your site tour of Rustic Retreat is booked for <strong>${esc(when)}</strong>.</p>
<p>If that time no longer works, just reply to this email and we'll find another.</p>
<p>We look forward to showing you around!<br>Rustic Retreat</p>`,
  });
}

// ── A message from staff to a couple, sent in full by email ────────────────
// Replies go to the venue's own inbox (REPLY_TO_EMAIL, else ADMIN_EMAIL), not
// to the no-reply sending address.
async function sendCoupleMessage({ to, coupleId, coupleNames, senderName, subject, body }) {
  const replyTo = process.env.REPLY_TO_EMAIL || ADMIN_EMAIL || undefined;
  return send({
    to, coupleId, replyTo,
    kind: 'message',
    subject: subject || `A message from ${senderName} at Rustic Retreat`,
    text: `${body}\n\n— ${senderName}, Rustic Retreat\n\nJust reply to this email.`,
    html: `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(body)}</div>
<p style="margin-top:20px">— ${esc(senderName)}, Rustic Retreat</p>
<p style="color:#94a3b8;font-size:12px">Just reply to this email.</p>`,
  });
}

// ── Morning summary to the venue (7 am, services/schedule.js) ───────────────
function fmtDay(iso) {
  return new Date(iso.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function fmtTime(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

async function sendMorningSummary(s) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const link = (path) => `${BASE_URL}${path}`;
  const sections = [];
  const add = (title, rows, path) => { if (rows.length) sections.push({ title, rows, path }); };

  add('Weddings this week', s.weddings_week.map(w =>
    `${w.couple_names} — ${fmtDay(w.event_date)}${w.end_date !== w.event_date ? ` to ${fmtDay(w.end_date)}` : ''}${w.on_site ? ' (on site now)' : ''}${w.guest_count ? `, ${w.guest_count} guests` : ''}`), '/calendar');
  add('Tours today', s.tours_today.map(t => `${fmtTime(t.scheduled_at)} — ${t.name}${t.phone ? ` (${t.phone})` : ''}`), '/tours');
  add('Tours later this week', s.tours_week.map(t => `${fmtDay(t.scheduled_at)} ${fmtTime(t.scheduled_at)} — ${t.name}`), '/tours');
  add('Needs a follow-up', s.follow_ups.map(c =>
    `${c.couple_names} — enquired ${c.days_old === 0 ? 'today' : `${c.days_old} day${c.days_old === 1 ? '' : 's'} ago`}${c.email ? ` (${c.email})` : ''}`), '/dashboard');
  add('Tasks due', s.tasks_due.map(t => `${t.overdue ? 'OVERDUE ' : ''}${t.title}${t.couple_names ? ` — ${t.couple_names}` : ''}${t.overdue ? ` (was due ${fmtDay(t.due_date)})` : ''}`), '/tasks');
  add('Payments due this week', s.payments_due.map(p =>
    `${p.overdue ? 'OVERDUE ' : ''}${p.couple_names} — ${p.description}, $${money(p.amount)} due ${fmtDay(p.due_date)}`), '/payments');
  add('Contracts waiting for a signature', s.contracts_waiting.map(c => `${c.couple_names} — "${c.title}", waiting on ${c.waiting_on || 'a signer'}`), '/contracts');
  add('Forms sent but not returned', s.forms_waiting.map(f => `${f.couple_names} — "${f.title}", sent ${fmtDay(f.link_sent_at)}`), '/forms');
  if (s.tour_requests) add('Tour requests to schedule', [`${s.tour_requests} tour request${s.tour_requests === 1 ? '' : 's'} not scheduled yet`], '/tours');

  const heading = `Your day at Rustic Retreat — ${fmtDay(s.today)}`;
  const text = [heading, '', ...sections.flatMap(sec => [sec.title.toUpperCase(), ...sec.rows.map(r => `• ${r}`), `Open: ${link(sec.path)}`, ''])].join('\n');
  const html = `<p style="font-size:16px"><strong>${esc(heading)}</strong></p>` + sections.map(sec => `
<h3 style="margin:20px 0 6px;font-size:14px;color:#334155">${esc(sec.title)}</h3>
<ul style="margin:0;padding-left:18px;color:#334155">${sec.rows.map(r => `<li style="margin:3px 0">${esc(r).replace(/^OVERDUE /, '<strong style="color:#dc2626">Overdue</strong> ')}</li>`).join('')}</ul>
<p style="margin:6px 0 0"><a href="${esc(link(sec.path))}" style="color:#e11d48;font-size:13px">Open in the CRM →</a></p>`).join('') +
    `<p style="color:#94a3b8;font-size:12px;margin-top:28px">Sent every morning at 7 am when there is something to show.</p>`;

  return send({ to: ADMIN_EMAIL, kind: 'morning-summary', subject: `Today at Rustic Retreat: ${fmtDay(s.today)}`, text, html });
}

// ── A daily job failed — tell the venue ──────────────────────────────────────
async function sendJobFailureAdmin({ job, error }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const what = job === 'backup' ? 'the daily backup' : `the daily "${job}" job`;
  return send({
    to: ADMIN_EMAIL,
    kind: 'job-failure',
    subject: `CRM problem: ${what} failed`,
    text: `The CRM could not complete ${what} today.\n\nError: ${error}\n\nIt will try again tomorrow. If this keeps happening, check the Railway logs.`,
    html: `<p>The CRM could not complete <strong>${esc(what)}</strong> today.</p><p style="color:#666">Error: ${esc(error)}</p><p>It will try again tomorrow. If this keeps happening, check the Railway logs.</p>`,
  });
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
    kind: 'contract-link',
    to,
    subject: `Your contract is ready to sign — ${contractTitle}`,
    text: `Hi ${greeting},\n\nYour contract "${contractTitle}" from Rustic Retreat is ready for your review and digital signature.\n\nSign here: ${fullUrl}\n\n${note}\n\nIf you have any questions, please reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(greeting)}</strong>,</p>
<p>Your contract <strong>"${esc(contractTitle)}"</strong> from Rustic Retreat is ready for your review and digital signature.</p>
<p style="color:#64748b;font-size:14px">${note}</p>
<p style="margin:24px 0"><a href="${fullUrl}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review & Sign Contract</a></p>
<p>Or copy this link: <a href="${fullUrl}">${fullUrl}</a></p>
<p>If you have any questions, just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Forms ────────────────────────────────────────────────────────────────────
// Names and titles are typed by people, so they are escaped before going into
// the HTML body.

async function sendFormLink({ to, cc, coupleNames, formTitle, path }) {
  const url = `${BASE_URL}${path}`;
  const recipients = [...new Set([to, cc].filter(Boolean))];
  return send({
    kind: 'form-link',
    to: recipients,
    subject: `Please fill in: ${formTitle}`,
    text: `Hi ${coupleNames},\n\nRustic Retreat has a short form for you: "${formTitle}".\n\nFill it in here: ${url}\n\nYou can come back to this link to change your answers. If you have any questions, just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>Rustic Retreat has a short form for you: <strong>"${esc(formTitle)}"</strong>.</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Fill in the form</a></p>
<p>Or copy this link: <a href="${esc(url)}">${esc(url)}</a></p>
<p style="color:#64748b;font-size:14px">You can come back to this link to change your answers.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

async function sendFormCompletedAdmin({ coupleNames, formTitle }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'form-completed',
    to: ADMIN_EMAIL,
    subject: `${coupleNames} filled in ${formTitle}`,
    text: `${coupleNames} have filled in "${formTitle}". Their answers are on their client page in the CRM.`,
    html: `<p><strong>${esc(coupleNames)}</strong> have filled in <strong>"${esc(formTitle)}"</strong>.</p><p>Their answers are on their client page in the CRM.</p>`,
  });
}

// ── Website enquiry / booking request → the venue ────────────────────────────
// Replaces the Formspree email once the website sends its forms to the CRM.
// Every answer is listed, the couple's page is linked, and replying goes
// straight to the couple.
async function sendWebsiteSubmissionAdmin({ kind, coupleNames, email: coupleEmail, answers, coupleId }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const url = `${BASE_URL}/clients/${coupleId}`;
  const heading = kind === 'booking-request' ? 'New booking request' : 'New website enquiry';
  const rows = answers.map(([label, value]) =>
    `<tr><td style="color:#666;vertical-align:top;padding:4px 12px 4px 0">${esc(label)}</td><td style="padding:4px 0;white-space:pre-wrap">${esc(value)}</td></tr>`).join('');
  return send({
    kind: 'website-submission',
    to: ADMIN_EMAIL,
    replyTo: coupleEmail,
    subject: `${heading}: ${coupleNames}`,
    text: `${heading} from ${coupleNames} (${coupleEmail}).\n\n${answers.map(([l, v]) => `${l}: ${v}`).join('\n')}\n\nOpen in the CRM: ${url}\n\nReply to this email to answer the couple.`,
    html: `<p><strong>${esc(heading)}</strong> from <strong>${esc(coupleNames)}</strong> (<a href="mailto:${esc(coupleEmail)}">${esc(coupleEmail)}</a>).</p>
<table cellpadding="0" style="border-collapse:collapse;font-size:14px">${rows}</table>
<p style="margin:20px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open in the CRM</a></p>
<p style="color:#64748b;font-size:13px">Reply to this email to answer the couple directly. The couple, a follow-up task and their answers are already in the CRM.</p>`,
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
  return send({
    kind: 'contract-signed',
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
async function sendContractSignedAdmin({ coupleNames, contractTitle, signerName, signedAt, note }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'contract-signed-admin',
    to: ADMIN_EMAIL,
    subject: `Contract signed by ${signerName} — ${coupleNames}`,
    text: `${signerName} has signed "${contractTitle}" for ${coupleNames} at ${signedAt}.${note ? `\n\n${note}` : ''}`,
    html: `<p><strong>${esc(signerName)}</strong> has signed <strong>"${esc(contractTitle)}"</strong> for ${esc(coupleNames)}.</p><p>Signed at: ${esc(signedAt)}</p>${note ? `<p>${esc(note)}</p>` : ''}`,
  });
}

// ── New message notification to couple ───────────────────────────────────────
async function sendNewMessageCouple({ to, coupleNames, senderName, preview }) {
  const url = `${BASE_URL}/portal/messages`;
  const reply = portalEnabled()
    ? { text: `Reply here: ${url}`, html: `<p><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reply in Portal</a></p>` }
    : { text: 'Just reply to this email.', html: '<p>Just reply to this email.</p>' };
  return send({
    kind: 'message',
    to,
    subject: `New message from ${senderName} — Rustic Retreat`,
    text: `Hi ${coupleNames},\n\n${senderName} sent you a message:\n\n"${preview}"\n\n${reply.text}`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p><strong>${esc(senderName)}</strong> sent you a message:</p>
<blockquote style="border-left:3px solid #e11d48;padding:8px 16px;color:#555;margin:16px 0;white-space:pre-wrap">${esc(preview)}</blockquote>
${reply.html}`,
  });
}

// ── New inquiry lead ─────────────────────────────────────────────────────────
async function sendNewLeadAdmin({ coupleNames, email, phone, weddingDate, guestCount, message }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'new-lead',
    to: ADMIN_EMAIL,
    replyTo: email || undefined,
    subject: `New inquiry from ${coupleNames}`,
    text: `New lead:\n\nCouple: ${coupleNames}\nEmail: ${email}\nPhone: ${phone || '—'}\nWedding Date: ${weddingDate || '—'}\nGuests: ${guestCount || '—'}\n\nMessage:\n${message || '—'}`,
    html: `<p><strong>New inquiry received!</strong></p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Couple:</td><td><strong>${esc(coupleNames)}</strong></td></tr>
<tr><td style="color:#666">Email:</td><td>${esc(email)}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${esc(phone || '—')}</td></tr>
<tr><td style="color:#666">Wedding Date:</td><td>${esc(weddingDate || '—')}</td></tr>
<tr><td style="color:#666">Guest Count:</td><td>${esc(guestCount || '—')}</td></tr>
</table>
${message ? `<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${esc(message)}</p>` : ''}`,
  });
}

// ── How to pay (shown while the portal is off) ───────────────────────────────
function howToPay({ coupleNames, description }) {
  if (portalEnabled()) {
    const url = `${BASE_URL}/portal/payments`;
    return {
      text: `View your payment schedule in your wedding portal: ${url}`,
      html: `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Payment Portal</a></p>`,
    };
  }
  const memo = `${coupleNames} — ${description}`;
  return {
    text: `To pay, send an Interac e-Transfer to ${ETRANSFER_EMAIL} and put "${memo}" in the message.`,
    html: `<p>To pay, send an <strong>Interac e-Transfer</strong> to <strong>${esc(ETRANSFER_EMAIL)}</strong> and put <em>${esc(memo)}</em> in the message.</p>`,
  };
}

// ── Payment reminder to couple ───────────────────────────────────────────────
function dueWording(daysUntilDue) {
  if (daysUntilDue <= 0) return 'today';
  if (daysUntilDue === 1) return 'tomorrow';
  return `in ${daysUntilDue} days`;
}

async function sendPaymentReminder({ to, coupleId, coupleNames, description, amount, dueDate, daysUntilDue }) {
  const urgency = dueWording(daysUntilDue);
  const pay = howToPay({ coupleNames, description });
  return send({
    coupleId,
    kind: 'payment-reminder',
    to,
    subject: `Payment reminder: ${description} due ${urgency}`,
    text: `Hi ${coupleNames},\n\nThis is a friendly reminder that your payment "${description}" of $${money(amount)} CAD is due ${urgency} (${dueDate}).\n\n${pay.text}\n\nIf you have already paid, thank you, and please ignore this reminder. Questions? Just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>This is a friendly reminder that your payment is coming up:</p>
<table cellpadding="8" style="border-collapse:collapse;background:#fdf2f8;border-radius:8px;width:100%;max-width:400px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${esc(description)}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#e11d48">$${money(amount)} CAD</strong></td></tr>
<tr><td style="color:#888">Due Date:</td><td><strong>${esc(dueDate)}</strong></td></tr>
</table>
${pay.html}
<p>If you have already paid, thank you, and please ignore this reminder. Questions? Just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Payment receipt to couple ────────────────────────────────────────────────
async function sendPaymentReceipt({ to, coupleId, coupleNames, description, amount, paymentMethod, paidDate, balance }) {
  const balanceLine = balance > 0
    ? `Remaining balance: $${money(balance)} CAD`
    : 'Your balance is paid in full — thank you!';
  const scheduleLink = portalEnabled()
    ? { text: `\n\nView your full payment schedule: ${BASE_URL}/portal/payments`,
        html: `<p style="margin:24px 0"><a href="${esc(`${BASE_URL}/portal/payments`)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View Payment Portal</a></p>` }
    : { text: '\n\nQuestions about your payment schedule? Just reply to this email.',
        html: '<p>Questions about your payment schedule? Just reply to this email.</p>' };
  return send({
    coupleId,
    kind: 'payment-receipt',
    to,
    subject: `Payment received — ${description} (Rustic Retreat)`,
    text: `Hi ${coupleNames},\n\nThis confirms we've received your payment. Thank you!\n\nPayment: ${description}\nAmount: $${money(amount)} CAD\nMethod: ${paymentMethod}\nDate: ${paidDate}\n\n${balanceLine}${scheduleLink.text}\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>This confirms we've received your payment — thank you! 🎉</p>
<table cellpadding="8" style="border-collapse:collapse;background:#f0fdf4;border-radius:8px;width:100%;max-width:420px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${esc(description)}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#16a34a">$${money(amount)} CAD</strong></td></tr>
<tr><td style="color:#888">Method:</td><td>${esc(paymentMethod)}</td></tr>
<tr><td style="color:#888">Date:</td><td>${esc(paidDate)}</td></tr>
<tr><td style="color:#888">Balance:</td><td><strong>${balance > 0 ? '$' + money(balance) + ' CAD' : 'Paid in full ✓'}</strong></td></tr>
</table>
${scheduleLink.html}
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Site tour request — admin notification ───────────────────────────────────
async function sendTourRequestAdmin({ coupleNames, email: coupleEmail, phone, preferredDate }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'tour-request',
    to: ADMIN_EMAIL,
    replyTo: coupleEmail || undefined,
    subject: `Site tour requested — ${coupleNames}`,
    text: `${coupleNames} requested a site tour.\n\nEmail: ${coupleEmail}\nPhone: ${phone || '—'}\nPreferred date: ${preferredDate || 'Flexible'}\n\nFollow up to confirm a time.`,
    html: `<p><strong>${esc(coupleNames)}</strong> requested a site tour.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Email:</td><td>${esc(coupleEmail)}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${esc(phone || '—')}</td></tr>
<tr><td style="color:#666">Preferred date:</td><td>${esc(preferredDate || 'Flexible')}</td></tr>
</table>
<p>Follow up to confirm a time.</p>`,
  });
}


// ── Enquiry nobody has followed up yet — alert to admin ─────────────────────
// Couples are never nudged automatically (the owner's choice): the venue is
// told instead, so the follow-up is personal.
async function sendColdLeadAdmin({ coupleNames, email: coupleEmail, phone, daysOld, coupleId }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const url = coupleId ? `${BASE_URL}/clients/${coupleId}` : `${BASE_URL}/clients`;
  return send({
    kind: 'follow-up-alert',
    to: ADMIN_EMAIL,
    replyTo: coupleEmail || undefined,
    subject: `Needs a follow-up — ${coupleNames} (${daysOld} days since their enquiry)`,
    text: `${coupleNames} enquired ${daysOld} days ago and nobody has followed up in the CRM yet (no tour scheduled, no proposal sent, not marked contacted).\n\nEmail: ${coupleEmail || '—'}\nPhone: ${phone || '—'}\n\nOpen in the CRM: ${url}\n\nOnce you've been in touch, click "Mark contacted" on their page.`,
    html: `<p><strong>${esc(coupleNames)}</strong> enquired <strong>${daysOld} days ago</strong> and nobody has followed up in the CRM yet (no tour scheduled, no proposal sent, not marked contacted).</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">Email:</td><td>${esc(coupleEmail || '—')}</td></tr>
<tr><td style="color:#666">Phone:</td><td>${esc(phone || '—')}</td></tr>
</table>
<p style="margin:20px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open in the CRM</a></p>
<p style="color:#666">Once you've been in touch, click "Mark contacted" on their page.</p>`,
  });
}

// ── Proposal sent to couple (online accept link) ─────────────────────────────
async function sendProposal({ to, coupleNames, title, total, token }) {
  const url = `${BASE_URL}/proposal/${token}`;
  return send({
    kind: 'proposal',
    to,
    subject: `Your proposal from Rustic Retreat — ${title}`,
    text: `Hi ${coupleNames},\n\nYour personalized proposal "${title}" is ready to review.\n\nTotal: $${money(total)} CAD (incl. GST)\n\nReview and accept online here: ${url}\n\nQuestions? Just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>Your personalized proposal <strong>"${esc(title)}"</strong> is ready to review.</p>
<table cellpadding="8" style="border-collapse:collapse;background:#fdf2f8;border-radius:8px;width:100%;max-width:400px;margin:16px 0">
<tr><td style="color:#888">Total (incl. GST):</td><td><strong style="color:#e11d48">$${money(total)} CAD</strong></td></tr>
</table>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Review &amp; Accept Proposal</a></p>
<p>Or copy this link: <a href="${esc(url)}">${esc(url)}</a></p>
<p>Questions? Just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Proposal accepted — admin notification ───────────────────────────────────
async function sendProposalAcceptedAdmin({ coupleNames, title, total, acceptedName }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'proposal-accepted',
    to: ADMIN_EMAIL,
    subject: `🎉 Proposal accepted — ${coupleNames}`,
    text: `${acceptedName} accepted "${title}" for ${coupleNames}.\n\nTotal: $${money(total)} CAD\n\nA booking and deposit invoice have been created automatically.`,
    html: `<p><strong>${esc(acceptedName)}</strong> accepted <strong>"${esc(title)}"</strong> for ${esc(coupleNames)}! 🎉</p>
<p>Total: <strong>$${money(total)} CAD</strong></p>
<p>A booking and deposit invoice have been created automatically.</p>`,
  });
}

// ── Text from a number we do not recognise ───────────────────────────────────
// An inbound text that matches no couple must not be swallowed. It is most
// likely a real person — a lead texting the number off the website, or a couple
// using a phone we never recorded — and dropping it silently means nobody ever
// learns they wrote in.
// ── Text from a number we do not recognise ───────────────────────────────────
// An inbound text that matches no couple must not be swallowed. It is most
// likely a real person — a lead texting the number off the website, or a couple
// using a phone we never recorded — and dropping it silently means nobody ever
// learns they wrote in.
async function sendUnmatchedSmsAdmin({ fromNumber, text, receivedAt }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  return send({
    kind: 'unmatched-sms',
    to: ADMIN_EMAIL,
    subject: `Text from an unknown number (${fromNumber})`,
    text: `A text arrived from a number that matches no couple in the CRM.\n\nFrom: ${fromNumber}\nReceived: ${receivedAt}\n\nMessage:\n${text}\n\nAdd this number to the right couple to have future texts thread automatically.`,
    html: `<p><strong>A text arrived from a number that matches no couple in the CRM.</strong></p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td style="color:#666">From:</td><td><strong>${esc(fromNumber)}</strong></td></tr>
<tr><td style="color:#666">Received:</td><td>${esc(receivedAt)}</td></tr>
</table>
<p><strong>Message:</strong></p><p style="white-space:pre-wrap">${esc(text)}</p>
<p style="color:#666">Add this number to the right couple to have future texts thread automatically.</p>`,
  });
}

module.exports = {
  send,
  sendTourConfirmation,
  isConfigured: () => configured,
  sendCoupleMessage,
  sendMorningSummary,
  sendJobFailureAdmin,
  esc,
  dueWording,
  sendUnmatchedSmsAdmin,
  sendProposal,
  sendProposalAcceptedAdmin,
  sendContractLink,
  sendContractSignedCouple,
  sendContractSignedAdmin,
  sendNewMessageCouple,
  sendNewLeadAdmin,
  sendFormLink,
  sendFormCompletedAdmin,
  sendWebsiteSubmissionAdmin,
  sendPaymentReminder,
  sendPaymentReceipt,
  sendTourRequestAdmin,
  sendColdLeadAdmin,
};
