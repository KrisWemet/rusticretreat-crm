// The instalment plan every invoice, proposal and contract printout uses.
//
// It must match Section 4 of the venue agreement the couple signs
// (contract-templates/rental-agreement-2027.js, paymentSchedule):
//   Initial deposit   25%   due upon signing
//   2nd payment       25%   180 days before check-in
//   Balance           50%    90 days before check-in
// Before this module the CRM invoiced three different ways (90/30 days, a
// single balance at 30 days) while the signed agreement said 180/90.

const DAY_MS = 86400000;
const SECOND_DAYS = 180;
const BALANCE_DAYS = 90;

const round2 = n => Math.round(n * 100) / 100;

function isoDay(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDays(iso, days) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @param total        GST-inclusive total
 * @param checkIn      first day of the booking (YYYY-MM-DD), or null if undated
 * @param depositDue   when the deposit is due (YYYY-MM-DD); defaults to today
 * @param depositPct   deposit percentage (proposals let staff change it; 25 by default)
 * @returns [{ key, label, pct, amount, due_date }] — amounts sum exactly to total
 */
function buildPaymentSchedule({ total, checkIn = null, depositDue = null, depositPct = 25 }) {
  const today = new Date().toISOString().slice(0, 10);
  const depDue = isoDay(depositDue) || today;
  const start = isoDay(checkIn);

  const deposit = round2(total * depositPct / 100);
  const second = round2(total * 0.25);
  const balance = round2(total - deposit - second);

  // A milestone that falls on or before the deposit (a late booking) is due
  // with the deposit rather than on a date that has already passed.
  const due = days => {
    if (!start) return null;
    const d = addDays(start, -days);
    return d <= depDue ? depDue : d;
  };

  return [
    { key: 'deposit', label: `Booking Deposit (${depositPct}%)`, pct: depositPct, amount: deposit, due_date: depDue },
    { key: 'second', label: `Second Payment (25%) — ${SECOND_DAYS} days before check-in`, pct: 25, amount: second, due_date: due(SECOND_DAYS) },
    { key: 'balance', label: `Final Balance (${round2(100 - depositPct - 25)}%) — ${BALANCE_DAYS} days before check-in`, pct: round2(100 - depositPct - 25), amount: balance, due_date: due(BALANCE_DAYS) },
  ];
}

module.exports = { buildPaymentSchedule, SECOND_DAYS, BALANCE_DAYS };
