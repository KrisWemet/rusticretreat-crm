#!/usr/bin/env node
/**
 * One-time Stripe webhook setup.
 * Run this ONCE from your local machine (where internet access is available):
 *   node setup-stripe-webhook.js <your-server-url>
 *
 * Example:
 *   node setup-stripe-webhook.js https://crm.rusticretreat.com
 *
 * For LOCAL development, skip this and use the Stripe CLI instead:
 *   stripe listen --forward-to localhost:3001/api/payments/webhook
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const serverUrl = process.argv[2];
if (!serverUrl) {
  console.error('Usage: node setup-stripe-webhook.js <server-url>');
  console.error('Example: node setup-stripe-webhook.js https://crm.rusticretreat.com');
  console.error('\nFor local dev, use: stripe listen --forward-to localhost:3001/api/payments/webhook');
  process.exit(1);
}

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

(async () => {
  const webhookUrl = `${serverUrl.replace(/\/$/, '')}/api/payments/webhook`;
  console.log(`Creating webhook for: ${webhookUrl}`);

  try {
    // Check for an existing identical webhook and delete it first
    const existing = await stripe.webhookEndpoints.list({ limit: 20 });
    for (const w of existing.data) {
      if (w.url === webhookUrl) {
        console.log(`Deleting existing webhook: ${w.id}`);
        await stripe.webhookEndpoints.del(w.id);
      }
    }

    const webhook = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: ['checkout.session.completed'],
      description: 'Rustic Retreat CRM — auto-marks invoices paid on card payment',
    });

    console.log('\n✓ Webhook created!');
    console.log('  ID:', webhook.id);
    console.log('  URL:', webhook.url);
    console.log('  Signing secret:', webhook.secret);

    // Update .env with the signing secret
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      let env = fs.readFileSync(envPath, 'utf8');
      env = env.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m, `STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
      fs.writeFileSync(envPath, env);
      console.log('\n✓ .env updated with STRIPE_WEBHOOK_SECRET');
    } else {
      console.log('\n  Add this to server/.env:');
      console.log(`  STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
    }

    console.log('\nRestart the server to pick up the new config.');
  } catch (err) {
    console.error('Stripe error:', err.message);
    process.exit(1);
  }
})();
