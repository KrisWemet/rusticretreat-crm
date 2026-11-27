// The refundable damage deposit, as Section 4.2 of the rental agreement sets
// it out: $1,000 due at check-in (e-Transfer is the agreement's payment
// method), fully refundable subject to a post-event inspection within 48 hours
// of check-out, with deductions only for the listed reasons.
//
// It is held money, not income, so it is never an invoice and never appears in
// the payment or GST reports. Only an amount charged *beyond* the deposit
// becomes an invoice, and only when staff choose to create one.

const db = require('../db');
const { stayFor } = require('./finalDetails');
const { addDays } = require('./planning');
const { albertaToday } = require('./schedule');

const DEFAULT_AMOUNT = 1000;
const INSPECTION_DAYS = 2;   // "within 48 hours of check-out"
const TREE_MINIMUM = 500;    // Section 7.5 / Schedule A: minimum per tree

// The agreement's reasons for a deduction (Section 4.2), plus the Schedule A
// forfeiture for removal from the property.
const CATEGORIES = [
  { key: 'damage', label: 'Damage' },
  { key: 'missing', label: 'Missing items' },
  { key: 'cleaning', label: 'Excessive cleaning' },
  { key: 'extinguisher', label: 'Fire extinguisher discharged (non-emergency)' },
  { key: 'tree', label: 'Tree cut or removed', minimum: TREE_MINIMUM, per: 'tree' },
  { key: 'forfeit', label: 'Forfeited: removal from the property (Schedule A)' },
];
const METHODS = ['e-Transfer', 'Cash', 'Cheque', 'Other'];

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const moneyIn = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? r2(n) : null;
};

// The amount the couple agreed to: the signed rental agreement's own
// "damage deposit" field when there is one, else the agreement's $1,000.
function agreedAmount(coupleId) {
  const row = db.prepare(`SELECT v.value FROM contracts ct JOIN contract_field_values v ON v.contract_id = ct.id AND v.field_key = 'damage_deposit'
    WHERE ct.couple_id = ? ORDER BY (ct.status = 'signed') DESC, ct.id DESC`).get(coupleId);
  const n = row ? moneyIn(row.value) : null;
  return n && n > 0 ? n : DEFAULT_AMOUNT;
}

const parse = (row) => row && ({ ...row, deductions: JSON.parse(row.deductions || '[]') });
const recordFor = (coupleId) => parse(db.prepare('SELECT * FROM damage_deposits WHERE couple_id = ?').get(coupleId));

function ensureRecord(coupleId) {
  let rec = recordFor(coupleId);
  if (!rec) {
    db.prepare('INSERT INTO damage_deposits (couple_id, amount) VALUES (?, ?)').run(coupleId, agreedAmount(coupleId));
    rec = recordFor(coupleId);
  }
  return rec;
}

// Where the deposit stands, and what is owed which way.
function summarize(rec, stay, today = albertaToday()) {
  const expected = rec ? rec.amount : null;
  const received = rec?.received_at ? r2(rec.received_amount ?? rec.amount) : 0;
  const deducted = r2((rec?.deductions || []).reduce((s, d) => s + Number(d.amount || 0), 0));
  const inspected = !!rec?.inspected_at;
  const refundDue = inspected ? r2(Math.max(0, received - deducted)) : null;
  const excess = inspected ? r2(Math.max(0, deducted - received)) : 0;
  const status = !rec?.received_at && !inspected ? 'to_collect'
    : !inspected ? 'held'
    : rec.refunded_at ? 'refunded'
    : refundDue > 0 ? 'refund_due'
    : 'kept';
  const inspectionDue = stay?.check_out ? addDays(stay.check_out, INSPECTION_DAYS) : null;
  return {
    status, expected, received, deducted, kept: inspected ? r2(Math.min(received, deducted)) : 0,
    refund_due: refundDue, refunded: rec?.refunded_at ? r2(rec.refund_amount) : 0, excess,
    inspection_due: inspectionDue,
    inspection_overdue: !inspected && !!inspectionDue && today > inspectionDue,
    closed: status === 'refunded' || status === 'kept',
  };
}

function view(coupleId) {
  const rec = recordFor(coupleId);
  const stay = stayFor(coupleId);
  const invoice = rec?.excess_invoice_id ? db.prepare('SELECT id, amount, due_date, paid FROM invoices WHERE id = ?').get(rec.excess_invoice_id) || null : null;
  return {
    record: rec || null, stay, agreed_amount: rec ? rec.amount : agreedAmount(coupleId),
    ...summarize(rec, stay), excess_invoice: invoice, categories: CATEGORIES, methods: METHODS,
  };
}

// Reads the inspection's deductions. Each needs a reason from the agreement's
// list, what happened, and an amount; a tree is at least $500 each.
function cleanDeductions(list) {
  const out = [], errors = [];
  for (const [i, d] of (Array.isArray(list) ? list : []).entries()) {
    const cat = CATEGORIES.find(c => c.key === d?.category);
    const amount = moneyIn(d?.amount);
    const description = String(d?.description || '').trim().slice(0, 500);
    const quantity = d?.quantity == null || d.quantity === '' ? 1 : Number(d.quantity);
    const n = i + 1;
    if (!cat) { errors.push(`Deduction ${n}: choose a reason`); continue; }
    if (!description) { errors.push(`Deduction ${n}: say what happened, so the couple can see why`); continue; }
    if (amount == null || amount <= 0) { errors.push(`Deduction ${n}: enter an amount`); continue; }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) { errors.push(`Deduction ${n}: the number must be a whole number`); continue; }
    if (cat.minimum && amount < cat.minimum * quantity) {
      errors.push(`Deduction ${n}: the agreement sets at least $${cat.minimum} per ${cat.per} (${quantity} × $${cat.minimum} = $${cat.minimum * quantity})`);
      continue;
    }
    out.push({ category: cat.key, label: cat.label, description, quantity, amount });
  }
  return { deductions: out, errors };
}

// Deposits that need doing something about, for the dashboard and the 7 am
// email: collect at check-in this week, inspect after check-out, send refunds.
// A deposit actually received is never dropped until it is closed; a stay with
// nothing recorded is only chased for two weeks after check-out, so weddings
// from before this was built don't flood the list.
function actionList(today = albertaToday(), weekEnd = addDays(today, 6)) {
  const { defaultEndDate } = require('./bookingRules');
  const rows = db.prepare(`
    SELECT b.couple_id, b.event_date, b.end_date, b.package_name, c.partner1_name, c.partner2_name
    FROM bookings b JOIN couples c ON c.id = b.couple_id
    WHERE c.archived_at IS NULL AND c.status != 'cancelled' AND b.event_date IS NOT NULL
      AND b.id = (SELECT b2.id FROM bookings b2 WHERE b2.couple_id = b.couple_id ORDER BY b2.event_date DESC, b2.id DESC LIMIT 1)
  `).all();
  const collect = [], inspect = [], refund = [];
  for (const b of rows) {
    const checkOut = b.end_date || defaultEndDate(b.event_date, b.package_name) || b.event_date;
    const rec = recordFor(b.couple_id);
    const s = summarize(rec, { check_in: b.event_date, check_out: checkOut }, today);
    const base = { couple_id: b.couple_id, couple_names: `${b.partner1_name} & ${b.partner2_name}`, check_in: b.event_date, check_out: checkOut };
    if (s.status === 'to_collect' && b.event_date <= weekEnd && checkOut >= today) {
      collect.push({ ...base, amount: rec?.amount ?? agreedAmount(b.couple_id), on_site: b.event_date <= today });
    } else if ((s.status === 'held' && checkOut <= today) || (s.status === 'to_collect' && checkOut < today && checkOut >= addDays(today, -14))) {
      inspect.push({ ...base, due: s.inspection_due, overdue: s.inspection_overdue, held: s.received });
    } else if (s.status === 'refund_due') {
      refund.push({ ...base, amount: s.refund_due });
    }
  }
  const byDate = (k) => (a, b) => String(a[k]).localeCompare(String(b[k]));
  return { collect: collect.sort(byDate('check_in')), inspect: inspect.sort(byDate('check_out')), refund: refund.sort(byDate('check_out')) };
}

// Every deposit record, with where it stands, for the Payments page and the
// Reports CSV.
function allDeposits() {
  const rows = db.prepare(`SELECT d.couple_id, c.partner1_name, c.partner2_name FROM damage_deposits d JOIN couples c ON c.id = d.couple_id`).all();
  return rows.map(r => {
    const rec = recordFor(r.couple_id);
    const stay = stayFor(r.couple_id);
    return { couple_id: r.couple_id, couple_names: `${r.partner1_name} & ${r.partner2_name}`, check_in: stay?.check_in || null, check_out: stay?.check_out || null, record: rec, ...summarize(rec, stay) };
  }).sort((a, b) => String(b.check_in || '').localeCompare(String(a.check_in || '')));
}

module.exports = {
  DEFAULT_AMOUNT, INSPECTION_DAYS, TREE_MINIMUM, CATEGORIES, METHODS,
  agreedAmount, recordFor, ensureRecord, summarize, view, cleanDeductions, actionList, allDeposits, moneyIn, isDay, r2,
};
