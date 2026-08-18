# Deploying the Rustic Retreat CRM

The CRM and the contract e-signing are one application — there is no separate
e-sign service to run or connect. Deploying this repo deploys both.

This app is **not** connected to the public wedding website. It is a private
staff tool plus a couple-facing portal, and nothing here reads or writes the
marketing site.

---

## Deploy on Railway (current path)

Railway runs the app as a normal long-lived Node process, which is what this
codebase is built for: SQLite on disk, and two background schedulers (payment
reminders and lead nurture) that need a process that stays alive between
requests.

### 1. Create the service

Point Railway at this repo and branch. `railway.json` already sets the build and
start commands, and the healthcheck at `/api/health`.

### 2. Attach a volume — do this before the first deploy

**This is the step that protects your books.** Railway replaces the application
directory on every deploy. A database written there is destroyed on the next
push, silently and completely.

1. Add a volume to the service, mounted at `/data`.
2. Set `DB_PATH=/data/rusticretreat.db`.

The server refuses to boot in production if `DB_PATH` is missing or points
inside the app directory, so a misconfiguration fails the deploy instead of
quietly erasing every booking, invoice and signed contract. If you see that
error, the volume is not attached correctly — fix it rather than working around
it.

### 3. Set environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `NODE_ENV` | yes | Set to `production`. Enables serving the built client and the persistence guard. |
| `DB_PATH` | yes | Must be on the mounted volume, e.g. `/data/rusticretreat.db`. |
| `CRM_GATE_KEY` | yes* | Shared secret in front of the whole app. Without the cookie every path 404s. Generate with `openssl rand -hex 24`. |
| `BASE_URL` | yes | Public URL of the deployed app. Used in emails and Stripe redirects. |
| `ADMIN_BOOTSTRAP_PASSWORD` | first boot | Resets the admin password. See below. |
| `RESEND_API_KEY` | **yes** | Contract signing links are emailed to each partner individually, so signing does not work without email. Create a sending key at resend.com. |
| `SMTP_FROM` | **yes** | Sender address, on a domain verified with your email provider — e.g. `Rustic Retreat <noreply@rusticretreatalberta.ca>`. |
| `ADMIN_EMAIL` | recommended | Where staff notifications go when a contract completes. |
| `SMTP_*` | alternative | Your own SMTP server, used only when `RESEND_API_KEY` is unset. Many hosts block outbound SMTP, which is why Resend's HTTPS API is the default. |
| `STRIPE_*` | optional | Card payments. Unset, the portal falls back to e-Transfer. |
| `SIGNING_LINK_DAYS` | optional | How long a contract signing link stays valid. Defaults to 45 days. |
| `ENABLE_COUPLE_PORTAL` | leave unset | The couple portal is switched off. Signing does not create portal logins and the confirmation email omits the portal link. Set to `1` when you are ready to run it. |

\* `CRM_GATE_KEY` is required in production. To intentionally run without the
gate, set `CRM_PUBLIC=1` instead — but note the seeded staff passwords are in
this repo's git history, so do the password rotation below first.

### 4. Rotate the seeded passwords on first boot

The repo ships with `admin@rusticretreat.com` / `admin123`, which is public in
git history. On your first deploy:

1. Set `ADMIN_BOOTSTRAP_PASSWORD` to a strong password (12+ characters).
2. Deploy and log in.
3. **Unset the variable** — it reapplies on every boot while set.

That bootstrap also disables the second seeded staff login and the seeded couple
portal logins, so no published credential stays usable.

### 5. Confirm email actually sends

Signing is a three-party chain — venue, then each partner — and each partner is
emailed their own link when their turn comes. If email is not working, the
contract locks after you sign and then silently stalls.

The CRM does not pretend otherwise: when a signing link fails to send, the API
reports it and the Contracts screen shows an "Email not delivered" banner with
the link so you can pass it on by hand. A green toast means it genuinely left
the server.

To verify: create a test contract against a couple whose two email addresses you
control, sign it as the venue, and check that partner 1 receives the link.

### 6. Clear the demo data when you are ready for real books

The app deploys seeded with sample couples, bookings and invoices so every
screen has something in it while you click through. That fake revenue will
otherwise sit in your analytics and revenue totals next to real bookings.

When you are ready to start entering real data:

```bash
# in a Railway shell on the service, with DB_PATH set as above
npm run reset-data --prefix server -- --yes
```

This clears couples, bookings, invoices, contracts, messages, tasks, tours and
per-couple vendor lists. It keeps your staff logins and your venue setup
(packages, add-ons, forms). Add `--everything` to clear the venue setup too.

It refuses to run without `--yes`. Signed contracts are business records —
download the database file first if there is any chance you still need them.

---

## Moving to Vercel later

Vercel is the eventual target, but it needs one substantial change first, and
it is worth being clear about why.

Vercel runs serverless functions: no persistent disk, and no process that
survives between requests. That breaks three things here:

1. **SQLite on disk.** `better-sqlite3` writes to a file. On Vercel only `/tmp`
   is writable, it is not shared between invocations, and it does not persist.
   The books would not survive.
2. **The background schedulers.** `setInterval` in `paymentReminder.js` and
   `leadNurture.js` needs a live process. On Vercel these become Cron Jobs
   hitting an endpoint.
3. **`app.listen()`.** The server exports the Express app, so this part is a
   small change — the entry point becomes a serverless handler.

The real work is (1): moving to Postgres. Every route uses `better-sqlite3`'s
**synchronous** API — `db.prepare(...).get()`, `.all()`, `.run()` — across
**325 call sites in 25 files**. A Postgres driver is asynchronous, so each of
those becomes `await`, and every handler containing one becomes `async`. The two
`db.transaction()` blocks (`portal.js`, `proposals.js`) need converting too.

A Supabase project named **Rustic-Retreat-CRM** already exists and is active
(`aztaffrywreshzyzraiz`, Postgres 17). It currently holds an unrelated,
empty schema from an earlier attempt — 25 tables that do not match this app's
schema — so the migration would define this app's tables fresh rather than
reuse them. **13 of those existing tables have Row Level Security disabled**,
which means anyone holding the project's anon key can read or write them. That
matters before anything real is stored there.

Suggested order when you want to pick this up:

1. Port the schema from `server/db.js` to a Supabase migration.
2. Introduce an async DB wrapper and convert routes module by module, starting
   with the money paths: couples, bookings, invoices, payments, contracts.
3. Replace the two schedulers with Vercel Cron Jobs.
4. Swap the entry point to a serverless handler and deploy to the existing
   `rustic_retreat_crm` Vercel project.

Until then Railway runs the same codebase with no changes at all.

---

## Running locally

```bash
npm run install:all
cp server/.env.example server/.env
npm run dev
```

Client on `http://localhost:5173`, API on `http://localhost:3001`.
Log in with `admin@rusticretreat.com` / `admin123`.

The persistence guard only applies when `NODE_ENV=production`, so local
development uses `server/rusticretreat.db` as before.
