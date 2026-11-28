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

async function sendViaResend({ to, subject, html, text, replyTo, from, attachments }) {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: from || SMTP_FROM, to: Array.isArray(to) ? to : [to], subject, html, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments?.length ? { attachments } : {}) }),
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
// from and attachments are Resend-only; they are used to forward mail received
// at the venue's own domain (routes/inboundEmail.js), which needs Resend anyway.
async function send({ to, subject, html, text, replyTo, coupleId, kind, from, attachments }) {
  if (Array.isArray(to)) to = to.filter(Boolean);
  let result;
  if (!to || to.length === 0) {
    result = { delivered: false, error: 'No recipient address' };
  } else if (!configured) {
    console.log(`[EMAIL – not configured] To: ${to} | Subject: ${subject}`);
    result = { delivered: false, error: 'Email is not configured on this server' };
  } else {
    try {
      if (RESEND_API_KEY) await sendViaResend({ to, subject, html, text, replyTo, from, attachments });
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
  const dep = s.deposits || { collect: [], inspect: [], refund: [] };
  add('Damage deposits', [
    ...dep.collect.map(d => `${d.couple_names} — collect $${money(d.amount)} at check-in${d.on_site ? ' (on site now)' : ` ${fmtDay(d.check_in)}`}`),
    ...dep.inspect.map(d => `${d.overdue ? 'OVERDUE ' : ''}${d.couple_names} — inspection due by ${fmtDay(d.due)}${d.held ? `, holding $${money(d.held)}` : ', deposit not recorded'}`),
    ...dep.refund.map(d => `${d.couple_names} — send the $${money(d.amount)} refund`),
  ], '/payments');
  add('Unread messages from couples', (s.unread_messages || []).map(m =>
    `${m.couple_names} — ${m.n} unread message${m.n === 1 ? '' : 's'}, the first ${fmtDay(m.oldest)}`), '/messages');
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

// The Final Details Form link. Its deadline and the lock come from the rental
// agreement (Section 2.3): counts are final once submitted.
async function sendFinalDetailsLink({ to, coupleId, coupleNames, url, deadline }) {
  const due = deadline ? fmtDay(deadline) : '7 days before check-in';
  return send({
    kind: 'final-details-link',
    coupleId,
    to,
    subject: `Your Final Details Form for Rustic Retreat (due ${due})`,
    text: `Hi ${coupleNames},\n\nIt's time for your Final Details Form: your final guest count, overnight campers, tents and RVs, and any extras such as propane or generator rental.\n\nFill it in here: ${url}\n\nIt is due by ${due}. Once you submit it, the counts are locked and cannot be changed (Section 2.3 of your rental agreement). The form shows any overage fees as you go; we will review it and send an invoice for anything owing, payable by the same date.\n\nIf you have any questions, just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>It's time for your <strong>Final Details Form</strong>: your final guest count, overnight campers, tents and RVs, and any extras such as propane or generator rental.</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Fill in your Final Details</a></p>
<p>Or copy this link: <a href="${esc(url)}">${esc(url)}</a></p>
<p>It is due by <strong>${esc(due)}</strong>. Once you submit it, the counts are locked and cannot be changed (Section 2.3 of your rental agreement). The form shows any overage fees as you go; we will review it and send an invoice for anything owing, payable by the same date.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// The damage deposit statement (agreement Section 4.2), sent only when staff
// press the button: what was received, each deduction and why, and what is
// coming back.
async function sendDepositStatement({ to, coupleId, coupleNames, received, receivedAt, deductions, refund, refundedAt, refundMethod, excess }) {
  const m = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = deductions.map(d => `${d.label}${d.quantity > 1 ? ` (${d.quantity})` : ''}: ${d.description} — ${m(d.amount)}`);
  const outcome = refundedAt
    ? `We sent your refund of ${m(refund)}${refundMethod ? ` by ${refundMethod}` : ''} on ${fmtDay(refundedAt)}.`
    : refund > 0 ? `Your refund of ${m(refund)} is on its way.`
    : 'No refund is due.';
  const owed = excess > 0 ? ` The deductions come to ${m(excess)} more than the deposit; we will send an invoice for that amount.` : '';
  return send({
    kind: 'damage-deposit-statement',
    coupleId,
    to,
    subject: 'Your Rustic Retreat damage deposit',
    text: `Hi ${coupleNames},\n\nThank you for celebrating with us. Here is where your damage deposit stands (Section 4.2 of your rental agreement).\n\nReceived: ${m(received)}${receivedAt ? ` on ${fmtDay(receivedAt)}` : ''}\n${lines.length ? `Deductions:\n${lines.map(l => `  - ${l}`).join('\n')}\n` : 'Deductions: none\n'}\n${outcome}${owed}\n\nIf you have any questions, just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>Thank you for celebrating with us. Here is where your damage deposit stands (Section 4.2 of your rental agreement).</p>
<table style="border-collapse:collapse;font-size:14px;margin:12px 0">
<tr><td style="padding:4px 16px 4px 0;color:#64748b">Received${receivedAt ? ` ${esc(fmtDay(receivedAt))}` : ''}</td><td style="padding:4px 0;text-align:right"><strong>${m(received)}</strong></td></tr>
${deductions.map(d => `<tr><td style="padding:4px 16px 4px 0">${esc(d.label)}${d.quantity > 1 ? ` (${d.quantity})` : ''}: ${esc(d.description)}</td><td style="padding:4px 0;text-align:right">−${m(d.amount)}</td></tr>`).join('')}
${deductions.length ? '' : '<tr><td style="padding:4px 16px 4px 0">Deductions</td><td style="padding:4px 0;text-align:right">none</td></tr>'}
<tr><td style="padding:8px 16px 4px 0;border-top:1px solid #e2e8f0"><strong>Refund</strong></td><td style="padding:8px 0 4px;border-top:1px solid #e2e8f0;text-align:right"><strong>${m(refund)}</strong></td></tr>
</table>
<p>${esc(outcome)}${esc(owed)}</p>
<p>If you have any questions, just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

async function sendFinalDetailsSubmittedAdmin({ coupleId, coupleNames, total }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const owing = total > 0 ? `Overages come to $${Number(total).toFixed(2)} including GST.` : 'There are no overage fees.';
  return send({
    kind: 'final-details-submitted',
    coupleId,
    to: ADMIN_EMAIL,
    subject: `${coupleNames} submitted their Final Details Form`,
    text: `${coupleNames} submitted their Final Details Form. ${owing}\n\nReview it on their page in the CRM (Event plan tab), then approve it to create the overage invoice.`,
    html: `<p><strong>${esc(coupleNames)}</strong> submitted their Final Details Form. ${esc(owing)}</p><p>Review it on their page in the CRM (Event plan tab), then approve it to create the overage invoice.</p>`,
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

// ── A couple wrote from their portal → the venue ─────────────────────────────
async function sendCoupleMessageAdmin({ coupleId, coupleNames, content }) {
  if (!ADMIN_EMAIL) return { delivered: false, error: 'No ADMIN_EMAIL set' };
  const url = `${BASE_URL}/messages?couple=${coupleId}`;
  const preview = String(content || '').slice(0, 1500);
  return send({
    kind: 'couple-message',
    to: ADMIN_EMAIL,
    subject: `New message from ${coupleNames}`,
    text: `${coupleNames} sent a message from their wedding portal:\n\n${preview}\n\nReply in the CRM: ${url}`,
    html: `<p><strong>${esc(coupleNames)}</strong> sent a message from their wedding portal:</p>
<blockquote style="margin:12px 0;padding:10px 14px;border-left:3px solid #fda4af;background:#fff1f2;color:#334155;white-space:pre-wrap">${esc(preview)}</blockquote>
<p><a href="${esc(url)}" style="color:#e11d48">Reply in the CRM →</a></p>
<p style="color:#94a3b8;font-size:12px">Replying to this email does not reach the couple. Reply from Messages in the CRM.</p>`,
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
  // A setup link (first time) asks them to choose a password; otherwise it is
  // the portal's sign-in page.
  const isSetup = /\/portal\/setup\//.test(url);
  const portalBlock = portalEnabled
    ? {
        text: isSetup
          ? `\n\nYour wedding planning portal is ready. Choose your password here (the link works once, for 14 days): ${url}`
          : `\n\nLog in to your wedding planning portal to start planning: ${url}`,
        html: `<p>${isSetup ? 'Your wedding planning portal is ready: payments, your Final Details Form, documents, guests and messages in one place. Choose your password to get started (the link works once, for 14 days).' : ''}</p><p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${isSetup ? 'Set up my portal' : 'Open Wedding Portal'}</a></p>`,
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

// The couple portal setup link, sent by staff (or to reset a forgotten
// password). Choosing a password signs them straight in.
async function sendPortalInvite({ to, coupleId, coupleNames, url, days, hasLogin = false }) {
  return send({
    kind: hasLogin ? 'portal-password-link' : 'portal-invite',
    coupleId,
    to,
    subject: hasLogin ? 'Choose a new password for your Rustic Retreat portal' : 'Your Rustic Retreat wedding portal',
    text: `Hi ${coupleNames},\n\n${hasLogin ? 'Here is a link to choose a new password for your wedding portal.' : 'Your Rustic Retreat wedding portal is ready: your payments, Final Details Form, documents, guest list and messages in one place.'}\n\nChoose your password here: ${url}\n\nThe link works once and expires in ${days} days. Afterwards, sign in at ${BASE_URL}/portal/login with either of your email addresses.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>${hasLogin ? 'Here is a link to choose a new password for your wedding portal.' : 'Your Rustic Retreat wedding portal is ready: your payments, Final Details Form, documents, guest list and messages in one place.'}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">${hasLogin ? 'Choose a new password' : 'Set up my portal'}</a></p>
<p style="color:#64748b;font-size:14px">The link works once and expires in ${days} days. Afterwards, sign in at <a href="${esc(BASE_URL)}/portal/login">${esc(BASE_URL)}/portal/login</a> with either of your email addresses.</p>
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

// The lines of an itemised invoice (extras, overages), for reminders and
// receipts. Empty for an ordinary one-amount invoice.
function itemsBlock(items) {
  if (!items || !items.length) return { text: '', html: '' };
  const { lineText } = require('./extras');
  return {
    text: `\n${items.map(l => `  - ${lineText(l)}`).join('\n')}\n`,
    html: `<table cellpadding="4" style="border-collapse:collapse;font-size:14px;margin:8px 0 16px">${items.map(l =>
      `<tr><td style="color:#475569">${esc(l.label)}${l.kind !== 'gst' && Number(l.quantity) !== 1 ? ` × ${esc(String(Number(l.quantity)))}` : ''}</td><td style="text-align:right;padding-left:24px">$${money(l.amount)}</td></tr>`).join('')}</table>`,
  };
}

async function sendPaymentReminder({ to, coupleId, coupleNames, description, amount, dueDate, daysUntilDue, items, payUrl, cardFeePct }) {
  const urgency = dueWording(daysUntilDue);
  const pay = howToPay({ coupleNames, description });
  const lines = itemsBlock(items);
  // Card payment, when it is switched on: a link, with the fee stated.
  const cardText = payUrl ? `\nPrefer to pay by credit card? ${payUrl} (a ${cardFeePct}% card fee applies; e-Transfer has no fee).\n` : '';
  const cardHtml = payUrl ? `<p style="font-size:14px">Prefer to pay by credit card? <a href="${esc(payUrl)}">Pay by card</a> (a ${esc(String(cardFeePct))}% card fee applies; e-Transfer has no fee).</p>` : '';
  return send({
    coupleId,
    kind: 'payment-reminder',
    to,
    subject: `Payment reminder: ${description} due ${urgency}`,
    text: `Hi ${coupleNames},\n\nThis is a friendly reminder that your payment "${description}" of $${money(amount)} CAD is due ${urgency} (${dueDate}).\n${lines.text}\n${pay.text}${cardText}\n\nIf you have already paid, thank you, and please ignore this reminder. Questions? Just reply to this email.\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>This is a friendly reminder that your payment is coming up:</p>
<table cellpadding="8" style="border-collapse:collapse;background:#fdf2f8;border-radius:8px;width:100%;max-width:400px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${esc(description)}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#e11d48">$${money(amount)} CAD</strong></td></tr>
<tr><td style="color:#888">Due Date:</td><td><strong>${esc(dueDate)}</strong></td></tr>
</table>
${lines.html}${pay.html}${cardHtml}
<p>If you have already paid, thank you, and please ignore this reminder. Questions? Just reply to this email.</p>
<p>Warm regards,<br>Rustic Retreat</p>`,
  });
}

// ── Payment receipt to couple ────────────────────────────────────────────────
async function sendPaymentReceipt({ to, coupleId, coupleNames, description, amount, paymentMethod, paidDate, balance, items }) {
  const lines = itemsBlock(items);
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
    text: `Hi ${coupleNames},\n\nThis confirms we've received your payment. Thank you!\n\nPayment: ${description}\nAmount: $${money(amount)} CAD\nMethod: ${paymentMethod}\nDate: ${paidDate}\n${lines.text}\n${balanceLine}${scheduleLink.text}\n\nWarm regards,\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(coupleNames)}</strong>,</p>
<p>This confirms we've received your payment — thank you! 🎉</p>
<table cellpadding="8" style="border-collapse:collapse;background:#f0fdf4;border-radius:8px;width:100%;max-width:420px;margin:16px 0">
<tr><td style="color:#888">Payment:</td><td><strong>${esc(description)}</strong></td></tr>
<tr><td style="color:#888">Amount:</td><td><strong style="color:#16a34a">$${money(amount)} CAD</strong></td></tr>
<tr><td style="color:#888">Method:</td><td>${esc(paymentMethod)}</td></tr>
<tr><td style="color:#888">Date:</td><td>${esc(paidDate)}</td></tr>
<tr><td style="color:#888">Balance:</td><td><strong>${balance > 0 ? '$' + money(balance) + ' CAD' : 'Paid in full ✓'}</strong></td></tr>
</table>
${lines.html}${scheduleLink.html}
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

// ── Staff sign-up invite ─────────────────────────────────────────────────────
// Returned so the admin is told whether it went out; the link is also shown on
// screen to copy, so a failed send is never a dead end.
// Someone used "Forgot your password?" with this login's address.
async function sendPasswordResetRequest({ to, name, url, hours }) {
  return send({
    kind: 'staff-password-reset',
    to,
    subject: 'Reset your Rustic Retreat CRM password',
    text: `Hi ${name},\n\nSomeone (hopefully you) asked to reset the password for your Rustic Retreat CRM login.\n\nChoose a new password here: ${url}\n\nThe link works once and expires in ${hours} hours. If you did not ask for this, ignore this email; your password has not changed.\n\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(name)}</strong>,</p>
<p>Someone (hopefully you) asked to reset the password for your Rustic Retreat CRM login.</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p>
<p>Or copy this link: <a href="${esc(url)}">${esc(url)}</a></p>
<p style="color:#64748b;font-size:14px">The link works once and expires in ${hours} hours. If you did not ask for this, ignore this email; your password has not changed.</p>
<p>Rustic Retreat</p>`,
  });
}

async function sendStaffInvite({ to, name, invitedBy, url, expiresDays, reset = false }) {
  // reset: the person already has a login and is choosing a new password.
  const intro = reset
    ? `${invitedBy} sent you a link to choose a new password for your Rustic Retreat CRM login.`
    : `${invitedBy} has set up a login for you on the Rustic Retreat CRM.`;
  return send({
    kind: reset ? 'staff-password-link' : 'staff-invite',
    to,
    subject: reset ? 'Choose a new password for the Rustic Retreat CRM' : 'Set up your Rustic Retreat CRM login',
    text: `Hi ${name},\n\n${intro}\n\nChoose your password here: ${url}\n\nThe link works once and expires in ${expiresDays} days.\n\nRustic Retreat`,
    html: `<p>Hi <strong>${esc(name)}</strong>,</p>
<p>${esc(intro)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e11d48;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Choose your password</a></p>
<p>Or copy this link: <a href="${esc(url)}">${esc(url)}</a></p>
<p style="color:#64748b;font-size:14px">The link works once and expires in ${expiresDays} days.</p>
<p>Rustic Retreat</p>`,
  });
}

module.exports = {
  send,
  sendPasswordResetRequest,
  sendFinalDetailsLink,
  sendFinalDetailsSubmittedAdmin,
  sendDepositStatement,
  sendPortalInvite,
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
  sendCoupleMessageAdmin,
  sendWebsiteSubmissionAdmin,
  sendPaymentReminder,
  sendPaymentReceipt,
  sendTourRequestAdmin,
  sendColdLeadAdmin,
  sendStaffInvite,
};
