const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { importRows, rowsFromCsv, templateCsv } = require('../services/existingBookings');

// Couples who booked before the CRM was in use. See services/existingBookings.js.

router.get('/template.csv', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="existing-bookings-template.csv"');
  res.send(templateCsv());
});

// Body: { csv } for a spreadsheet, or { rows: [{...}] } for the single form.
function readRows(body) {
  if (typeof body?.csv === 'string') return rowsFromCsv(body.csv);
  if (Array.isArray(body?.rows)) return { rows: body.rows, unknownColumns: [], missingColumns: [] };
  return null;
}

// Check without saving. Nothing is written.
router.post('/preview', authenticateToken, (req, res) => {
  const parsed = readRows(req.body);
  if (!parsed) return res.status(400).json({ error: 'Send a spreadsheet (csv) or rows to check.' });
  if (parsed.missingColumns.length) {
    return res.status(400).json({ error: `The spreadsheet is missing these columns: ${parsed.missingColumns.join(', ')}. Start from the template.`, ...parsed });
  }
  const { results } = importRows(parsed.rows, { req, dryRun: true, exclude: req.body.exclude || [] });
  res.json({ results, unknownColumns: parsed.unknownColumns });
});

// Save every row that passes. Rows with problems are skipped and reported.
router.post('/', authenticateToken, (req, res) => {
  const parsed = readRows(req.body);
  if (!parsed) return res.status(400).json({ error: 'Send a spreadsheet (csv) or rows to add.' });
  if (parsed.missingColumns.length) {
    return res.status(400).json({ error: `The spreadsheet is missing these columns: ${parsed.missingColumns.join(', ')}. Start from the template.` });
  }
  const outcome = importRows(parsed.rows, { req, exclude: req.body.exclude || [] });
  res.status(outcome.added ? 201 : 400).json(outcome);
});

module.exports = router;
