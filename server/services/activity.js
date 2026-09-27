const db = require('../db');

// Record one action in the activity log. `req` supplies who did it (staff are
// identified by their token); everything else describes what happened.
// Never throws: a logging hiccup must not undo the change it describes.
function logActivity(req, { action, entity = null, entityId = null, coupleId = null, summary = null, detail = null }) {
  try {
    const user = req && req.user;
    db.prepare(`INSERT INTO activity_log (user_id, user_name, action, entity, entity_id, couple_id, summary, detail)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(user?.userId || null, user?.name || user?.email || (req ? 'system' : 'system'), action, entity,
        entityId != null ? Number(entityId) : null, coupleId != null ? Number(coupleId) : null,
        summary, detail == null ? null : JSON.stringify(detail));
  } catch (err) {
    console.error('[activity] could not record', action, err.message);
  }
}

function recentActivity({ coupleId = null, limit = 50 } = {}) {
  const rows = coupleId
    ? db.prepare('SELECT * FROM activity_log WHERE couple_id = ? ORDER BY at DESC, id DESC LIMIT ?').all(coupleId, limit)
    : db.prepare('SELECT * FROM activity_log ORDER BY at DESC, id DESC LIMIT ?').all(limit);
  return rows.map(r => ({ ...r, detail: r.detail ? JSON.parse(r.detail) : null }));
}

module.exports = { logActivity, recentActivity };
