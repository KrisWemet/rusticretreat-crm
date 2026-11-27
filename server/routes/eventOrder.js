const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { buildEventOrder, renderEventOrder } = require('../services/eventOrder');

// Everything for one wedding weekend, as data (the planning overview reads
// it for its readiness list) or as a printable event order.

router.get('/:coupleId', authenticateToken, (req, res) => {
  const eo = buildEventOrder(req.params.coupleId);
  if (!eo) return res.status(404).json({ error: 'Couple not found' });
  res.json(eo);
});

router.get('/:coupleId/print', authenticateToken, (req, res) => {
  const eo = buildEventOrder(req.params.coupleId);
  if (!eo) return res.status(404).json({ error: 'Couple not found' });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(renderEventOrder(eo, { financials: req.query.financials !== '0' }));
});

// The venue's own notes for the day: gate codes, generator plan, who opens up.
router.put('/:coupleId/notes', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const notes = String(req.body.event_notes ?? '').slice(0, 20000);
  db.prepare('UPDATE couples SET event_notes = ? WHERE id = ?').run(notes || null, couple.id);
  res.json({ event_notes: notes });
});

module.exports = router;
