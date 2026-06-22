const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateCouple } = require('../middleware/auth');
const invoices = require('./invoices');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const stripe = STRIPE_SECRET ? require('stripe')(STRIPE_SECRET) : null;

// Is card payment available? The portal uses this to show/hide the Pay button.
router.get('/config', (req, res) => {
  res.json({
    enabled: !!stripe,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
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

  let event = req.body;
  if (STRIPE_WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('[stripe webhook signature]', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  } else {
    // No signing secret configured — parse the raw body best-effort (dev only).
    try { event = JSON.parse(req.body.toString()); } catch (_) {}
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const invoiceId = session.metadata && session.metadata.invoice_id;
    if (invoiceId) invoices.markInvoicePaid(invoiceId, true, 'Credit Card');
  }
  res.json({ received: true });
}

module.exports = router;
module.exports.webhookHandler = webhookHandler;
