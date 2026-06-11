const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple } = require('../middleware/auth');

// Admin: Get timeline for couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const events = db.prepare(`
    SELECT * FROM timeline_events WHERE couple_id = ? ORDER BY order_index ASC, time ASC
  `).all(req.params.coupleId);
  res.json(events);
});

// Admin: Add timeline event
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const { time, title, description, location, duration_minutes, order_index } = req.body;
  if (!time || !title) return res.status(400).json({ error: 'Time and title required' });

  // Get max order index
  const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM timeline_events WHERE couple_id = ?').get(req.params.coupleId);
  const nextOrder = (maxOrder.max || 0) + 1;

  const result = db.prepare(`
    INSERT INTO timeline_events (couple_id, time, title, description, location, duration_minutes, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.coupleId, time, title, description || null, location || null,
    duration_minutes || 30, order_index || nextOrder);

  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(event);
});

// Portal: Get timeline
router.get('/portal', authenticateCouple, (req, res) => {
  const events = db.prepare(`
    SELECT * FROM timeline_events WHERE couple_id = ? ORDER BY order_index ASC, time ASC
  `).all(req.couple.coupleId);
  res.json(events);
});

// Portal: Add timeline event
router.post('/portal', authenticateCouple, (req, res) => {
  const { time, title, description, location, duration_minutes } = req.body;
  if (!time || !title) return res.status(400).json({ error: 'Time and title required' });

  const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM timeline_events WHERE couple_id = ?').get(req.couple.coupleId);
  const nextOrder = (maxOrder.max || 0) + 1;

  const result = db.prepare(`
    INSERT INTO timeline_events (couple_id, time, title, description, location, duration_minutes, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.couple.coupleId, time, title, description || null, location || null,
    duration_minutes || 30, nextOrder);

  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(event);
});

// Update timeline event
router.put('/:id', (req, res, next) => {
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
  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (req.auth.coupleId && req.auth.coupleId !== event.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { time, title, description, location, duration_minutes, order_index } = req.body;

  db.prepare(`
    UPDATE timeline_events SET
      time = ?, title = ?, description = ?, location = ?,
      duration_minutes = ?, order_index = ?
    WHERE id = ?
  `).run(
    time || event.time,
    title || event.title,
    description !== undefined ? description : event.description,
    location !== undefined ? location : event.location,
    duration_minutes !== undefined ? duration_minutes : event.duration_minutes,
    order_index !== undefined ? order_index : event.order_index,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete timeline event
router.delete('/:id', (req, res, next) => {
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
  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  if (req.auth.coupleId && req.auth.coupleId !== event.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM timeline_events WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deleted' });
});

module.exports = router;
