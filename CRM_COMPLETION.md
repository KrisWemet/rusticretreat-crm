# CRM completion candidate

Prepared September 27, 2026. The implementation is on `codex/crm-completion`, based on the newer local work at `34e0953` and integrated with the latest help update at `9dd149d` from `claude/wedding-crm-esign-integration-coau0z`. The original local checkout was left intact. No production deployment, real message, real signature or real charge was performed.

## Delivered improvements

| Plan area | Result |
| --- | --- |
| Protect records | Archive rather than erase business history; signed/locked agreements and financial history resist deletion. Current account permissions and session version are checked on requests; access and password changes invalidate old sessions. |
| Reliable money | Immutable receipt ledger with integer cents, partial transfers, actual dates/references, refunds, overpayments and audited allocation corrections. Wedding records, bookings, invoices, reminders, statements and analytics derive balances from receipts. Rebuilding a schedule retains paid obligations and allocates the remainder. Damage deposits have a separate received/returned/retained register. |
| Booking lifecycle | Ceremony and occupancy dates are separate. Sales stages cannot invent reservations or release booked dates. Explicit cancellation/reopening requires reasons; availability protects the stay and reset day, including active holds. Signing conflicts remain visible with a staff task rather than a false reservation confirmation. |
| Agreements | Both standard creation paths use the seasonal rental agreement and Schedule A; known partner details, ceremony/stay dates, package and quoted total prefill the packet. Issued packet snapshots preserve terms. Signed originals and attachments remain readable and protected. Custom text is an explicit exception. |
| Follow-ups | Next action, owner and due date remain visible independently of the contacted marker, with quick rescheduling/completion. Today brings together actionable work. Website retries do not duplicate the same submission/task. |
| Notifications and cards | Durable email jobs retain failures and unknown outcomes with reviewed retry; private links are reissued from their source. Provider acceptance is labelled honestly. Signed Stripe test webhooks reject mismatched obligations and duplicate receipts; ambiguous or unmatched card money stays in an owner review queue. |
| Daily usability | Grouped navigation, global search by either partner/contact or ceremony/stay date, one wedding workspace, preselected conversation/tour/reservation/agreement/payment shortcuts, mapped form prefill and staff review, draft persistence/revision conflict protection, saving/error states, dialog focus control and a useful page-load recovery screen. The existing workspace cards were retained rather than adding a second parallel record view. |
| Event operations | Arrival/departure instructions, vendor/power and setup plans, readiness/closeout notes, nightly camping/RVs, immutable inspections/photos, separate damage-deposit disposition, reusable relative-date tasks and a printable handover. Checkout tasks follow checkout rather than the ceremony. Assigned-event logins have server-enforced operational access without financial or contract privileges. |
| Recovery and release | Existing scheduled local/off-site backup support retained; new read-only verification and fresh-instance restore test cover the new records and DB-held files. Async route failures reach the error handler; fatal process errors close the server and exit for platform restart. Release/rollback instructions and built-in guides reflect current behavior. |
| Performance/dependencies | Admin, portal and public pages load in separate chunks. Vulnerable dependencies were updated with lockfiles; both dependency audits report zero known vulnerabilities. Demo login advertising, unsupported statistics and disabled-portal prompts were removed. |

## Verification evidence

- **131/131 server tests pass**, with no skipped or cancelled tests: [server output](docs/verification/server-tests.txt). Coverage includes record protection, current-account authorization, partial/refunded/corrected money, schedule regeneration, holds/conflicts, cancellation/reopening, distinct ceremony/stay dates, public three-party signing, packet snapshots, form revisions/review, scoped event access, provider failures/retries, website deduplication and signed Stripe webhook reconciliation.
- **Production client build passes**: [build output](docs/verification/client-build.txt). Initial JavaScript bundle: `dist/assets/index-Bt4um5UH.css                    54.06 kB │ gzip:  9.55 kB`. The original audit observed approximately 660 kB / 173 kB gzip; this is a build-size comparison, not a measured phone loading-time claim.
- **Zero reported vulnerabilities** in the locked client and server dependency graphs: [server audit](docs/verification/audit-server.json), [client audit](docs/verification/audit-client.json).
- **Fresh-instance recovery passes:** an online snapshot is checked for integrity and foreign keys, opened in a separate child process, and used to log in and retrieve a wedding, partial receipt/reference, correct balance, private form answers, signed record, PDF attachment, camping, deposit balance and inspection photo bytes. Tests use disposable synthetic databases and no live providers.
- **Observed browser checks:** synthetic staff login and phone-only enquiry; a $250 receipt followed by a $50 refund leaves $200 received/$800 outstanding in the record and payment screens; public form draft saves, survives reload and submits; next action survives reload; event instructions/readiness save and reload; arrival inspection saves. The tour and agreement shortcuts open with the couple selected. At 390 px, the checked record/dialog fit the viewport; closing the operations dialog restores focus to its opener. These checks do not establish every page, keyboard sequence or real-device journey.

## Operating choices

The staff-first workflow and disabled couple portal are preserved. A label in the sales board never reserves a date. Existing manual reservation, accepted-proposal and fully signed agreement paths perform availability checks. Date holds are optional, default to seven days and allow 1–30 days; expired holds release inventory automatically through availability queries. Owners choose when to create them.

Damage deposits are recorded separately from venue revenue using actual amounts and disposition; the approved packet retains its existing deposit terms. No new automatic cancellation/refund policy was invented. Imported signed records remain attached to the wedding; staff explicitly create/check the reservation and financial schedule. Amendments require a new agreement record and signature process, retaining the original. Historical template terms that changed before snapshot storage cannot be reconstructed retroactively.

## Historical backup review

The database formerly tracked in Git was reviewed using a read-only extracted copy and aggregate queries. Integrity was `ok`; it contained 4 couples, 2 bookings, 2 contracts, 5 messages, 6 invoices and 2 users. All couple email addresses used `example.com`; no live contact email addresses were found in that check. This does not prove every field is free of sensitive material. The file is absent from the current tree but remains in Git history. History was not rewritten and credentials were not rotated by this task.

## Required before production acceptance

1. Confirm the hosting service's authoritative source branch and deployed SHA, persistent volume, environment settings, approved seasonal prices/GST/add-ons, staff assignments and the packet terms. The release candidate is prepared; the live commit was not verified or changed.
2. Rehearse the inquiry → tour → proposal → agreement → reservation → partial payment → event closeout workflow on staging with designated test contacts. Observe the plan's 10-second lookup, 15-second next-action and 30-second payment targets with the actual administrator; they have not been timed in an owner usability session.
3. Check configured Resend/SMTP and any wanted SMS sender/number using designated contacts. Provider acceptance does not establish inbox delivery; delivery/bounce callbacks are not enabled/verified here. Repeat phone signing and form journeys on real devices without a staff session.
4. Exercise the actual Stripe sandbox integration and owner reconciliation workflow if card checkout will be enabled. Automated tests use signed events and a stub, not real charges.
5. Download a recent backup from the actual restricted off-site bucket and restore it on a disposable host, preserving secrets/configuration separately. Confirm retention, last-success indicators, monitoring and the documented rollback with the hosting setup. The synthetic database restore passes; a real bucket/host restore remains an external acceptance check.
6. Perform the controlled production smoke test after an approved release. Do not send test material to genuine couples. Record results and deployed SHA in the handoff.

See [README](README.md) for operation, [DEPLOY](DEPLOY.md) for release/recovery and [HANDOFF](HANDOFF.md) for venue context. This is a verified code candidate, not a declaration that live acceptance is finished.
