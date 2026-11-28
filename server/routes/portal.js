const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateCouple, authenticateToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const access = require('../services/portalAccess');
const email = require('../services/email');
const rateLimit = require('../middleware/rateLimit');
const { logActivity } = require('../services/activity');
const card = require('../services/cardPayments');
const extras = require('../services/extras');

const coupleToken = (c) => jwt.sign({ coupleId: c.id, email: c.email, partner1_name: c.partner1_name, partner2_name: c.partner2_name }, JWT_SECRET, { expiresIn: '7d' });
const names = (c) => `${c.partner1_name} & ${c.partner2_name}`;
const baseUrl = () => (process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');

// ── Staff: a couple's portal access ──────────────────────────────────────────
router.get('/access/:coupleId', authenticateToken, (req, res) => {
  const a = access.accessFor(req.params.coupleId);
  if (!a) return res.status(404).json({ error: 'Couple not found' });
  res.json(a);
});

// Send (or re-send) the setup link. A new link replaces an unused one.
router.post('/invite/:coupleId', authenticateToken, async (req, res) => {
  try {
    if (!access.enabled()) return res.status(409).json({ error: 'The couple portal is switched off. Turn it on first (ENABLE_COUPLE_PORTAL in Railway).' });
    const c = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.coupleId);
    if (!c) return res.status(404).json({ error: 'Couple not found' });
    const to = [...new Set([c.email, c.partner2_email].filter(Boolean))];
    if (!to.length) return res.status(400).json({ error: 'Add an email address for the couple first' });
    const inv = access.createInvite(c.id, req.user?.name || 'staff');
    let emailed = null;
    if (req.body?.send_email !== false) emailed = await email.sendPortalInvite({ to, coupleId: c.id, coupleNames: names(c), url: inv.url, days: inv.days, hasLogin: !!c.password_hash });
    logActivity(req, { action: 'portal.invite', entity: 'couple', entityId: c.id, coupleId: c.id,
      summary: emailed?.delivered ? 'Emailed the couple their portal link' : 'Made a portal link for the couple' });
    res.json({ ...access.accessFor(c.id), url: inv.url, emailed });
  } catch (err) {
    console.error('[portal] invite', err);
    res.status(500).json({ error: 'Could not make the portal link' });
  }
});

// Withdraw access: the couple's password is cleared, open links are cancelled,
// and any session they have stops working on its next request.
router.delete('/access/:coupleId', authenticateToken, (req, res) => {
  const c = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!c) return res.status(404).json({ error: 'Couple not found' });
  db.transaction(() => {
    db.prepare('UPDATE couples SET password_hash = NULL WHERE id = ?').run(c.id);
    db.prepare('DELETE FROM portal_invites WHERE couple_id = ? AND used_at IS NULL').run(c.id);
  })();
  logActivity(req, { action: 'portal.revoke', entity: 'couple', entityId: c.id, coupleId: c.id, summary: 'Withdrew the couple’s portal access' });
  res.json(access.accessFor(c.id));
});

// ── Public: the couple's setup link (no login) ───────────────────────────────
const setupLimit = rateLimit({ windowMs: 900000, max: 30, name: 'portal-setup' });

router.get('/setup/:token', setupLimit, (req, res) => {
  if (!access.enabled()) return res.status(404).json({ error: 'The couple portal is not open.' });
  const inv = access.inviteFor(req.params.token);
  if (!inv) return res.status(404).json({ error: 'This link has expired or has already been used. Ask Rustic Retreat for a new one.' });
  res.json({ couple: names(inv), email: inv.email });
});

router.post('/setup/:token', setupLimit, (req, res) => {
  if (!access.enabled()) return res.status(404).json({ error: 'The couple portal is not open.' });
  const r = access.completeInvite(req.params.token, req.body?.password);
  if (r.error) return res.status(r.status).json({ error: r.error });
  const c = db.prepare('SELECT * FROM couples WHERE id = ?').get(r.coupleId);
  db.prepare("UPDATE couples SET portal_last_login_at = datetime('now') WHERE id = ?").run(c.id);
  logActivity(null, { action: 'portal.setup', entity: 'couple', entityId: c.id, coupleId: c.id, summary: `${names(c)} set up their portal login` });
  res.status(201).json({ token: coupleToken(c), couple: { id: c.id, partner1_name: c.partner1_name, partner2_name: c.partner2_name, email: c.email, wedding_date: c.wedding_date, status: c.status } });
});

// ── Couple: what needs doing, files shared with them ─────────────────────────
// Everything the couple has to act on, in one list, each with where to do it.
function nextSteps(coupleId) {
  const steps = [];
  const today = require('../services/schedule').albertaToday();
  for (const s of db.prepare(`SELECT s.name, s.status, s.signing_token, ct.title FROM contract_signers s JOIN contracts ct ON ct.id = s.contract_id
      WHERE ct.couple_id = ? AND ct.status = 'sent' AND s.role != 'venue' AND s.status != 'signed' AND s.signing_token IS NOT NULL`).all(coupleId)) {
    steps.push({ kind: 'contract', title: `Sign "${s.title}"`, detail: `Waiting for ${s.name}`, url: `${baseUrl()}/sign/${s.signing_token}` });
  }
  for (const i of db.prepare('SELECT id, description, amount, due_date FROM invoices WHERE couple_id = ? AND paid = 0 ORDER BY due_date IS NULL, due_date').all(coupleId)) {
    steps.push({ kind: 'payment', title: `${i.description}: $${Number(i.amount).toFixed(2)}`, due: i.due_date, overdue: !!(i.due_date && i.due_date < today), url: card.payUrlFor(i.id) });
  }
  const fdRec = db.prepare('SELECT access_token, token_expires_at, submitted_at FROM final_details WHERE couple_id = ?').get(coupleId);
  if (fdRec?.access_token && !fdRec.submitted_at && (!fdRec.token_expires_at || fdRec.token_expires_at > new Date().toISOString().replace('T', ' ').slice(0, 19))) {
    const fd = require('../services/finalDetails').view(coupleId);
    steps.push({ kind: 'final_details', title: 'Send your Final Details Form', due: fd.deadline, overdue: fd.overdue, url: `${baseUrl()}/final-details/${fdRec.access_token}` });
  }
  for (const f of db.prepare(`SELECT fa.id, fa.access_token, f.title FROM form_assignments fa JOIN forms f ON f.id = fa.form_id
      WHERE fa.couple_id = ? AND fa.status = 'pending' AND fa.link_sent_at IS NOT NULL`).all(coupleId)) {
    steps.push({ kind: 'form', title: `Fill in "${f.title}"`, url: f.access_token ? `${baseUrl()}/form/${f.access_token}` : '/portal/forms' });
  }
  return steps;
}

router.get('/next-steps', authenticateCouple, (req, res) => {
  try { res.json(nextSteps(req.couple.coupleId)); }
  catch (err) { console.error('[portal] next steps', err); res.json([]); }
});

router.get('/files', authenticateCouple, (req, res) => {
  res.json(db.prepare('SELECT id, filename, mime_type, size, category, uploaded_at FROM couple_files WHERE couple_id = ? AND shared_with_couple = 1 ORDER BY uploaded_at DESC').all(req.couple.coupleId));
});

router.get('/files/:id', authenticateCouple, (req, res) => {
  const f = db.prepare('SELECT * FROM couple_files WHERE id = ? AND couple_id = ? AND shared_with_couple = 1').get(req.params.id, req.couple.coupleId);
  if (!f) return res.status(404).json({ error: 'File not found' });
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${String(f.filename).replace(/[^\w.\- ]+/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.data);
});

// The weekend schedule, read-only: the venue plans it with the couple.
router.get('/schedule', authenticateCouple, (req, res) => {
  const { sortRunOfShow } = require('../services/planning');
  res.json(sortRunOfShow(db.prepare('SELECT id, day_date, time, title, description, location, duration_minutes, category FROM timeline_events WHERE couple_id = ?').all(req.couple.coupleId)));
});

// Get couple's own profile/dashboard data
router.get('/dashboard', authenticateCouple, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.couple.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const booking = db.prepare('SELECT * FROM bookings WHERE couple_id = ? LIMIT 1').get(req.couple.coupleId);

  const guestStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rsvp_status = 'accepted' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN rsvp_status = 'declined' THEN 1 ELSE 0 END) as declined,
      SUM(CASE WHEN rsvp_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM guests WHERE couple_id = ?
  `).get(req.couple.coupleId);

  const budgetStats = db.prepare(`
    SELECT
      SUM(estimated_cost) as total_estimated,
      SUM(actual_cost) as total_actual,
      SUM(CASE WHEN paid = 1 THEN actual_cost ELSE 0 END) as total_paid
    FROM budget_items WHERE couple_id = ?
  `).get(req.couple.coupleId);

  const checklistStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
    FROM checklist_items WHERE couple_id = ?
  `).get(req.couple.coupleId);

  const upcomingTasks = db.prepare(`
    SELECT * FROM checklist_items
    WHERE couple_id = ? AND completed = 0 AND due_date IS NOT NULL
    ORDER BY due_date ASC LIMIT 5
  `).all(req.couple.coupleId);

  const unreadMessages = db.prepare(`
    SELECT COUNT(*) as count FROM messages
    WHERE couple_id = ? AND sender_type = 'staff' AND read_at IS NULL
  `).get(req.couple.coupleId);

  // Remove password hash from response
  const { password_hash, ...coupleData } = couple;

  res.json({
    couple: coupleData,
    booking,
    stats: {
      guests: guestStats,
      budget: budgetStats,
      checklist: checklistStats
    },
    upcomingTasks,
    unreadMessages: unreadMessages.count
  });
});

// Get documents for couple
router.get('/documents', authenticateCouple, (req, res) => {
  const documents = db.prepare(`
    SELECT * FROM documents WHERE couple_id = ? ORDER BY created_at DESC
  `).all(req.couple.coupleId);
  res.json(documents);
});

// Admin: add document for couple
router.post('/documents/:coupleId', authenticateToken, (req, res) => {
  const { title, file_name, file_type } = req.body;
  if (!title || !file_name) return res.status(400).json({ error: 'Title and file name required' });

  const result = db.prepare(`
    INSERT INTO documents (couple_id, title, file_name, file_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.coupleId, title, file_name, file_type || null, req.user.name || 'Admin');

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(doc);
});

// Admin: Get all documents
router.get('/documents/admin/all', authenticateToken, (req, res) => {
  const documents = db.prepare(`
    SELECT d.*, c.partner1_name, c.partner2_name
    FROM documents d
    JOIN couples c ON d.couple_id = c.id
    ORDER BY d.created_at DESC
  `).all();
  res.json(documents);
});

// Couple: change their portal password
router.post('/change-password', authenticateCouple, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < 10) {
    return res.status(400).json({ error: 'New password must be at least 10 characters' });
  }

  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.couple.coupleId);
  if (!couple || !couple.password_hash || !bcrypt.compareSync(current_password, couple.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE couples SET password_hash = ? WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), req.couple.coupleId);
  res.json({ success: true, message: 'Password updated successfully' });
});

// Couple: get their invoices / payment schedule
router.get('/invoices', authenticateCouple, (req, res) => {
  const rows = db.prepare(`
    SELECT id, description, amount, due_date, paid, paid_at, payment_method, card_fee FROM invoices WHERE couple_id = ? ORDER BY due_date ASC, created_at DESC
  `).all(req.couple.coupleId);
  const items = extras.itemsByInvoice(rows.map(r => r.id));
  // Each unpaid invoice carries its pay link (e-Transfer details, and card with
  // its fee when card payment is on).
  res.json(rows.map(r => ({ ...r, items: items[r.id] || [], pay_url: r.paid ? null : card.payUrlFor(r.id) })));
});

// Couple: get their contracts
router.get('/contracts', authenticateCouple, (req, res) => {
  const contracts = db.prepare(`
    SELECT id, title, status, sent_at, signed_at, signer_name, created_at
    FROM contracts WHERE couple_id = ? ORDER BY created_at DESC
  `).all(req.couple.coupleId);
  res.json(contracts);
});

// Couple: list forms assigned to them (with status)
router.get('/forms', authenticateCouple, (req, res) => {
  const rows = db.prepare(`
    SELECT fa.id AS assignment_id, fa.status, fa.submitted_at,
           f.id AS form_id, f.title, f.description
    FROM form_assignments fa JOIN forms f ON f.id = fa.form_id
    WHERE fa.couple_id = ? ORDER BY fa.status, fa.created_at DESC
  `).all(req.couple.coupleId);
  res.json(rows);
});

// Couple: get a single assigned form with its fields and any saved answers
router.get('/forms/:assignmentId', authenticateCouple, (req, res) => {
  const assignment = db.prepare('SELECT * FROM form_assignments WHERE id = ? AND couple_id = ?')
    .get(req.params.assignmentId, req.couple.coupleId);
  if (!assignment) return res.status(404).json({ error: 'Form not found' });

  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(assignment.form_id);
  const fields = db.prepare(`
    SELECT ff.*, r.value
    FROM form_fields ff
    LEFT JOIN form_responses r ON r.field_id = ff.id AND r.assignment_id = ?
    WHERE ff.form_id = ?
    ORDER BY ff.order_index, ff.id
  `).all(assignment.id, assignment.form_id);
  res.json({ assignment, form, fields });
});

// Couple: submit/save answers to an assigned form
router.post('/forms/:assignmentId', authenticateCouple, (req, res) => {
  const assignment = db.prepare('SELECT * FROM form_assignments WHERE id = ? AND couple_id = ?')
    .get(req.params.assignmentId, req.couple.coupleId);
  if (!assignment) return res.status(404).json({ error: 'Form not found' });

  const answers = req.body.answers || {}; // { field_id: value }
  const validFieldIds = new Set(
    db.prepare('SELECT id FROM form_fields WHERE form_id = ?').all(assignment.form_id).map(f => f.id)
  );

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM form_responses WHERE assignment_id = ?').run(assignment.id);
    const insert = db.prepare('INSERT INTO form_responses (assignment_id, field_id, value) VALUES (?, ?, ?)');
    for (const [fieldId, value] of Object.entries(answers)) {
      if (!validFieldIds.has(Number(fieldId))) continue;
      insert.run(assignment.id, Number(fieldId), value == null ? null : String(value));
    }
    db.prepare(`UPDATE form_assignments SET status = 'completed', submitted_at = datetime('now'),
                filled_by = COALESCE(filled_by, 'couple'), updated_by = 'couple', updated_at = datetime('now') WHERE id = ?`).run(assignment.id);
  });
  tx();
  res.json({ success: true });
});

module.exports = router;
