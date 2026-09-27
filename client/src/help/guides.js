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
    summary: 'Everything about one couple in one place: contact details, bookings, payments, contracts, forms, tasks, emails and history.',
    whatYouCanDo: [
      'Edit contact and wedding details (Edit Couple), including Partner 2.',
      'Mark contacted, so they leave the "Needs a follow-up" list.',
      'See their booking and tours, balance owing and next payment, contracts and signing progress, forms, tasks, every email the CRM sent them, and the history of changes.',
      'Add a task for this couple, start a New Proposal, or Generate Contract.',
      'Archive the couple (and Restore them later).',
    ],
    howTo: [
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
    ],
    related: ['enquiry-to-booking', 'clients', 'payments'],
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
      'Send signing links; each partner signs online, then you Sign as the venue.',
      'Re-send the current signer\'s link (this also renews its expiry).',
      'Add a contract signed on paper or elsewhere, so every contract is on file.',
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
    ],
    howTo: [
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
      'Insert a quick reply for common answers.',
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
    ],
    related: ['client-page', 'morning-routine'],
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
    ],
    howTo: [
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
    ],
    related: ['morning-routine', 'client-page'],
  },
  {
    slug: 'vendors',
    title: 'Vendors',
    path: '/vendors',
    summary: 'Each couple\'s vendors — photographer, caterer, DJ and so on — with contact details.',
    whatYouCanDo: [
      'Add a vendor for a couple with type, business and contact name, email, phone and website.',
      'Switch a vendor between "considering" and booked.',
      'Search, edit and delete vendors.',
    ],
    howTo: [
      {
        title: 'Keep the wedding weekend contacts together',
        steps: [
          'Add each vendor the couple books, choosing the couple and vendor type.',
          'Click the status to mark them booked once confirmed.',
          'Before the weekend, search by the couple\'s name to see everyone arriving.',
        ],
      },
    ],
    tips: ['This page lists each couple\'s own vendors; it is not a venue-wide preferred-vendor list.'],
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
    related: ['pipeline', 'clients'],
  },
  {
    slug: 'packages',
    title: 'Packages & Add-Ons',
    path: '/packages',
    summary: 'The venue\'s packages and add-ons, with prices by wedding year — used when building proposals and contracts.',
    whatYouCanDo: [
      'Create and edit packages: name, description, what\'s included, max guests, and prices by wedding year.',
      'Mark a package Active or Inactive.',
      'Manage the Add-On Catalog: flat fee, per guest or per night.',
    ],
    howTo: [
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
    summary: 'Your password, and (for admins) who can log in.',
    whatYouCanDo: [
      'Change your password (at least 10 characters).',
      'Admins: add a login for a staff member, choose their role, reset a password, or remove a login.',
    ],
    howTo: [
      {
        title: 'Give a new staff member access',
        recipe: 'staff-settings',
      },
    ],
    tips: ['Remove a login as soon as someone leaves — their past work stays in the history.'],
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
      'Create the contract on Contracts, prepare the venue details, and send it. Each partner signs, then you Sign as the venue.',
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
      'Send it. Partner 1 signs first by email link, then Partner 2 if there is one.',
      'Watch Signing progress. If a link expired or got lost, click Re-send the current signer\'s link.',
      'When the couple has signed, click Sign as the venue.',
      'Done: the couple is booked, the payment schedule is created if needed, and you can Download / print PDF.',
      'Signed on paper? Use "Add a contract signed on paper or elsewhere" so it\'s on file too.',
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
      'Admins: under "Who can log in", click Add a login, enter the name, email, a temporary password and the role, then share the password in person.',
      'Staff logins can do the day-to-day work; Admin logins can also manage logins and backups, and permanently delete.',
      'Remove a login when someone leaves.',
      'Glance at Backups now and then to confirm last night\'s backup and off-site copy worked.',
    ],
    links: ['settings', 'backups'],
  },
]

export const faq = [
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
