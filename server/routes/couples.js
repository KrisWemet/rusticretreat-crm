const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { logActivity, recentActivity } = require('../services/activity');

// The sales-board column for a status (see PATCH /:id/stage for the reverse).
function stageForStatus(status, currentStage) {
  if (status === 'booked' || status === 'completed') return 'booked';
  if (status === 'cancelled') return 'lost';
  if (status === 'inquiry') return ['tour', 'proposal'].includes(currentStage) ? currentStage : 'tour';
  if (status === 'lead') return 'inquiry';
  return currentStage || 'inquiry';
}

// Get all couples
router.get('/', authenticateToken, (req, res) => {
  const { status, search, archived } = req.query;
  let query = 'SELECT * FROM couples';
  const params = [];
  // Archived couples are hidden unless asked for (?archived=1 lists only them).
  const conditions = [archived === '1' ? 'archived_at IS NOT NULL' : 'archived_at IS NULL'];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(partner1_name LIKE ? OR partner2_name LIKE ? OR email LIKE ? OR partner2_email LIKE ? OR phone LIKE ? OR partner2_phone LIKE ?)');
    params.push(...Array(6).fill(`%${search}%`));
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const couples = db.prepare(query).all(...params);
  res.json(couples);
});

// Enquiries nobody has followed up yet (see services/leadNurture.js)
router.get('/follow-ups', authenticateToken, (req, res) => {
  res.json(require('../services/leadNurture').needsFollowUp());
});

// Get single couple
router.get('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  res.json(couple);
});

// Create couple
router.post('/', authenticateToken, (req, res) => {
  const {
    partner1_name, partner2_name, email, partner2_email, phone, wedding_date,
    venue_package, status, notes, budget_total, referral_source
  } = req.body;

  if (!partner1_name || !partner2_name || !email) {
    return res.status(400).json({ error: 'Partner names and email are required' });
  }
  // Each partner signs the contract from their own address so the signatures
  // are independently attributable, so a second address is required rather
  // than optional.
  if (!partner2_email) {
    return res.status(400).json({
      error: 'Partner 2 needs their own email address — each partner signs the contract separately.',
    });
  }
  if (partner2_email.trim().toLowerCase() === email.trim().toLowerCase()) {
    return res.status(400).json({
      error: 'Each partner needs a different email address so their signatures are separately attributable.',
    });
  }

  try {
    const result = db.prepare(`
      INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, phone, wedding_date, venue_package, status, notes, budget_total, referral_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(partner1_name, partner2_name, email, partner2_email || null, phone || null, wedding_date || null,
      venue_package || null, status || 'lead', notes || null, budget_total || 0, referral_source || null);

    const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(couple);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Update couple
router.put('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const {
    partner1_name, partner2_name, email, partner2_email, phone, wedding_date,
    venue_package, status, notes, budget_total, referral_source
  } = req.body;

  const nextEmail = (email || couple.email).trim().toLowerCase();
  const nextP2 = partner2_email !== undefined ? partner2_email : couple.partner2_email;
  if (partner2_email !== undefined && !partner2_email) {
    return res.status(400).json({
      error: 'Partner 2 needs their own email address — each partner signs the contract separately.',
    });
  }
  if (nextP2 && nextP2.trim().toLowerCase() === nextEmail) {
    return res.status(400).json({
      error: 'Each partner needs a different email address so their signatures are separately attributable.',
    });
  }

  try {
    db.prepare(`
      UPDATE couples SET
        partner1_name = ?, partner2_name = ?, email = ?, partner2_email = ?, phone = ?,
        wedding_date = ?, venue_package = ?, status = ?, notes = ?, budget_total = ?,
        referral_source = ?
      WHERE id = ?
    `).run(
      partner1_name || couple.partner1_name,
      partner2_name || couple.partner2_name,
      email || couple.email,
      // undefined means "not in this request"; empty string means "clear it".
      partner2_email !== undefined ? (partner2_email || null) : couple.partner2_email,
      phone !== undefined ? phone : couple.phone,
      wedding_date !== undefined ? wedding_date : couple.wedding_date,
      venue_package !== undefined ? venue_package : couple.venue_package,
      status || couple.status,
      notes !== undefined ? notes : couple.notes,
      budget_total !== undefined ? budget_total : couple.budget_total,
      referral_source !== undefined ? (referral_source || null) : couple.referral_source,
      req.params.id
    );

    // Keep the sales-board column in step when the status is changed here, as
    // the board keeps the status in step when a card is moved.
    if (status && status !== couple.status) {
      const stage = stageForStatus(status, couple.pipeline_stage);
      if (stage !== couple.pipeline_stage) db.prepare('UPDATE couples SET pipeline_stage = ? WHERE id = ?').run(stage, req.params.id);
    }

    const updated = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Update a couple's pipeline stage (used by the sales-board drag & drop)
const PIPELINE_STAGES = ['inquiry', 'tour', 'proposal', 'booked', 'lost'];

router.patch('/:id/stage', authenticateToken, (req, res) => {
  const { pipeline_stage, stage_order } = req.body;
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  if (pipeline_stage && !PIPELINE_STAGES.includes(pipeline_stage)) {
    return res.status(400).json({ error: 'Invalid pipeline stage' });
  }

  // Keep the coarse status in sync so the rest of the app stays consistent.
  const stageToStatus = { inquiry: 'lead', tour: 'inquiry', proposal: 'inquiry', booked: 'booked', lost: 'cancelled' };
  const newStage = pipeline_stage || couple.pipeline_stage;
  // Don't downgrade a completed couple back to booked.
  const newStatus = couple.status === 'completed' ? 'completed' : (stageToStatus[newStage] || couple.status);

  db.prepare('UPDATE couples SET pipeline_stage = ?, stage_order = ?, status = ? WHERE id = ?').run(
    newStage,
    stage_order != null ? stage_order : couple.stage_order,
    newStatus,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id));
});

// Mark an enquiry as personally followed up (or undo it)
router.patch('/:id/contacted', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const contacted = req.body?.contacted !== false;
  db.prepare(`UPDATE couples SET contacted_at = ${contacted ? "datetime('now')" : 'NULL'} WHERE id = ?`).run(req.params.id);
  res.json(db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id));
});

// Archive a couple: hidden from lists, but every record is kept and they can
// be restored. This is what "Delete" does for everyone.
router.delete('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  if (req.query.permanent === '1') return deletePermanently(req, res, couple);

  db.prepare("UPDATE couples SET archived_at = datetime('now') WHERE id = ?").run(couple.id);
  logActivity(req, { action: 'couple.archived', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Archived ${couple.partner1_name} & ${couple.partner2_name}` });
  res.json({ message: 'Couple archived', archived: true });
});

router.patch('/:id/restore', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  db.prepare('UPDATE couples SET archived_at = NULL WHERE id = ?').run(couple.id);
  logActivity(req, { action: 'couple.restored', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Restored ${couple.partner1_name} & ${couple.partner2_name}` });
  res.json(db.prepare('SELECT * FROM couples WHERE id = ?').get(couple.id));
});

// Permanent delete removes the couple and everything they own. Admin only,
// only once archived, and never while they have a signed contract or a paid
// invoice: those are records the business has to keep.
function deletePermanently(req, res, couple) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only an admin can delete a couple permanently' });
  if (!couple.archived_at) return res.status(409).json({ error: 'Archive the couple first' });
  const signed = db.prepare("SELECT COUNT(*) AS n FROM contracts WHERE couple_id = ? AND status = 'signed'").get(couple.id).n;
  const paid = db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE couple_id = ? AND paid = 1').get(couple.id).n;
  if (signed || paid) {
    return res.status(409).json({
      error: `This couple has ${[signed && `${signed} signed contract${signed > 1 ? 's' : ''}`, paid && `${paid} paid invoice${paid > 1 ? 's' : ''}`].filter(Boolean).join(' and ')}, so they stay archived rather than deleted.`,
    });
  }
  const { password_hash, ...snapshot } = couple;
  db.prepare('DELETE FROM couples WHERE id = ?').run(couple.id);
  logActivity(req, { action: 'couple.deleted', entity: 'couple', entityId: couple.id, coupleId: couple.id,
    summary: `Permanently deleted ${couple.partner1_name} & ${couple.partner2_name}`, detail: snapshot });
  res.json({ message: 'Couple deleted permanently' });
}

// Everything about one couple in one request, for their client page: bookings,
// payments and balance, contracts with signing progress, tasks, tours, the
// emails the CRM sent them and what staff have done on their record.
router.get('/:id/overview', authenticateToken, (req, res) => {
  const id = Number(req.params.id);
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const today = require('../services/schedule').albertaToday();

  const invoices = db.prepare('SELECT * FROM invoices WHERE couple_id = ? ORDER BY due_date IS NULL, due_date, id').all(id);
  const total = invoices.reduce((t, i) => t + Number(i.amount || 0), 0);
  const paid = invoices.filter(i => i.paid).reduce((t, i) => t + Number(i.amount || 0), 0);

  const contracts = db.prepare(`
    SELECT id, title, status, source, sent_at, signed_at, signing_expires_at, wedding_date, package_name, total_price, created_at
    FROM contracts WHERE couple_id = ? ORDER BY created_at DESC`).all(id)
    .map(c => ({ ...c, signers: db.prepare('SELECT role, name, status, signed_at FROM contract_signers WHERE contract_id = ? ORDER BY sign_order').all(c.id) }));

  res.json({
    today,
    bookings: db.prepare('SELECT * FROM bookings WHERE couple_id = ? ORDER BY event_date').all(id),
    invoices: invoices.map(i => ({ ...i, overdue: !i.paid && i.due_date && i.due_date < today })),
    balance: { total, paid, balance: total - paid },
    contracts,
    tasks: db.prepare('SELECT * FROM tasks WHERE couple_id = ? ORDER BY completed, due_date IS NULL, due_date, id').all(id),
    tours: db.prepare('SELECT * FROM tours WHERE couple_id = ? ORDER BY COALESCE(scheduled_at, preferred_date, created_at) DESC').all(id),
    emails: db.prepare('SELECT id, at, kind, to_addr, subject, delivered, error FROM email_log WHERE couple_id = ? ORDER BY at DESC, id DESC LIMIT 50').all(id),
    activity: recentActivity({ coupleId: id, limit: 50 }),
    messages: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE couple_id = ?').get(id).n,
  });
});

// What has happened on this couple's record, newest first
router.get('/:id/activity', authenticateToken, (req, res) => {
  res.json(recentActivity({ coupleId: Number(req.params.id) }));
});

// Get couple stats
router.get('/:id/stats', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  const guestStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN rsvp_status = 'accepted' THEN 1 ELSE 0 END) as accepted,
      SUM(CASE WHEN rsvp_status = 'declined' THEN 1 ELSE 0 END) as declined,
      SUM(CASE WHEN rsvp_status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM guests WHERE couple_id = ?
  `).get(req.params.id);

  const budgetStats = db.prepare(`
    SELECT
      SUM(estimated_cost) as total_estimated,
      SUM(actual_cost) as total_actual
    FROM budget_items WHERE couple_id = ?
  `).get(req.params.id);

  const checklistStats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed
    FROM checklist_items WHERE couple_id = ?
  `).get(req.params.id);

  res.json({
    guests: guestStats,
    budget: budgetStats,
    checklist: checklistStats
  });
});

// Dashboard stats (admin)
router.get('/admin/dashboard', authenticateToken, (req, res) => {
  const totalCouples = db.prepare('SELECT COUNT(*) as count FROM couples').get();
  const upcomingEvents = db.prepare(`
    SELECT COUNT(*) as count FROM bookings
    WHERE event_date >= date('now') AND event_date <= date('now', '+90 days')
  `).get();
  const newLeads = db.prepare(`
    SELECT COUNT(*) as count FROM couples
    WHERE status IN ('lead', 'inquiry') AND created_at >= date('now', '-30 days')
  `).get();
  const tasksDue = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    WHERE completed = 0 AND due_date <= date('now', '+7 days')
  `).get();
  const recentCouples = db.prepare(`
    SELECT * FROM couples ORDER BY created_at DESC LIMIT 5
  `).all();
  const upcomingBookings = db.prepare(`
    SELECT b.*, c.partner1_name, c.partner2_name, c.email as couple_email
    FROM bookings b
    JOIN couples c ON b.couple_id = c.id
    WHERE b.event_date >= date('now')
    ORDER BY b.event_date ASC LIMIT 5
  `).all();

  res.json({
    stats: {
      totalCouples: totalCouples.count,
      upcomingEvents: upcomingEvents.count,
      newLeads: newLeads.count,
      tasksDue: tasksDue.count
    },
    recentCouples,
    upcomingBookings
  });
});

module.exports = router;
