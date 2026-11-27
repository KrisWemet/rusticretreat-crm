const express = require('express');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { logActivity } = require('../services/activity');

// Files kept on a couple's record: their AGLC licence, vendor insurance
// certificates, a hand-drawn layout, inspiration photos. Stored in the
// database like contract files — never in /uploads, which is wiped on every
// deploy and readable by anyone — and served only to signed-in staff.

const FILE_TYPES = {
  'application/pdf': 'PDF', 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP',
  'image/heic': 'HEIC', 'image/heif': 'HEIF', 'image/gif': 'GIF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/csv': 'CSV', 'text/plain': 'TXT',
};
// Shown in the browser; everything else downloads, so no file can render as
// a page on the CRM's own origin.
const INLINE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CATEGORIES = ['Licence & permits', 'Insurance', 'Layout', 'Timeline', 'Vendor', 'Inspiration', 'Other'];
const MAX_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => (FILE_TYPES[file.mimetype]
    ? cb(null, true)
    : cb(Object.assign(new Error('bad type'), { code: 'BAD_TYPE' }))),
}).single('file');

const COLUMNS = 'id, couple_id, filename, mime_type, size, category, uploaded_by, uploaded_at';

router.get('/categories', authenticateToken, (req, res) => res.json(CATEGORIES));

router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(db.prepare(`SELECT ${COLUMNS} FROM couple_files WHERE couple_id = ? ORDER BY uploaded_at DESC, id DESC`).all(req.params.coupleId));
});

router.post('/couple/:coupleId', authenticateToken, (req, res) => upload(req, res, (err) => {
  if (err) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That file is over 15 MB. Save a smaller copy and try again.'
      : err.code === 'BAD_TYPE' ? 'That file type isn’t supported. Upload a PDF, photo, Word, Excel, CSV or text file.'
      : 'The upload could not be read.';
    return res.status(400).json({ error: msg });
  }
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  if (!req.file) return res.status(400).json({ error: 'Choose a file to upload' });
  const category = CATEGORIES.includes(req.body?.category) ? req.body.category : 'Other';
  const r = db.prepare(`INSERT INTO couple_files (couple_id, filename, mime_type, size, category, data, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(couple.id, String(req.file.originalname || 'file').slice(0, 200), req.file.mimetype, req.file.size, category,
      req.file.buffer, req.user?.name || req.user?.email || null);
  res.status(201).json(db.prepare(`SELECT ${COLUMNS} FROM couple_files WHERE id = ?`).get(r.lastInsertRowid));
}));

router.get('/:id', authenticateToken, (req, res) => {
  const f = db.prepare('SELECT * FROM couple_files WHERE id = ?').get(req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  const safeName = f.filename.replace(/["\\\r\n]/g, '');
  res.setHeader('Content-Type', f.mime_type);
  res.setHeader('Content-Disposition', `${INLINE.has(f.mime_type) ? 'inline' : 'attachment'}; filename="${safeName}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(f.data);
});

router.patch('/:id', authenticateToken, (req, res) => {
  const f = db.prepare(`SELECT ${COLUMNS} FROM couple_files WHERE id = ?`).get(req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  const category = CATEGORIES.includes(req.body.category) ? req.body.category : f.category;
  db.prepare('UPDATE couple_files SET category = ? WHERE id = ?').run(category, f.id);
  res.json({ ...f, category });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const f = db.prepare(`SELECT ${COLUMNS} FROM couple_files WHERE id = ?`).get(req.params.id);
  if (!f) return res.status(404).json({ error: 'File not found' });
  db.prepare('DELETE FROM couple_files WHERE id = ?').run(f.id);
  logActivity(req, { action: 'file.deleted', entity: 'couple_file', entityId: f.id, coupleId: f.couple_id,
    summary: `Deleted file "${f.filename}"`, detail: f });
  res.json({ success: true });
});

module.exports = router;
