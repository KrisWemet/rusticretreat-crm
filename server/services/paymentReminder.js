const db = require('../db');
const email = require('./email');

// Reminders go out 14, 7 and 1 day before a payment is due (and on the day,
// if the 1-day one could not be sent). A reminder counts as sent only once the
// email actually went out, so a failed send is retried the next day.
async function checkAndSendReminders() {
  // Days are counted on Alberta dates, not the server's (UTC) clock.
  const today = new Date(require('./schedule').albertaToday() + 'T00:00:00');

  const unpaid = db.prepare(`
    SELECT i.*, c.email, c.partner2_email, c.partner1_name, c.partner2_name
    FROM invoices i
    JOIN couples c ON c.id = i.couple_id
    WHERE i.paid = 0
      AND i.due_date IS NOT NULL
      AND c.email IS NOT NULL
      AND c.status != 'cancelled'
      AND c.archived_at IS NULL
  `).all();

  let sent = 0;
  let failed = 0;
  for (const invoice of unpaid) {
    const dueDate = new Date(invoice.due_date + 'T00:00:00');
    const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
    if (daysUntilDue < 0 || daysUntilDue > 14) continue;

    let flag = null;
    if (daysUntilDue <= 1 && !invoice.reminder_1d_sent) flag = 'reminder_1d_sent';
    else if (daysUntilDue > 1 && daysUntilDue <= 7 && !invoice.reminder_7d_sent) flag = 'reminder_7d_sent';
    else if (daysUntilDue > 7 && !invoice.reminder_14d_sent) flag = 'reminder_14d_sent';
    if (!flag) continue;

    const r = await email.sendPaymentReminder({
      to: [invoice.email, invoice.partner2_email].filter(Boolean),
      coupleId: invoice.couple_id,
      coupleNames: `${invoice.partner1_name} & ${invoice.partner2_name}`,
      description: invoice.description,
      amount: invoice.amount,
      dueDate: dueDate.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' }),
      daysUntilDue,
    });
    if (r && r.delivered) {
      // Earlier reminders that were skipped are not worth sending late.
      const flags = ['reminder_14d_sent', 'reminder_7d_sent', 'reminder_1d_sent'];
      const upTo = flags.slice(0, flags.indexOf(flag) + 1);
      db.prepare(`UPDATE invoices SET ${upTo.map(f => `${f} = 1`).join(', ')} WHERE id = ?`).run(invoice.id);
      sent++;
    } else {
      failed++;
    }
  }

  console.log(`[PaymentReminder] Checked ${unpaid.length} invoices, sent ${sent} reminders${failed ? `, ${failed} failed (will retry)` : ''}`);
  return { sent, failed };
}

module.exports = { checkAndSendReminders };
