# Completion release and recovery

The current candidate is `codex/crm-completion`; its review base is `claude/wedding-crm-esign-integration-coau0z` at `9dd149d`. This task has not changed the live deployment. Confirm the hosting service’s source branch and actual deployed SHA before releasing. Older notes below describe prior setups, not newly verified production state.

## Release checks

1. Use Node 22.23.0 or a compatible Node 22 version at least 22.12. Install both lockfiles, run the server tests and build the client.
2. Record the running commit and take a SQLite online backup from Backups. Download an additional copy and verify that the configured off-site bucket has a recent readable copy.
3. Keep `DB_PATH` on the persistent volume and retain the existing `JWT_SECRET` or volume `.jwt-secret`. Check `BASE_URL`, allowed website origins, admin notification address, sending identity and access gate. Public signing/form/proposal endpoints must remain accessible without a staff gate cookie.
4. The completion schema is additive. Existing paid rows become legacy receipt entries, retaining unknown dates as unknown. Existing signatures and attachments are preserved. New packet snapshots apply to new or newly locked agreements; historical template definitions cannot be reconstructed if they had changed before this release.
5. Rehearse against a restored copy with synthetic contacts and disabled or sandbox providers before production. Confirm both signer identities, separate ceremony/stay dates, the approved price/GST breakdown, one schedule, a partial receipt/refund, mapped-form review and cancellation/rebooking.
6. After the controlled production release, verify the actual SHA, health, a designated test contact, daily job status, last local/off-site backup and restricted staff permissions. Record those results in the handoff.

## Read-only backup verification

Run against a saved copy, not the working database:

```sh
npm run verify-backup --prefix server -- /absolute/path/to/downloaded-copy.db
```

The tool checks SQLite integrity, foreign keys, key table counts and SHA-256 without booting the app, running migrations or sending notifications. The database includes contract attachments and inspection photo bytes. Preserve provider settings and signing/gate configuration separately; they are not all inside the SQLite file.

## Recovery rehearsal

Restore a downloaded off-site snapshot into a **separate directory and instance**. Preserve the original snapshot and environment settings. First run the read-only verification above. Boot the separate instance using a distinct `DB_PATH`, port and URL, no real email/SMS/Stripe credentials and a designated test admin account. Opening a migrated copy can create pre-migration snapshots; allocate enough space.

Open a known wedding, receipt history, saved form answers, a signed agreement and its attached document. Open an inspection photo and confirm camping/readiness notes and damage-deposit history. Check pending signatures/forms and the assigned-event login. Compare record counts and amounts with the original snapshot. Record elapsed recovery time and any missing external configuration. Automated tests demonstrate synthetic snapshot recovery; a real bucket download and host restoration remain to be demonstrated.

## Production rollback

Stop writes and stop the app before replacing a database. Retain the current database **and its WAL/SHM sidecars** together as a rollback set; never copy only the live `.db` while writes continue. Restore a verified snapshot into the stopped instance, use the matching application revision and retain the required secrets and environment configuration. Restart, verify integrity and the representative records, then reopen writes.

Do not blindly run an old application against a new receipt ledger: an old app could calculate money from obsolete paid flags or offer destructive actions. If returning to an old release, use a matching pre-upgrade database and reconcile any transactions recorded after that snapshot. Never delete real data with the demo reset command.

---

# Historical hosting notes

# Deploying the Rustic Retreat CRM

The CRM and the contract e-signing are one application — there is no separate
e-sign service to run or connect. Deploying this repo deploys both.

The app provides website enquiry, booking-request and public availability endpoints.
The marketing site must be configured to call them with an allowed origin. The
couple portal remains disabled by default; public signing, proposals and private
form links operate separately from staff login.

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
| `SMS_PROVIDER` | optional | `telnyx` (default) or `twilio`. Texting is off until the credentials below are set; messages still record in the CRM, they just do not reach a phone. |
| `SMS_FROM_NUMBER` | for texting | The venue's provider number in E.164, e.g. `+15875550100`. Every text is sent from it. |
| `TELNYX_API_KEY` | for texting | Telnyx API key. Use `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` instead when `SMS_PROVIDER=twilio`. |
| `TELNYX_PUBLIC_KEY` | for texting | Base64 Ed25519 key from the Telnyx portal, used to verify inbound webhooks. Without it every inbound text is refused, which is the safe failure. |
| `SMS_WEBHOOK_URL` | twilio only | The exact public webhook URL configured at Twilio. Twilio signs the URL it was given, and behind Railway's proxy the request arrives as http, so the https URL is stated rather than inferred. |
| `STRIPE_*` | optional | Card payments. Unset, the portal falls back to e-Transfer. |
| `SIGNING_LINK_DAYS` | optional | How long a contract signing link stays valid. Defaults to 45 days. |
| `ENABLE_COUPLE_PORTAL` | leave unset | The couple portal is switched off. Signing does not create portal logins and the confirmation email omits the portal link. Set to `1` when you are ready to run it. |
| `BACKUP_INTERVAL_HOURS` | optional | How often to snapshot the database. Defaults to 24. Set to `0` to disable. |
| `BACKUP_KEEP` | optional | How many snapshots to retain. Defaults to 14. |

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

## Backups

The app snapshots its own database every 24 hours into `backups/` beside the
database file — so on Railway, onto the volume. It keeps the most recent 14 and
takes one a minute after each boot, so a fresh deploy always has a restore
point. **Backups** in the sidebar lists them, takes one on demand, and downloads
any of them. Admin only: a snapshot is every couple, price and signature in one
file.

Snapshots use SQLite's online backup API, not a file copy. This matters more
than it sounds. The database runs in WAL mode, where recent commits live in a
`-wal` sidecar until a checkpoint, so a cron job doing `cp rusticretreat.db`
produces a file that is stale at best and unreadable at worst — while appearing
to succeed. If you set up any backup tooling of your own, have it call this
endpoint rather than copy the file.

**What this does and does not cover.** Snapshots sit on the same volume as the
live database, so they protect you from a bad import, an accidental delete, or a
corrupted write. They do not protect you from losing the volume. For that a copy
has to leave the server — download one periodically and keep it somewhere else.
The Backups screen says so too.

To restore: download a snapshot, and replace the file at `DB_PATH` with it
(delete any `-wal` and `-shm` files sitting beside it), then restart the service.

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
Set `ADMIN_EMAIL_LOGIN` and a unique `ADMIN_BOOTSTRAP_PASSWORD` (at least 12 characters), then remove the bootstrap variable after use.

The persistence guard only applies when `NODE_ENV=production`, so local
development uses `server/rusticretreat.db` as before.
