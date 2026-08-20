// Venue facts that appear in couple-facing documents.
//
// These live in one place because the same value is printed into a contract the
// couple signs and shown on the portal's payment page. When the two disagreed,
// they disagreed about where to send money: the contract said
// info@rusticretreat.com and the portal said payments@rusticretreat.com, on a
// domain the venue does not use at all. A couple following either one
// e-transfers to a mailbox nobody reads.
//
// Anything printed into a signed document is a promise. Keep this list short
// and keep it correct.

// The Interac e-Transfer recipient, confirmed by the owner. Deliberately not on
// rusticretreatalberta.ca — that domain sends the venue's email, but the
// e-Transfer account is registered to this Gmail address. Do not "correct" it to
// match the sending domain. Override per-environment with ETRANSFER_EMAIL.
const ETRANSFER_EMAIL = process.env.ETRANSFER_EMAIL || 'rusticretreatalberta@gmail.com';

module.exports = { ETRANSFER_EMAIL };
