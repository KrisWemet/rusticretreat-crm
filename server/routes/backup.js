const express = require('express');
const router = express.Router();
const path = require('path');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const backup = require('../services/backup');

// A backup file is the entire business — every couple, price, signature and
// contract — in one download. Staff-level access is not enough for that, so
// every route here is admin-only.

// ── List available backups ───────────────────────────────────────────────────
router.get('/', authenticateToken, requireAdmin, (req, res) => {
  try {
    res.json({
      backups: backup.listBackups(),
      directory: backup.BACKUP_DIR,
      keep: backup.KEEP,
      interval_hours: backup.INTERVAL_HOURS,
      offsite_configured: require('../services/offsite').configured(),
      offsite_keep: require('../services/offsite').KEEP,
      jobs: require('../services/schedule').jobStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Take a backup right now ──────────────────────────────────────────────────
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const r = await backup.createBackup();
    res.status(201).json({ success: true, name: r.name, size: r.size, pruned: r.pruned, offsite: r.offsite });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Download one ─────────────────────────────────────────────────────────────
// This is the step that gets a copy off the server. Backups written beside the
// database survive a bad deploy or a mistaken delete, but not the loss of the
// volume they sit on — only a copy somewhere else does.
router.get('/:name/download', authenticateToken, requireAdmin, (req, res) => {
  const full = backup.resolveBackup(req.params.name);
  if (!full) return res.status(404).json({ error: 'Backup not found' });
  res.download(full, path.basename(full));
});

module.exports = router;
