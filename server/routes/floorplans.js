const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');
const { ELEMENT_TYPES, isTable, cleanItems, summarize, renderSvg } = require('../services/floorPlan');
const { esc } = require('../services/planning');
const { logActivity } = require('../services/activity');

// Floor plans and seating. A couple can have several plans (ceremony,
// reception); a plan with no couple is a venue layout saved as a template.
// Seats live on the guest (seat_plan_id + seat_table), so removing a table
// from a plan, or the plan itself, simply unseats whoever was at it.

const parse = (p) => p && ({ ...p, items: JSON.parse(p.items || '[]') });
const getPlan = (id) => parse(db.prepare('SELECT * FROM floor_plans WHERE id = ?').get(id));

function cleanSize(body, fallback = {}) {
  const w = Number(body.width_ft ?? fallback.width_ft ?? 80);
  const h = Number(body.height_ft ?? fallback.height_ft ?? 50);
  if (!(w >= 10 && w <= 1000 && h >= 10 && h <= 1000)) throw new Error('Width and length must be between 10 and 1,000 feet');
  return { width_ft: Math.round(w), height_ft: Math.round(h) };
}

// Guests seated at tables that no longer exist on the plan lose their seat.
function unseatMissing(plan) {
  const tables = new Set(plan.items.filter(i => isTable(i.type)).map(i => i.id));
  const seated = db.prepare('SELECT id, seat_table FROM guests WHERE seat_plan_id = ?').all(plan.id);
  const clear = db.prepare('UPDATE guests SET seat_plan_id = NULL, seat_table = NULL WHERE id = ?');
  let n = 0;
  for (const g of seated) if (!tables.has(g.seat_table)) { clear.run(g.id); n++; }
  return n;
}

router.get('/element-types', authenticateToken, (req, res) => res.json(ELEMENT_TYPES));

router.get('/templates', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM floor_plans WHERE couple_id IS NULL ORDER BY name').all().map(parse));
});

router.get('/couple/:coupleId', authenticateToken, (req, res) => {
  res.json(db.prepare('SELECT * FROM floor_plans WHERE couple_id = ? ORDER BY created_at, id').all(req.params.coupleId).map(parse));
});

// New plan for a couple: blank, or a copy of a saved layout or another plan.
router.post('/couple/:coupleId', authenticateToken, (req, res) => {
  const couple = db.prepare('SELECT id FROM couples WHERE id = ?').get(req.params.coupleId);
  if (!couple) return res.status(404).json({ error: 'Couple not found' });
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name the plan, for example "Reception"' });
  try {
    const source = req.body.copy_from ? getPlan(req.body.copy_from) : null;
    if (req.body.copy_from && !source) return res.status(404).json({ error: 'The layout to copy was not found' });
    const size = cleanSize(req.body, source || {});
    const items = source ? cleanItems(source.items, size) : [];
    const r = db.prepare('INSERT INTO floor_plans (couple_id, name, width_ft, height_ft, items, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(couple.id, name.slice(0, 80), size.width_ft, size.height_ft, JSON.stringify(items), source?.notes || null);
    res.status(201).json(getPlan(r.lastInsertRowid));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Save any plan as a venue layout others can start from. Seating is not part
// of a layout; it belongs to the couple's guests.
router.post('/:id/save-as-template', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const name = String(req.body.name || plan.name).trim().slice(0, 80);
  const r = db.prepare('INSERT INTO floor_plans (couple_id, name, width_ft, height_ft, items, notes) VALUES (NULL, ?, ?, ?, ?, ?)')
    .run(name, plan.width_ft, plan.height_ft, JSON.stringify(plan.items), plan.notes);
  res.status(201).json(getPlan(r.lastInsertRowid));
});

router.get('/:id', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
});

router.put('/:id', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  try {
    const size = cleanSize(req.body, plan);
    const items = req.body.items !== undefined ? cleanItems(req.body.items, size) : plan.items;
    const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 80) : plan.name;
    if (!name) return res.status(400).json({ error: 'The plan needs a name' });
    const notes = req.body.notes !== undefined ? (req.body.notes || null) : plan.notes;
    let unseated = 0;
    db.transaction(() => {
      db.prepare(`UPDATE floor_plans SET name = ?, width_ft = ?, height_ft = ?, items = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(name, size.width_ft, size.height_ft, JSON.stringify(items), notes, plan.id);
      unseated = unseatMissing({ id: plan.id, items });
    })();
    res.json({ ...getPlan(plan.id), unseated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  db.transaction(() => {
    db.prepare('UPDATE guests SET seat_plan_id = NULL, seat_table = NULL WHERE seat_plan_id = ?').run(plan.id);
    db.prepare('DELETE FROM floor_plans WHERE id = ?').run(plan.id);
  })();
  logActivity(req, { action: 'floorplan.deleted', entity: 'floor_plan', entityId: plan.id, coupleId: plan.couple_id,
    summary: `Deleted floor plan "${plan.name}"`, detail: plan });
  res.json({ success: true });
});

// Seat guests: [{ guest_id, table }] where table is a table element's id on
// this plan, or null to unseat. A table can be over-filled (staff may squeeze
// in a chair); the plan shows it in red rather than refusing.
router.put('/:id/seats', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan || !plan.couple_id) return res.status(404).json({ error: 'Plan not found' });
  const list = Array.isArray(req.body.assignments) ? req.body.assignments : [];
  const tables = new Set(plan.items.filter(i => isTable(i.type)).map(i => i.id));
  const guestOf = db.prepare('SELECT id, couple_id FROM guests WHERE id = ?');
  for (const a of list) {
    const g = guestOf.get(a.guest_id);
    if (!g || g.couple_id !== plan.couple_id) return res.status(400).json({ error: 'That guest is not on this couple’s list' });
    if (a.table != null && !tables.has(String(a.table))) return res.status(400).json({ error: 'That table is not on this plan' });
  }
  const set = db.prepare('UPDATE guests SET seat_plan_id = ?, seat_table = ? WHERE id = ?');
  db.transaction(() => {
    for (const a of list) set.run(a.table == null ? null : plan.id, a.table == null ? null : String(a.table), a.guest_id);
  })();
  res.json(db.prepare('SELECT id, seat_plan_id, seat_table FROM guests WHERE couple_id = ?').all(plan.couple_id));
});

// Printable plan: the drawing, what to set out, and who sits where.
router.get('/:id/print', authenticateToken, (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const couple = plan.couple_id ? db.prepare('SELECT partner1_name, partner2_name, wedding_date FROM couples WHERE id = ?').get(plan.couple_id) : null;
  const guests = plan.couple_id ? db.prepare('SELECT first_name, last_name, meal_preference, dietary_restrictions, seat_table FROM guests WHERE seat_plan_id = ? ORDER BY last_name, first_name').all(plan.id) : [];
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(printablePlan(plan, couple, guests));
});

function seatingByTable(plan, guests) {
  const byTable = {};
  for (const g of guests) (byTable[g.seat_table] = byTable[g.seat_table] || []).push(g);
  return plan.items.filter(i => isTable(i.type))
    .map(t => ({ table: t, guests: byTable[t.id] || [] }))
    .sort((a, b) => (a.table.label || '').localeCompare(b.table.label || '', undefined, { numeric: true }));
}

function printablePlan(plan, couple, guests) {
  const sum = summarize(plan.items);
  const seats = seatingByTable(plan, guests);
  const seated = Object.fromEntries(seats.map(s => [s.table.id, s.guests.length]));
  const who = couple ? `${esc(couple.partner1_name)} &amp; ${esc(couple.partner2_name)}` : 'Venue layout';
  const tableBlocks = seats.map(s => `
    <div class="tbl"><h3>${esc(s.table.label || 'Unnamed table')} <span>${s.guests.length}/${s.table.seats}</span></h3>
    ${s.guests.length ? `<ol>${s.guests.map(g => `<li>${esc(g.first_name)} ${esc(g.last_name)}${g.meal_preference ? ` <em>· ${esc(g.meal_preference)}</em>` : ''}${g.dietary_restrictions ? ` <em>· ${esc(g.dietary_restrictions)}</em>` : ''}</li>`).join('')}</ol>` : '<p class="none">No one seated</p>'}</div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(plan.name)} — ${who}</title>
<style>
body{font-family:Helvetica,Arial,sans-serif;color:#0f172a;margin:24px;font-size:12px}
h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #cbd5e1;padding-bottom:3px}
.meta{color:#475569;margin:2px 0 12px}.bar{display:flex;gap:8px;margin-bottom:16px}
.bar button{background:#e11d48;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:13px;cursor:pointer}
table.eq{border-collapse:collapse}table.eq td{padding:2px 12px 2px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.tbl{border:1px solid #e2e8f0;border-radius:6px;padding:8px;break-inside:avoid}.tbl h3{margin:0 0 4px;font-size:13px}
.tbl h3 span{color:#64748b;font-weight:normal}.tbl ol{margin:0;padding-left:18px}.tbl em{color:#64748b;font-style:normal}
.none{color:#94a3b8;margin:0}.notes{white-space:pre-wrap}
@media print { .noprint { display: none !important; } body { margin: 0; } }
</style></head><body>
<div class="bar noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${esc(plan.name)}</h1>
<p class="meta">${who}${couple?.wedding_date ? ` · ${esc(couple.wedding_date)}` : ''} · ${plan.width_ft} × ${plan.height_ft} ft</p>
${renderSvg(plan, plan.items, { widthPx: 900, seated })}
<h2>To set out</h2>
<table class="eq">${sum.equipment.map(e => `<tr><td>${esc(e.label)}</td><td><strong>${e.count}</strong></td></tr>`).join('')}
<tr><td>Seats at tables</td><td><strong>${sum.tableSeats}</strong></td></tr>${sum.ceremonyChairs ? `<tr><td>Ceremony chairs</td><td><strong>${sum.ceremonyChairs}</strong></td></tr>` : ''}</table>
${plan.notes ? `<h2>Setup notes</h2><p class="notes">${esc(plan.notes)}</p>` : ''}
${seats.length ? `<h2>Seating</h2><div class="grid">${tableBlocks}</div>` : ''}
</body></html>`;
}

module.exports = router;
module.exports.seatingByTable = seatingByTable;
