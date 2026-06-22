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

// Season occupancy — Rustic Retreat sells one wedding per weekend, June–Sept.
router.get('/occupancy', authenticateToken, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  // Saturday of the weekend a given date belongs to (Fri/Sat/Sun → that Sat).
  const weekendSaturday = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const diff = 6 - d.getDay(); // 6 = Saturday
    d.setDate(d.getDate() + diff);
    return d.toISOString().slice(0, 10);
  };

  // Sellable inventory: every Saturday from June 1 to Sept 30 of the year.
  const sellableWeekends = [];
  const cursor = new Date(`${year}-06-01T00:00:00`);
  const seasonEnd = new Date(`${year}-09-30T00:00:00`);
  // advance to the first Saturday
  while (cursor.getDay() !== 6) cursor.setDate(cursor.getDate() + 1);
  while (cursor <= seasonEnd) {
    sellableWeekends.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 7);
  }

  const bookings = db.prepare(`
    SELECT event_date, total_price FROM bookings
    WHERE event_date >= ? AND event_date <= ?
  `).all(`${year}-06-01`, `${year}-09-30`);

  const bookedWeekends = new Set();
  let revenue = 0;
  for (const b of bookings) {
    bookedWeekends.add(weekendSaturday(b.event_date));
    revenue += b.total_price || 0;
  }

  const totalWeekends = sellableWeekends.length;
  const bookedCount = sellableWeekends.filter(w => bookedWeekends.has(w)).length;
  const openWeekends = sellableWeekends.filter(w => !bookedWeekends.has(w));

  res.json({
    year,
    total_weekends: totalWeekends,
    booked_weekends: bookedCount,
    open_weekends: openWeekends.length,
    occupancy_rate: totalWeekends > 0 ? Math.round((bookedCount / totalWeekends) * 100) : 0,
    season_revenue: revenue,
    revenue_per_available_weekend: totalWeekends > 0 ? Math.round(revenue / totalWeekends) : 0,
    open_weekend_dates: openWeekends,
  });
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

// Proposal conversion — how the BEO pipeline is performing.
router.get('/proposals', authenticateToken, (req, res) => {
  const rows = db.prepare(`SELECT status, COUNT(*) as count, COALESCE(SUM(total), 0) as value FROM proposals GROUP BY status`).all();
  const byStatus = Object.fromEntries(rows.map(r => [r.status, r]));
  const get = (s) => byStatus[s] || { count: 0, value: 0 };

  const sent = get('sent'), accepted = get('accepted'), declined = get('declined'), expired = get('expired');
  // Decided = anything that has left the "open" pool
  const decided = accepted.count + declined.count + expired.count;
  const winRate = decided > 0 ? Math.round((accepted.count / decided) * 100) : 0;

  res.json({
    total: rows.reduce((s, r) => s + r.count, 0),
    open_count: sent.count,
    open_value: sent.value,            // outstanding proposals awaiting a decision
    accepted_count: accepted.count,
    accepted_value: accepted.value,    // booked revenue won through proposals
    declined_count: declined.count,
    expired_count: expired.count,
    win_rate: winRate,                 // accepted / (accepted + declined + expired)
  });
});

module.exports = router;
