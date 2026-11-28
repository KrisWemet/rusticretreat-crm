const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');
const { parseTime, formatTime, isDay, addDays, daysBetween, sortRunOfShow } = require('../services/planning');

// The run of show. Built for the couple portal (one undated day-of list) and
// now used by staff to plan a whole three- or five-day wedding: each item can
// carry its own day, who is responsible, and a category.

const CATEGORIES = ['Setup', 'Arrivals', 'Ceremony', 'Photos', 'Reception', 'Food & drink', 'Vendor', 'Venue', 'Teardown', 'Other'];

// "15:30" from a time input, or "3:30 pm" typed by hand, is stored the way
// existing rows are ("3:30 PM"), so the list reads the same however it was
// entered. Anything unreadable is refused rather than stored as-is, because
// an unreadable time cannot be put in order.
function cleanTime(value) {
  const minutes = parseTime(value);
  return minutes == null ? null : formatTime(minutes);
}

function readItem(body, existing = {}) {
  const pick = (k) => (body[k] !== undefined ? body[k] : existing[k]);
  const time = body.time !== undefined ? cleanTime(body.time) : existing.time;
  if (!time) return { error: 'Enter a time such as 3:30 PM' };
  const title = String(pick('title') || '').trim();
  if (!title) return { error: 'Give the item a title' };
  const day = pick('day_date') || null;
  if (day && !isDay(day)) return { error: 'The day must be a date' };
  const duration = pick('duration_minutes');
  const minutes = duration === '' || duration == null ? null : Number(duration);
  if (minutes != null && !(minutes >= 0 && minutes <= 24 * 60)) return { error: 'Duration must be between 0 and 1440 minutes' };
  return {
    value: {
      time, title: title.slice(0, 200),
      description: pick('description') || null,
      location: pick('location') || null,
      duration_minutes: minutes == null ? 30 : Math.round(minutes),
      day_date: day,
      assigned_to: pick('assigned_to') ? String(pick('assigned_to')).slice(0, 120) : null,
      category: pick('category') ? String(pick('category')).slice(0, 40) : null,
    },
  };
}

const listFor = (coupleId) => sortRunOfShow(db.prepare('SELECT * FROM timeline_events WHERE couple_id = ?').all(coupleId));

function insertItem(coupleId, v, { addedBy = null, locked = 0 } = {}) {
  const maxOrder = db.prepare('SELECT MAX(order_index) as max FROM timeline_events WHERE couple_id = ?').get(coupleId);
  const r = db.prepare(`
    INSERT INTO timeline_events (couple_id, time, title, description, location, duration_minutes, order_index, day_date, assigned_to, category, added_by, locked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(coupleId, v.time, v.title, v.description, v.location, v.duration_minutes, (maxOrder.max || 0) + 1,
    v.day_date, v.assigned_to, v.category, addedBy, locked ? 1 : 0);
  return db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(r.lastInsertRowid);
}

router.get('/categories', authenticateToken, (req, res) => res.json(CATEGORIES));

// ── Templates: a schedule saved with day offsets, reusable for any dates ─────
router.get('/templates', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM timeline_templates ORDER BY name').all()
    .map(t => ({ ...t, items: JSON.parse(t.items || '[]') })));
});

// Save a couple's run of show as a template. Days are kept relative to the
// earliest dated item, so applying it to a later wedding lands each item on
// the same day of that weekend. Items the couple added are their own plans,
// not the venue's standard, so they are left out; locks are kept.
router.post('/templates', authenticateToken, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name the template' });
  const items = listFor(req.body.couple_id).filter(i => i.added_by !== 'couple');
  if (!items.length) return res.status(400).json({ error: 'This run of show has no items to save' });
  const first = items.map(i => i.day_date).filter(Boolean).sort()[0] || null;
  const saved = items.map(i => ({
    day_offset: first && i.day_date ? daysBetween(first, i.day_date) : 0,
    time: i.time, title: i.title, description: i.description, location: i.location,
    duration_minutes: i.duration_minutes, assigned_to: i.assigned_to, category: i.category,
    ...(i.locked ? { locked: true } : {}),
  }));
  const r = db.prepare('INSERT INTO timeline_templates (name, items) VALUES (?, ?)').run(name.slice(0, 120), JSON.stringify(saved));
  res.status(201).json({ id: r.lastInsertRowid, name, items: saved });
});

router.delete('/templates/:id', authenticateToken, (req, res) => {
  db.prepare('DELETE FROM timeline_templates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Copy a template into a couple's run of show, starting on start_date.
// Existing items are kept unless replace is set, and even then the items the
// couple added themselves are kept: replacing the venue's plan never deletes
// the couple's own work.
router.post('/couple/:coupleId/apply-template', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const tpl = db.prepare('SELECT * FROM timeline_templates WHERE id = ?').get(req.body.template_id);
  if (!tpl) return res.status(404).json({ error: 'Template not found' });
  const start = req.body.start_date || null;
  if (start && !isDay(start)) return res.status(400).json({ error: 'Choose the first day of the wedding' });
  const items = JSON.parse(tpl.items || '[]');
  db.transaction(() => {
    if (req.body.replace) db.prepare("DELETE FROM timeline_events WHERE couple_id = ? AND COALESCE(added_by, '') <> 'couple'").run(couple.id);
    for (const it of items) {
      const { value } = readItem({ ...it, day_date: start ? addDays(start, Number(it.day_offset) || 0) : null });
      if (value) insertItem(couple.id, value, { addedBy: req.user?.name || 'Venue', locked: !!it.locked });
    }
  })();
  res.json(listFor(couple.id));
});

// ── Staff ────────────────────────────────────────────────────────────────────
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(listFor(req.params.coupleId));
});

router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const { value, error } = readItem(req.body);
  if (error) return res.status(400).json({ error });
  res.status(201).json(insertItem(couple.id, value, { addedBy: req.user?.name || 'Venue', locked: !!req.body.locked }));
});

// The couple's changes are recorded where staff look (the couple's activity),
// so a moved ceremony time is never a surprise on the day.
const { logActivity } = require('../services/activity');
const coupleChange = (coupleId, summary) => logActivity({ user: { name: 'The couple' } }, { action: 'schedule.couple_change', entity: 'timeline', coupleId, summary });
const LOCKED_MSG = 'Rustic Retreat has set this one. Send us a message if it needs to change.';

// ── Portal ───────────────────────────────────────────────────────────────────
router.get('/portal', authenticateCouple, (req, res) => {
  res.json(listFor(req.couple.coupleId));
});

router.post('/portal', authenticateCouple, (req, res) => {
  const { value, error } = readItem(req.body);
  if (error) return res.status(400).json({ error });
  const item = insertItem(req.couple.coupleId, value, { addedBy: 'couple' });
  coupleChange(req.couple.coupleId, `The couple added "${item.title}" at ${item.time}${item.day_date ? ` on ${item.day_date}` : ''} to the schedule`);
  res.status(201).json(item);
});

// ── Either side, each limited to its own couple ──────────────────────────────
router.put('/:id', authenticateAny, (req, res) => {
  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const byCouple = !!req.auth.coupleId;
  if (byCouple && req.auth.coupleId !== event.couple_id) return res.status(403).json({ error: 'Access denied' });
  if (byCouple && event.locked) return res.status(403).json({ error: LOCKED_MSG });
  const { value, error } = readItem(req.body, event);
  if (error) return res.status(400).json({ error });
  const order = req.body.order_index !== undefined ? req.body.order_index : event.order_index;
  // Only staff lock or unlock an item.
  const locked = !byCouple && req.body.locked !== undefined ? (req.body.locked ? 1 : 0) : (event.locked || 0);
  db.prepare(`
    UPDATE timeline_events SET time = ?, title = ?, description = ?, location = ?, duration_minutes = ?,
      order_index = ?, day_date = ?, assigned_to = ?, category = ?, locked = ?
    WHERE id = ?
  `).run(value.time, value.title, value.description, value.location, value.duration_minutes, order,
    value.day_date, value.assigned_to, value.category, locked, req.params.id);
  const after = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  if (byCouple && (after.time !== event.time || after.title !== event.title || after.day_date !== event.day_date || after.location !== event.location || after.description !== event.description)) {
    coupleChange(event.couple_id, `The couple changed "${event.title}" (${event.time}${event.day_date ? `, ${event.day_date}` : ''}) to "${after.title}" (${after.time}${after.day_date ? `, ${after.day_date}` : ''})`);
  }
  res.json(after);
});

router.delete('/:id', authenticateAny, (req, res) => {
  const event = db.prepare('SELECT * FROM timeline_events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  if (req.auth.coupleId && req.auth.coupleId !== event.couple_id) return res.status(403).json({ error: 'Access denied' });
  if (req.auth.coupleId && event.locked) return res.status(403).json({ error: LOCKED_MSG });
  db.prepare('DELETE FROM timeline_events WHERE id = ?').run(req.params.id);
  if (req.auth.coupleId) coupleChange(event.couple_id, `The couple removed "${event.title}" (${event.time}${event.day_date ? `, ${event.day_date}` : ''}) from the schedule`);
  res.json({ message: 'Event deleted' });
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
