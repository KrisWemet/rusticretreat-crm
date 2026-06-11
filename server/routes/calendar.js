const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ── Get all booked dates + blocked dates ─────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const booked = db.prepare(`
    SELECT b.event_date, b.package_name, b.guest_count, b.start_time, b.end_time,
           c.partner1_name, c.partner2_name, c.id AS couple_id
    FROM bookings b JOIN couples c ON b.couple_id = c.id
    ORDER BY b.event_date ASC
  `).all();

  const blocked = db.prepare(`
    SELECT * FROM blocked_dates ORDER BY date ASC
  `).all();

  res.json({ booked, blocked });
});

// ── Block a date ─────────────────────────────────────────────────────────────
router.post('/block', authenticateToken, (req, res) => {
  const { date, reason } = req.body;
  if (!date) return res.status(400).json({ error: 'date required' });
  try {
    const result = db.prepare(`
      INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
      ON CONFLICT(date) DO UPDATE SET reason = excluded.reason
    `).run(date, reason || null);
    res.status(201).json(db.prepare('SELECT * FROM blocked_dates WHERE date = ?').get(date));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Unblock a date ───────────────────────────────────────────────────────────
router.delete('/block/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM blocked_dates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
