const db = require('../db');
const email = require('./email');

async function checkAndSendReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const unpaid = db.prepare(`
    SELECT i.*, c.email, c.partner1_name, c.partner2_name
    FROM invoices i
    JOIN couples c ON c.id = i.couple_id
    WHERE i.paid = 0
      AND i.due_date IS NOT NULL
      AND c.email IS NOT NULL
  `).all();

  let sent = 0;
  for (const invoice of unpaid) {
    const dueDate = new Date(invoice.due_date + 'T00:00:00');
    const msUntilDue = dueDate.getTime() - today.getTime();
    const daysUntilDue = Math.round(msUntilDue / 86400000);

    if (daysUntilDue < 0 || daysUntilDue > 14) continue;

    const coupleNames = `${invoice.partner1_name} & ${invoice.partner2_name}`;
    const formattedDate = dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const payload = { to: invoice.email, coupleNames, description: invoice.description, amount: invoice.amount, dueDate: formattedDate, daysUntilDue };

    if (daysUntilDue <= 1 && !invoice.reminder_1d_sent) {
      await email.sendPaymentReminder(payload);
      db.prepare('UPDATE invoices SET reminder_1d_sent = 1 WHERE id = ?').run(invoice.id);
      sent++;
    } else if (daysUntilDue <= 7 && !invoice.reminder_7d_sent) {
      await email.sendPaymentReminder(payload);
      db.prepare('UPDATE invoices SET reminder_7d_sent = 1 WHERE id = ?').run(invoice.id);
      sent++;
    } else if (daysUntilDue <= 14 && !invoice.reminder_14d_sent) {
      await email.sendPaymentReminder(payload);
      db.prepare('UPDATE invoices SET reminder_14d_sent = 1 WHERE id = ?').run(invoice.id);
      sent++;
    }
  }

  console.log(`[PaymentReminder] Checked ${unpaid.length} invoices, sent ${sent} reminders`);
}

function startReminderScheduler() {
  checkAndSendReminders().catch(err => console.error('[PaymentReminder]', err.message));
  const timer = setInterval(() => {
    checkAndSendReminders().catch(err => console.error('[PaymentReminder]', err.message));
  }, 24 * 60 * 60 * 1000);
  timer.unref();
}

module.exports = { startReminderScheduler };
