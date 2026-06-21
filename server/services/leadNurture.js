const db = require('../db');
const email = require('./email');

// Automated follow-up for cold leads. Leads that sit in 'lead' or 'inquiry'
// without converting get a gentle nudge to the couple at 3 days, and a
// staff alert at 7 days so someone reaches out personally.
async function checkAndNurtureLeads() {
  const leads = db.prepare(`
    SELECT id, partner1_name, partner2_name, email, phone, status,
           nurture_3d_sent, nurture_7d_sent,
           CAST(julianday('now') - julianday(created_at) AS INTEGER) AS days_old
    FROM couples
    WHERE status IN ('lead', 'inquiry')
  `).all();

  let nudged = 0;
  let alerted = 0;
  for (const lead of leads) {
    const coupleNames = `${lead.partner1_name} & ${lead.partner2_name}`;

    if (lead.days_old >= 3 && !lead.nurture_3d_sent && lead.email) {
      await email.sendLeadNurture({ to: lead.email, coupleNames });
      db.prepare('UPDATE couples SET nurture_3d_sent = 1 WHERE id = ?').run(lead.id);
      nudged++;
    }

    if (lead.days_old >= 7 && !lead.nurture_7d_sent) {
      await email.sendColdLeadAdmin({
        coupleNames,
        email: lead.email,
        phone: lead.phone,
        daysOld: lead.days_old,
      });
      db.prepare('UPDATE couples SET nurture_7d_sent = 1 WHERE id = ?').run(lead.id);
      alerted++;
    }
  }

  console.log(`[LeadNurture] Checked ${leads.length} leads, sent ${nudged} nudges, ${alerted} staff alerts`);
}

function startLeadNurtureScheduler() {
  checkAndNurtureLeads().catch(err => console.error('[LeadNurture]', err.message));
  const timer = setInterval(() => {
    checkAndNurtureLeads().catch(err => console.error('[LeadNurture]', err.message));
  }, 24 * 60 * 60 * 1000);
  timer.unref();
}

module.exports = { startLeadNurtureScheduler };
