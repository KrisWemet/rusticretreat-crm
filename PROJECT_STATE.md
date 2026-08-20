# Project state — Rustic Retreat CRM

Running handoff document. **Update it when you change something structural, hit
a trap worth recording, or change the deployment.** It exists so a new session
does not rediscover the same landmines.

Last updated: 2026-08-20 · branch `claude/wedding-crm-esign-integration-coau0z`
· HEAD `142fa8f`

---

## What this is

A wedding-venue CRM for Rustic Retreat (Alberta) with **contract e-signing built
in** — one app, one deploy, no third-party signing service.

Two repos exist. **`KrisWemet/e-sign` is empty** — one commit, a README. It never
held code. All signing lives in this repo; there is nothing to merge or
integrate. Its README now says so.

The CRM is **not** connected to the public wedding website, deliberately.

**Live:** `https://rusticretreat-crm-production.up.railway.app` on Railway,
project `refreshing-analysis` (auto-generated name), service `rusticretreat-crm`.

---

## Where things stand

Working and verified end to end on the live deploy:

- Venue signs → partner 1 emailed → they sign → partner 2 emailed → they sign
  → contract marked signed, couple booked, booking created
- Email delivery through Resend (domain `rusticretreatalberta.ca`)
- Nightly database backups onto the Railway volume, downloadable from the UI
- Contracts list shows every signer, each opening their signature + audit trail

Not done / deliberately off:

- **Couple portal is disabled** (`ENABLE_COUPLE_PORTAL` unset). The owner wants
  the venue side solid first. Signing does not create portal logins.
- **Demo seed data is still in the live database.** Sample couples and invoices
  are mixed in with real ones. Run the reset when the owner is ready (below).
- **SMS / unified inbox** — researched and scoped, not built. See below.
- **Vercel** — the original target, deferred. See below.

---

## The traps — read this before changing anything

These all cost real debugging time. Most were invisible in testing because the
API was fine and only the browser told the truth.

### Anything a couple touches must be publicly reachable — twice over

A signing link goes to someone with no login and no cookie. Two separate layers
blocked that, and each one looked fine to staff because *their* browser was
already authenticated:

1. **The React route guard** (`client/src/contexts/AuthContext.jsx`) redirected
   anything that was not a portal route or the login page. `/sign/:token` hit it
   and bounced couples to the staff login. Fixed with an explicit
   `PUBLIC_ROUTES` list. A new public page must be added there.
2. **The preview gate** (`server/index.js`) 404s every path without the
   `crm_gate` cookie. It exempted only the healthcheck and the Stripe webhook,
   so signing links answered `"Not found"`. Fixed with `PUBLIC_PATHS`. **This
   must include `/assets/` too** — these pages are served by the SPA shell, so
   blocking the bundle gives a blank screen rather than an error.

**Test any couple-facing change in a browser with no cookie and no session.**
Curling the API proves nothing; the API was correct throughout both bugs.

### Persistence: everything must live on the volume

Railway replaces the application directory on every deploy. Two things were
being written there:

- **The database.** `server/db.js` now refuses to boot in production if
  `DB_PATH` is inside the app directory, *or* if it is not inside
  `RAILWAY_VOLUME_MOUNT_PATH` when running on Railway. A failed deploy is
  recoverable; an erased ledger is not.
- **The JWT secret.** It was written to `server/.jwt-secret`, so every deploy
  generated a new key and logged out every user, staff and couple alike. It now
  lives beside the database (`server/middleware/auth.js`), and adopts a secret
  from the old location once so upgrading does not log everyone out.

If you add anything else that persists, put it next to `DB_PATH`.

### Backups must use the SQLite backup API, never a file copy

The database runs in WAL mode. A `cp` of the `.db` file while the app is running
produced a database that **could not be opened at all** — verified. `db.backup()`
is used instead (`server/services/backup.js`). If you ever wire external backup
tooling, have it call `POST /api/backup`, not copy the file.

Backups sit on the same volume as the database, so they cover a bad import or an
accidental delete but **not** losing the volume. Off-site means downloading one.

### Email must report whether it actually sent

`server/services/email.js` `send()` returns `{ delivered, error }` and never
throws. It used to swallow failures, so the CRM told staff a couple had been
emailed their signing link when nothing had left the server.

- Signing-link sends **must** check the result and surface failure.
- Incidental notifications may ignore it — a failed courtesy email must not roll
  back a signature already recorded.

Resend's HTTP API is preferred over SMTP because hosted platforms block SMTP
ports. `RESEND_API_URL` is overridable so the send path can be tested against a
local stub.

### 401 vs 403 is load-bearing

`server/middleware/auth.js` returns **401** for an unusable token and **403** for
a valid session lacking permission. The client ends the session on 401 only.
Conflating them either strands a signed-out user on a dashboard whose every
request fails, or logs out a staff member who merely hit an admin-only route.

### The UI must not trust data it fetched once

Couples sign from their own phones. The contracts list fetched on mount and
never again, so a fully executed contract kept showing "Sent" — and a stale
status is indistinguishable from a current one. It now refreshes on tab focus,
visibility change, and a slow interval. Apply the same thinking to any screen
showing state that changes off-screen.

### Requiring a field means providing somewhere to enter it

Partner 2's email became required for signing, but the public enquiry form never
collects one and the client detail page had no field — so every couple arriving
through the website could never be given a contract, with nowhere to fix it.
When you make something required, check every path that creates the record.

### `better-sqlite3` and Node 22

Version 9 has no Node 22 prebuilt binary and falls back to compiling with
node-gyp, which needs Python that the build image lacks. Pinned to **12.11.1**.
Do not blindly upgrade: **13.x also has no Node 22 binary** and reintroduces the
identical build failure. Verify the release asset exists before bumping.

---

## Architecture notes

```
client/    React 18 + Vite + Tailwind SPA (admin, couple portal, public signing)
server/    Express 4 + better-sqlite3 (synchronous)
  routes/    one module per resource; contracts.js holds the signing chain
  services/  email, backup, paymentReminder, leadNurture
  db.js      schema, additive migrations, seed data
```

### The signing chain

`contract_signers` — one row per signer, `sign_order` 1 venue → 2 partner1 →
3 partner2. Each row has its own token, status and audit fields.

- A token is **only issued when it is that person's turn**, so a later signer's
  link does not exist yet rather than existing and being refused.
- Order is enforced on read *and* write, so a replayed POST cannot jump ahead.
- **The venue signing sets `contracts.locked_at`** and the edit endpoint refuses
  all changes from then on. This is the point of signing first — the couple must
  be signing the document the venue committed to.
- A contract becomes `signed` only when nobody is left. Until then no booking is
  created and the couple is not marked booked — none of that should fire off a
  half-signed agreement.
- `contracts.signer_name` / `signature_data` are **legacy single-signer columns**,
  kept for contracts signed before this existed. They hold whoever signed *last*.
  Never use them to describe who signed — read `contract_signers`.

### Conventions worth matching

- Migrations are additive `ALTER TABLE` in `try/catch` blocks in `db.js`.
- Schedulers: run once at boot, `setInterval`, `.unref()`, `.catch()` per run.
- Routes: `res.status(N).json({ error })`, auth middleware per-route.
- The rate limiter is a factory: `rateLimit({ windowMs, max, name })`.

---

## Deployment

Railway, `refreshing-analysis` / `rusticretreat-crm`. Volume mounted at `/data`.

Variables currently set (verified 2026-08-20):

| Variable | Value / note |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_PATH` | `/data/rusticretreat.db` — must be on the volume |
| `CRM_GATE_KEY` | set — gate cookie, everything else 404s |
| `BASE_URL` | the Railway URL; used to build signing links |
| `RESEND_API_KEY` | set — sending key scoped to the domain |
| `SMTP_FROM` | `Rustic Retreat <noreply@rusticretreatalberta.ca>` |
| `ADMIN_EMAIL` | `ouimettest@gmail.com` |
| `ADMIN_BOOTSTRAP_PASSWORD` | **empty on purpose** — see below |
| `ENABLE_COUPLE_PORTAL` | unset, portal off |
| `JWT_SECRET` | not set; the secret persists on the volume instead |

`ADMIN_BOOTSTRAP_PASSWORD` resets the admin password on *every* boot while it
has a value. It is set to empty rather than deleted because the Railway MCP has
no delete-variable tool; `if (!pw) return` short-circuits it. Deleting the row in
the dashboard is tidier and equivalent.

**Admin login:** `admin@rusticretreat.com` — password was set via the bootstrap.
The seeded `admin123` and the second staff login are disabled.

**Reaching the app:** `https://<host>/?gate=<CRM_GATE_KEY>` sets a 30-day cookie.
Without it every non-public path 404s, by design.

**Resend:** domain `rusticretreatalberta.ca` shows `partially_failed`, which is
misleading — DKIM and SPF are **verified**; only the inbound MX record failed,
and that is for receiving, not sending.

### Known deployment wrinkle

Nixpacks promotes environment variables to Docker build args, so secrets appear
in image layers (the build log warns about it). Deleting a variable does not
remove it from images already built. Low impact — only the account owner can pull
those images — but do not reuse those secret values elsewhere.

---

## Deferred work

### SMS / unified inbox (researched, not built)

The owner asked whether SMS, Facebook Messenger and email could land in one
inbox. Today's **Messages is an internal portal inbox only** — `messages` has
`sender_type CHECK IN ('staff','couple')`, `couple_id NOT NULL`, no channel
column, no external id, and no inbound route. There is no telephony dependency.

Decisions already taken by the owner:

- **Port the existing business number** to Twilio (not a new number).
- Unknown senders land in an **unassigned inbox** to be linked by hand — no
  auto-created leads.
- **Email notification** per inbound message (Resend already works).

Not yet resolved: whether that number takes voice calls. Porting it to Twilio
without configuring voice forwarding would stop calls working — check before
starting.

Schema work it implies: a channel column, contact identities (a phone number is
not an email address), threads that survive one person messaging from several
places, and inbound messages from people who are not yet a couple — which
`couple_id NOT NULL` cannot represent.

Phone numbers are stored as free text, `(780) 555-1234` style, with no
normalisation anywhere. Twilio needs E.164 (`+17805551234`).

Facebook Messenger was assessed as poor value: Meta app review takes weeks and
replies are limited to 24 hours after the customer's last message.

### Vercel (original target, deferred)

Deferred because it needs Postgres first: every route uses `better-sqlite3`'s
**synchronous** API across roughly **325 call sites in 25 files**, all of which
become `async`, plus two `db.transaction()` blocks and three `setInterval`
schedulers that need a live process. A Supabase project `Rustic-Retreat-CRM`
exists (`aztaffrywreshzyzraiz`, Postgres 17) holding an unrelated empty schema.
**13 of its tables have RLS disabled** — fix before storing anything real.

See `DEPLOY.md` for the full write-up.

### Smaller open items

- Demo seed data still in the live database. Clear with
  `npm run reset-data --prefix server -- --yes` (keeps logins and venue setup;
  `--everything` also clears packages/add-ons/forms; refuses without `--yes`).
- No off-site backup — snapshots are downloaded by hand today.
- The printable executed contract has never been eyeballed by the owner.
- `GET /api/messages/unread/count` is dead code; the sidebar Messages badge is
  wired but never fed.

---

## Testing

There is no test suite. Verification has been: run the production build locally
and drive it with Playwright + Chromium (`/opt/pw-browsers/chromium`,
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; do not run `playwright install`).

```bash
npm run build --prefix client
NODE_ENV=production DB_PATH=/tmp/x/test.db PORT=3060 CRM_PUBLIC=1 \
  RESEND_API_KEY=re_test RESEND_API_URL=http://localhost:3099/emails \
  node server/index.js
```

`CRM_PUBLIC=1` runs without the gate. A tiny stub on `:3099` accepting
`POST /emails` lets the send path be exercised without touching Resend.

Two environment limits worth knowing: this sandbox's egress proxy **blocks
`*.railway.app` and `api.resend.com`**, so the live app cannot be reached from
here and email can only be tested against the stub. Google Fonts is blocked too,
which produces a harmless `ERR_CONNECTION_RESET` in every browser test.

Railway and Resend are reachable through their MCP connectors — deploy status,
logs, variables, and Resend's delivery log are all readable, which is how the
live configuration above was verified. The Railway connector drops and needs
re-authorising periodically.
