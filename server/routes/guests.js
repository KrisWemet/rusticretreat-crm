const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');

// Admin: Get guests for couple
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  const guests = db.prepare(`
    SELECT * FROM guests WHERE couple_id = ? ORDER BY last_name ASC, first_name ASC
  `).all(req.params.coupleId);
  res.json(guests);
});

// Portal: Get guests
router.get('/portal', authenticateCouple, (req, res) => {
  const guests = db.prepare(`
    SELECT * FROM guests WHERE couple_id = ? ORDER BY last_name ASC, first_name ASC
  `).all(req.couple.coupleId);
  res.json(guests);
});

// Portal: Add guest
router.post('/portal', authenticateCouple, (req, res) => {
  const { first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });

  const result = db.prepare(`
    INSERT INTO guests (couple_id, first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.couple.coupleId, first_name, last_name, email || null, phone || null,
    rsvp_status || 'pending', meal_preference || null, plus_one ? 1 : 0, dietary_restrictions || null, notes || null);

  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(guest);
});

// Admin: Add guest
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const { first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes } = req.body;
  if (!first_name || !last_name) return res.status(400).json({ error: 'First and last name required' });

  const result = db.prepare(`
    INSERT INTO guests (couple_id, first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.coupleId, first_name, last_name, email || null, phone || null,
    rsvp_status || 'pending', meal_preference || null, plus_one ? 1 : 0, dietary_restrictions || null, notes || null);

  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(guest);
});

// Update guest
router.put('/:id', authenticateAny, (req, res) => {
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  if (req.auth.coupleId && req.auth.coupleId !== guest.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes } = req.body;

  db.prepare(`
    UPDATE guests SET
      first_name = ?, last_name = ?, email = ?, phone = ?,
      rsvp_status = ?, meal_preference = ?, plus_one = ?,
      dietary_restrictions = ?, notes = ?
    WHERE id = ?
  `).run(
    first_name || guest.first_name,
    last_name || guest.last_name,
    email !== undefined ? email : guest.email,
    phone !== undefined ? phone : guest.phone,
    rsvp_status || guest.rsvp_status,
    meal_preference !== undefined ? meal_preference : guest.meal_preference,
    plus_one !== undefined ? (plus_one ? 1 : 0) : guest.plus_one,
    dietary_restrictions !== undefined ? dietary_restrictions : guest.dietary_restrictions,
    notes !== undefined ? notes : guest.notes,
    req.params.id
  );

  const updated = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// Delete guest
router.delete('/:id', authenticateAny, (req, res) => {
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });

  if (req.auth.coupleId && req.auth.coupleId !== guest.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare('DELETE FROM guests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Guest deleted' });
});

module.exports = router;
