const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateCouple } = require('../middleware/auth');

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
router.post('/documents/:coupleId', (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}, (req, res) => {
  const { title, file_name, file_type } = req.body;
  if (!title || !file_name) return res.status(400).json({ error: 'Title and file name required' });

  const result = db.prepare(`
    INSERT INTO documents (couple_id, title, file_name, file_type, uploaded_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.coupleId, title, file_name, file_type || null, req.auth.name || 'Admin');

  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(doc);
});

// Admin: Get all documents
router.get('/documents/admin/all', (req, res, next) => {
  const jwt = require('jsonwebtoken');
  const { JWT_SECRET } = require('../middleware/auth');
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}, (req, res) => {
  const documents = db.prepare(`
    SELECT d.*, c.partner1_name, c.partner2_name
    FROM documents d
    JOIN couples c ON d.couple_id = c.id
    ORDER BY d.created_at DESC
  `).all();
  res.json(documents);
});

module.exports = router;
