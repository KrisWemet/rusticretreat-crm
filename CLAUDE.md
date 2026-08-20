# Rustic Retreat CRM

**Read [PROJECT_STATE.md](PROJECT_STATE.md) first.** It carries the current state
of the build, the deployment configuration, and — most usefully — the traps that
have already cost real debugging time. Keep it updated as you work.

A wedding-venue CRM with contract e-signing built in. Live on Railway. The
separate `KrisWemet/e-sign` repo is empty and irrelevant; everything is here.

The real venue agreement — 15 pages plus a mandatory 6-page Schedule A, with
twelve initials blocks and boxes both sides fill in — lives in
`server/contract-templates/` as structured data. Read `schema.md` there before
changing it, and note that **a block type has to be handled in two renderers**:
`services/contractRender.js` (printed record) and
`client/src/components/ContractDocument.jsx` (prep and signing).

## Before you change anything

**Test couple-facing changes in a browser with no session and no cookie.** Two
separate layers — the React route guard and the server's preview gate — have
each independently broken contract signing links while the API stayed perfectly
correct. Curling an endpoint proves nothing about whether a couple can use it.

**Anything that must survive a deploy goes on the volume**, beside `DB_PATH`.
Railway replaces the application directory on every push. This has already
destroyed the JWT secret once; the database is guarded against it explicitly.

**Do not upgrade `better-sqlite3` without checking the release assets.** It is
pinned to 12.11.1 because 9.x and 13.x both lack a Node 22 prebuilt binary and
fail the build.

## Working style the owner expects

They run the venue and are not a developer. What has worked:

- Verify against the running app, not just the code. Playwright and Chromium are
  installed; drive the real UI.
- Say plainly when something is broken, including when you broke it.
- Distinguish what you proved from what you assume. The sandbox cannot reach the
  live app, so "verified locally" and "verified in production" are different
  claims and should be labelled as such.
- Deployment config is verifiable through the Railway and Resend MCP connectors —
  check the live values rather than handing over strings to paste.

## Commands

```bash
npm run install:all
npm run dev                                  # client :5173, API :3001
npm run build --prefix client
npm run reset-data --prefix server -- --yes  # clear demo data; refuses without --yes
```
