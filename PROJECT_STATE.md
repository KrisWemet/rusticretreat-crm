# Project state — Rustic Retreat CRM

Running handoff document. **Update it when you change something structural, hit
a trap worth recording, or change the deployment.** It exists so a new session
does not rediscover the same landmines.

Last updated: 2026-08-20 · branch `claude/wedding-crm-esign-integration-coau0z`
· HEAD `d9104bf`

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

### The CRM issues two different contracts, and they contradict each other

**Unresolved — the owner is supplying the real contract text.** Until then, do
not treat either document as authoritative.

Staff can produce a contract two ways, and the two produce materially different
agreements for the same venue:

| | New Contract button | Generate from a proposal |
| --- | --- | --- |
| Where | `client/src/pages/admin/Contracts.jsx` `DEFAULT_TERMS` | `server/routes/contracts.js` `from-proposal` |
| Cancel 120 days out | deposit only | 50% of total |
| GST | not mentioned | itemised, 5% |
| Payment schedule | referred to, absent | real dates |
| Force majeure | absent | present |
| Guest cap | none | 80 |
| Fire bans | fireworks promised outright | subject to Alberta restrictions |
| Generators off 10 PM | present | absent |

On a $7,350 booking the cancellation row alone is a $3,675 difference decided by
which button staff happened to click. Neither matches how the venue actually
invoices (25% / 25% at 90 days / 50% at 30 days). `DEFAULT_TERMS` also has an
overlap at exactly 60 days between its 50% and 100% cancellation bands, which
reads against the venue as the drafter.

`contracts` has **no end-date column**, so a manually written contract cannot
state which days a multi-day package covers — while its clause 1 refers to "the
first day" and "the final day". `proposals` does have `end_date`; the
proposal-derived contract prints it into the body but the contract row drops it.

**When the real contract text arrives, both paths must render the same document.**

### Anything printed into a signed document is a promise

The contract told couples to e-transfer to `info@rusticretreat.com` and the
portal payment page said `payments@rusticretreat.com` — two different addresses,
both on a domain the venue does not send email from. Either one sends a couple's
deposit to a mailbox nobody reads.

The address now lives in `server/venue.js` and is served to the portal through
`GET /api/payments/config`, so the contract and the portal cannot drift apart.
Override with `ETRANSFER_EMAIL`.

The confirmed recipient is **`rusticretreatalberta@gmail.com`** — a Gmail
address, deliberately *not* on `rusticretreatalberta.ca`. That domain sends the
venue's email; the e-Transfer account is registered to the Gmail. Do not
"tidy" it to match the sending domain.

The same contract also directed payment "online through the client portal" while
the portal is switched off. It now only says that when `ENABLE_COUPLE_PORTAL` is
set. Check any couple-facing sentence against what is actually turned on.

### SQLite integers are not booleans in JSX

`inv.paid` comes back as `0`, and React renders `{inv.paid && <x/>}` as a literal
"0" on the page. A stray zero sat under every unpaid invoice on the couple's
payment page and the admin one. Guard integer flags with `!!`. Three more sites
still do this with `guest_count`, harmless only because a guest count of zero
does not occur in practice.

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

### Template-backed contracts (the real venue agreement)

The venue's actual contract is a 15-page rental agreement plus a mandatory
6-page Schedule A. Both are transcribed into `server/contract-templates/` as
structured block lists — wording verbatim from the owner's PDFs, structure ours.
`schema.md` in that folder is the block reference.

```
contract-templates/rental-agreement-2027.js   13 sections, 12 initials blocks,
                                              11 venue fields, 22 client fields
contract-templates/schedule-a-2027.js         14 sections, rules only, no fields
services/contractTemplate.js                  packets, values, initials, schedule
services/contractRender.js                    → static HTML for the printed record
client/src/components/ContractDocument.jsx    → React for prep + signing
```

**A packet is what gets signed.** Section 12.1 of the rental agreement makes the
booking incomplete until Schedule A is signed too, so the two never travel
separately: one link, one ceremony, both documents, and a consent statement that
names both by title. Sending them apart would recreate by hand the half-executed
booking that clause exists to prevent.

**Two locks, not one.** `locked_at` freezes the terms and the venue's fields when
the venue signs. `client_fields_locked_at` freezes the couple's answers when
Client 1 submits, so Client 2 initials and signs the same document rather than
one still moving. Client 2 gets a read-only view; if something is wrong the
contract has to be reissued, which is the correct outcome.

**The venue cannot sign an incomplete contract.** Signing is one-way, so a blank
required field would be blank forever on a document the couple is then bound by.
`POST /:id/sign-venue` refuses and names what is missing.

**No bulk initials.** Twelve clauses, each initialled by its own click, each row
carrying its own timestamp, IP and user agent. The point of separate initials is
separate acknowledgment; an "initial everything" button would defeat it. The
signing page compensates with a progress counter and a jump-to-next control
instead.

**Two renderers, one vocabulary.** `contractRender.js` produces the static
printed record; `ContractDocument.jsx` produces the interactive one. They are
deliberately separate — the printed record must not depend on a bundle running —
but **adding a block type means editing both**. That is the one place in this
feature where a change has to be made twice.

Free-text contracts still work unchanged: `template_key IS NULL` keeps the old
renderer and the old flow, so already-executed agreements print as they always
did.

### Print stylesheets: `@media print` goes last, with `!important`

The printable contract and proposal both carry a red toolbar marked `.noprint`.
It **printed onto the page anyway** — the venue's signed business record came out
with a "Save as PDF / Print" button on it. Neither rule was wrong: `.noprint`
inside `@media print` and `.bar { display:flex }` have identical specificity
(0,1,0), and `.bar` was written *later* in the stylesheet, so source order gave
it the win. A media query grants no extra weight.

Both files now put the `@media print` block at the **end** of the stylesheet and
use `display: none !important`. Verify with Playwright's `emulateMedia({media:
'print'})` and read the *computed* style — `isVisible()` on a screen-media page
tells you nothing about what lands on paper.

### An async route handler without try/catch kills the whole server

Express 4 does not catch a rejected `async` handler. The rejection escapes to
the process and Node treats an unhandled rejection as fatal, so **one failed
email inside one request takes the entire CRM offline** and every page answers
502 until the platform restarts it. `POST /api/proposals/:id/send` did exactly
this.

Proven, not assumed: a minimal Express app with one rejecting async route
answers 200, then 000 — process gone — after a single request to it.

`index.js` now installs `unhandledRejection` and `uncaughtException` guards that
log under `[FATAL-GUARD]` and keep serving. They are a net, not a licence:
**every async handler still needs its own try/catch.** Audit with

```bash
grep -n "async (req, res)" server/routes/*.js   # then check each has try {
```

**Reading a 502:** it is never a route or auth problem — those are 404 and
401/403. 502 means nothing was listening. `GET /api/health` reports
`uptime_seconds`; if it keeps resetting to a few seconds, the process is
crash-looping.

### A modal closing is not the same as its children not rendering

Closing the prep screen set `prepContract` to null while the modal still held the
loaded contract data, and its body read `contract.title`. The whole Contracts
page went white. `Modal` returns null when closed, which feels like protection
and is not: React evaluates a component's children before Modal ever decides
whether to render them. Clear the loaded data when the subject goes away, and
guard the body on the subject as well as on the data.

This was the third change in this project that was correct at the API and broken
in the browser. Curl proves nothing here.

### Never put a backtick inside HTML that lives in a template literal

While fixing the above I wrote a CSS comment containing `` `.noprint` ``. Those
backticks closed the surrounding JS template literal, and both print routes
started returning 500 (`esc(...).noprint is not a function`). The file still
*parsed* — `node -e "require('./routes/contracts.js')"` passed happily — because
the result was syntactically valid JavaScript, just nonsense. A parse check is
not a smoke test; fetch the route.

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
- The printable executed contract has never been eyeballed by the owner in
  production (verified locally: toolbar hidden, three signature blocks, all
  three parties labelled).
- `GET /api/messages/unread/count` is dead code; the sidebar Messages badge is
  wired but never fed.
- `ETRANSFER_EMAIL` is **not set on Railway**. Not urgent: the built-in default
  is the confirmed address, so the live app is already correct.
- The two contract templates still disagree; see the trap above.

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
