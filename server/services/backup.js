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

// Daily and manual snapshots kept on the volume, plus the snapshots taken
// automatically just before a data migration runs (see runOnce in db.js).
const KEEP = Number(process.env.BACKUP_KEEP || 30);
const KEEP_PRE_MIGRATION = 10;
const INTERVAL_HOURS = 24; // once a day, run by the daily job runner

const FILE_RE = /^(rusticretreat|pre-migration)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z(-[a-z0-9-]+)?\.db$/;

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
 *
 * The snapshot is then copied off the volume to the storage bucket, when one
 * is configured. With requireOffsite, a failed upload is an error (the daily
 * job, so the venue is alerted); otherwise it is reported in the result.
 */
async function createBackup({ requireOffsite = false } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `rusticretreat-${stamp()}.db`;
  const dest = path.join(BACKUP_DIR, name);

  await db.backup(dest);

  const { size } = fs.statSync(dest);
  const pruned = pruneOldBackups();

  let offsite;
  try {
    offsite = await require('./offsite').uploadBackup(dest, name);
  } catch (err) {
    if (requireOffsite) throw new Error(`Backup ${name} was saved on the server, but the off-site copy failed: ${err.message}`);
    offsite = { uploaded: false, error: err.message };
  }
  return { name, path: dest, size, pruned, offsite };
}

// Retention runs after a successful backup, never before — a failed backup
// must not take the old ones with it. Each kind keeps its own newest copies.
function pruneOldBackups() {
  const files = listBackups();
  const stale = [
    ...files.filter(f => f.kind === 'daily').slice(KEEP),
    ...files.filter(f => f.kind === 'pre-migration').slice(KEEP_PRE_MIGRATION),
  ];
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
      return { name: n, size: s.size, created_at: s.mtime.toISOString(),
        kind: n.startsWith('pre-migration-') ? 'pre-migration' : 'daily' };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.name.localeCompare(a.name));
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

// The daily job (services/schedule.js): snapshot, prune, copy off-site.
async function dailyBackup() {
  const r = await createBackup({ requireOffsite: true });
  const off = r.offsite?.uploaded ? `, copied off-site (${r.offsite.kept} kept)` : ' (no off-site bucket configured)';
  console.log(`[backup] Wrote ${r.name} (${(r.size / 1024).toFixed(0)} KB)` + (r.pruned ? `, pruned ${r.pruned} old` : '') + off);
  return { name: r.name, size: r.size, offsite: !!r.offsite?.uploaded };
}

module.exports = {
  createBackup, dailyBackup, listBackups, resolveBackup,
  BACKUP_DIR, KEEP, INTERVAL_HOURS,
};
