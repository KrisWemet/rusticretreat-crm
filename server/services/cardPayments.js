// Paying an invoice by card, with the card fee passed on (owner, Nov 2026).
//
// e-Transfer stays the preferred, free way to pay. A couple who wants to pay by
// card opens the invoice's private link (no login: the portal is off), sees the
// card fee as its own line, and pays through Stripe Checkout. Card payment is
// switched on only when STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set in
// Railway; until then the link still shows the invoice and the e-Transfer
// details.
//
// Canadian card-network rules (Visa and Mastercard, since Oct 2022) cap a
// credit-card surcharge at 2.4%, forbid surcharging debit cards, and require
// the merchant to notify the networks and their processor 30 days before
// starting. The CRM enforces the cap; the notice is the owner's to give.

const crypto = require('crypto');
const db = require('../db');

const MAX_FEE_PCT = 2.4;
const DEFAULT_FEE_PCT = 2.4;
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const baseUrl = () => (process.env.BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');

const enabled = () => !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);

function feePct() {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'card_fee_pct'").get();
  const n = row ? Number(row.value) : DEFAULT_FEE_PCT;
  return Number.isFinite(n) && n >= 0 && n <= MAX_FEE_PCT ? n : DEFAULT_FEE_PCT;
}

function setFeePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error('The card fee must be a percentage of 0 or more');
  if (n > MAX_FEE_PCT) throw new Error(`Card rules in Canada cap the fee at ${MAX_FEE_PCT}%`);
  db.prepare("INSERT INTO app_settings (key, value) VALUES ('card_fee_pct', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(r2(n)));
  return r2(n);
}

// What paying this invoice by card costs: the invoice plus the fee line.
function cardQuote(amount, pct = feePct()) {
  const fee = r2(Number(amount) * pct / 100);
  return { amount: r2(amount), fee_pct: pct, fee, total: r2(Number(amount) + fee) };
}

// The invoice's private pay link, made the first time it is asked for.
function ensureToken(invoiceId) {
  const inv = db.prepare('SELECT id, pay_token FROM invoices WHERE id = ?').get(invoiceId);
  if (!inv) return null;
  if (inv.pay_token) return inv.pay_token;
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE invoices SET pay_token = ? WHERE id = ?').run(token, inv.id);
  return token;
}

const payUrl = (token) => `${baseUrl()}/pay/${token}`;
const payUrlFor = (invoiceId) => { const t = ensureToken(invoiceId); return t ? payUrl(t) : null; };

function invoiceForToken(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  return db.prepare(`SELECT i.*, c.partner1_name, c.partner2_name, c.status AS couple_status
    FROM invoices i JOIN couples c ON c.id = i.couple_id WHERE i.pay_token = ?`).get(token) || null;
}

module.exports = { MAX_FEE_PCT, enabled, feePct, setFeePct, cardQuote, ensureToken, payUrl, payUrlFor, invoiceForToken, r2 };
