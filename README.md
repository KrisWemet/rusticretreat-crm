# Rustic Retreat CRM

A wedding-venue CRM with **contract e-signing built in**. One app, one deploy,
no third-party signing service and no per-envelope fees.

It is a private tool: a staff-facing CRM plus a couple-facing planning portal.
It is deliberately **not** connected to the public wedding website.

## What's in it

**Staff side** — pipeline, couples, bookings, venue calendar, proposals,
contracts, invoices and payments, tours, tasks, forms, messages, analytics.

**Couple portal** — their own dashboard, documents, checklist, budget, guest
list, timeline, vendor list, forms, messages, and online payment.

**E-signing** — see below.

## E-signing, in house

Signing lives in this app (`server/routes/contracts.js`,
`client/src/pages/SignContract.jsx`). Nothing leaves for an external provider.

The flow:

1. Staff write a contract, or generate one pre-filled from an accepted proposal
   (`POST /api/contracts/from-proposal/:id`) — it builds a full venue services
   agreement from the proposal's line items, pricing and dates.
2. **Send** issues a single-use signing link and emails it to the couple.
   Re-sending reissues the token, so an older link stops working and the couple
   always signs the copy you last sent.
3. The couple opens the link — no login, no account — reads the terms, types
   their legal name, draws a signature, and ticks an explicit consent statement.
4. On signing, the app records the signature image, the exact consent wording
   shown, the signer's name and email, the timestamp, when the contract was
   first opened, the IP address, and the browser user agent.
5. Signing also drives the CRM forward: the couple flips to `booked`, the
   booking is created or updated from the contract's event details, and portal
   credentials are generated and shown once.
6. Both sides keep a copy. Staff print or save a PDF from the contract screen;
   the couple gets the same executed copy, audit trail included, from their own
   signing link.

Signing links expire after 45 days by default (`SIGNING_LINK_DAYS`). Expiry
gates *signing* only — a couple can always get back to a contract they have
already signed.

Electronic signatures are enforceable in Alberta under the Electronic
Transactions Act, SA 2001, c E-5.5, which the generated agreement cites. The
audit trail above exists because if a signature is ever questioned, what matters
is showing what the signer was presented with and that they affirmatively
accepted it. This is a solid in-house implementation, not a regulated
certificate-based signing service — if you ever need a notarised or
certificate-backed signature for a specific document, use a dedicated provider
for that one.

## Running locally

```bash
npm run install:all
cp server/.env.example server/.env
npm run dev
```

Client on `http://localhost:5173`, API on `http://localhost:3001`.
Sign in with `admin@rusticretreat.com` / `admin123`.

## Deploying

See **[DEPLOY.md](DEPLOY.md)**. Two things there matter more than the rest:

- **Attach a persistent volume and set `DB_PATH` to it.** Hosted platforms
  replace the app directory on every deploy; a database written there is wiped
  on the next push. The server refuses to boot in production if this is wrong.
- **Rotate the seeded passwords.** `admin123` is in this repo's git history.
  Set `ADMIN_BOOTSTRAP_PASSWORD` on first boot, then unset it.

## Clearing the demo data

The app ships seeded with sample couples and bookings so the screens have
something in them. Before you start keeping real books:

```bash
npm run reset-data --prefix server -- --yes
```

Keeps your staff logins and venue setup (packages, add-ons, forms); clears
couples, bookings, invoices, contracts and messages. `--everything` clears the
venue setup too. Refuses to run without `--yes`.

## Layout

```
client/    React + Vite + Tailwind SPA (admin + couple portal + signing page)
server/    Express API, SQLite via better-sqlite3
  routes/    one module per resource; contracts.js holds the e-sign flow
  services/  email, payment reminders, lead nurture
  db.js      schema, migrations, seed data
```
