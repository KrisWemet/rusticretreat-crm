const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// ── Get all booked dates, holds, tours and blocked dates ────────────────────
// Cancelled and archived couples hold nothing. A "hold" is a date that is not
// booked yet but is spoken for: a proposal out with the couple, or a contract
// waiting for signatures.
function calendarData() {
  const { defaultEndDate } = require('../services/bookingRules');
  const withEnd = r => ({ ...r, end_date: r.end_date || defaultEndDate(r.event_date, r.package_name) || r.event_date });

  const booked = db.prepare(`
    SELECT b.id, b.event_date, b.end_date, b.package_name, b.guest_count, b.start_time, b.end_time,
           c.partner1_name, c.partner2_name, c.id AS couple_id
    FROM bookings b JOIN couples c ON b.couple_id = c.id
    WHERE b.event_date IS NOT NULL AND c.status != 'cancelled' AND c.archived_at IS NULL
    ORDER BY b.event_date ASC
  `).all().map(withEnd);

  const bookedCouples = new Set(booked.map(b => b.couple_id));
  const proposalHolds = db.prepare(`
    SELECT p.id, p.event_date, p.end_date, p.package_name, p.title, c.id AS couple_id, c.partner1_name, c.partner2_name
    FROM proposals p JOIN couples c ON c.id = p.couple_id
    WHERE p.status = 'sent' AND p.event_date IS NOT NULL AND c.archived_at IS NULL AND c.status != 'cancelled'
  `).all().map(r => ({ ...withEnd(r), kind: 'proposal' }));
  const contractHolds = db.prepare(`
    SELECT ct.id, ct.wedding_date AS event_date, NULL AS end_date, ct.package_name, ct.title, c.id AS couple_id, c.partner1_name, c.partner2_name
    FROM contracts ct JOIN couples c ON c.id = ct.couple_id
    WHERE ct.status = 'sent' AND ct.wedding_date IS NOT NULL AND c.archived_at IS NULL AND c.status != 'cancelled'
  `).all().map(r => ({ ...withEnd(r), kind: 'contract' }));
  const holds = [...contractHolds, ...proposalHolds].filter(h => !bookedCouples.has(h.couple_id));

  const blocked = db.prepare(`
    SELECT * FROM blocked_dates ORDER BY date ASC
  `).all();

  const tours = db.prepare(`
    SELECT t.id, t.couple_id, t.name, t.preferred_date, t.scheduled_at, t.status
    FROM tours t LEFT JOIN couples c ON c.id = t.couple_id
    WHERE t.status = 'scheduled' AND t.scheduled_at IS NOT NULL AND (c.id IS NULL OR c.archived_at IS NULL)
    ORDER BY t.scheduled_at ASC
  `).all();

  return { booked, holds, blocked, tours };
}

router.get('/', authenticateToken, (req, res) => {
  res.json(calendarData());
});

// ── Subscription feed for Google Calendar, Outlook or Apple Calendar ─────────
// A private address (the token is the only key) that calendar apps poll. It
// is read-only and one-way: changing an event in Google does not change the
// CRM. Turning it off or making a new address stops the old one working.
const crypto = require('crypto');
const { requireAdmin } = require('../middleware/auth');
const { buildIcs } = require('../services/icsFeed');
const getSetting = (k) => db.prepare('SELECT value FROM app_settings WHERE key = ?').get(k)?.value || null;
const setSetting = (k, v) => (v == null
  ? db.prepare('DELETE FROM app_settings WHERE key = ?').run(k)
  : db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v));
const feedUrl = (req, token) => `${(process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')}/api/calendar/feed/${token}.ics`;

router.get('/feed/:token', (req, res) => {
  const token = getSetting('calendar_feed_token');
  const given = String(req.params.token || '').replace(/\.ics$/, '');
  const ok = token && given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
  if (!ok) return res.status(404).send('Not found');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(buildIcs(calendarData(), { baseUrl: process.env.BASE_URL || `${req.protocol}://${req.get('host')}` }));
});

router.get('/feed-settings', authenticateToken, (req, res) => {
  const token = getSetting('calendar_feed_token');
  res.json({ enabled: !!token, url: token ? feedUrl(req, token) : null });
});

// enable (keeps an existing address), regenerate (old address stops), disable
router.post('/feed-settings', authenticateToken, requireAdmin, (req, res) => {
  const action = req.body.action;
  if (!['enable', 'regenerate', 'disable'].includes(action)) return res.status(400).json({ error: 'Unknown action' });
  let token = getSetting('calendar_feed_token');
  if (action === 'disable') token = null;
  else if (action === 'regenerate' || !token) token = crypto.randomBytes(24).toString('hex');
  setSetting('calendar_feed_token', token);
  res.json({ enabled: !!token, url: token ? feedUrl(req, token) : null });
});

// ── Block every date in a range (e.g. a family holiday) ──────────────────────
router.post('/block-range', authenticateToken, (req, res) => {
  const { from, to, reason } = req.body;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(from || '') || !iso.test(to || '')) return res.status(400).json({ error: 'Pick a start and end date' });
  if (to < from) return res.status(400).json({ error: 'The end date is before the start date' });
  const days = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
    if (days.length > 92) return res.status(400).json({ error: 'Block at most three months at a time' });
  }
  const upsert = db.prepare(`INSERT INTO blocked_dates (date, reason) VALUES (?, ?)
                             ON CONFLICT(date) DO UPDATE SET reason = excluded.reason`);
  db.transaction(() => days.forEach(d => upsert.run(d, reason || null)))();
  res.status(201).json({ blocked: days.length });
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
module.exports.calendarData = calendarData;
