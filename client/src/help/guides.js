// Built-in help: one guide per admin page, start-to-finish recipes, and FAQ.
// Plain data (no JSX) so the Help Center, the "?" panel and the server test
// can all read it. When a screen changes, update its guide here — the test in
// server/test/helpContent.test.js fails if a sidebar page has no guide.

export const pageGuides = [
  {
    slug: 'dashboard',
    title: 'Dashboard',
    path: '/dashboard',
    summary: 'Your starting point each day: what needs doing today, who needs a follow-up, and what is coming up.',
    whatYouCanDo: [
      'See "Today and this week": site tours, tasks due, payments due in the next 7 days, contracts waiting for a signature, forms not returned and weddings this week.',
      'See "Needs a follow-up": enquiries nobody has acted on yet.',
      'Click a stat card (New Leads, Pending Tasks, Upcoming) to open that filtered list.',
      'Check Recent Clients, Recent Messages and Upcoming Weddings at a glance.',
    ],
    howTo: [
      {
        title: 'Clear your day from the dashboard',
        steps: [
          'Start at the top with "Today and this week" and click Open on each item to go straight to it.',
          'Work down "Needs a follow-up": open each couple, reach out (phone, email or the Messages page), then click Mark contacted on their page.',
          'Anything you can\'t finish today, turn into a task so it shows up again.',
        ],
      },
    ],
    tips: [
      'The same list arrives as the morning summary email at about 7 am Alberta time — but only on days with something to report.',
      'An enquiry stops showing under "Needs a follow-up" once it has a tour booked, a proposal sent, a booking, or you click Mark contacted.',
    ],
    related: ['morning-routine', 'enquiry-to-booking', 'clients'],
  },
  {
    slug: 'clients',
    title: 'Clients & Leads',
    path: '/clients',
    summary: 'Every couple the venue has heard from, from first enquiry to completed wedding.',
    whatYouCanDo: [
      'Search by name or email, and filter by status (lead, inquiry, booked, completed, cancelled).',
      'Add a couple by hand with Add Couple — for phone calls, walk-ins or referrals.',
      'See archived couples with the Archived filter, and restore them.',
      'Click View → to open a couple\'s full page.',
    ],
    howTo: [
      {
        title: 'Add a couple who phoned or emailed you directly',
        steps: [
          'Click Add Couple.',
          'Fill in at least Partner 1 Name and an email or phone. Add the wedding date and "How they heard about us" if you know them — Analytics uses that for referral sources.',
          'Leave Status as lead (or inquiry if they asked about dates or pricing) and save.',
        ],
      },
      {
        title: 'Find a couple fast',
        steps: [
          'Use the search box at the top of any page (in the header) — it searches names, emails and phone numbers.',
          'Or use the search on this page to narrow the list.',
        ],
      },
    ],
    tips: [
      'Website enquiries arrive here on their own — you don\'t need to type them in.',
      'Status tracks where the couple is overall; the Sales Pipeline shows the same couples as columns.',
    ],
    related: ['client-page', 'enquiry-to-booking', 'pipeline'],
  },
  {
    slug: 'client-page',
    title: 'A couple\'s page',
    path: '/clients/:id',
    summary: 'Everything about one couple in one place. Overview holds their record; the other tabs plan the wedding weekend: event plan, run of show, guests, floor plans, vendors, and files and notes.',
    whatYouCanDo: [
      'Edit contact and wedding details (Edit Couple), including Partner 2.',
      'Mark contacted, so they leave the "Needs a follow-up" list.',
      'See their booking and tours, balance owing and next payment, contracts and signing progress, forms, tasks, every email the CRM sent them, and the history of changes.',
      'Add a task for this couple, start a New Proposal, or Generate Contract.',
      'Archive the couple (and Restore them later).',
      'Event plan: see what is still missing before the weekend, keep the venue’s notes for the day, add a checklist of tasks, and print the event order (with or without prices).',
      'Run of show: plan every day of the stay hour by hour, with where each thing happens and who is responsible; print it whole or for one vendor; save it as a template for other weddings.',
      'Guests: keep the guest list with RSVPs, meals, dietary needs and plus-ones; import a spreadsheet (CSV) and export one.',
      'Floor plans: drag tables, the dance floor, tents and more onto a plan of the space, then seat guests at tables and print it.',
      'Vendors: add the couple’s vendors from your directory or by hand, with arrival times and whether each is confirmed.',
      'Files & notes: keep files (licence, insurance, layouts) and a dated log of calls, emails, meetings and visits.',
    ],
    howTo: [
      { title: 'Plan the wedding weekend', recipe: 'plan-weekend' },
      {
        title: 'Record that you\'ve followed up with a new enquiry',
        steps: [
          'Contact the couple however suits you.',
          'Click Mark contacted near the top. It shows "✓ Contacted" with the date; click it again to undo.',
        ],
      },
      {
        title: 'Archive a couple instead of deleting',
        steps: [
          'Click Archive. They disappear from your lists, but their bookings, contracts, payments and forms are kept.',
          'To bring them back: Clients & Leads → Archived → open the couple → Restore.',
        ],
      },
    ],
    tips: [
      'Always archive rather than delete. Only an admin can delete permanently, and never once a contract is signed or a payment is recorded.',
      '"Emails sent" shows whether each email reached the mail service — handy when a couple says they never got something.',
      '"History" shows who changed what and when (payments recorded, prices changed, archives).',
      'The event order is built from the booking, the signed agreement (setup and teardown times, on-site contacts), the run of show, vendors, guests and floor plans. Print it again after changes; a printed copy does not update itself.',
      'In the run of show, times between midnight and 5 AM are listed at the end of their day, so a 12:30 AM sparkler exit stays with Saturday night.',
      'Removing a table from a floor plan unseats the guests who were at it; they show again under "Not seated yet".',
    ],
    related: ['plan-weekend', 'enquiry-to-booking', 'clients', 'payments'],
  },
  {
    slug: 'pipeline',
    title: 'Sales Pipeline',
    path: '/pipeline',
    summary: 'Your enquiries as columns — Inquiry, Tour, Proposal, Booked, Lost — so you can see where each couple is.',
    whatYouCanDo: [
      'Drag a card to another column on a computer.',
      'On a phone or tablet, use the Move to… menu on each card.',
      'Search couples to find a card quickly.',
    ],
    howTo: [
      {
        title: 'Move a couple forward',
        steps: [
          'Find their card (use Search couples… if the column is long).',
          'Drag it to the next column, or pick the column from Move to….',
          'Their status updates to match (for example, Booked sets them as booked).',
        ],
      },
    ],
    tips: [
      'Move couples to Lost when they go elsewhere — it keeps the other columns honest and feeds the conversion numbers in Analytics.',
      'Some moves happen for you: signing the contract marks the couple booked.',
    ],
    related: ['enquiry-to-booking', 'clients'],
  },
  {
    slug: 'tours',
    title: 'Site Tours',
    path: '/tours',
    summary: 'Tour requests from the website and tours you book yourself.',
    whatYouCanDo: [
      'See requests with the couple\'s preferred and flexible times.',
      'Schedule a requested tour, or Add tour for someone who phoned — even someone not in the CRM yet.',
      'Mark a tour completed, or cancel it.',
    ],
    howTo: [
      {
        title: 'Book a site tour',
        steps: [
          'Click Schedule Tour on a request, or Add tour for a new one.',
          'Pick the Tour Date & Time and add notes for anything to prepare.',
          'Leave the "Email … a confirmation" box ticked to send them the details (it only appears when the couple has an email address).',
          'After the visit, click Mark completed.',
        ],
      },
    ],
    tips: [
      'Tours booked for this week appear on the dashboard and in the morning email, so they don\'t sneak up on you.',
      'A booked tour takes the couple off the "Needs a follow-up" list.',
    ],
    related: ['enquiry-to-booking', 'calendar'],
  },
  {
    slug: 'proposals',
    title: 'Proposals',
    path: '/proposals',
    summary: 'Itemised quotes couples can open, read and accept online.',
    whatYouCanDo: [
      'Build a proposal from packages and add-ons, with guest count, dates, GST and deposit percent.',
      'Send to couple, Copy link, Print / PDF, or Duplicate as a new draft.',
      'Search and filter by status: draft, sent, accepted, declined, expired.',
    ],
    howTo: [
      {
        title: 'Send a quote',
        steps: [
          'Click New Proposal (or New Proposal on the couple\'s page).',
          'Pick the couple, then add the package and any add-ons. Extra guests are charged per guest over 80 (100 is the most the reception holds).',
          'Set Valid Until, add a personal note, and save.',
          'Click Send to couple. If you see "not delivered", use Copy link and send it yourself.',
        ],
      },
    ],
    tips: [
      'Prices include 5% GST, and the total shown to the couple is what they pay.',
      'A sent proposal past its Valid Until date turns "expired" automatically overnight. Duplicate it to send a fresh one.',
      'Once a couple accepts, move on to the contract — accepting a proposal is not a signed booking.',
    ],
    related: ['enquiry-to-booking', 'contracts', 'packages'],
  },
  {
    slug: 'calendar',
    title: 'Venue Calendar',
    path: '/calendar',
    summary: 'Which weekends are booked, held or blocked, month by month.',
    whatYouCanDo: [
      'See every booking, hold and tour for each day; click a day for details.',
      'Block dates (a single day or a range) with an optional reason, and unblock them.',
      'Jump back to Today, and see Upcoming bookings.',
    ],
    howTo: [
      {
        title: 'Block dates the venue is unavailable',
        steps: [
          'Click Block dates.',
          'Choose From and To dates and add a reason if you like (maintenance, private event).',
          'Click Block. Those dates now show as unavailable to the website\'s availability check too.',
          'To undo, click the day and choose Unblock this date.',
        ],
      },
    ],
    tips: [
      'Dashed purple "Hold" entries mean a proposal is out or a contract isn\'t signed yet. Check with that couple before offering the date to someone else.',
      'Cancelled couples are hidden from the calendar.',
    ],
    related: ['calendar-recipe', 'bookings', 'tours'],
  },
  {
    slug: 'bookings',
    title: 'Bookings',
    path: '/bookings',
    summary: 'The details of each confirmed wedding: dates, package, guest count, add-ons, locations and price.',
    whatYouCanDo: [
      'Create or edit a booking: check-in and check-out dates, package, guest count, ceremony and reception locations, add-ons, food and beverage notes, special requests.',
      'Set the Total Package Price (CAD, incl. GST).',
      'Search bookings and switch between upcoming and past.',
    ],
    howTo: [
      {
        title: 'Change a wedding\'s price',
        steps: [
          'Click Edit on the booking.',
          'Enter the new Total Package Price, including GST.',
          'Save, then check Payments — if the payment schedule needs to change, adjust or re-create it there.',
        ],
      },
    ],
    tips: [
      'Payment status comes from the invoices on the Payments page, so you don\'t type it in here.',
      'Signing a contract creates the booking details for you in most cases; use this page to adjust them.',
    ],
    related: ['payments', 'before-after-wedding', 'calendar'],
  },
  {
    slug: 'contracts',
    title: 'Contracts',
    path: '/contracts',
    summary: 'Prepare, send, sign and store wedding contracts, with a full signing record.',
    whatYouCanDo: [
      'New Contract for a couple, and fill in the venue\'s details before sending (Prepare contract).',
      'Sign as the venue first: that locks the terms and emails partner 1 their signing link. Partner 2 gets theirs after partner 1 signs.',
      'Re-send the current signer\'s link (this also renews its expiry).',
      'Record Signed Contract: add one signed on paper or elsewhere, with the signed copy attached, so every contract is on file.',
      'Download / print PDF; see signing progress and the consent record (date, IP address, device).',
      'Search and filter by status.',
    ],
    howTo: [
      {
        title: 'Get a contract signed',
        recipe: 'contract-recipe',
      },
    ],
    tips: [
      'Signing links last 45 days. If one has expired, Re-send gives the couple a fresh one.',
      'When the last signature is in, the CRM marks the couple booked and creates the 25 / 25 / 50 payment schedule if they don\'t have invoices yet.',
      'Signed contracts can\'t be deleted — they are the venue\'s legal record.',
    ],
    related: ['contract-recipe', 'enquiry-to-booking', 'payments'],
  },
  {
    slug: 'payments',
    title: 'Payments',
    path: '/payments',
    summary: 'Invoices, payment schedules, money received and what is still owed.',
    whatYouCanDo: [
      'Generate Payment Schedule (Create Schedule) for a couple — the standard 25 / 25 / 50 split.',
      'Add Invoice for anything extra, Edit invoice, or Split into two payments.',
      'Record payment with date received, method (e-Transfer, cash, cheque, card) and reference, and email a receipt to the couple.',
      'Email a payment reminder now; filter by client, upcoming, overdue and paid.',
      'See Collected, Outstanding and Overdue totals.',
      'Damage deposits: what you are holding right now, whose refund is still to send, and a CSV of every deposit. Deposits are not invoices, because a refundable deposit is not income.',
    ],
    howTo: [
      {
        title: 'Bill a couple for extras (propane, firewood, consumables, linens)',
        steps: [
          'Open the couple\'s page → Event plan → Extras → Bill extras.',
          'Choose each extra and how many. The price fills in for the year of their stay; type over it if you agreed something else. For a placeholder price, type what you are charging.',
          'Use "Something else" for anything not on the list.',
          'Check the due date and click Create invoice. It is a separate invoice with a line for each item plus GST, so their payment schedule stays as signed.',
          'Record the e-Transfer on Payments as usual. The receipt email lists the items.',
        ],
      },
      {
        title: 'Handle the $1,000 damage deposit',
        steps: [
          'Open the couple\'s page → Event plan → Damage deposit. The dashboard reminds you in the week of check-in.',
          'When their e-Transfer arrives at check-in, click Record deposit received (add the e-Transfer reference if you have it).',
          'Within 48 hours of check-out, walk the site and click Record the inspection. Add a deduction only for a reason the agreement allows: damage, missing items, excessive cleaning, a fire extinguisher set off, or a tree cut ($500 minimum per tree). Say what happened; the couple sees it.',
          'The card works out the refund. Send it by e-Transfer, then click Record refund sent.',
          'Optional: Email the couple a statement showing what was received, each deduction and the refund.',
          'If the deductions come to more than the deposit, click Create an invoice for the difference.',
        ],
      },
      {
        title: 'Record an e-Transfer that just arrived',
        recipe: 'payment-recipe',
      },
      {
        title: 'Set up a couple\'s payment schedule',
        steps: [
          'Click Create Schedule and pick the couple.',
          'Check the amounts (they include GST) and due dates, then save.',
          'The CRM now reminds the couple automatically before each due date.',
        ],
      },
    ],
    tips: [
      'Couples are reminded by email 14, 7 and 1 day before a payment is due, with e-Transfer instructions. A reminder is only marked sent if the email actually went.',
      'Paid invoices can\'t be deleted, so your records stay complete.',
      'Put the e-Transfer reference number in Reference — it makes matching bank deposits easy later.',
    ],
    related: ['payment-recipe', 'bookings', 'client-page'],
  },
  {
    slug: 'forms',
    title: 'Forms',
    path: '/forms',
    summary: 'Questionnaires for couples — build them once, send them to each couple, and read the answers.',
    whatYouCanDo: [
      'Create a form with a title, description and questions (text, choices, dates…).',
      'Assign a form to a couple, which gives them a link to fill it in.',
      'Read the answers, or fill in or edit answers yourself (for example during a phone call).',
      'See forms "Waiting on couples" and click Resend link.',
    ],
    howTo: [
      {
        title: 'Send a couple a questionnaire',
        recipe: 'forms-recipe',
      },
    ],
    tips: [
      'Website booking-request answers are saved as form responses on the couple, so nothing gets lost.',
      'Forms sent but not returned show on the dashboard.',
    ],
    related: ['forms-recipe', 'client-page'],
  },
  {
    slug: 'messages',
    title: 'Messages',
    path: '/messages',
    summary: 'Write to couples by email from the CRM, and keep each conversation in one thread.',
    whatYouCanDo: [
      'Search conversations and open a couple\'s thread.',
      'Write an email with an optional subject; it is sent with the venue as the reply-to address.',
      'Use a template: pick a saved email and its placeholders (names, dates, amounts owing) fill in from the couple’s record. Read it, edit it, then send.',
    ],
    howTo: [
      {
        title: 'Email a couple',
        steps: [
          'Open their conversation (or search for them).',
          'Add a Subject if you like, write the message and click Send.',
          'Their reply comes to the venue\'s inbox as normal email.',
        ],
      },
    ],
    tips: [
      'Emailing from here keeps a copy on the couple\'s page under "Emails sent", so anyone on staff can see what was said.',
      'If a template needs something the couple\'s record doesn\'t have yet (say, a wedding date), you get a warning to check before sending.',
      'Edit the templates on Settings → Email templates.',
    ],
    related: ['client-page', 'morning-routine', 'settings'],
  },
  {
    slug: 'tasks',
    title: 'Tasks',
    path: '/tasks',
    summary: 'Your to-do list, with due dates, priorities and the couple each task is for.',
    whatYouCanDo: [
      'Add a task — pick a common follow-up shortcut or type your own, choose Due in and Priority, and link it to a couple.',
      'Assign tasks to a staff member.',
      'Mark done / Mark not done, edit, and filter by couple, due today or overdue.',
      'Checklists: lists of to-dos timed from a couple\'s check-in, check-out, booking or enquiry date. Apply one to a couple, or set it to apply by itself when a couple enquires or books.',
    ],
    howTo: [
      {
        title: 'Set up a checklist for every booked wedding',
        steps: [
          'Click Checklists, then Edit on "Booked wedding: venue checklist" (or New checklist).',
          'For each task set how many days before or after which date it falls due, its priority and who does it.',
          'Set "When to use it" to "Automatically when a couple books", and save. Each new booking then gets the tasks with real due dates.',
        ],
      },
      {
        title: 'Never forget a follow-up',
        steps: [
          'Click Add Task and choose a shortcut like "Follow up after tour", or type your own title.',
          'Set Due in (for example 3 days) and the Related Couple.',
          'It appears on the dashboard and in the morning email when it\'s due.',
        ],
      },
    ],
    tips: [
      'The Tasks badge in the sidebar counts tasks due today or overdue.',
      'You can also add a task straight from a couple\'s page.',
      'A checklist "Booked wedding: venue checklist" comes ready, timed from the rental agreement\'s deadlines. It is off until you set "When to use it". Applying a checklist twice adds only what is missing.',
      'Checklist tasks remind the venue only; nothing is ever emailed to the couple.',
    ],
    related: ['morning-routine', 'client-page', 'plan-weekend'],
  },
  {
    slug: 'vendors',
    title: 'Vendors',
    path: '/vendors',
    summary: 'Your vendor directory (the vendors you know and recommend), and every vendor each couple has booked.',
    whatYouCanDo: [
      'Vendor directory: add the caterers, photographers, rentals and others you work with. Star the ones you recommend and note when their insurance expires (expired shows in red).',
      'See how many weddings each directory vendor has worked.',
      'Couples\' vendors: every couple\'s vendors in one list, searchable, with booked status.',
    ],
    howTo: [
      {
        title: 'Keep the wedding weekend contacts together',
        steps: [
          'Open the couple\'s page → Vendors tab.',
          'Pick from your vendor directory and click Add, or click New vendor for someone new.',
          'Note when each arrives and click the status to mark them confirmed. They all print on the event order.',
        ],
      },
    ],
    tips: ['Adding a directory vendor to a couple copies their details, so editing the directory later never changes what a past wedding recorded.', 'Removing a vendor from the directory keeps them on couples who already have them.'],
    related: ['before-after-wedding'],
  },
  {
    slug: 'analytics',
    title: 'Analytics',
    path: '/analytics',
    summary: 'How the business is doing: revenue, bookings, conversion and where couples find you.',
    whatYouCanDo: [
      'See Revenue YTD, Total Collected, Outstanding and Avg Deal Size.',
      'Monthly revenue, season occupancy and revenue per available weekend.',
      'The conversion funnel, proposal conversion, package performance and referral sources.',
      'Pick the year for season occupancy.',
    ],
    howTo: [
      {
        title: 'See which marketing works',
        steps: [
          'Look at Referral Sources — it counts "How they heard about us" on each couple.',
          'Compare with Package Performance and the conversion funnel to see which enquiries turn into weddings.',
        ],
      },
    ],
    tips: ['Figures are only as good as the data: fill in "How they heard about us" and move lost couples to Lost in the pipeline.'],
    related: ['pipeline', 'clients', 'reports'],
  },
  {
    slug: 'reports',
    title: 'Reports',
    path: '/reports',
    summary: 'Money received, money still owed, weddings by year and enquiries by source, each downloadable as a CSV.',
    whatYouCanDo: [
      'Payments received between two dates, by month, with the GST included in them (5/105 of each amount, since totals include GST).',
      'Still owed: every unpaid invoice, grouped by how late it is. Cancelled and archived couples are left out.',
      'Weddings by year: dates, package, guests, paid and balance.',
      'Enquiries by source: where couples heard about you, how many booked, and the booking rate.',
      'Download any of these as a CSV, plus every couple\'s contact details.',
    ],
    howTo: [
      {
        title: 'Send your accountant last year\'s payments',
        steps: [
          'Click Last year (or pick the dates).',
          'Under Payments received, click CSV. The file opens in Excel or Google Sheets.',
          'The GST column shows the GST inside each payment.',
        ],
      },
    ],
    tips: ['A payment counts on the day you recorded the money arriving, not the day it was due.', 'Record each payment on the Payments page as it arrives so these reports stay right.'],
    related: ['payments', 'analytics', 'payment-recipe'],
  },
  {
    slug: 'packages',
    title: 'Packages & Add-Ons',
    path: '/packages',
    summary: 'The venue\'s packages and add-ons, with prices by wedding year — used when building proposals and contracts.',
    whatYouCanDo: [
      'Create and edit packages: name, description, what\'s included, max guests, and prices by wedding year.',
      'Mark a package Active or Inactive.',
      'Manage the Add-On Catalog: flat fee, per guest or per night, with what shows after the price (for example "per 20 lb tank").',
      'Give an add-on a different price for each wedding year, like a package.',
      'An add-on marked "Placeholder price" is not offered to couples and cannot be billed without typing the real price. Changing its price clears the mark.',
      'Tick "Offer on the Final Details Form" on an add-on (propane, firewood, generator…) so couples can choose it, with a quantity, when they send their final numbers.',
    ],
    howTo: [
      {
        title: 'Set the price of an extra',
        steps: [
          'Click the pencil next to the extra (for example Propane tank).',
          'Type the price before GST. For a price that only applies to one wedding year, use + Add a year.',
          'Save. If it was a placeholder price, it now shows on the Final Details Form (when "Offer on the Final Details Form" is ticked) and can be billed.',
        ],
      },
      {
        title: 'Set next year\'s prices',
        steps: [
          'Edit the package and add a row under "Prices by wedding year" (for example 2028).',
          'Enter the price including GST and save. Proposals for weddings in that year use it.',
        ],
      },
    ],
    tips: [
      'Changing a price here does not change proposals or bookings you already made.',
      'Make a package Inactive rather than deleting it, so old weddings still show it.',
      'The Midweek Elopement & Vow Renewal package starts Inactive with no price. Set its price, then make it Active. It books a single Tuesday, Wednesday or Thursday (day use), for up to 20 guests, paid 50% at booking and 50% 30 days before.',
    ],
    related: ['proposals'],
  },
  {
    slug: 'backups',
    title: 'Backups',
    path: '/backups',
    summary: 'Proof your data is safe: nightly backups, off-site copies, and the daily automatic jobs.',
    whatYouCanDo: [
      'See each backup with its date and size, and download a copy.',
      'Check that off-site copies are on.',
      'See when each daily job last ran and whether it worked.',
    ],
    howTo: [
      {
        title: 'Check everything ran overnight',
        steps: [
          'Open Backups and look at the Daily job list — each should show today\'s date and a good result.',
          'If something failed, the venue also gets an email about it.',
        ],
      },
    ],
    tips: [
      'A backup is taken every night at 2 am Alberta time and copied off-site; 30 are kept here and 60 off-site.',
      'Download a copy now and then and keep it somewhere safe of your own.',
    ],
    related: ['staff-settings'],
  },
  {
    slug: 'settings',
    title: 'Settings',
    path: '/settings',
    summary: 'Your password, who can log in (admins), email templates, Final Details rates and calendar sync.',
    whatYouCanDo: [
      'Change your password (at least 10 characters).',
      'Admins: invite someone to sign up (they choose their own password), send a login a link to choose a new password, or remove a login.',
      'Email templates: write and edit the saved emails used on Messages, with placeholders such as {first_names}, {wedding_date} and {balance_owing}.',
      'Calendar sync (admins turn it on): a private address that shows weddings, holds, blocked dates and site tours in Google Calendar, Outlook or a phone.',
      'Final Details Form rates (admins change them): guests, tents and RVs included, the fee for each extra, the caps, GST on overages and how many days before check-in the form is due. They start as the rental agreement\'s Section 2.3 table.',
    ],
    howTo: [
      {
        title: 'Give a new staff member access',
        recipe: 'staff-settings',
      },
      {
        title: 'See the venue calendar in Google Calendar',
        steps: [
          'An admin clicks Turn on calendar sync under Calendar sync, then Copy.',
          'In Google Calendar on a computer: Other calendars → + → From URL, paste, and Add calendar.',
          'Google checks for changes every few hours, so a booking made now can take a while to appear.',
        ],
      },
    ],
    tips: ['Remove a login as soon as someone leaves — their past work stays in the history.', 'The calendar address is private but not secret-proof: anyone who has it sees couples\' names and dates. If it is shared by mistake, click Make a new address.'],
    related: ['staff-settings', 'backups'],
  },
  {
    slug: 'help',
    title: 'Help & Guides',
    path: '/help',
    summary: 'These guides: how each page works and how to run the venue with the CRM.',
    whatYouCanDo: [
      'Search every guide, recipe and question.',
      'Open the "?" button on any page for help with that page.',
    ],
    howTo: [],
    tips: ['Press the ? key on any page (when you\'re not typing) to open help for that page.'],
    related: ['enquiry-to-booking'],
  },
]

export const recipes = [
  {
    slug: 'enquiry-to-booking',
    title: 'New enquiry → booked wedding',
    summary: 'The whole journey, and which page to use at each step.',
    steps: [
      'An enquiry arrives — from the website on its own, or you add it with Add Couple on Clients & Leads. The venue gets an email.',
      'It shows under "Needs a follow-up" on the dashboard and in the morning email. The CRM does not email the couple for you — you reach out.',
      'Contact the couple, then click Mark contacted on their page (or book a tour, which also counts).',
      'Book a site tour on Site Tours; leave the confirmation email box ticked. Mark it completed after the visit.',
      'Build and send a proposal on Proposals. The couple can accept it online.',
      'Create the contract on Contracts, prepare the venue details, and send it. You Sign as the venue first; then each partner signs by email link.',
      'On the final signature the couple becomes booked and the 25 / 25 / 50 payment schedule is created.',
      'From here, Payments reminds the couple before each due date. You record each payment as it arrives.',
    ],
    links: ['dashboard', 'client-page', 'tours', 'proposals', 'contracts', 'payments'],
  },
  {
    slug: 'payment-recipe',
    title: 'Recording a payment',
    summary: 'When an e-Transfer, cheque or cash arrives.',
    steps: [
      'Open Payments and find the couple\'s invoice (filter by client if needed).',
      'Click Record payment.',
      'Enter the Date received, the Method (e-Transfer, cash, cheque or card) and the Reference (the e-Transfer reference or cheque number).',
      '"Email a receipt to the couple" is ticked by default — untick it if they don\'t need one — then Save.',
      'The balance on the couple\'s page updates, and the change is recorded in their History.',
      'If they paid a different amount, use Split into two payments or edit the invoice first.',
    ],
    links: ['payments', 'client-page'],
  },
  {
    slug: 'morning-routine',
    title: 'Your morning routine',
    summary: 'Ten minutes each morning keeps every couple looked after.',
    steps: [
      'Read the morning summary email (about 7 am) or open the Dashboard.',
      'Tours today: check the notes and prepare the site.',
      'Needs a follow-up: contact each couple, then Mark contacted.',
      'Payments due and overdue: check your bank for e-Transfers and record any that arrived.',
      'Waiting for a signature and forms not returned: send a friendly nudge or Re-send the link.',
      'Messages: answer anything new. Tasks: clear what\'s due, and add tasks for anything you put off.',
    ],
    links: ['dashboard', 'tasks', 'messages', 'payments'],
  },
  {
    slug: 'contract-recipe',
    title: 'Preparing and signing a contract',
    summary: 'From a blank contract to a fully signed, stored agreement.',
    steps: [
      'On Contracts, click New Contract and choose the couple (or Generate Contract on their page).',
      'Fill in the event details: package, dates, times, ceremony and reception locations, guest count (100 at most).',
      'Use "Fill in the venue\'s details before sending" to check the wording and the price including GST.',
      'Click Sign as the venue. You sign first: that locks the terms, so nothing can change after the couple sees it, and emails Partner 1 their signing link.',
      'Partner 1 signs by email link, then Partner 2 gets theirs.',
      'Watch Signing progress. If a link expired or got lost, click Re-send the current signer\'s link.',
      'Done: the couple is booked, the payment schedule is created if needed, and you can Download / print PDF.',
      'Signed on paper? Click Record Signed Contract and attach the signed copy, so it\'s on file too.',
    ],
    links: ['contracts', 'payments'],
  },
  {
    slug: 'calendar-recipe',
    title: 'Blocking dates and reading the calendar',
    summary: 'Know what\'s free before you promise a date.',
    steps: [
      'Open Venue Calendar. Weddings show on their dates; dashed purple "Hold" entries are dates with a proposal out or a contract not signed yet.',
      'Click a day to see everything on it — weddings, holds, tours and blocks.',
      'To close dates, click Block dates, choose From and To, add a reason and click Block.',
      'Use Today to jump back to the current month.',
    ],
    links: ['calendar', 'tours', 'bookings'],
  },
  {
    slug: 'forms-recipe',
    title: 'Sending forms and reading answers',
    summary: 'Collect the details you need from couples.',
    steps: [
      'Build the form once on Forms (Form Title, description, questions).',
      'Use "Assign to couple…" and click Assign, or add it from the couple\'s page under Forms.',
      'The couple gets a link to fill it in. Until they do, it shows under "Waiting on couples" on Forms (with Resend link) and on the dashboard.',
      'Click "Read the answers" to see their responses, or "Fill in or edit answers" to enter them yourself.',
    ],
    links: ['forms', 'client-page'],
  },
  {
    slug: 'before-after-wedding',
    title: 'Before and after the wedding',
    summary: 'The last weeks, the weekend itself, and wrapping up.',
    steps: [
      'Weddings this week show on the dashboard and in the morning email.',
      'Check the Bookings details (guest count, locations, special requests) and the couple\'s Vendors.',
      'Make sure the final payment is recorded on Payments before the weekend.',
      'At check-in, collect the $1,000 damage deposit by e-Transfer and record it on the couple\'s Event plan tab (Damage deposit).',
      'Within 48 hours of check-out, inspect the site, record the inspection there with any deductions, then send the refund and record it.',
      'The morning after the last day of the stay, the CRM marks the couple completed on its own.',
    ],
    links: ['bookings', 'vendors', 'payments'],
  },
  {
    slug: 'staff-settings',
    title: 'Staff, passwords and backups',
    summary: 'Looking after logins and making sure your data is safe.',
    steps: [
      'Change your own password on Settings (at least 10 characters).',
      'Admins: under "Who can log in", click Invite to sign up, enter their name and email, pick the role and tick Email them the link. They open the link and choose their own password. The link works once and lasts 7 days; you can also copy it and text it.',
      'Forgot your own password? On the sign-in page click "Forgot your password?" and enter your email. A link to choose a new one arrives by email; it works once and lasts 2 hours. Check spam if it does not arrive.',
      'An admin can also click Send password link next to someone\'s name. They get an email to choose a new one.',
      'Emails are not case-sensitive when signing in; passwords are.',
      'Staff logins can do the day-to-day work; Admin logins can also manage logins and backups, and permanently delete.',
      'Remove a login when someone leaves.',
      'Glance at Backups now and then to confirm last night\'s backup and off-site copy worked.',
    ],
    links: ['settings', 'backups'],
  },
  {
    slug: 'plan-weekend',
    title: 'Plan the wedding weekend',
    summary: 'From booked to the morning of check-in: schedule, guests, layout, vendors and the event order.',
    steps: [
      'Open the couple\'s page. The Event plan tab lists what is still missing (signed agreement, payments, guest count, on-site contacts, run of show, vendors, floor plan, forms, Final Details Form).',
      'A few weeks before check-in, Event plan → Final Details Form: click Email the link to the couple (or Make a link to copy and text it). They enter their final guests, campers, tents, RVs and extras and see the overage fees as they type. It is due 7 days before check-in and locks when they submit.',
      'Taking the numbers by phone instead? Click Fill it in for them, type the numbers, say who confirmed them, and Submit and lock.',
      'When it comes in (you get an email), check the numbers and click Approve. If anything is owing, that makes an overage invoice due on the form\'s due date; record the e-Transfer on Payments as usual. Only an admin can reopen a submitted form, and not once its invoice is paid.',
      'Event plan → Checklists: add the venue checklist so each deadline becomes a dated task.',
      'Run of show: add each day hour by hour (check-in, vendor arrivals, ceremony, dinner, quiet hours, check-out), or start from a saved template. Give each item a place and the person responsible.',
      'Guests: add guests or import the couple\'s spreadsheet (CSV). Track RSVPs, meals and dietary needs.',
      'Floor plans: New floor plan, then add tables, the dance floor and anything else, drag them into place and save. Select a table to seat guests at it.',
      'Vendors: add everyone working the weekend, with arrival times, and mark each one confirmed.',
      'Event plan: write the venue\'s notes for the day, then Print event order. It includes the final counts once the Final Details Form is in. Use Vendor copy (no prices) for anyone who should not see payments.',
      'Print the run of show for one vendor by choosing them in the filter first.',
    ],
    links: ['client-page', 'tasks', 'vendors', 'before-after-wedding'],
  },
]

export const faq = [
  {
    q: 'Why can\'t I change the amount of some invoices?',
    a: 'Invoices for extras, Final Details overages and damage beyond the deposit are made of lines, and the total is the sum of the lines. To change one, delete it (if unpaid) and bill the extras again with the right lines.',
  },
  {
    q: 'Why isn\'t the damage deposit in my payments or GST report?',
    a: 'A refundable deposit is money you are holding, not income, so it is kept off invoices and the payments report. Payments → Damage deposits shows what you are holding, and its CSV lists what was kept for deductions, for your bookkeeper.',
  },
  {
    q: 'A couple made a mistake on their Final Details Form after submitting. Can it be changed?',
    a: 'The agreement says submitted counts are final, so the couple cannot change it. An admin can click Reopen form on the Event plan tab if the venue agrees; that withdraws the unpaid overage invoice so you can approve again. Once the overage invoice is paid it cannot be reopened. Record any change as a new invoice instead.',
  },
  {
    q: 'Is GST added to Final Details overage fees?',
    a: 'Yes, 5% by default, on the assumption that overages are taxed like the package. Change it under Settings → Final Details Form rates if your accountant says otherwise.',
  },
  {
    q: 'Can couples see the run of show, guest list or floor plan?',
    a: 'Not while the couple portal is switched off. These are staff tools; print the run of show or event order (vendor copy has no prices) when you want to share them.',
  },
  {
    q: 'Does the calendar in Google update straight away?',
    a: 'No. Google Calendar checks a subscribed calendar every few hours. The CRM itself is always current.',
  },
  {
    q: 'Why didn\'t the couple get an automatic follow-up email?',
    a: 'On purpose. The CRM reminds you (dashboard and morning email) instead of emailing couples, so every enquiry gets a personal reply. Payment reminders are the only automatic emails couples get.',
  },
  {
    q: 'I archived a couple by mistake. Where did they go?',
    a: 'Clients & Leads → Archived. Open them and click Restore. Nothing was lost.',
  },
  {
    q: 'Do prices include GST?',
    a: 'Yes. Package prices, proposal totals, contract totals and invoices all include 5% GST.',
  },
  {
    q: 'A couple says the signing link doesn\'t work.',
    a: 'Links last 45 days. On Contracts, click Re-send the current signer\'s link — it sends a fresh link and renews the expiry.',
  },
  {
    q: 'A proposal says "not delivered".',
    a: 'The email didn\'t reach the mail service. Check the couple\'s email address, then try again or use Copy link and send it yourself.',
  },
  {
    q: 'When are payment reminders sent?',
    a: '14, 7 and 1 day before each due date, with e-Transfer instructions. Use "Email a payment reminder now" on Payments to send one straight away.',
  },
  {
    q: 'Can I delete a paid invoice or a signed contract?',
    a: 'No — they are the venue\'s financial and legal records. Edit or split an invoice instead; add a note if something changed.',
  },
  {
    q: 'Is there a portal where couples log in?',
    a: 'Not yet — the client portal is on hold. Couples get emailed links for proposals, contracts and forms, and pay by e-Transfer.',
  },
  {
    q: 'How do I see who changed something?',
    a: 'Open the couple\'s page and look at History: it records payments, price changes, archives and deletions with who did it and when.',
  },
]
