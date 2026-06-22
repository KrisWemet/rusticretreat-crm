const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

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

// Start background schedulers
require('./services/paymentReminder').startReminderScheduler();
require('./services/leadNurture').startLeadNurtureScheduler();

// Serve built React frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Rustic Retreat CRM server running on port ${PORT}`);
});

module.exports = app;
