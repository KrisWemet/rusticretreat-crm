const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

const IS_PROD = process.env.NODE_ENV === 'production';
const BOOTED_AT = new Date();

// Trust exactly one proxy hop (Railway/Vercel/Fly all sit in front of us) so
// req.ip is the proxy-validated client address rather than a client-supplied
// X-Forwarded-For value. The rate limiters key on req.ip.
app.set('trust proxy', 1);

// ── Preview gate ─────────────────────────────────────────────────────────────
// While the CRM is deployed for private testing, CRM_GATE_KEY puts a shared
// secret in front of the whole app: without the cookie every path 404s, so the
// host looks empty to a scanner and nothing — not the login page, not the JS
// bundle, not any /api route — is reachable.
//
// This FAILS CLOSED. An unset key in production is a hard boot error rather
// than an open door, because the ordinary ways a variable goes missing (a new
// environment, a preview deploy, a renamed service, a typo) would otherwise
// silently publish an app whose seeded admin password is in public git history.
if (IS_PROD && !process.env.CRM_GATE_KEY && process.env.CRM_PUBLIC === '1') {
  console.warn('[gate] CRM_PUBLIC=1 — preview gate disabled, app is publicly reachable');
} else if (IS_PROD && !process.env.CRM_GATE_KEY) {
  throw new Error(
    'CRM_GATE_KEY is required in production. Set it to a random secret ' +
    '(openssl rand -hex 24), or set CRM_PUBLIC=1 to intentionally go public.'
  );
}

const GATE_KEY = process.env.CRM_GATE_KEY;
if (GATE_KEY && GATE_KEY.length < 16) {
  throw new Error('CRM_GATE_KEY must be at least 16 characters');
}
if (GATE_KEY && /[$][{(]/.test(GATE_KEY)) {
  throw new Error('CRM_GATE_KEY looks like an un-evaluated shell expression — paste the generated value, not the command');
}

// Paths the gate must let through, because the people who use them are not
// staff and will never hold the cookie.
//
// A contract signing link is emailed to a couple. Before this list existed the
// gate answered them with "Not found" — the link worked perfectly for staff,
// whose browser already had the cookie, and was a dead end for every couple it
// was actually sent to. The same applied to proposal links and the public
// enquiry form.
//
// The built assets have to be here too: these pages are served by the SPA
// shell, so blocking /assets would leave the couple staring at a blank page
// having fetched an HTML file it could not run. Those files are client-side
// bundles with no secrets in them; the gate exists to keep the CRM itself
// unbrowsable, and the app root, the login page and every authenticated route
// stay behind it.
//
// Each of these paths carries its own protection: signing and proposal links
// require an unguessable token, and the enquiry form is rate-limited.
const PUBLIC_PATHS = [
  /^\/api\/health$/,                 // platform healthcheck — probers send no cookies
  /^\/api\/payments\/webhook$/,      // Stripe authenticates by signature instead
  /^\/api\/sms\/inbound$/,           // the SMS provider signs its webhooks too
  /^\/sign\//,                       // couple opening their contract signing link
  /^\/api\/contracts\/sign\//,       // …and the API that page calls, incl. /print
  /^\/proposal\//,                   // couple reviewing a proposal
  /^\/api\/proposals\/public\//,
  /^\/inquire\/?$/,                  // public enquiry form
  /^\/api\/inquire/,
  /^\/assets\//,                     // JS/CSS the above pages need to render
  /^\/favicon\.(ico|svg|png)$/,
];

app.use((req, res, next) => {
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (!GATE_KEY) return next();

  if (PUBLIC_PATHS.some(p => p.test(req.path))) return next();

  const cookies = req.headers.cookie || '';
  if (cookies.split(';').some(c => c.trim() === 'crm_gate=' + GATE_KEY)) return next();

  if (req.query.gate === GATE_KEY) {
    res.setHeader('Set-Cookie',
      `crm_gate=${GATE_KEY}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
    // Normalise before redirecting: req.path preserves a leading '//', and a
    // protocol-relative Location would send the browser to another site.
    return res.redirect('/' + req.path.replace(/^\/+/, ''));
  }
  return res.status(404).send('Not found');
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.BASE_URL
    : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
// Stripe webhook needs the raw body for signature verification — mount it
// BEFORE the JSON body parser.
const { webhookHandler } = require('./routes/payments');
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookHandler);
// Same reasoning for inbound SMS: the signature covers the bytes as sent, so
// the body must not be parsed and re-serialised first. type '*/*' because the
// two supported providers disagree — Telnyx posts JSON, Twilio form-encoded.
const { inboundHandler } = require('./routes/sms');
app.post('/api/sms/inbound', express.raw({ type: '*/*' }), inboundHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database
require('./db');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/couples', require('./routes/couples'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/checklist', require('./routes/checklist'));
app.use('/api/guests', require('./routes/guests'));
app.use('/api/budget', require('./routes/budget'));
app.use('/api/vendors', require('./routes/vendors'));
app.use('/api/timeline', require('./routes/timeline'));
app.use('/api/portal', require('./routes/portal'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/contracts', require('./routes/contracts'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/inquire', require('./routes/inquire'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/packages', require('./routes/packages'));
app.use('/api/tours', require('./routes/tours'));
app.use('/api/addons', require('./routes/addons'));
app.use('/api/proposals', require('./routes/proposals'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/backup', require('./routes/backup'));

// Start background schedulers
require('./services/paymentReminder').startReminderScheduler();
require('./services/leadNurture').startLeadNurtureScheduler();
require('./services/backup').startBackupScheduler();

// Health check. Must be registered BEFORE the production SPA catch-all below —
// Express matches in registration order, so app.get('*') would otherwise shadow
// it and return index.html with a 200, making the platform healthcheck pass even
// when every API router is broken.
app.get('/api/health', (req, res) => {
  // uptime_seconds makes a crash loop visible from the outside: if this keeps
  // resetting to a few seconds, the process is dying and being restarted, which
  // is what a 502 on every page actually means.
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.round(process.uptime()),
    booted_at: BOOTED_AT.toISOString(),
  });
});

// Unmatched /api paths must 404 as JSON. Without this the SPA catch-all answers
// them with the HTML shell and a 200, so a typo'd endpoint surfaces as a JSON
// parse error in the client instead of an honest 404.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve built React frontend in production
if (IS_PROD) {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ── Last-resort crash guards ─────────────────────────────────────────────────
// Node kills the process on an unhandled promise rejection, and Express 4 does
// not catch a rejected async route handler — so one failed email inside one
// request could take the whole CRM offline, and every page would answer 502
// until the platform noticed and restarted it. That has happened.
//
// Individual handlers still catch their own errors; this only stops a miss from
// being fatal. Both are logged loudly and prefixed so they are findable in the
// deploy log, because a swallowed crash that nobody can see is its own problem.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL-GUARD] Unhandled promise rejection — request failed, server kept running');
  console.error(reason instanceof Error ? reason.stack : reason);
});

process.on('uncaughtException', (err) => {
  // Node's own advice is to exit here, on the grounds that state may be
  // corrupt. For this app the realistic source is an async callback in one
  // request, and taking a venue's entire CRM offline is the worse failure —
  // Railway would restart it, but only after every page has been dead for a
  // while. Log it as needing investigation and stay up.
  console.error('[FATAL-GUARD] Uncaught exception — server kept running, investigate this');
  console.error(err?.stack || err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Rustic Retreat CRM server running on port ${PORT}`);
});

module.exports = app;
