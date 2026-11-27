// Extras (the agreement's Section 5 add-ons) and itemised invoices.
//
// Add-on prices are before GST, like package prices, and can differ by wedding
// year (`season_prices`, the same shape packages use). An add-on can carry a
// placeholder price the owner has not set yet: it is never offered to a couple,
// and it cannot be billed until staff type the real price for that line.
//
// An itemised invoice keeps its lines in `invoice_items`; the invoice's own
// `amount` stays the total (GST included, as every invoice in this CRM is), so
// payments, reminders and reports keep working unchanged.

const db = require('../db');
const { parseSeasonPrices, priceFor } = require('./packagePricing');

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const UNIT_TEXT = { flat: 'each', per_guest: 'per guest', per_night: 'per night' };

// An add-on as the API returns it: year prices parsed, flags as booleans, and
// its price for a stay starting on `checkIn` (the default price when unknown).
function presentAddon(a, checkIn = null) {
  if (!a) return a;
  return {
    ...a,
    season_prices: parseSeasonPrices(a.season_prices),
    price_placeholder: !!a.price_placeholder,
    on_final_form: a.on_final_form == null ? true : !!a.on_final_form,
    unit_text: a.unit_label || UNIT_TEXT[a.unit] || 'each',
    year_price: r2(priceFor(a, checkIn)),
  };
}

const catalog = (checkIn = null, { activeOnly = true } = {}) => db.prepare(
  `SELECT * FROM addons ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY name COLLATE NOCASE`).all().map(a => presentAddon(a, checkIn));

// Write an invoice and its lines in one go. `lines` are
// { label, quantity, unit_price, amount, addon_id?, kind? }; the total is the
// sum of the lines, so the invoice can never disagree with them.
function createItemisedInvoice({ coupleId, bookingId = null, description, dueDate, notes = null, lines }) {
  const total = r2(lines.reduce((s, l) => s + Number(l.amount), 0));
  return db.transaction(() => {
    const id = db.prepare('INSERT INTO invoices (couple_id, booking_id, description, amount, due_date, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(coupleId, bookingId, description, total, dueDate, notes).lastInsertRowid;
    const add = db.prepare(`INSERT INTO invoice_items (invoice_id, addon_id, label, quantity, unit_price, amount, kind, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    lines.forEach((l, i) => add.run(id, l.addon_id || null, String(l.label).slice(0, 300), l.quantity ?? 1, r2(l.unit_price ?? l.amount), r2(l.amount), l.kind || 'item', i));
    return { id, total };
  })();
}

const itemsFor = (invoiceId) => db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY order_index, id').all(invoiceId);

// Lines for many invoices at once, as { invoiceId: [lines] }.
function itemsByInvoice(invoiceIds) {
  const out = {};
  if (!invoiceIds.length) return out;
  const rows = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id IN (${invoiceIds.map(() => '?').join(',')}) ORDER BY invoice_id, order_index, id`).all(...invoiceIds);
  for (const r of rows) (out[r.invoice_id] = out[r.invoice_id] || []).push(r);
  return out;
}

// One line of text per invoice line, for emails and printouts.
const money = (n) => `$${Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function lineText(l) {
  if (l.kind === 'gst') return `${l.label}: ${money(l.amount)}`;
  const qty = Number(l.quantity);
  return qty !== 1 ? `${l.label} × ${Number.isInteger(qty) ? qty : qty.toFixed(2)} @ ${money(l.unit_price)}: ${money(l.amount)}` : `${l.label}: ${money(l.amount)}`;
}

// Read and price extras staff are billing. Each line is an add-on (priced for
// the stay's year unless staff type a price) or a custom line with a label and
// a price. A placeholder price must be overridden.
function cleanExtraLines(input, { checkIn = null } = {}) {
  const lines = [], errors = [];
  const byId = new Map(catalog(checkIn, { activeOnly: false }).map(a => [a.id, a]));
  for (const [i, raw] of (Array.isArray(input) ? input : []).entries()) {
    const n = i + 1;
    const qty = Number(raw?.quantity);
    if (!Number.isFinite(qty) || qty <= 0 || qty > 10000 || r2(qty) !== qty) { errors.push(`Line ${n}: enter a quantity`); continue; }
    const typed = raw?.unit_price === '' || raw?.unit_price == null ? null : Number(raw.unit_price);
    if (typed != null && (!Number.isFinite(typed) || typed < 0 || typed > 100000)) { errors.push(`Line ${n}: the price must be 0 or more`); continue; }
    let label, unitPrice, addonId = null;
    if (raw?.addon_id) {
      const a = byId.get(Number(raw.addon_id));
      if (!a) { errors.push(`Line ${n}: that extra no longer exists`); continue; }
      if (a.price_placeholder && typed == null) { errors.push(`${a.name} still has a placeholder price. Type the price for this line, or set it in Packages & Add-Ons`); continue; }
      label = a.name + (a.unit_label ? ` (${a.unit_label})` : '');
      unitPrice = typed != null ? typed : a.year_price;
      addonId = a.id;
    } else {
      label = String(raw?.label || '').trim();
      if (!label) { errors.push(`Line ${n}: say what it is for`); continue; }
      if (typed == null) { errors.push(`Line ${n}: enter a price`); continue; }
      unitPrice = typed;
    }
    lines.push({ addon_id: addonId, label, quantity: qty, unit_price: r2(unitPrice), amount: r2(qty * unitPrice), kind: 'item' });
  }
  if (!lines.length && !errors.length) errors.push('Add at least one extra');
  return { lines, errors };
}

// The GST line added to a set of before-GST lines.
function withGstLine(lines, gstRate) {
  const subtotal = r2(lines.reduce((s, l) => s + l.amount, 0));
  const gst = r2(subtotal * gstRate / 100);
  return { subtotal, gst, total: r2(subtotal + gst), lines: gst > 0 ? [...lines, { label: `GST ${gstRate}%`, quantity: 1, unit_price: gst, amount: gst, kind: 'gst' }] : lines };
}

module.exports = { presentAddon, catalog, createItemisedInvoice, itemsFor, itemsByInvoice, lineText, cleanExtraLines, withGstLine, r2, UNIT_TEXT };
