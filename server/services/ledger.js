const db = require("../db");
const { albertaToday } = require("./schedule");
const cents = (n) => Math.round(Number(n) * 100);
const money = (n) => Math.round(n) / 100;

// Compatibility for old paid rows, including imported records. Preserve unknown dates.
function adoptLegacy(invoice) {
  if (
    invoice.paid &&
    invoice.amount > 0 &&
    !db
      .prepare("SELECT 1 FROM payment_entries WHERE invoice_id = ?")
      .get(invoice.id)
  ) {
    db.prepare(
      `INSERT INTO payment_entries (invoice_id, amount_cents, kind, received_at, method, reference, reason, idempotency_key)
      VALUES (?, ?, 'legacy', ?, ?, ?, 'Imported existing paid invoice', ?)`,
    ).run(
      invoice.id,
      cents(invoice.amount),
      invoice.paid_at,
      invoice.payment_method,
      invoice.payment_reference,
      `legacy:${invoice.id}`,
    );
  }
}
function invoiceView(invoice) {
  if (!invoice) return null;
  adoptLegacy(invoice);
  const p = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents),0) AS paid, COUNT(*) AS count FROM payment_entries WHERE invoice_id = ?",
    )
    .get(invoice.id);
  const balance = money(cents(invoice.amount) - p.paid);
  return {
    ...invoice,
    amount_paid: money(p.paid),
    balance,
    has_payments: p.count > 0,
    paid: balance <= 0 ? 1 : 0,
  };
}
function statement(coupleId) {
  const invoices = db
    .prepare("SELECT * FROM invoices WHERE couple_id = ?")
    .all(coupleId)
    .map(invoiceView);
  const total = invoices.reduce((n, i) => n + cents(i.amount), 0);
  const paid = invoices.reduce((n, i) => n + cents(i.amount_paid), 0);
  return {
    total: money(total),
    paid: money(paid),
    balance: money(total - paid),
  };
}
function bookingView(booking) {
  if (!booking) return null;
  const invoices = db
    .prepare("SELECT * FROM invoices WHERE couple_id = ?")
    .all(booking.couple_id)
    .map(invoiceView);
  const st = statement(booking.couple_id);
  const overdue = invoices.some(
    (i) => i.balance > 0 && i.due_date && i.due_date < albertaToday(),
  );
  return {
    ...booking,
    invoiced_total: st.total,
    paid_total: st.paid,
    outstanding_balance: st.balance,
    deposit_paid: money(
      invoices
        .filter((i) => /deposit/i.test(i.description))
        .reduce((n, i) => n + cents(i.amount_paid), 0),
    ),
    payment_schedule_missing: !invoices.length,
    payment_status: !invoices.length
      ? "pending"
      : st.balance <= 0
        ? "paid"
        : overdue
          ? "overdue"
          : st.paid > 0
            ? "partial"
            : "pending",
  };
}
function syncInvoice(id) {
  const inv = invoiceView(
    db.prepare("SELECT * FROM invoices WHERE id = ?").get(id),
  );
  db.prepare(
    "UPDATE invoices SET paid = ?, paid_at = CASE WHEN ? THEN COALESCE(paid_at, ?) ELSE NULL END WHERE id = ?",
  ).run(
    inv.paid,
    inv.paid,
    db
      .prepare(
        "SELECT received_at FROM payment_entries WHERE invoice_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(id)?.received_at || null,
    id,
  );
  return invoiceView(db.prepare("SELECT * FROM invoices WHERE id = ?").get(id));
}
function record(invoiceId, input, userId) {
  return db.transaction(() => {
    const invoice = invoiceView(
      db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId),
    );
    if (!invoice)
      throw Object.assign(new Error("Invoice not found"), { status: 404 });
    const key = input.idempotency_key || null;
    if (key) {
      const existing = db
        .prepare("SELECT * FROM payment_entries WHERE idempotency_key = ?")
        .get(key);
      if (existing) {
        if (
          existing.invoice_id !== Number(invoiceId) ||
          existing.amount_cents !== cents(input.amount)
        )
          throw new Error(
            "Payment reference has already been used for another entry",
          );
        return { entry: existing, invoice, duplicate: true };
      }
    }
    const amount = cents(input.amount);
    if (
      !Number.isFinite(Number(input.amount)) ||
      !Number.isSafeInteger(amount) ||
      !amount
    )
      throw new Error("Enter a valid payment amount");
    if (amount < 0 && -amount > cents(invoice.amount_paid))
      throw new Error("A refund or reversal cannot exceed money received");
    if (amount < 0 && !String(input.reason || "").trim())
      throw new Error("A reason is required for a refund or reversal");
    const at = input.received_at || albertaToday();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(at) ||
      new Date(at + "T00:00:00Z").toISOString().slice(0, 10) !== at
    )
      throw new Error("Enter a real payment date");
    const kind =
      amount > 0
        ? "receipt"
        : input.kind === "reversal"
          ? "reversal"
          : "refund";
    const r = db
      .prepare(
        `INSERT INTO payment_entries (invoice_id, amount_cents, kind, received_at, method, reference, reason, user_id, idempotency_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        invoice.id,
        amount,
        kind,
        at,
        input.method || "E-Transfer",
        input.reference || null,
        input.reason || null,
        userId || null,
        key,
      );
    db.prepare(
      "UPDATE invoices SET payment_method = ?, payment_reference = ? WHERE id = ?",
    ).run(input.method || "E-Transfer", input.reference || null, invoice.id);
    const updated = syncInvoice(invoice.id);
    return {
      entry: db
        .prepare("SELECT * FROM payment_entries WHERE id = ?")
        .get(r.lastInsertRowid),
      invoice: updated,
      duplicate: false,
    };
  })();
}
module.exports = { cents, money, invoiceView, bookingView, statement, record };
