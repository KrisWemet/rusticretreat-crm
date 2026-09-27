# Rustic Retreat CRM

Staff CRM for an Alberta wedding venue, with proposals, private forms and three-party agreement signing. The public website’s enquiry and booking-request forms can create CRM records without retyping. The couple portal remains disabled unless explicitly enabled.

The working release branch for the completion changes is `codex/crm-completion`. It incorporates the newer local baseline and the repository’s subsequent help-and-guides update. See [CRM_COMPLETION.md](CRM_COMPLETION.md) for scope, verification and remaining live acceptance checks. This branch has not been deployed by this task.

## Daily workflow

Start with Dashboard’s Today list, search for a couple by name, email or phone, and work from their record. A first enquiry needs one name and one contact method. Collect both partners’ names and email addresses before issuing an agreement.

The couple workspace contains booking dates, balances, agreement progress, tasks, forms, email outcomes, history and a next action with owner and due date. Event operations adds camping, preparation, inspection photos, separate damage deposits, optional date holds and staff assignment. Built-in Help & Guides explains the pages and workflows.

## Records and money

- Receipts are immutable entries with amount, actual date, method and reference. Partial payments, overpayments, refunds and allocation corrections retain their history. Balances come from receipts, across booking cards, invoices, statements and analytics.
- Schedule regeneration preserves invoices carrying payment history and creates only the remaining obligations. Damage deposits are separate from venue-fee invoices and revenue.
- Archive couples to retain their records. Signed or locked agreements and financial history cannot be permanently erased through the CRM.
- Ceremony, check-in and check-out are separate dates. Reservations and unexpired optional holds protect the stay and reset day. Proposal acceptance, manual booking and completed agreement signing check availability; a sales-board label alone cannot reserve inventory.
- New standard agreements use the seasonal rental packet and Schedule A. The issued packet is stored with the record. Signed originals remain immutable; custom text is an explicit exception.
- Forms prefill mapped information, retain answer history and reject conflicting revisions. Staff review selected answers before applying them to booking details.

## Access and notifications

Admins manage staff, backups, refunds, damage deposits and reconciliation. Full staff use the daily CRM. Event-only logins see assigned preparation, tasks and inspections, without access to contracts or financial records. Changing passwords or access revokes old sessions.

Resend or SMTP sends email. Provider acceptance is recorded separately from failure or an unknown outcome; it does not establish inbox delivery. Ordinary failed messages can be retried after review. Private links are reissued from their original record so stale signing or form links are not resent blindly. SMS and optional Stripe require their own provider configuration.

## Run locally

Use Node 22.23.0 or a later compatible Node 22 release (Vite 8 requires at least Node 22.12).

```sh
npm run install:all
cp server/.env.example server/.env
npm run dev
```

Client: `http://localhost:5173`; API: `http://localhost:3001`. Set `ADMIN_EMAIL_LOGIN` and a unique `ADMIN_BOOTSTRAP_PASSWORD` of at least 12 characters to establish an admin login. Remove the bootstrap variable after it has been applied. The login screen does not advertise seed credentials.

```sh
npm test --prefix server
npm run build --prefix client
npm audit --prefix server
npm audit --prefix client
npm run verify-backup --prefix server -- /absolute/path/to/saved-copy.db
```

Use disposable databases and synthetic contacts for rehearsals. Production requires a persistent volume, explicit access configuration and configured providers. [DEPLOY.md](DEPLOY.md) describes release, recovery and rollback. Never use the destructive demo reset against business data.
