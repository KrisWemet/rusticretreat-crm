const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// Get all couples
router.get('/', authenticateToken, (req, res) => {
  const { status, search } = req.query;
  let query = 'SELECT * FROM couples';
  const params = [];
  const conditions = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    conditions.push('(partner1_name LIKE ? OR partner2_name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const couples = db.prepare(query).all(...params);
  res.json(couples);
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
    partner1_name, partner2_name, email, phone, wedding_date,
    venue_package, status, notes, budget_total
  } = req.body;

  if (!partner1_name || !partner2_name || !email) {
    return res.status(400).json({ error: 'Partner names and email are required' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO couples (partner1_name, partner2_name, email, phone, wedding_date, venue_package, status, notes, budget_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(partner1_name, partner2_name, email, phone || null, wedding_date || null,
      venue_package || null, status || 'lead', notes || null, budget_total || 0);

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
    partner1_name, partner2_name, email, phone, wedding_date,
    venue_package, status, notes, budget_total
  } = req.body;

  try {
    db.prepare(`
      UPDATE couples SET
        partner1_name = ?, partner2_name = ?, email = ?, phone = ?,
        wedding_date = ?, venue_package = ?, status = ?, notes = ?, budget_total = ?
      WHERE id = ?
    `).run(
      partner1_name || couple.partner1_name,
      partner2_name || couple.partner2_name,
      email || couple.email,
      phone !== undefined ? phone : couple.phone,
      wedding_date !== undefined ? wedding_date : couple.wedding_date,
      venue_package !== undefined ? venue_package : couple.venue_package,
      status || couple.status,
      notes !== undefined ? notes : couple.notes,
      budget_total !== undefined ? budget_total : couple.budget_total,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    throw err;
  }
});

// Delete couple
router.delete('/:id', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT * FROM couples WHERE id = ?').get(req.params.id);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });

  db.prepare('DELETE FROM couples WHERE id = ?').run(req.params.id);
  res.json({ message: 'Couple deleted successfully' });
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
