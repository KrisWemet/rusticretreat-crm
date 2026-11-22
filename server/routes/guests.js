const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken, authenticateCouple, authenticateAny } = require('../middleware/auth');
const { parseCsv, sendCsv } = require('../services/planning');

const RSVP = ['pending', 'accepted', 'declined'];

function readGuest(body, existing = {}) {
  const pick = (k) => (body[k] !== undefined ? body[k] : existing[k]);
  const first = String(pick('first_name') || '').trim();
  const last = String(pick('last_name') || '').trim();
  if (!first || !last) return { error: 'First and last name required' };
  const rsvp = pick('rsvp_status') || 'pending';
  if (!RSVP.includes(rsvp)) return { error: 'RSVP must be pending, accepted or declined' };
  const text = (k) => { const v = pick(k); return v == null || String(v).trim() === '' ? null : String(v).trim(); };
  return {
    value: {
      first_name: first.slice(0, 80), last_name: last.slice(0, 80),
      email: text('email'), phone: text('phone'), rsvp_status: rsvp,
      meal_preference: text('meal_preference'), plus_one: pick('plus_one') ? 1 : 0,
      dietary_restrictions: text('dietary_restrictions'), notes: text('notes'), party: text('party'),
    },
  };
}

function insertGuest(coupleId, v) {
  const r = db.prepare(`
    INSERT INTO guests (couple_id, first_name, last_name, email, phone, rsvp_status, meal_preference, plus_one, dietary_restrictions, notes, party)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(coupleId, v.first_name, v.last_name, v.email, v.phone, v.rsvp_status, v.meal_preference, v.plus_one,
    v.dietary_restrictions, v.notes, v.party);
  return db.prepare('SELECT * FROM guests WHERE id = ?').get(r.lastInsertRowid);
}

const listFor = (coupleId) => db.prepare('SELECT * FROM guests WHERE couple_id = ? ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE').all(coupleId);

// ── Staff ────────────────────────────────────────────────────────────────────
router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(listFor(req.params.coupleId));
});

router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  if (!db.prepare('SELECT 1 FROM couples WHERE id = ?').get(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  const { value, error } = readGuest(req.body);
  if (error) return res.status(400).json({ error });
  res.status(201).json(insertGuest(req.params.coupleId, value));
});

// Header names people actually use in a guest-list spreadsheet, mapped to ours.
const HEADERS = {
  first_name: ['first name', 'first', 'firstname', 'given name'],
  last_name: ['last name', 'last', 'lastname', 'surname', 'family name'],
  name: ['name', 'full name', 'guest', 'guest name'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'phone number', 'mobile', 'cell'],
  party: ['party', 'household', 'group', 'family'],
  rsvp_status: ['rsvp', 'rsvp status', 'status', 'attending'],
  meal_preference: ['meal', 'meal choice', 'meal preference', 'entree', 'entrée'],
  dietary_restrictions: ['dietary', 'dietary restrictions', 'allergies', 'dietary needs'],
  plus_one: ['plus one', 'plus-one', '+1', 'guest of'],
  notes: ['notes', 'note', 'comments'],
};

function rsvpFrom(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s) return 'pending';
  if (['yes', 'y', 'accepted', 'accept', 'attending', 'coming', 'confirmed'].includes(s)) return 'accepted';
  if (['no', 'n', 'declined', 'decline', 'not attending', 'regrets'].includes(s)) return 'declined';
  return 'pending';
}
const truthy = (v) => ['yes', 'y', 'true', '1', 'x'].includes(String(v || '').trim().toLowerCase());

// Paste or upload a spreadsheet saved as CSV. The first row must name the
// columns; "Name" alone is split into first and last. Rows already on the list
// (same name and email) are skipped, so importing the same file twice is safe.
router.post('/couple/:coupleId/import', authenticateToken, (req, res) => {
  if (!db.prepare('SELECT 1 FROM couples WHERE id = ?').get(req.params.coupleId)) return res.status(404).json({ error: 'Couple not found' });
  const rows = parseCsv(req.body.csv);
  if (rows.length < 2) return res.status(400).json({ error: 'The file needs a header row and at least one guest' });
  if (rows.length > 1001) return res.status(400).json({ error: 'That is more than 1,000 guests — split the file and try again' });
  const header = rows[0].map(h => String(h).trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    const i = header.findIndex(h => names.includes(h));
    if (i >= 0) col[key] = i;
  }
  if (col.first_name == null && col.name == null) {
    return res.status(400).json({ error: 'Could not find a "First Name" (or "Name") column in the first row' });
  }
  const existing = new Set(listFor(req.params.coupleId).map(g => `${g.first_name}|${g.last_name}|${g.email || ''}`.toLowerCase()));
  let added = 0; const skipped = [];
  db.transaction(() => {
    rows.slice(1).forEach((r, idx) => {
      const get = (k) => (col[k] == null ? '' : String(r[col[k]] ?? '').trim());
      let first = get('first_name'), last = get('last_name');
      if (!first && get('name')) {
        const parts = get('name').split(/\s+/);
        first = parts.shift(); last = last || parts.join(' ');
      }
      if (!last) last = '-';
      const { value, error } = readGuest({
        first_name: first, last_name: last, email: get('email'), phone: get('phone'), party: get('party'),
        rsvp_status: rsvpFrom(get('rsvp_status')), meal_preference: get('meal_preference'),
        dietary_restrictions: get('dietary_restrictions'), plus_one: truthy(get('plus_one')), notes: get('notes'),
      });
      if (error) { skipped.push({ row: idx + 2, reason: 'No name' }); return; }
      const key = `${value.first_name}|${value.last_name}|${value.email || ''}`.toLowerCase();
      if (existing.has(key)) { skipped.push({ row: idx + 2, reason: 'Already on the list' }); return; }
      existing.add(key);
      insertGuest(req.params.coupleId, value);
      added++;
    });
  })();
  res.json({ added, skipped, guests: listFor(req.params.coupleId) });
});

router.get('/couple/:coupleId/export', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT partner1_name, partner2_name FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const guests = listFor(req.params.coupleId);
  // Table names come from the floor plan the guest is seated on.
  const tables = {};
  for (const p of db.prepare('SELECT id, items FROM floor_plans WHERE couple_id = ?').all(req.params.coupleId)) {
    for (const it of JSON.parse(p.items || '[]')) tables[`${p.id}:${it.id}`] = it.label || '';
  }
  sendCsv(res, `guest-list-${couple.partner1_name}-${couple.partner2_name}.csv`,
    ['First Name', 'Last Name', 'Party', 'Email', 'Phone', 'RSVP', 'Meal', 'Dietary', 'Plus One', 'Table', 'Notes'],
    guests.map(g => [g.first_name, g.last_name, g.party, g.email, g.phone, g.rsvp_status, g.meal_preference,
      g.dietary_restrictions, g.plus_one ? 'Yes' : '', g.seat_plan_id ? tables[`${g.seat_plan_id}:${g.seat_table}`] || '' : '', g.notes]));
});

// ── Portal ───────────────────────────────────────────────────────────────────
router.get('/portal', authenticateCouple, (req, res) => {
  res.json(listFor(req.couple.coupleId));
});

router.post('/portal', authenticateCouple, (req, res) => {
  const { value, error } = readGuest(req.body);
  if (error) return res.status(400).json({ error });
  res.status(201).json(insertGuest(req.couple.coupleId, value));
});

// ── Either side, each limited to its own couple ──────────────────────────────
router.put('/:id', authenticateAny, (req, res) => {
  const guest = db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id);
  if (!guest) return res.status(404).json({ error: 'Guest not found' });
  if (req.auth.coupleId && req.auth.coupleId !== guest.couple_id) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const { value, error } = readGuest(req.body, guest);
  if (error) return res.status(400).json({ error });
  db.prepare(`
    UPDATE guests SET first_name = ?, last_name = ?, email = ?, phone = ?, rsvp_status = ?, meal_preference = ?,
      plus_one = ?, dietary_restrictions = ?, notes = ?, party = ?
    WHERE id = ?
  `).run(value.first_name, value.last_name, value.email, value.phone, value.rsvp_status, value.meal_preference,
    value.plus_one, value.dietary_restrictions, value.notes, value.party, req.params.id);
  res.json(db.prepare('SELECT * FROM guests WHERE id = ?').get(req.params.id));
});

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
