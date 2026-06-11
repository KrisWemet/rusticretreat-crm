const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
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
