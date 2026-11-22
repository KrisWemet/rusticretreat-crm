// Floor plans: what an element can be, checking what the editor saves, the
// equipment counts, and a static SVG for the printed plan and event order.
//
// The interactive editor (client/src/components/planning/FloorPlanEditor.jsx)
// draws the same elements in React. Like the two contract renderers, the two
// are kept separate on purpose — the printed plan must not depend on a bundle
// running — so a new element type needs adding in both places.
//
// Units are feet. x and y are the element's centre; rotation is in degrees.

const { esc } = require('./planning');

const ELEMENT_TYPES = {
  round:      { label: 'Round table',        w: 6,  h: 6,  seats: 8,  shape: 'ellipse', table: true },
  rect:       { label: 'Banquet table',      w: 8,  h: 2.5, seats: 8, shape: 'rect',    table: true },
  long:       { label: 'Long feast table',   w: 16, h: 3,  seats: 16, shape: 'rect',    table: true },
  head:       { label: 'Head table',         w: 8,  h: 2.5, seats: 2, shape: 'rect',    table: true },
  cocktail:   { label: 'Cocktail table',     w: 2.5, h: 2.5, seats: 0, shape: 'ellipse' },
  chairs:     { label: 'Ceremony chairs',    w: 14, h: 10, seats: 40, shape: 'rows' },
  aisle:      { label: 'Aisle',              w: 4,  h: 30, seats: 0, shape: 'outline' },
  arch:       { label: 'Ceremony arch',      w: 6,  h: 2,  seats: 0, shape: 'rect' },
  dancefloor: { label: 'Dance floor',        w: 16, h: 16, seats: 0, shape: 'rect' },
  stage:      { label: 'Stage / band',       w: 12, h: 8,  seats: 0, shape: 'rect' },
  dj:         { label: 'DJ booth',           w: 6,  h: 3,  seats: 0, shape: 'rect' },
  bar:        { label: 'Bar',                w: 8,  h: 3,  seats: 0, shape: 'rect' },
  food:       { label: 'Buffet / food truck', w: 12, h: 4, seats: 0, shape: 'rect' },
  cake:       { label: 'Cake table',         w: 4,  h: 2.5, seats: 0, shape: 'rect' },
  gift:       { label: 'Gift & card table',  w: 6,  h: 2.5, seats: 0, shape: 'rect' },
  lounge:     { label: 'Lounge seating',     w: 8,  h: 6,  seats: 0, shape: 'rect' },
  photo:      { label: 'Photo booth',        w: 6,  h: 6,  seats: 0, shape: 'rect' },
  firepit:    { label: 'Fire pit',           w: 6,  h: 6,  seats: 0, shape: 'ellipse' },
  tent:       { label: 'Tent',               w: 30, h: 20, seats: 0, shape: 'outline' },
  gazebo:     { label: 'Gazebo',             w: 20, h: 20, seats: 0, shape: 'outline' },
  zone:       { label: 'Area',               w: 20, h: 15, seats: 0, shape: 'outline' },
  restroom:   { label: 'Washrooms',          w: 8,  h: 4,  seats: 0, shape: 'rect' },
  generator:  { label: 'Generator',          w: 6,  h: 4,  seats: 0, shape: 'rect' },
  tree:       { label: 'Tree',               w: 6,  h: 6,  seats: 0, shape: 'ellipse' },
  label:      { label: 'Text label',         w: 12, h: 2,  seats: 0, shape: 'text' },
};

const isTable = (type) => !!ELEMENT_TYPES[type]?.table;
const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
const round1 = (n) => Math.round(n * 10) / 10;

// Throws a message staff can act on; returns the cleaned list otherwise.
function cleanItems(items, plan) {
  if (!Array.isArray(items)) throw new Error('Items must be a list');
  if (items.length > 500) throw new Error('A plan can hold at most 500 elements');
  const seen = new Set();
  return items.map((it, i) => {
    const def = ELEMENT_TYPES[it?.type];
    if (!def) throw new Error(`Element ${i + 1} has an unknown type`);
    const id = String(it.id || '');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(id) || seen.has(id)) throw new Error(`Element ${i + 1} needs a unique id`);
    seen.add(id);
    const maxX = plan.width_ft + 50, maxY = plan.height_ft + 50;
    return {
      id, type: it.type,
      x: round1(num(it.x, -50, maxX, plan.width_ft / 2)),
      y: round1(num(it.y, -50, maxY, plan.height_ft / 2)),
      w: round1(num(it.w, 0.5, 500, def.w)),
      h: round1(num(it.h, 0.5, 500, def.h)),
      rotation: ((Math.round(num(it.rotation, -3600, 3600, 0)) % 360) + 360) % 360,
      label: String(it.label ?? '').slice(0, 60),
      seats: Math.round(num(it.seats, 0, 400, def.seats)),
    };
  });
}

// What to set out: tables by kind, seats, ceremony chairs, and the rest.
function summarize(items) {
  const counts = {};
  let tables = 0, tableSeats = 0, ceremonyChairs = 0;
  for (const it of items) {
    counts[it.type] = (counts[it.type] || 0) + 1;
    if (isTable(it.type)) { tables++; tableSeats += it.seats || 0; }
    if (it.type === 'chairs') ceremonyChairs += it.seats || 0;
  }
  const equipment = Object.entries(counts)
    .filter(([t]) => !['label', 'zone', 'tree', 'aisle'].includes(t))
    .map(([t, n]) => ({ type: t, label: ELEMENT_TYPES[t].label, count: n }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return { tables, tableSeats, ceremonyChairs, equipment };
}

// A self-contained SVG, scaled to fit `widthPx`. Seated counts are shown on
// each table when `seated` (table id → number) is given.
function renderSvg(plan, items, { widthPx = 900, seated = {} } = {}) {
  const W = Math.max(10, plan.width_ft), H = Math.max(10, plan.height_ft);
  const heightPx = Math.round(widthPx * (H / W));
  const grid = [];
  const step = W > 150 ? 10 : 5;
  for (let x = 0; x <= W; x += step) grid.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" />`);
  for (let y = 0; y <= H; y += step) grid.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" />`);
  const font = Math.max(0.9, Math.min(W, H) / 45);
  // Same drawing order as the editor: areas, then floors, then tables, then labels.
  const LAYER = { tent: 0, gazebo: 0, zone: 0, aisle: 0, dancefloor: 1, stage: 1, chairs: 1, lounge: 1, label: 3 };
  const layer = (t) => LAYER[t] ?? 2;
  const shapes = [...items].sort((a, b) => layer(a.type) - layer(b.type)).map(it => {
    const def = ELEMENT_TYPES[it.type] || ELEMENT_TYPES.zone;
    const t = `translate(${it.x} ${it.y}) rotate(${it.rotation})`;
    const hw = it.w / 2, hh = it.h / 2;
    let body;
    if (def.shape === 'ellipse') body = `<ellipse rx="${hw}" ry="${hh}" class="${def.table ? 'tbl' : 'fx'}" />`;
    else if (def.shape === 'outline') body = `<rect x="${-hw}" y="${-hh}" width="${it.w}" height="${it.h}" class="ol" />`;
    else if (def.shape === 'rows') {
      const rows = [];
      for (let y = -hh + 1; y < hh; y += 2) rows.push(`<line x1="${-hw}" y1="${y}" x2="${hw}" y2="${y}" class="row" />`);
      body = `<rect x="${-hw}" y="${-hh}" width="${it.w}" height="${it.h}" class="ol" />${rows.join('')}`;
    } else if (def.shape === 'text') body = '';
    else body = `<rect x="${-hw}" y="${-hh}" width="${it.w}" height="${it.h}" class="${def.table ? 'tbl' : 'fx'}" />`;
    const name = it.label || (def.table ? '' : def.label);
    const sub = def.table ? `${seated[it.id] || 0}/${it.seats}` : (it.type === 'chairs' ? `${it.seats} chairs` : '');
    // Text stays upright whatever the element's rotation.
    const text = `<g transform="translate(${it.x} ${it.y})">`
      + (name ? `<text y="${sub ? -font * 0.2 : font * 0.35}" font-size="${font}" class="lbl">${esc(name)}</text>` : '')
      + (sub ? `<text y="${font * 1.0}" font-size="${font * 0.8}" class="sub">${esc(sub)}</text>` : '')
      + '</g>';
    return `<g transform="${t}">${body}</g>${text}`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${W + 2} ${H + 2}" width="${widthPx}" height="${heightPx}" role="img" aria-label="${esc(plan.name)}">
<style>.g line{stroke:#e5e7eb;stroke-width:0.08}.tbl{fill:#fff;stroke:#334155;stroke-width:0.18}.fx{fill:#f1f5f9;stroke:#64748b;stroke-width:0.15}.ol{fill:none;stroke:#64748b;stroke-width:0.18;stroke-dasharray:0.8 0.5}.row{stroke:#94a3b8;stroke-width:0.12}.lbl{text-anchor:middle;font-family:Helvetica,Arial,sans-serif;fill:#0f172a;font-weight:600}.sub{text-anchor:middle;font-family:Helvetica,Arial,sans-serif;fill:#475569}</style>
<rect x="0" y="0" width="${W}" height="${H}" fill="#fff" stroke="#94a3b8" stroke-width="0.2" />
<g class="g">${grid.join('')}</g>
${shapes.join('\n')}
</svg>`;
}

module.exports = { ELEMENT_TYPES, isTable, cleanItems, summarize, renderSvg };
