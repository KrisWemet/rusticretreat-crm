const fs = require('fs');
const path = require('path');
const db = require('../db');

// Where the database actually lives, resolved the same way db.js resolves it.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'rusticretreat.db');

// Backups sit next to the database, which on a hosted deploy means on the
// mounted volume. See the honest limits of that in DEPLOY.md: this protects
// against a bad migration, an accidental delete, or a corrupted write. It does
// NOT protect against losing the volume itself — for that a copy has to leave
// the server, which is what the download endpoint is for.
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DB_PATH), 'backups');

const KEEP = Number(process.env.BACKUP_KEEP || 14);
const INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 24);

const FILE_RE = /^rusticretreat-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db$/;

function stamp(d = new Date()) {
  return d.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
}

/**
 * Take a consistent snapshot of the live database.
 *
 * Uses SQLite's online backup API rather than copying the file. The database
 * runs in WAL mode, so recent commits live in the -wal sidecar until a
 * checkpoint: copying only the .db would silently produce a backup missing the
 * newest bookings and signatures, which is worse than no backup because it
 * looks fine until you restore it.
 */
async function createBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `rusticretreat-${stamp()}.db`;
  const dest = path.join(BACKUP_DIR, name);

  await db.backup(dest);

  const { size } = fs.statSync(dest);
  const pruned = pruneOldBackups();
  return { name, path: dest, size, pruned };
}

// Keep the most recent KEEP snapshots. Retention runs after a successful
// backup, never before — a failed backup must not take the old ones with it.
function pruneOldBackups() {
  const files = listBackups();
  const stale = files.slice(KEEP);
  for (const f of stale) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, f.name)); } catch { /* already gone */ }
  }
  return stale.length;
}

// Newest first.
function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(n => FILE_RE.test(n))
    .map(n => {
      const s = fs.statSync(path.join(BACKUP_DIR, n));
      return { name: n, size: s.size, created_at: s.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

// Resolve a caller-supplied backup name to a real path, or null.
// The strict filename pattern plus the containment check means a name like
// "../../etc/passwd" cannot escape the backup directory.
function resolveBackup(name) {
  if (!FILE_RE.test(name)) return null;
  const full = path.resolve(BACKUP_DIR, name);
  if (full !== path.join(path.resolve(BACKUP_DIR), name)) return null;
  return fs.existsSync(full) ? full : null;
}

function startBackupScheduler() {
  if (INTERVAL_HOURS <= 0) {
    console.log('[backup] Scheduler disabled (BACKUP_INTERVAL_HOURS=0)');
    return null;
  }
  const runOnce = async () => {
    try {
      const r = await createBackup();
      console.log(`[backup] Wrote ${r.name} (${(r.size / 1024).toFixed(0)} KB)` +
                  (r.pruned ? `, pruned ${r.pruned} old` : ''));
    } catch (err) {
      // A failed backup must never take the app down with it.
      console.error('[backup] Failed:', err.message);
    }
  };

  // Take one shortly after boot so a fresh deploy always has a restore point,
  // then settle into the regular interval.
  const first = setTimeout(runOnce, 60_000);
  const timer = setInterval(runOnce, INTERVAL_HOURS * 3600_000);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
  console.log(`[backup] Scheduler started — every ${INTERVAL_HOURS}h, keeping ${KEEP}, in ${BACKUP_DIR}`);
  return timer;
}

module.exports = {
  createBackup, listBackups, resolveBackup, startBackupScheduler,
  BACKUP_DIR, KEEP, INTERVAL_HOURS,
};
