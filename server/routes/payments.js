const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateCouple, authenticateToken, requireAdmin } = require('../middleware/auth');
const card = require('../services/cardPayments');
const rateLimit = require('../middleware/rateLimit');
const { logActivity } = require('../services/activity');
const invoices = require('./invoices');
const { ETRANSFER_EMAIL } = require('../venue');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const stripe = STRIPE_SECRET ? require('stripe')(STRIPE_SECRET) : null;

// Is card payment available? The portal uses this to show/hide the Pay button.
router.get('/config', (req, res) => {
  res.json({
    enabled: !!stripe,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    // The portal shows this to couples as the e-Transfer recipient. Served from
    // the same constant the contract prints so the two cannot drift apart.
    etransferEmail: ETRANSFER_EMAIL,
  });
});

// ── Couple: start a Stripe Checkout session for one of their invoices ─────────
router.post('/checkout/:invoiceId', authenticateCouple, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Online card payment is not enabled. Please use Interac e-Transfer.' });
  }
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.invoiceId);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  if (invoice.couple_id !== req.couple.coupleId) return res.status(403).json({ error: 'Not your invoice' });
  if (invoice.paid) return res.status(400).json({ error: 'This invoice is already paid' });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'cad',
          unit_amount: Math.round(invoice.amount * 100),
          product_data: { name: `Rustic Retreat — ${invoice.description}` },
        },
      }],
      metadata: { invoice_id: String(invoice.id) },
      success_url: `${BASE_URL}/portal/payments?paid=1`,
      cancel_url: `${BASE_URL}/portal/payments?cancelled=1`,
    });
    db.prepare('UPDATE invoices SET stripe_session_id = ? WHERE id = ?').run(session.id, invoice.id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe checkout error]', err.message);
    res.status(500).json({ error: 'Could not start payment session' });
  }
});

// ── Stripe webhook — marks the invoice paid once payment completes ────────────
// Mounted in index.js with a raw body parser so signatures verify.
function webhookHandler(req, res) {
  if (!stripe) return res.status(503).end();

  // This endpoint is necessarily public (Stripe cannot present a cookie or a
  // JWT), and it marks invoices paid — so an unsigned body is never trusted.
  // Without a signing secret anyone could POST a forged checkout.session.completed
  // and zero out a real invoice, so fail closed instead of best-effort parsing.
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe webhook] rejected: STRIPE_WEBHOOK_SECRET is not set');
    return res.status(503).end();
  }

  let event;
  const sig = req.headers['stripe-signature'];
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook signature]', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata && session.metadata.invoice_id;
    if (invoiceId) {
      // The card fee is charged on top of the invoice, so it is kept apart
      // from what was owed (Stripe reports it in cents).
      const fee = Number(session.metadata.card_fee_cents || 0) / 100;
      const result = invoices.markInvoicePaid(invoiceId, true, 'Credit card',
        { reference: session.payment_intent ? String(session.payment_intent) : undefined });
      if (result && fee > 0) db.prepare('UPDATE invoices SET card_fee = ? WHERE id = ?').run(fee, invoiceId);
    }
  }
  res.json({ received: true });
}

// ── Staff: card payment settings and an invoice's pay link ───────────────────
router.get('/card-settings', authenticateToken, (req, res) => {
  res.json({ enabled: card.enabled(), fee_pct: card.feePct(), max_fee_pct: card.MAX_FEE_PCT });
});

router.put('/card-settings', authenticateToken, requireAdmin, (req, res) => {
  try {
    const before = card.feePct();
    const pct = card.setFeePct(req.body?.fee_pct);
    logActivity(req, { action: 'settings.card_fee', entity: 'settings', summary: `Changed the card fee from ${before}% to ${pct}%` });
    res.json({ enabled: card.enabled(), fee_pct: pct, max_fee_pct: card.MAX_FEE_PCT });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/invoice/:id/pay-link', authenticateToken, (req, res) => {
  const inv = db.prepare('SELECT id, paid FROM invoices WHERE id = ?').get(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.paid) return res.status(400).json({ error: 'This invoice is already paid' });
  res.json({ url: card.payUrlFor(inv.id), card_enabled: card.enabled() });
});

// ── Public: an invoice's private pay link (no login) ─────────────────────────
const payLimit = rateLimit({ windowMs: 900000, max: 120, name: 'pay-link' });
const checkoutLimit = rateLimit({ windowMs: 900000, max: 15, name: 'pay-checkout' });
const NOT_FOUND = 'This payment link is not valid. Please contact Rustic Retreat.';

router.get('/public/:token', payLimit, (req, res) => {
  const inv = card.invoiceForToken(req.params.token);
  if (!inv) return res.status(404).json({ error: NOT_FOUND });
  const items = require('../services/extras').itemsFor(inv.id).map(l => ({ label: l.label, quantity: l.quantity, amount: l.amount, kind: l.kind }));
  res.json({
    couple: `${inv.partner1_name} & ${inv.partner2_name}`,
    description: inv.description, due_date: inv.due_date, paid: !!inv.paid, paid_at: inv.paid_at, items,
    etransfer_email: ETRANSFER_EMAIL,
    card: { enabled: card.enabled() && inv.couple_status !== 'cancelled', ...card.cardQuote(inv.amount) },
  });
});

router.post('/public/:token/checkout', checkoutLimit, async (req, res) => {
  const inv = card.invoiceForToken(req.params.token);
  if (!inv) return res.status(404).json({ error: NOT_FOUND });
  if (inv.paid) return res.status(400).json({ error: 'This invoice is already paid. Thank you!' });
  if (!stripe || !card.enabled()) return res.status(503).json({ error: 'Card payment is not available. Please pay by Interac e-Transfer.' });
  const q = card.cardQuote(inv.amount);
  try {
    const lineItems = [{ quantity: 1, price_data: { currency: 'cad', unit_amount: Math.round(q.amount * 100),
      product_data: { name: `Rustic Retreat: ${inv.description}` } } }];
    if (q.fee > 0) lineItems.push({ quantity: 1, price_data: { currency: 'cad', unit_amount: Math.round(q.fee * 100),
      product_data: { name: `Credit card fee (${q.fee_pct}%)`, description: 'Pay by Interac e-Transfer to avoid this fee.' } } });
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      metadata: { invoice_id: String(inv.id), card_fee_cents: String(Math.round(q.fee * 100)) },
      success_url: `${card.payUrl(inv.pay_token)}?paid=1`,
      cancel_url: `${card.payUrl(inv.pay_token)}?cancelled=1`,
    });
    db.prepare('UPDATE invoices SET stripe_session_id = ? WHERE id = ?').run(session.id, inv.id);
    res.json({ url: session.url });
  } catch (err) {
    console.error('[stripe checkout error]', err.message);
    res.status(500).json({ error: 'Could not start the card payment. Please try again, or pay by e-Transfer.' });
  }
});

module.exports = router;
module.exports.webhookHandler = webhookHandler;
