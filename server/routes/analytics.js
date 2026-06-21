const express = require('express');
const router = express.Router();
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

router.get('/summary', authenticateToken, (req, res) => {
  const revenue = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN paid = 1 THEN amount ELSE 0 END), 0) as collected,
      COALESCE(SUM(CASE WHEN paid = 0 THEN amount ELSE 0 END), 0) as outstanding
    FROM invoices
  `).get();

  const ytd = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as ytd
    FROM invoices
    WHERE paid = 1 AND strftime('%Y', paid_at) = strftime('%Y', 'now')
  `).get();

  const avgDeal = db.prepare(`
    SELECT COALESCE(AVG(total_price), 0) as avg
    FROM bookings WHERE total_price > 0
  `).get();

  const statusCounts = db.prepare(`SELECT status, COUNT(*) as count FROM couples GROUP BY status`).all();
  const counts = Object.fromEntries(statusCounts.map(r => [r.status, r.count]));
  const booked = (counts.booked || 0) + (counts.completed || 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const overdue = db.prepare(`
    SELECT COUNT(*) as count FROM invoices WHERE paid = 0 AND due_date < date('now')
  `).get();

  res.json({
    revenue_ytd: ytd.ytd,
    revenue_collected: revenue.collected,
    revenue_outstanding: revenue.outstanding,
    avg_deal_size: avgDeal.avg,
    total_couples: total,
    total_booked: booked,
    conversion_rate: total > 0 ? Math.round((booked / total) * 100) : 0,
    overdue_invoices: overdue.count,
  });
});

router.get('/revenue', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT strftime('%Y-%m', paid_at) as month, SUM(amount) as revenue, COUNT(*) as payments
    FROM invoices
    WHERE paid = 1 AND paid_at >= date('now', '-12 months')
    GROUP BY month ORDER BY month ASC
  `).all();
  res.json(rows);
});

router.get('/funnel', authenticateToken, (req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) as count FROM couples GROUP BY status`).all();
  const map = Object.fromEntries(rows.map(r => [r.status, r.count]));
  res.json({
    lead: map.lead || 0,
    inquiry: map.inquiry || 0,
    booked: map.booked || 0,
    completed: map.completed || 0,
    cancelled: map.cancelled || 0,
  });
});

router.get('/referrals', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT COALESCE(referral_source, 'Not specified') as source, COUNT(*) as count
    FROM couples GROUP BY source ORDER BY count DESC
  `).all();
  res.json(rows);
});

router.get('/packages', authenticateToken, (req, res) => {
  const rows = db.prepare(`
    SELECT COALESCE(package_name, 'Unknown') as package_name,
           COUNT(*) as bookings, SUM(total_price) as revenue, AVG(total_price) as avg_price
    FROM bookings WHERE total_price > 0
    GROUP BY package_name ORDER BY revenue DESC
  `).all();
  res.json(rows);
});

module.exports = router;
