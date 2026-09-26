// Choices shared by admin forms, so staff pick from a list instead of typing.

// Same list the public enquiry form offers, so Analytics groups them together.
export const REFERRAL_SOURCES = [
  'Google Search',
  'Instagram / Social Media',
  'Friend or Family Referral',
  'Wedding Website (The Knot, WeddingWire)',
  'Drove By / Saw the Venue',
  'Other',
]

// Suggestions only: the location fields still accept anything typed.
export const CEREMONY_SPACES = ['Forest Clearing', 'Poplar Grove', 'Meadow', 'Clear-Top Gazebo']
export const RECEPTION_SPACES = ['Clear-Top Gazebo', 'Forest Clearing', 'Meadow']

// Common follow-ups, offered as suggestions for a task's title.
export const TASK_TITLES = [
  'Follow up on enquiry',
  'Follow up after tour',
  'Send proposal',
  'Send contract for signing',
  'Countersign contract',
  'Confirm deposit received',
  'Remind couple of upcoming payment',
  'Collect day-of timeline',
  'Confirm final guest count',
  'Confirm vendors and arrival times',
  'Final walk-through',
  'Post-wedding thank-you and review request',
]

// Due-date shortcuts: days from today.
export const DUE_IN = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In 1 week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
  { label: 'In 1 month', days: 30 },
]

// A saved value that isn't in the list still shows as an option, so opening
// an older record never silently blanks it.
export function withCurrent(options, current) {
  return current && !options.includes(current) ? [...options, current] : options
}

// Quick replies for Messages. {names} becomes the couple's first names, and
// the text lands in the message box so it can be edited before sending.
export const MESSAGE_TEMPLATES = [
  { label: 'Check in', text: 'Hi {names}! Just checking in. Do you have any questions we can help with?' },
  { label: 'After a tour', text: 'Hi {names}, thanks so much for visiting Rustic Retreat! Let us know if you would like us to put together a proposal for your dates.' },
  { label: 'Proposal ready', text: 'Hi {names}, your proposal is ready. Take a look when you have a moment and let us know if you have any questions.' },
  { label: 'Contract ready to sign', text: 'Hi {names}, your rental agreement is ready to sign. Let us know if you have any questions before you do.' },
  { label: 'Payment reminder', text: 'Hi {names}, a friendly reminder that your next payment is coming up soon. Thank you!' },
  { label: 'Payment received', text: 'Hi {names}, we have received your payment. Thank you!' },
  { label: 'Day-of timeline', text: 'Hi {names}, could you send us your day-of timeline when you have a chance?' },
  { label: 'Final guest count', text: 'Hi {names}, could you confirm your final guest count for us?' },
]

export const firstNames = (c) =>
  [c?.partner1_name, c?.partner2_name].filter(Boolean).map(n => n.trim().split(/\s+/)[0]).join(' & ')
