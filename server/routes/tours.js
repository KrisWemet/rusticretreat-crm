const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const email = require('../services/email');

// ── Admin: list all tours ────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, c.partner1_name, c.partner2_name, c.status AS couple_status
    FROM tours t
    LEFT JOIN couples c ON c.id = t.couple_id
    ORDER BY
      CASE t.status WHEN 'requested' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
      COALESCE(t.scheduled_at, t.preferred_date, t.created_at) ASC
  `).all();
  res.json(rows);
});

// ── Admin: create a tour manually ────────────────────────────────────────────
router.post('/', authenticateToken, (req, res) => {
  const { couple_id, name, email, phone, preferred_date, scheduled_at, status, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = db.prepare(`
    INSERT INTO tours (couple_id, name, email, phone, preferred_date, scheduled_at, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(couple_id || null, name, email || null, phone || null,
    preferred_date || null, scheduled_at || null, status || 'requested', notes || null);
  res.status(201).json(db.prepare('SELECT * FROM tours WHERE id = ?').get(result.lastInsertRowid));
});

// ── Admin: update a tour (schedule / complete / reschedule) ──────────────────
router.put('/:id', authenticateToken, async (req, res) => {
  const tour = db.prepare('SELECT * FROM tours WHERE id = ?').get(req.params.id);
  if (!tour) return res.status(404).json({ error: 'Tour not found' });

  const { scheduled_at, status, notes, preferred_date, notify } = req.body;
  db.prepare(`
    UPDATE tours SET scheduled_at = ?, status = ?, notes = ?, preferred_date = ? WHERE id = ?
  `).run(
    scheduled_at !== undefined ? scheduled_at : tour.scheduled_at,
    status || tour.status,
    notes !== undefined ? notes : tour.notes,
    preferred_date !== undefined ? preferred_date : tour.preferred_date,
    req.params.id,
  );
  const updated = db.prepare('SELECT * FROM tours WHERE id = ?').get(req.params.id);

  if (updated.couple_id && updated.status === 'completed' && tour.status !== 'completed') {
    const key = `tour-followup:${tour.id}`;
    if (!db.prepare('SELECT 1 FROM tasks WHERE workflow_key = ?').get(key)) db.prepare('INSERT INTO tasks (title, couple_id, due_date, priority, workflow_key) VALUES (?, ?, ?, ?, ?)').run('Follow up after venue tour and prepare proposal', updated.couple_id, require('../services/schedule').albertaToday(), 'high', key);
  }
  // Staff tick "email a confirmation" when scheduling; nothing goes out otherwise.
  let confirmation = null;
  if (notify && updated.status === 'scheduled' && updated.scheduled_at) {
    const couple = updated.couple_id ? db.prepare('SELECT * FROM couples WHERE id = ?').get(updated.couple_id) : null;
    const to = [...new Set([updated.email, couple?.email, couple?.partner2_email].filter(Boolean).map(a => a.toLowerCase()))];
    confirmation = to.length
      ? await email.sendTourConfirmation({ to, coupleId: updated.couple_id, name: updated.name, scheduledAt: updated.scheduled_at })
      : { delivered: false, error: 'No email address for this visitor' };
  }
  res.json({ ...updated, confirmation_sent: confirmation ? confirmation.delivered : null, confirmation_error: confirmation && !confirmation.delivered ? confirmation.error : null });
});

// ── Admin: delete a tour ─────────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM tours WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
