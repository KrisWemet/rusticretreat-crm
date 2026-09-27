# Rustic Retreat CRM: handoff notes

Last updated: 27 September 2026. Written so a new chat can pick up where the last one stopped.

This file lives in the live CRM repo, `KrisWemet/rusticretreat-crm`, since 27 Sep 2026. It used to live in the old repo `KrisWemet/rustic-retreat-crm` (with a hyphen), which now only points here. Keep it up to date in this repo.

## The business

- **Venue:** Rustic Retreat, an off-grid wedding venue at Lac La Nonne, Alberta.
- **Bookings:** one wedding at a time, with a reset day after each.
- **Owner:** Shannon Ouimet. **Admin:** Kris Wemet.
- **Pricing:** all package prices are **before 5% GST**.

| Package | 2027 price | 2028 price | Allowed dates |
|---|---|---|---|
| 3-Day Weekend | $6,500 | $7,500 | Fri–Sun |
| 5-Day Experience | $7,500 | $8,500 | Wed–Sun, Thu–Mon or Fri–Tue |
| 2-Day Weekday Escape | **Retired**: no longer sold | not offered | none |

- The 5-Day 2027 price comes from the 2027 agreement's price table and the seed data in repo B. If the live Packages page ever shows something different, check it there.
- **Guests:** the reception holds at most 100.
- **Payment schedule** (this matches Section 4 of the signed agreement):
  1. 25% deposit. How the deposit falls due depends on how the couple books:
     - **Agreement signed directly:** the deposit is due at signing.
     - **Proposal accepted online:** the deposit is due 7 days after acceptance.
  2. 25% due **180 days** (about 6 months) before check-in.
  3. The last 50% due **90 days** (about 3 months) before check-in.
  4. If a milestone has already passed when the couple books, it is due with the deposit.
  - **Other arrangements:** the venue sometimes agrees a different plan with a couple. For example, one couple paid the deposit in two payments two weeks apart. The Payments page supports this (see `KrisWemet/rusticretreat-crm#5` below).
- **2028 agreement:** same wording as 2027. Only the prices are new.

---

## There are two repos. Only one is the live CRM.

Both repos have their own PR numbers, and both have used the branch name `claude/great-gates-rohjoy`. So always write a PR with its repo, for example `KrisWemet/rusticretreat-crm#2`, never just "PR #2".

### Repo B: the CRM in use (`KrisWemet/rusticretreat-crm`, no hyphen)

- **Web addresses:** https://crm.rusticretreatalberta.ca for the admin CRM, and https://sign.rusticretreatalberta.ca for e-signing.
- **Stack:** Express, better-sqlite3 12.11.1 (pinned) and a React client.
- **Hosting:** Railway project **"refreshing-analysis"**. Railway deploys from the branch **`claude/wedding-crm-esign-integration-coau0z`**. The repo's default branch is `claude/wedding-venue-crm-23ycf5`.
- **Database:** a SQLite file on a Railway volume mounted at `/data`, with `DB_PATH` pointing to it. **It holds real couples.**
- **Access:** `CRM_PUBLIC=1` means there is no extra access gate in front of the app. The owner chose to keep it that way, because the admin CRM already requires the admin login (email set by `ADMIN_EMAIL_LOGIN`, plus a password). The gate would only add a second shared key (`CRM_GATE_KEY`). Don't reopen this decision.
- **Tests:** `npm test --prefix server` runs `node --test test/*.test.js`. All 95 tests passed as of `KrisWemet/rusticretreat-crm#17`. GitHub Actions workflow: `.github/workflows/server-tests.yml`.
- **Backups:** nightly at 2 am Alberta time, 30 kept on the volume, a snapshot before every data migration, and an off-site copy in the Railway storage bucket **`crm-backups`** (60 kept). Its credentials reach the service as `BACKUP_BUCKET*` variable references. The Backups page shows each day's jobs; a failed backup emails the venue.
- **Daily jobs** (Alberta time, one runner, recorded in `job_runs`): backup 2 am; mark finished weddings completed and expire old proposals 3 am; morning summary email 7 am; payment reminders and follow-up alerts 8 am.
- **More notes** live in `PROJECT_STATE.md` in that repo.

### Repo A: the older CRM, **retired 27 Sep 2026** (`KrisWemet/rustic-retreat-crm`, with hyphen)

- **Stack:** React, Vite, TypeScript, Tailwind 4 and Supabase (project `aztaffrywreshzyzraiz`).
- **Status:** retired. Nothing live uses it; the website and this CRM were checked for references before retiring.
  - **Vercel** project `rustic_retreat_crm` (rusticretreatcrm.vercel.app) is **paused**. Resume it from the Vercel dashboard if ever needed.
  - **Supabase** project `aztaffrywreshzyzraiz` is **paused**, with its data kept: the `legacy_backup` schema (6 old enquiries, settings, 2 profiles) and 4 package-catalogue rows. It can be restored from the Supabase dashboard. On the free plan a project paused for 90+ days can no longer be restored, but its backup stays downloadable.
  - The repo's README carries a retirement notice. **Owner to-do:** archive the repo on GitHub (Settings → General → Danger Zone → Archive this repository). It becomes read-only, and can be unarchived later.
  - **Future Claude sessions** should be started on this repo (`KrisWemet/rusticretreat-crm`), not repo A.

### The public website (`KrisWemet/rustic-retreat-weddings`)

- **Web address:** https://www.rusticretreatalberta.ca. The bare `rusticretreatalberta.ca` redirects to www.
- **Hosting:** Vercel project `rustic-retreat-weddings`, deployed from `main`. Netlify also builds previews of PRs.
- **Stack:** React and Vite, with content in Sanity. Checks are `npm run lint` and a build; there is no test suite.
- **Forms:** the contact page (`src/pages/Contact.tsx`) and the 2026 and 2027 booking-request pages send to the **CRM first**, and the CRM emails the venue. **Formspree is the backup** (forms `mgooaleg`, `xqegwoga`, `xwvwajyy`). All three go through `submitEnquiry` in `src/lib/crm.ts`; see "Website forms → CRM" below.
  - **Formspree account:** keep it until the owner says the CRM is fully running. Removing Formspree later means deleting the fallback call in `src/lib/crm.ts`.

---

## Work finished

### Repo A (older CRM): `KrisWemet/rustic-retreat-crm#2` and `#3`

- **CI:** added a frontend CI workflow and gated production migrations.
- **Supabase:** the project was backed up and reset. The old edge functions and storage buckets were deleted, and both admin accounts were set up.
- **Vercel:** the project was relinked to the right repo and deployed.
- **Login:** fixed the unstyled login page (a Tailwind v4 CSS layer-order problem), made it look more professional, and added a working password-reset flow. The owner signed in successfully.
- **Client portal:** **on hold**. Admin must be fully working before any client gets access.

### `KrisWemet/rusticretreat-crm#1`: booking rules (merged as `21400b8`, deployed)

- **Booking rules:** `server/services/bookingRules.js` adds `assertBookable(...)`.
  - **Double bookings:** blocked. A booking takes up its own dates plus a reset day.
  - **Blocked dates:** respected. Cancelled couples don't count.
  - **Date patterns:** the check-in days allowed for each package are enforced.
  - **Guests:** capped at 100.
  - **Race-proof:** the checks run inside SQLite transactions, so two requests at once can't both book the same dates.
- **Where the rules apply:**
  - Creating and editing bookings. An edit re-checks only when dates, package or guest count change.
  - Sending and accepting proposals. The public error message doesn't name the other couple.
  - Venue countersigning a contract.
- **Seeded accounts:** the startup step that resets demo couple passwords now touches only the seeded demo emails.
- **Tested:** the owner confirmed that double booking is now impossible.

### `KrisWemet/rusticretreat-crm#2`: payments, 2028 prices, demo clean-up (merged as `3866e60`)

- **One payment schedule everywhere:** `server/services/paymentSchedule.js` (`buildPaymentSchedule`) implements 25% / 25% at 180 days / 50% at 90 days. It is used by:
  - proposal acceptance (creates 3 invoices)
  - proposal print view
  - contract text generated from a proposal
  - Payments page "generate schedule", which deletes unpaid invoices and rebuilds them
- **Prices by wedding year:**
  - A new `packages.season_prices` column holds per-year prices, for example `{"2028": 7500}`.
  - `server/services/packagePricing.js` works out the right price for a wedding date.
  - Packages page: a new "Prices by wedding year" editor.
  - Proposals page: the package price follows the event year.
- **2028 agreement:** `server/contract-templates/rental-agreement-2028.js` is copied automatically from the 2027 template. Only the key, subtitle and price table differ.
  - A contract must use the agreement for the wedding's year.
  - Retired options (2-Day) are hidden unless a contract already chose one.
- **One-time startup migrations:** these run once, recorded in the `app_migrations` table via `runOnce`.
  - `package-season-prices-2028`: sets the 2028 prices.
  - `retire-2-day-package`: deactivates the 2-Day package.
  - `remove-demo-couples-2026-09`: production only. Deletes the 4 seeded sample couples and their tasks; real couples are kept.
- **Guests field:** the Bookings form now allows up to 100 guests (it was 80).

### `KrisWemet/rusticretreat-crm#3`: booking form start and end times removed (merged as `7d14525`, deployed)

- **Form:** the New/Edit Booking form no longer has the Start Time and End Time fields. Check-In Date and Check-Out Date are still there.
- **Existing bookings:** times already saved are kept and still show in the bookings list. Edits don't erase them.
- **Unchanged:** the database columns and contract times are not touched.
- **Deploy:** succeeded on Railway at 14:58 UTC on 26 Sep 2026. The startup logs showed no new errors.

### `KrisWemet/rusticretreat-crm#4`: booking total with GST, security patch (merged as `368921b`, deployed)

- **Package:** the New/Edit Booking form's Package is now a dropdown of active packages. A retired or hand-typed name on an older booking stays selectable.
- **Total:** choosing a package or check-in date fills the total with that year's price plus 5% GST (3-Day 2027 → $6,825; 3-Day 2028 → $7,875; 5-Day 2028 → $8,925).
  - A total staff typed themselves is never overwritten.
  - If a total differs from the package price with GST, an amber note says so and offers the right figure in one click.
  - Saving is never blocked, so totals that include add-ons still work.
- **Security:** a lockfile-only update to express 4.22.3 and qs 6.16.0, which fixes a high-severity denial-of-service in `qs`.
- **Deploy:** succeeded on Railway at 15:20 UTC on 26 Sep 2026.

### `KrisWemet/rusticretreat-crm#5`: payment percentages and custom payment plans (merged as `91ef236`, deployed)

- **Add Invoice → Payment dropdown:** Deposit (25%), Second payment (25%), Final balance (50%), Half of the deposit (12.5%), or Custom amount.
  - Once a couple is picked, the choice fills the amount from their booking total, and the description and due date from the agreement's schedule.
  - Typing an amount switches the dropdown back to Custom.
- **Auto Schedule → editable plan:** the standard three payments appear as editable rows before saving.
  - **Split (✂):** turns a payment into two halves, the second due 14 days later (you can change the date). This covers a deposit paid in two parts.
  - **Other edits:** any description, amount or date can be changed, and rows can be removed or added.
  - **Total check:** **Create Schedule** only works once the rows add up to what's still owed. The server checks this too (`normaliseCustomSchedule` in `server/services/paymentSchedule.js`).
  - **Already paid:** paid invoices are always kept, so the new plan covers only the remainder. The form says how much has been paid.
  - **Safe replacement:** unpaid invoices are replaced in one transaction, so a refused plan changes nothing.
- **Server:** a new `POST /api/invoices/schedule-preview` returns the standard schedule without saving. `POST /api/invoices/schedule/:coupleId` now takes an optional `items` list.
- **Display:** invoice amounts now always show two decimals.
- **Deploy:** succeeded on Railway at 15:38 UTC on 26 Sep 2026.

### `KrisWemet/rusticretreat-crm#6`: dropdowns and quick picks across admin forms (merged as `90d19d0`, deployed)

- **Clients (add and edit):**
  - **Venue Package** is a list of active packages.
  - New **How they heard about us** list, with the same choices as the public enquiry form. It's saved as `referral_source`, so couples added by hand count in the Analytics referral chart. The client page shows it as "Heard about us".
- **Tasks:**
  - **Title** suggests 12 common follow-ups and still accepts anything typed.
  - **Due in** shortcuts, from today to 1 month.
  - **Assigned To** is a list of staff, from a new `GET /api/auth/staff` that returns only ids and names.
- **Bookings:**
  - **Ceremony / Reception** suggest the venue's spaces (Forest Clearing, Poplar Grove, Meadow, Clear-Top Gazebo) plus earlier entries, and still accept anything typed.
  - **Add-ons:** "+ Add from the add-on list" adds an item with its price to the add-ons text.
- **Messages:** a **Quick reply** list that fills an editable message with the couple's first names (check in, after a tour, proposal ready, contract ready, payment reminder, payment received, day-of timeline, final guest count).
- **Where to edit the lists:** they all live in `client/src/utils/options.js`. A saved value that isn't in a list still shows, so older records are never blanked.
- **Checked end to end:** a browser test on a local copy with a fresh database covered enquiry, couple, booking, split payment plan, task, message and Analytics, plus every admin and portal page. It found no errors.
- **Deploy:** succeeded on Railway at 15:54 UTC on 26 Sep 2026. The daily backup ran right after.

### Website forms → CRM: `KrisWemet/rusticretreat-crm#7`, `#8`, `#9` and `KrisWemet/rustic-retreat-weddings#7`, `#8` (deployed)

- **How it works now (since `rustic-retreat-weddings#8`):**
  - Each website form posts to the CRM first with `_notify=1`: the contact page to `POST /api/inquire/website`, and the booking pages to `POST /api/inquire/booking-request`.
  - The CRM records everything and emails the venue: every answer, an **Open in the CRM** link, and reply-to set to the couple.
  - It answers `{ notified }`. The site falls back to Formspree only if the CRM can't be reached within 10 seconds, or says the email didn't go out. If both fail but the CRM saved it, the couple still sees success.
  - **CORS:** those two endpoints accept the website's origins (`middleware/corsPolicy.js`; override with `WEBSITE_ORIGINS`). Everything else stays CRM-only.
  - **Duplicates:** a submission without `_notify` (an old cached page) is recorded but not emailed, so no enquiry is emailed twice.
  - **Other settings:** the website CSP in `vercel.json` allows the CRM host. The CRM base URL can be overridden with `VITE_CRM_ENQUIRY_BASE`.
- **What the CRM does with each enquiry** (`server/services/websiteEnquiry.js`):
  - **New email:** creates an **Inquiry** client from both partners' names, email and phone.
  - **Wedding date:** copied only when it's an exact date. All the couple's answers go into the notes either way.
  - **Known email:** adds to that client's notes instead of making a duplicate.
  - **Tour request:** always adds a **Requested** tour on Site Tours, with the suggested dates or "no dates suggested yet". If the couple already has an open (requested or scheduled) tour, the new dates are added to it instead.
  - **Follow-up task:** always adds a high-priority task, "Follow up on website enquiry and book their tour", due the next day. The site promises a reply within 24 hours.
  - **Form response:** saves the answers as a completed "Website enquiry (contact page)" form on the couple's Forms section, which staff can edit.
- **What the CRM does with each booking request** (`recordBookingRequest`):
  - **Couple:** creates or updates an **Inquiry** from both clients' names, email and phones.
  - **Other details:** the wedding date (DD/MM/YYYY, falling back to check-in), the package matched by length ("5-Day Weekend" becomes "5-Day Experience") and how they heard about the venue.
  - **Known couple:** a lead moves to inquiry. Later stages and anything already on file are kept.
  - **Notes and form:** every answer goes into the notes, plus a completed "Website booking request" form.
  - **Task:** adds a high-priority "Review booking request and send proposal" task. Nothing is booked automatically.
- **Spam:** a hidden `_gotcha` honeypot is dropped by both Formspree and the CRM. The CRM endpoint allows 10 an hour per IP address.
- **Verified live:** a test enquiry reached the live CRM at 16:42 UTC on 26 Sep 2026 and returned 201. The first test was sent from a page loaded before the website update, so nothing arrived. Hard-refresh before testing.
- **Deploys:** the CRM went out at 16:34 and 16:47 UTC, and the website on Vercel at 16:36 UTC, on 26 Sep 2026.
- **Clean-up:** delete the owner's test enquiry couples from Clients. That also removes their tour requests; their follow-up tasks under Tasks need deleting too.
- **Deploy of the CRM-first version:** the CRM (`9da1ce5`) went live on Railway at 21:33 UTC on 26 Sep 2026, and the website (`da5a6cf`) on Vercel at about 21:31 UTC. A live test enquiry, to confirm the email now comes from the CRM, was still to be sent by the owner.

### `KrisWemet/rusticretreat-crm#9`: contracts signed elsewhere, attached files, draft editing (merged as `9da1ce5`, deployed)

- **Record Signed Contract** (Contracts page) adds a contract signed on paper or through another service.
  - **Details:** title, date signed, who signed, wedding date, package, total, guests, notes, and the signed copy.
  - **Saved** as signed and locked with `source = 'external'`, so it never enters e-signing.
  - **Autofill:** the couple's known details and booking fill in automatically.
  - **Mistakes:** a recorded contract can be deleted.
- **Files on any contract:** PDF, JPG, PNG, WEBP or HEIC, up to 15 MB. You can attach, open and remove them from the contract view.
  - **Stored** in the `contract_files` table, so they're on the Railway volume and in every backup.
  - **Staff only:** files are served to signed-in staff only.
  - **Not `/uploads`:** the public `/uploads` folder is never used for contracts, since it's wiped on redeploy and readable by anyone.
- **Edit** on free-text drafts: title, event details and wording can be changed until the venue signs.
  - **Standard agreement:** its wording is fixed and filled in through **Prepare**.
  - **Custom terms:** these use **New Contract → Free-text contract**.

### `KrisWemet/rusticretreat-crm#9`: forms staff and couples can fill in (merged as `9da1ce5`, deployed)

- **Staff answers:** staff can fill in or correct any couple's answers.
  - **Where:** from the Forms page, or the **Forms** section on each client page, which also has "Add a form".
  - **Saving:** "Save for later" keeps a partial set.
  - **History:** each form records who first filled it in (staff, couple or website) and who last changed it.
- **Private links:** staff can email a couple a private link, or copy it to text them.
  - **No login:** the couple fills it in at `/form/<token>`.
  - **Lifetime:** 60 days, and a new link replaces the old one.
  - **Notice:** staff are emailed when it comes back.
  - **Code:** `server/services/forms.js` and `server/routes/forms.js`. The public page is `client/src/pages/PublicForm.jsx`, and `/form/` is on both public-path lists: `server/index.js` and `AuthContext.jsx`.
- **Website forms:** "Website enquiry (contact page)" and "Website booking request" are created automatically (`forms.system_key`). Their questions map to website fields by `form_fields.field_key`.
- **Fixed:** editing a form's questions used to delete every answer to it. Questions are now updated in place by id.
- **Email sending:** now supports several recipients and a reply-to (`server/services/email.js`).

### `KrisWemet/rusticretreat-crm#10`: wide tables scroll sideways (merged as `db74f64`, deployed)

- **Problem:** on a narrower window, table rows were cut off at the right edge, so buttons like **Delete** on Site Tours couldn't be reached without resizing the window.
- **Fix:** the table cards now use `overflow-x-auto` instead of `overflow-hidden`, so a wide table scrolls sideways inside its card.
- **Pages:** Site Tours, Tasks, Payments, Clients, Bookings, Backups, Proposals, Vendors, and the portal Guest List and Budget.

### The finishing plan, 26–27 Sep 2026: `KrisWemet/rusticretreat-crm#11`–`#17` (all merged and deployed)

The owner asked for a plan to finish the CRM. Decisions made along the way:
- **Couple emails: "remind me, not them".** No automatic nudge emails to enquiries; the CRM tells the venue who needs a follow-up. Payment reminders still go to couples, with e-Transfer instructions.
- **Backups:** off-site copy in a Railway storage bucket.
- **Extras:** a 7 am morning summary email. Card payments, SMS and camping tracking were left out for now.

**`#11` Phase 1a: wrong emails and bugs**
- The "Still dreaming?" auto-email to enquiries is gone. The dashboard lists **Needs a follow-up** (no scheduled tour, sent proposal, booking or "contacted" mark), with a **Mark contacted** button on each client page. The venue is emailed once when an enquiry is a week old.
- Payment reminders and receipts give e-Transfer instructions (no portal link), go to both partners, skip cancelled couples and only count as sent once delivered.
- The final contract signature books the date, sets the check-out date and adds the 25/25/50 schedule in one transaction; a date taken in the meantime becomes a task.
- Resend renews an expired signing link; accepted proposals can't be declined; proposal emails report real delivery; public availability follows the booking rules.

**`#12` Phase 1b: deletion safety**
- Delete archives a couple (Archived tab, Restore). Permanent delete is admin-only and refused while they have a signed contract or paid invoice. Paid invoices and signed contracts are protected.
- New activity log (who did what). Health check tests the database; errors no longer leak details; security headers; rate limits on proposal links.

**`#13` Phase 2: backups and daily jobs** (see Repo B above)
- Every email the CRM sends is logged (`email_log`) against the couple.

**`#14` Phase 3: the admin's day**
- Dashboard **Today and this week** panel, and the same list as a 7 am email to the venue.
- Client page shows everything: balance, next payment, payments, contracts and who still has to sign, tasks (quick add), bookings and tours, emails sent, history.
- **Find a couple** box on every page. Messages can **email** a couple (both partners; replies come to the venue inbox).

**`#15`, `#16` Phase 4: editing gaps**
- Payments: **Record payment** (date, method, reference, optional receipt), edit invoices, filters, send reminder now, printable statement.
- Tasks edit and filters; Tours add, filter and optional confirmation email; Bookings search and upcoming/past, payment status from invoices; Proposals filter, search, duplicate; Forms "waiting on couples" with resend.
- Extra-guest add-on now counts guests **over 80** (was "over 60"), matching the agreement.
- Calendar shows every item per day, holds (proposal or contract out), date-range blocking, phone agenda; Contracts filters and link-expiry warnings; Pipeline "Move to" menu; Vendors edit.
- **Settings:** change your password; the admin adds, resets and removes staff logins. `ADMIN_BOOTSTRAP_PASSWORD` now applies once per value, so it no longer undoes a password changed in the CRM.

**`#17` Phase 5: consistency and phones**
- 24 unstyled inputs fixed, one shared connection, visible load errors, Escape closes dialogs, forms stack on phones. Every admin page checked at phone and desktop width.

---

### Built-in help: Help & Guides (27 Sep 2026)

- **Where:** "Help & Guides" in the sidebar (`/help`), and a **Help (?)** button in the header of every page. Pressing `?` also opens help for the current page.
- **What:** a guide for each page, 8 step-by-step recipes (starting with "New enquiry → booked wedding"), common questions, and search.
- **Editing:** all the text lives in `client/src/help/guides.js`. **When a screen changes, update its guide there.** `server/test/helpContent.test.js` fails CI if a sidebar page has no guide or a link is broken.
- **Also fixed:** the Packages add-on type said "Per guest (over 60)"; it now says over 80, matching the extra-guest rule.

## Open items

1. **Shannon & Chris booking shows $6,439.**
   - **Cause:** that number was typed by hand into the New Booking form on 25 Sep 2026 (Railway log `POST /api/bookings`). No code changed it.
   - **Correct total:** **$6,825**, which is $6,500 plus $325 GST.
   - **Fix (for the owner, not done yet):** Bookings → Edit. The amber note offers **use $6,825.00**; click it, then Update Booking. Then on Payments, choose Auto Schedule for the couple and Create Schedule. Check-in is 23 Jul 2027, so the invoices should be:

     | Payment | Amount | Due |
     |---|---|---|
     | Deposit (25%) | $1,706.25 | now |
     | Second payment (25%) | $1,706.25 | 24 Jan 2027 (180 days before) |
     | Final payment (50%) | $3,412.50 | 24 Apr 2027 (90 days before) |
   - **Prevention:** now built and live (`KrisWemet/rusticretreat-crm#4`).
   - **Easier now:** on Payments, use **Record payment** when their deposit arrives, so the date, method and reference are kept.
2. **`KrisWemet/rusticretreat-crm#2` deploy: verified.** It deployed successfully at 00:58 UTC on 26 Sep 2026.
   - **Log results:** "Set 2028 prices on 2 package(s)" and "Removed 4 demo couple(s) and 6 demo task(s)". No migration errors.
   - **No "Deactivated 2-Day" line:** no *active* 2-Day package was found, so it was probably already switched off. Worth a glance on the Packages page.
3. **Owner to-dos from the finishing plan:**
   - **Check the first morning summary email** arrives at about 7 am Alberta time (it only sends when there is something to report).
   - **Delete the test enquiries** (they will now show under "Needs a follow-up" on the dashboard): Archive them, then Delete permanently.
   - **Send one live test enquiry** from the website to confirm the CRM emails the venue.
   - **Look at the printed executed contract** once in production.
   - **Supply the real contract text**, so both contract paths print the same terms.
   - **Optional:** if `ADMIN_BOOTSTRAP_PASSWORD` is still set in Railway, it can now be removed (the log says "already applied; it is safe to unset it").
4. **Later, optional:**
   - card payments (Stripe), text messages (SMS) and camping tracking: not built this round, by the owner's choice
   - a venue-wide preferred-vendor list (the Vendors page lists each couple's own vendors)
   - delete repo A's paused Vercel and Supabase projects for good, if the owner is sure nothing in them is needed
   - add camping tracking
   - confirm the cancellation wording in the agreement
   - **dependency upgrades that need a major version:**
     - nodemailer 8 → 10: only the backup email path behind Resend, and the affected options aren't used
     - react-router 6 → 7: moderate
   - **retire Formspree** once the owner is happy with the CRM emails: remove the fallback in the website's `src/lib/crm.ts`, then close the Formspree account
   - **2026 booking page prices:** `/booking-2026` still lists the 3-Day at $4,500 and the 5-Day at $5,500. Check whether that page should still be live.

---

## Rules to keep following

- **Never run `reset-data.js` on the live database.** It holds real couples.
- **Back up before risky changes:** the CRM snapshots itself before every data migration and copies nightly backups off-site; for anything else risky, press **Back up now** on the Backups page first.
- **Secrets** go straight into Railway or GitHub settings, never into chat. Never put a Supabase service-role key in a `VITE_` variable.
- **Client portal** stays on hold until the owner says otherwise.
- **The CRM access gate** stays off (`CRM_PUBLIC=1`).
- **Totals** entered in the CRM should include 5% GST.
- **Git:** work on a `claude/...` branch and open a PR. Railway deploys from `claude/wedding-crm-esign-integration-coau0z`.
  - **Merging:** on 26 Sep 2026 the owner gave Claude permission to merge its own PRs once the checks pass. Nothing is merged while a check is red or still running.
  - **After merging:** check the Railway deploy (or, for the website, Vercel) and tell the owner when it's live.
  - **If the merge is refused** by the session's safety check, tell the owner and ask them to merge it.
