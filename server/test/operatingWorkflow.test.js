const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  http = require("http");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rr-operating-"));
Object.assign(process.env, {
  DB_PATH: path.join(tmp, "test.db"),
  NODE_ENV: "production",
  JWT_SECRET: "operating-tests",
  RESEND_API_KEY: "synthetic-only",
  STRIPE_SECRET_KEY: "sk_test_synthetic",
  STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
});
delete process.env.SMTP_HOST;
let db,
  server,
  stub,
  base,
  email,
  mailStatus = 200;
const received = [];
const auth = (id) =>
  "Bearer " +
  require("jsonwebtoken").sign(
    { userId: id, role: id === 1 ? "admin" : "staff" },
    process.env.JWT_SECRET,
  );
async function call(method, url, body, token = auth(1)) {
  const r = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json", authorization: token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
const couple = () =>
  db
    .prepare(
      "INSERT INTO couples(partner1_name,partner2_name,email) VALUES('Ava','Ben',?)",
    )
    .run(crypto.randomUUID() + "@synthetic.invalid").lastInsertRowid;
test.before(async () => {
  stub = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      received.push({
        key: req.headers["idempotency-key"],
        payload: JSON.parse(raw),
      });
      res.writeHead(mailStatus, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          mailStatus === 200
            ? { id: "synthetic-provider-id" }
            : { error: "Synthetic outage" },
        ),
      );
    });
  });
  await new Promise((r) => stub.listen(0, r));
  process.env.RESEND_API_URL = "http://127.0.0.1:" + stub.address().port;
  db = require("../db");
  const express = require("express"),
    app = express();
  app.post(
    "/webhook",
    express.raw({ type: "application/json" }),
    require("../routes/payments").webhookHandler,
  );
  app.use(express.json());
  for (const n of [
    "couples",
    "bookings",
    "invoices",
    "analytics",
    "calendar",
    "inquire",
  ])
    app.use("/api/" + n, require("../routes/" + n));
  app.use("/api/operations", require("../routes/venueOperations"));
  app.get("/async-failure", async () => {
    throw new Error("Synthetic async failure");
  });
  app.use((err, req, res, next) =>
    res.status(500).json({ error: err.message }),
  );
  require("../services/asyncErrors").protectAsyncRoutes(app);
  email = require("../services/email");
  await new Promise((r) => {
    server = app.listen(0, () => {
      base = "http://127.0.0.1:" + server.address().port;
      r();
    });
  });
});
test.after(async () => {
  await email.waitForIdle();
  server?.close();
  stub?.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("holds reserve inventory and reset days, expire, and allow their own couple to book", async () => {
  const a = couple(),
    b = couple();
  const body = {
    event_date: "2027-08-06",
    end_date: "2027-08-08",
    package_name: "3-Day Weekend",
    reason: "Agreement review",
    days: 7,
  };
  const hold = await call("POST", `/api/operations/${a}/holds`, body);
  assert.equal(hold.status, 201);
  assert.equal(
    (await call("POST", "/api/bookings", { couple_id: b, ...body })).status,
    409,
  );
  assert.ok(
    (
      await call("GET", "/api/inquire/availability", undefined, "")
    ).body.unavailableDates.includes("2027-08-09"),
  );
  assert.ok(
    (await call("GET", "/api/calendar")).body.holds.some(
      (h) => h.id === hold.body.id,
    ),
  );
  db.prepare(
    "UPDATE date_holds SET expires_at=datetime('now','-1 day') WHERE id=?",
  ).run(hold.body.id);
  assert.ok(
    !(await call("GET", "/api/calendar")).body.holds.some(
      (h) => h.id === hold.body.id,
    ),
  );
  assert.equal(
    (await call("POST", `/api/operations/${a}/holds`, body)).status,
    201,
  );
  assert.equal(
    (
      await call("POST", "/api/bookings", {
        couple_id: a,
        ...body,
        wedding_date: "2027-08-07",
      })
    ).status,
    201,
  );
});
let operatingId;
test("camping and readiness save with conflict detection and stay validation", async () => {
  operatingId = couple();
  await call("POST", "/api/bookings", {
    couple_id: operatingId,
    event_date: "2027-09-03",
    end_date: "2027-09-05",
    wedding_date: "2027-09-04",
    package_name: "3-Day Weekend",
  });
  const details = {
    arrival_instructions: "Meet venue host",
    readiness: "Insurance received",
    camping: [{ date: "2027-09-03", guests: 20, tents: 4, rvs: 3 }],
  };
  assert.equal(
    (
      await call("PUT", `/api/operations/${operatingId}`, {
        details,
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call("PUT", `/api/operations/${operatingId}`, {
        details,
        revision: 0,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("PUT", `/api/operations/${operatingId}`, {
        details: {
          camping: [{ date: "2027-09-05", guests: 20, tents: 4, rvs: 3 }],
        },
        revision: 1,
      })
    ).status,
    400,
  );
  assert.equal(
    (await call("GET", `/api/operations/${operatingId}`)).body.details
      .camping[0].rvs,
    3,
  );
});
test("damage deposits retain immutable dispositions and stay separate from venue revenue", async () => {
  const id = operatingId,
    body = {
      kind: "received",
      amount: 500,
      reason: "Security deposit",
      received_at: "2026-09-27",
      idempotency_key: "damage-retry",
    };
  assert.equal(
    (await call("POST", `/api/operations/${id}/deposit`, body, auth(2))).status,
    403,
  );
  assert.equal(
    (await call("POST", `/api/operations/${id}/deposit`, body)).status,
    201,
  );
  assert.equal(
    (await call("POST", `/api/operations/${id}/deposit`, body)).body.held,
    500,
  );
  assert.equal(
    (
      await call("POST", `/api/operations/${id}/deposit`, {
        ...body,
        kind: "returned",
        amount: 501,
        idempotency_key: "invalid",
      })
    ).status,
    400,
  );
  await call("POST", `/api/operations/${id}/deposit`, {
    ...body,
    kind: "retained",
    amount: 50,
    reason: "Reviewed damage",
    idempotency_key: "retained",
  });
  const ret = await call("POST", `/api/operations/${id}/deposit`, {
    ...body,
    kind: "returned",
    amount: 450,
    idempotency_key: "returned",
  });
  assert.equal(ret.body.held, 0);
  assert.equal(ret.body.retained, 50);
  assert.equal(
    (await call("GET", "/api/analytics/summary")).body.revenue_collected,
    0,
  );
  assert.throws(
    () =>
      db
        .prepare("DELETE FROM damage_deposit_entries WHERE couple_id=?")
        .run(id),
    /cannot be deleted/,
  );
});
test("inspection photos and operating plans survive a fresh read-only backup", async () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=",
    "base64",
  );
  const body = new FormData();
  body.append("stage", "departure");
  body.append("notes", "SYNTHETIC cleared site");
  body.append(
    "photo",
    new Blob([png], { type: "image/png" }),
    "inspection.png",
  );
  const r = await fetch(base + `/api/operations/${operatingId}/inspections`, {
    method: "POST",
    headers: { authorization: auth(1) },
    body,
  });
  assert.equal(r.status, 201);
  const id = (await r.json()).id;
  const photo = await fetch(
    base + `/api/operations/${operatingId}/inspections/${id}/photo`,
    { headers: { authorization: auth(1) } },
  );
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  const copy = path.join(tmp, "recovered.db");
  await db.backup(copy);
  const v = require("../services/verifyBackup").verifyBackup(copy);
  assert.equal(v.counts.event_inspections, 1);
  assert.equal(v.counts.damage_deposit_entries, 3);
  const restored = new (require("better-sqlite3"))(copy, { readonly: true });
  assert.deepEqual(
    restored.prepare("SELECT photo FROM event_inspections WHERE id=?").get(id)
      .photo,
    png,
  );
  assert.equal(
    JSON.parse(
      restored
        .prepare("SELECT details FROM event_operations WHERE couple_id=?")
        .get(operatingId).details,
    ).readiness,
    "Insurance received",
  );
  restored.close();
  const sheet = await fetch(base + `/api/couples/${operatingId}/event-sheet`, {
    headers: { authorization: auth(1) },
  });
  assert.match(await sheet.text(), /20 guests · 4 tents · 3 RVs/);
});
test("reusable relative task templates add missing work without duplication", async () => {
  const body = { title: "Confirm gate code", offset_days: -2, owner: "Kris" };
  assert.equal(
    (await call("POST", "/api/operations/templates", body, auth(2))).status,
    403,
  );
  assert.equal(
    (await call("POST", "/api/operations/templates", body)).status,
    201,
  );
  await call("POST", `/api/operations/${operatingId}/tasks`, {});
  await call("POST", `/api/operations/${operatingId}/tasks`, {});
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE couple_id=?")
    .all(operatingId);
  assert.equal(tasks.length, 6);
  assert.equal(
    tasks.find((t) => t.workflow_key === "booking-workflow:closeout").due_date,
    "2027-09-06",
  );
  assert.equal(
    tasks.find((t) => t.title === body.title).due_date,
    "2027-09-02",
  );
});
test("identical website requests create one task while changed answers are retained", () => {
  const svc = require("../services/websiteEnquiry"),
    body = {
      client1Name: "Test",
      client2Name: "Partner",
      email: "dedup@synthetic.invalid",
      eventDate: "14/08/2027",
      guestCount: "85",
    };
  const a = svc.recordBookingRequest(body),
    b = svc.recordBookingRequest({ ...body, _notify: "1" });
  assert.equal(b.duplicate, true);
  assert.equal(b.coupleId, a.coupleId);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM tasks WHERE couple_id=?")
      .get(a.coupleId).n,
    1,
  );
  svc.recordBookingRequest({ ...body, guestCount: "90" });
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM tasks WHERE couple_id=?")
      .get(a.coupleId).n,
    2,
  );
});
test("email failures persist, retries use a stable key, and acceptance is distinct from confirmed delivery", async () => {
  mailStatus = 500;
  const input = {
    to: "mail@synthetic.invalid",
    subject: "SYNTHETIC test",
    text: "Synthetic",
    coupleId: operatingId,
    kind: "message",
    idempotencyKey: "email-retry-key",
  };
  const a = await email.send(input);
  assert.equal(a.accepted, false);
  assert.equal(
    db.prepare("SELECT status FROM email_jobs WHERE id=?").get(a.jobId).status,
    "failed",
  );
  assert.ok(
    (await call("GET", "/api/analytics/today")).body.failed_emails.some(
      (e) => e.id === a.jobId,
    ),
  );
  mailStatus = 200;
  const b = await call(
    "POST",
    `/api/operations/email-jobs/${a.jobId}/retry`,
    {},
  );
  assert.equal(b.body.status, "accepted");
  assert.equal(b.body.accepted, true);
  assert.equal(b.body.confirmedDelivered, undefined);
  const before = received.length;
  assert.equal((await email.send(input)).duplicate, true);
  assert.equal(received.length, before);
  assert.equal(received.at(-1).key, "email-retry-key");
});
async function webhook(session) {
  const raw = JSON.stringify({
    id: "evt_" + session.id,
    type: "checkout.session.completed",
    data: { object: session },
  });
  const signature = require("stripe")(
    process.env.STRIPE_SECRET_KEY,
  ).webhooks.generateTestHeaderString({
    payload: raw,
    secret: process.env.STRIPE_WEBHOOK_SECRET,
  });
  const r = await fetch(base + "/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: raw,
  });
  return { status: r.status, body: await r.json() };
}
test("signed card retries cannot duplicate money and changed checkout invoices need reconciliation", async () => {
  const id = couple(),
    invoice = db
      .prepare(
        "INSERT INTO invoices(couple_id,description,amount) VALUES(?,'Card payment',100)",
      )
      .run(id).lastInsertRowid;
  db.prepare(
    "INSERT INTO checkout_sessions(id,invoice_id,amount_cents,invoice_amount_cents) VALUES(?,?,?,?)",
  ).run("cs_synthetic", invoice, 10000, 10000);
  const session = {
    id: "cs_synthetic",
    metadata: { invoice_id: String(invoice) },
    payment_status: "paid",
    currency: "cad",
    amount_total: 10000,
  };
  assert.equal((await webhook(session)).status, 200);
  assert.equal((await webhook(session)).body.duplicate, true);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM payment_entries WHERE invoice_id=?")
      .get(invoice).n,
    1,
  );
  const changed = db
    .prepare(
      "INSERT INTO invoices(couple_id,description,amount) VALUES(?,'Changed checkout',150)",
    )
    .run(id).lastInsertRowid;
  db.prepare(
    "INSERT INTO checkout_sessions(id,invoice_id,amount_cents,invoice_amount_cents) VALUES(?,?,?,?)",
  ).run("cs_changed", changed, 10000, 10000);
  assert.equal(
    (
      await webhook({
        ...session,
        id: "cs_changed",
        metadata: { invoice_id: String(changed) },
      })
    ).body.needs_review,
    true,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM payment_entries WHERE invoice_id=?")
      .get(changed).n,
    0,
  );
  assert.equal(
    (
      await call("POST", "/api/operations/checkout-review/cs_changed/accept", {
        reason: "Matched provider receipt to revised invoice",
      })
    ).body.invoice.balance,
    50,
  );
});
test("allocation corrections preserve total money and require owner review", async () => {
  const id = couple(),
    insert = db.prepare(
      "INSERT INTO invoices(couple_id,description,amount) VALUES(?,?,100)",
    );
  const a = insert.run(id, "Deposit").lastInsertRowid,
    b = insert.run(id, "Balance").lastInsertRowid;
  await call("POST", `/api/invoices/${a}/payments`, {
    amount: 150,
    send_receipt: false,
  });
  const body = {
    target_invoice_id: b,
    amount: 50,
    reason: "Apply overpayment to balance",
    idempotency_key: "move-payment",
  };
  assert.equal(
    (await call("POST", `/api/invoices/${a}/reallocate`, body, auth(2))).status,
    403,
  );
  assert.equal(
    (await call("POST", `/api/invoices/${a}/reallocate`, body)).body.target
      .balance,
    50,
  );
  assert.equal(
    (await call("POST", `/api/invoices/${a}/reallocate`, body)).status,
    200,
  );
  assert.equal(require("../services/ledger").statement(id).paid, 150);
});
test("async request errors reach the response middleware", async () => {
  const r = await call("GET", "/async-failure");
  assert.equal(r.status, 500);
  assert.equal(r.body.error, "Synthetic async failure");
});

test("event-only staff see assigned operations without money, contracts, other events or private photos", async () => {
  const user = db
    .prepare(
      "INSERT INTO users(name,email,password_hash,role,access_scope) VALUES('Weekend helper','helper@synthetic.invalid','x','staff','operations')",
    )
    .run().lastInsertRowid;
  const token = auth(user),
    other = couple();
  assert.equal(
    (await call("GET", "/api/invoices", undefined, token)).status,
    403,
  );
  assert.equal(
    (await call("GET", "/api/couples", undefined, token)).status,
    403,
  );
  assert.equal(
    (await call("GET", `/api/operations/${operatingId}`, undefined, token))
      .status,
    403,
  );
  assert.equal(
    (
      await call("POST", `/api/operations/${operatingId}/assign`, {
        user_id: user,
      })
    ).status,
    200,
  );
  const assigned = await call(
    "GET",
    "/api/operations/assigned",
    undefined,
    token,
  );
  assert.equal(assigned.body.length, 1);
  assert.equal(assigned.body[0].email, undefined);
  const event = await call(
    "GET",
    `/api/operations/${operatingId}`,
    undefined,
    token,
  );
  assert.equal(event.status, 200);
  assert.equal(event.body.deposit, null);
  assert.equal(
    (await call("GET", `/api/operations/${other}`, undefined, token)).status,
    403,
  );
  assert.equal(
    (await call("GET", "/api/operations/email-jobs", undefined, token)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "GET",
        `/api/operations/${operatingId}/due-preview`,
        undefined,
        token,
      )
    ).status,
    403,
  );
  const tasks = (
    await call(
      "GET",
      `/api/operations/${operatingId}/assigned-tasks`,
      undefined,
      token,
    )
  ).body;
  assert.equal(
    (
      await call(
        "PATCH",
        `/api/operations/${operatingId}/assigned-tasks/${tasks[0].id}`,
        { completed: true },
        token,
      )
    ).status,
    200,
  );
  await call("DELETE", `/api/operations/${operatingId}/assign/${user}`);
  assert.equal(
    (await call("GET", `/api/operations/${operatingId}`, undefined, token))
      .status,
    403,
  );
});
test("rescheduling offers an explicit review for standard unpaid dates, preserving paid and custom dates", async () => {
  const id = couple();
  const b = (
    await call("POST", "/api/bookings", {
      couple_id: id,
      event_date: "2028-07-07",
      end_date: "2028-07-09",
      wedding_date: "2028-07-08",
      package_name: "3-Day Weekend",
    })
  ).body;
  await call("POST", `/api/invoices/schedule/${id}`, {
    total_price: 8000,
    wedding_date: b.event_date,
  });
  const invoices = (await call("GET", `/api/invoices/couple/${id}`)).body;
  await call("POST", `/api/invoices/${invoices[0].id}/payments`, {
    amount: invoices[0].amount,
    send_receipt: false,
  });
  const custom = db
    .prepare(
      "INSERT INTO invoices(couple_id,description,amount,due_date) VALUES(?,'Custom extras',50,'2028-07-01')",
    )
    .run(id).lastInsertRowid;
  assert.equal(
    (
      await call("PUT", `/api/bookings/${b.id}`, {
        event_date: "2028-07-14",
        end_date: "2028-07-16",
        wedding_date: "2028-07-15",
      })
    ).status,
    200,
  );
  const preview = await call("GET", `/api/operations/${id}/due-preview`);
  assert.equal(preview.body.length, 2);
  assert.equal(
    (await call("POST", `/api/operations/${id}/due-preview`, { changes: [] }))
      .status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/api/operations/${id}/due-preview`, {
        changes: preview.body,
      })
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT due_date FROM invoices WHERE id=?").get(custom).due_date,
    "2028-07-01",
  );
  assert.equal(
    db.prepare("SELECT due_date FROM invoices WHERE id=?").get(invoices[0].id)
      .due_date,
    invoices[0].due_date,
  );
});

test("legacy and unmatched signed card receipts remain visible for review", async () => {
  const id = couple(),
    invoice = db
      .prepare(
        "INSERT INTO invoices(couple_id,description,amount) VALUES(?,'Legacy checkout',100)",
      )
      .run(id).lastInsertRowid;
  const session = {
    id: "cs_legacy",
    metadata: { invoice_id: String(invoice) },
    payment_status: "paid",
    currency: "cad",
    amount_total: 10000,
  };
  assert.equal((await webhook(session)).body.needs_review, true);
  assert.ok(
    (await call("GET", "/api/operations/checkout-review")).body.some(
      (r) => r.id === "cs_legacy",
    ),
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM payment_entries WHERE invoice_id=?")
      .get(invoice).n,
    0,
  );
  assert.equal(
    (await webhook({ ...session, id: "cs_unmatched", metadata: {} })).body
      .needs_review,
    true,
  );
  assert.ok(
    (await call("GET", "/api/operations/unmatched-card-receipts")).body.some(
      (r) => r.id === "cs_unmatched",
    ),
  );
});

test("rescheduling adds a newly introduced unassigned template without losing existing work", async () => {
  const id = couple();
  const b = (
    await call("POST", "/api/bookings", {
      couple_id: id,
      event_date: "2028-08-04",
      end_date: "2028-08-06",
      wedding_date: "2028-08-05",
      package_name: "3-Day Weekend",
    })
  ).body;
  await call("POST", "/api/operations/templates", {
    title: "Review check-out checklist",
    offset_days: 1,
  });
  assert.equal(
    (
      await call("PUT", `/api/bookings/${b.id}`, {
        event_date: "2028-08-11",
        end_date: "2028-08-13",
        wedding_date: "2028-08-12",
      })
    ).status,
    200,
  );
  assert.equal(
    db
      .prepare(
        "SELECT due_date FROM tasks WHERE couple_id=? AND title='Review check-out checklist'",
      )
      .get(id).due_date,
    "2028-08-13",
  );
});
