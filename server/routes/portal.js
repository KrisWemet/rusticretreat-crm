const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateCouple, authenticateToken } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

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
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
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
    SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date ASC, created_at DESC
  `).all(req.couple.coupleId);
  res.json(rows);
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
    db.prepare(`UPDATE form_assignments SET status = 'completed', submitted_at = datetime('now') WHERE id = ?`).run(assignment.id);
  });
  tx();
  res.json({ success: true });
});

module.exports = router;
