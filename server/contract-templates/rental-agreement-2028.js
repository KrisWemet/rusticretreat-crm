// Event Venue Rental Agreement — 2028 pricing.
//
// The owner confirmed the 2028 agreement is the 2027 agreement with new package
// prices and nothing else. It is derived from the 2027 template rather than
// copied, so every clause, initials block and the payment schedule stay
// word-for-word identical: only the key, subtitle and Section 3 price table
// differ. If a future year changes wording, copy the file instead of deriving.
//
// The 2-Day package is retired and is not offered in 2028 at all.

const base = require('./rental-agreement-2027');

const PRICES_2028 = [
  { value: '3-day', price: 7500, cells: ['3-Day Weekend', '$7,500', '3 days / 2 nights'] },
  { value: '5-day', price: 8500, cells: ['5-Day Weekend', '$8,500', '5 days / 4 nights'] },
];

const template = structuredClone(base);
template.key = 'rental-agreement-2028';
template.version = 1;
template.subtitle = '2028 Pricing · Rates subject to change in 2029';

let replaced = 0;
for (const section of template.sections) {
  for (const block of section.blocks) {
    if (block.t === 'choice' && block.key === 'package') {
      block.columns = ['Package', '2028 Price', 'Duration'];
      block.options = PRICES_2028;
      replaced += 1;
    }
  }
}
// Fail at boot, not on a couple's screen, if the 2027 structure ever changes.
if (replaced !== 1) throw new Error(`rental-agreement-2028: expected one package table, found ${replaced}`);

module.exports = template;
