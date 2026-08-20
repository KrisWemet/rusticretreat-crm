// Venue facts that appear in couple-facing documents.
//
// These live in one place because the same value is printed into a contract the
// couple signs and shown on the portal's payment page. When the two disagreed,
// they disagreed about where to send money: the contract said
// info@rusticretreat.com and the portal said payments@rusticretreat.com, on a
// domain the venue does not send email from. A couple following either one
// e-transfers to a mailbox nobody reads.
//
// Anything printed into a signed document is a promise. Keep this list short
// and keep it correct.

// The Interac e-Transfer recipient. Override per-environment; the default is
// the venue's real domain so a misconfigured deploy cannot fall back to a
// domain the venue does not control.
const ETRANSFER_EMAIL = process.env.ETRANSFER_EMAIL || 'info@rusticretreatalberta.ca';

module.exports = { ETRANSFER_EMAIL };
