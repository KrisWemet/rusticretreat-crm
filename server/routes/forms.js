const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const rateLimit = require('../middleware/rateLimit');
const email = require('../services/email');
const forms = require('../services/forms');
const { saveFields } = forms;

const staffName = (req) => `staff: ${req.user?.name || req.user?.email || 'staff'}`;

// ── Public: a couple filling in a form from their private link ───────────────
// Registered before the staff routes, and needing no login, like a contract
// signing link. The token is the only key, so it is long, random and expires.
const publicLimiter = rateLimit({ windowMs: 600000, max: 60, name: 'form-link' });
router.get('/public/:token', publicLimiter, (req, res) => {
  const a = forms.assignmentForToken(req.params.token);
  if (!a) return res.status(404).json({ error: 'This link has expired or is no longer valid. Please ask Rustic Retreat for a new one.' });
  const full = forms.fullAssignment(a.id);
  res.json({
    form: { title: full.form.title, description: full.form.description },
    couple: `${full.assignment.partner1_name} & ${full.assignment.partner2_name}`,
    status: full.assignment.status,
    revision: full.assignment.revision,
    fields: full.fields.map(({ field_key, ...f }) => f),
  });
});

router.post('/public/:token', publicLimiter, (req, res) => {
  const a = forms.assignmentForToken(req.params.token);
  if (!a) return res.status(404).json({ error: 'This link has expired or is no longer valid. Please ask Rustic Retreat for a new one.' });
  const result = forms.saveAnswers(a, req.body.answers, { by: 'couple', complete: req.body.complete !== false, revision: req.body.revision });
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  const full = forms.fullAssignment(a.id);
  // Tell staff a form came back; a mail failure never fails the couple's save.
  if (req.body.complete !== false) Promise.resolve(email.sendFormCompletedAdmin({
    coupleNames: `${full.assignment.partner1_name} & ${full.assignment.partner2_name}`,
    formTitle: full.form.title,
  })).catch(() => {});
  res.json({ success: true, revision: full.assignment.revision });
});

function getFullForm(id) {
  const form = db.prepare('SELECT * FROM forms WHERE id = ?').get(id);
  if (!form) return null;
  form.fields = db.prepare('SELECT * FROM form_fields WHERE form_id = ? ORDER BY order_index, id').all(id);
  return form;
}

// ── Admin: list forms with field + assignment counts ─────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM form_fields ff WHERE ff.form_id = f.id) AS field_count,
      (SELECT COUNT(*) FROM form_assignments fa WHERE fa.form_id = f.id) AS assigned_count,
      (SELECT COUNT(*) FROM form_assignments fa WHERE fa.form_id = f.id AND fa.status = 'completed') AS completed_count
    FROM forms f ORDER BY f.created_at DESC
  `).all();
  res.json(rows);
});

// ── Admin: forms sent to couples and not yet returned ────────────────────────
router.get('/awaiting', authenticateToken, (req, res) => {
  res.json(db.prepare(`
    SELECT fa.id, fa.form_id, fa.couple_id, fa.link_sent_at, fa.token_expires_at, f.title,
           c.partner1_name, c.partner2_name, c.email
    FROM form_assignments fa JOIN forms f ON f.id = fa.form_id JOIN couples c ON c.id = fa.couple_id
    WHERE fa.status = 'pending' AND fa.link_sent_at IS NOT NULL AND c.archived_at IS NULL
    ORDER BY fa.link_sent_at
  `).all());
});

router.get('/:id', authenticateToken, (req, res) => {
  const form = getFullForm(req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
});

router.post('/', authenticateToken, (req, res) => {
  const { title, description, fields } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });
  const result = db.prepare('INSERT INTO forms (title, description) VALUES (?, ?)').run(title, description || null);
  saveFields(result.lastInsertRowid, fields);
  res.status(201).json(getFullForm(result.lastInsertRowid));
});

router.put('/:id', authenticateToken, (req, res) => {
  const existing = db.prepare('SELECT * FROM forms WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Form not found' });
  const { title, description, is_active, fields } = req.body;
  db.prepare('UPDATE forms SET title = ?, description = ?, is_active = ? WHERE id = ?').run(
    title ?? existing.title,
    description ?? existing.description,
    is_active != null ? (is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );
  if (fields) saveFields(req.params.id, fields);
  res.json(getFullForm(req.params.id));
});

router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM forms WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Admin: assignments for a form ────────────────────────────────────────────
router.get('/:id/assignments', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT fa.*, c.partner1_name, c.partner2_name
    FROM form_assignments fa JOIN couples c ON c.id = fa.couple_id
    WHERE fa.form_id = ? ORDER BY fa.created_at DESC
  `).all(req.params.id);
  res.json(rows);
});

// ── Admin: assign a form to a couple ─────────────────────────────────────────
router.post('/:id/assign', authenticateToken, (req, res) => {
  const { couple_id } = req.body;
  if (!couple_id) return res.status(400).json({ error: 'couple_id is required' });
  const existing = db.prepare('SELECT id FROM form_assignments WHERE form_id = ? AND couple_id = ?')
    .get(req.params.id, couple_id);
  if (existing) return res.status(409).json({ error: 'Form already assigned to this couple', assignment_id: existing.id });
  const result = db.prepare('INSERT INTO form_assignments (form_id, couple_id) VALUES (?, ?)')
    .run(req.params.id, couple_id);
  res.status(201).json(db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(result.lastInsertRowid));
});

// ── Admin: view a couple's submitted responses for an assignment ─────────────
router.get('/assignments/:assignmentId/responses', authenticateToken, (req, res) => {
  const assignment = db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(req.params.assignmentId);
  if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
  const rows = db.prepare(`
    SELECT ff.label, ff.field_type, ff.order_index, r.value
    FROM form_fields ff
    LEFT JOIN form_responses r ON r.field_id = ff.id AND r.assignment_id = ?
    WHERE ff.form_id = ?
    ORDER BY ff.order_index, ff.id
  `).all(req.params.assignmentId, assignment.form_id);
  res.json({ assignment, responses: rows });
});

// ── Admin: every form a couple has (for their client page) ───────────────────
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(db.prepare(`
    SELECT fa.id, fa.form_id, fa.status, fa.submitted_at, fa.filled_by, fa.updated_by, fa.updated_at,
           fa.link_sent_at, fa.token_expires_at, fa.created_at, f.title, f.system_key,
           (SELECT COUNT(*) FROM form_responses r WHERE r.assignment_id = fa.id) AS answer_count
    FROM form_assignments fa JOIN forms f ON f.id = fa.form_id
    WHERE fa.couple_id = ? ORDER BY COALESCE(fa.submitted_at, fa.created_at) DESC, fa.id DESC
  `).all(req.params.coupleId));
});

// ── Admin: one assignment with its questions and answers, for editing ────────
router.get('/assignments/:assignmentId', authenticateToken, (req, res) => {
  const full = forms.fullAssignment(req.params.assignmentId);
  if (!full) return res.status(404).json({ error: 'Assignment not found' });
  res.json(full);
});

// ── Admin: staff fill in or correct a couple's answers ───────────────────────
// complete: false saves a partial answer set without checking required
// questions, so staff can fill in what they have and come back.
router.put('/assignments/:assignmentId/responses', authenticateToken, (req, res) => {
  const a = db.prepare('SELECT * FROM form_assignments WHERE id = ?').get(req.params.assignmentId);
  if (!a) return res.status(404).json({ error: 'Assignment not found' });
  const result = forms.saveAnswers(a, req.body.answers, { by: staffName(req), complete: req.body.complete !== false, revision: req.body.revision });
  if (!result.ok) return res.status(result.status || 400).json({ error: result.error });
  res.json(forms.fullAssignment(a.id));
});

// Staff explicitly review which answers update the operational record.
router.post('/assignments/:assignmentId/apply', authenticateToken, (req, res) => {
  const full = forms.fullAssignment(req.params.assignmentId);
  if (!full) return res.status(404).json({ error: 'Assignment not found' });
  if (Number(req.body.revision) !== full.assignment.revision) return res.status(409).json({ error: 'Answers have changed; reopen and review them again.' });
  const selected = new Set((req.body.field_ids || []).map(Number));
  const updates = full.fields.filter(f => selected.has(f.id) && forms.RECORD_FIELDS.includes(f.record_field) && f.value != null);
  const booking = db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY id DESC LIMIT 1').get(full.assignment.couple_id);
  if (updates.some(f => f.record_field !== 'phone') && !booking) return res.status(409).json({ error: 'Create the booking before applying event details.' });
  const guests = updates.find(f => f.record_field === 'guest_count');
  try {
    if (guests) require('../services/bookingRules').assertBookable(db, { ...booking, guest_count: Number(guests.value) }, { excludeBookingId: booking.id, checkPackage: false });
    db.transaction(() => {
      for (const f of updates) {
        const table = f.record_field === 'phone' ? 'couples' : 'bookings';
        const id = table === 'couples' ? full.assignment.couple_id : booking.id;
        db.prepare(`UPDATE ${table} SET ${f.record_field} = ? WHERE id = ?`).run(f.value, id);
      }
      require('../services/activity').logActivity(req, { action: 'form.applied', entity: 'form', entityId: full.assignment.id, coupleId: full.assignment.couple_id, summary: 'Applied reviewed form answers to the event record', detail: updates.map(f => ({ field: f.record_field, value: f.value })) });
    })();
    res.json({ applied: updates.length });
  } catch (err) { res.status(err.status || 400).json({ error: err.message }); }
});
router.get('/assignments/:assignmentId/history', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM form_answer_versions WHERE assignment_id = ? ORDER BY id DESC').all(req.params.assignmentId));
});

// ── Admin: send (or re-send) the couple a private link to fill the form in ───
// Returns the link either way, so staff can text or paste it if the email
// did not go out.
router.post('/assignments/:assignmentId/link', authenticateToken, async (req, res) => {
  const full = forms.fullAssignment(req.params.assignmentId);
  if (!full) return res.status(404).json({ error: 'Assignment not found' });
  const { token, expires } = forms.issueLink(full.assignment.id);
  const path = `/form/${token}`;
  let delivery = { delivered: false, error: 'Not sent' };
  if (req.body.send !== false) {
    delivery = await email.sendFormLink({
      to: full.assignment.couple_email,
      cc: full.assignment.partner2_email,
      coupleNames: `${full.assignment.partner1_name} & ${full.assignment.partner2_name}`,
      formTitle: full.form.title, path,
    });
  }
  res.json({ path, expires_at: expires, sent: !!delivery.delivered, sent_to: full.assignment.couple_email, error: delivery.delivered ? null : delivery.error });
});

router.delete('/assignments/:assignmentId', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM form_assignments WHERE id = ?').run(req.params.assignmentId);
  res.json({ success: true });
});

module.exports = router;
