const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  os = require("os"),
  path = require("path");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rr-completion-"));
process.env.DB_PATH = path.join(tmp, "test.db");
process.env.JWT_SECRET = "completion-test";
process.env.NODE_ENV = "production";
delete process.env.RESEND_API_KEY;
delete process.env.SMTP_HOST;
const db = require("../db"),
  express = require("express"),
  jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
for (const n of [
  "couples",
  "bookings",
  "invoices",
  "forms",
  "contracts",
  "auth",
  "analytics",
  "tours",
])
  app.use("/api/" + n, require("../routes/" + n));
let server, base;
const token = (id) =>
  "Bearer " +
  jwt.sign(
    { userId: id, role: id === 1 ? "admin" : "staff" },
    process.env.JWT_SECRET,
  );
const call = async (method, url, body, auth = token(1)) => {
  const res = await fetch(base + url, {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: res.status,
    body: (res.headers.get("content-type") || "").includes("json")
      ? await res.json()
      : await res.text(),
  };
};
const couple = () =>
  db
    .prepare(
      "INSERT INTO couples(partner1_name,partner2_name,email) VALUES('Alex','River',?)",
    )
    .run(crypto.randomUUID() + "@test.invalid").lastInsertRowid;
const invoice = (id, amount = 2000) =>
  db
    .prepare(
      "INSERT INTO invoices(couple_id,description,amount,due_date) VALUES(?,'Deposit',?,'2027-06-01')",
    )
    .run(id, amount).lastInsertRowid;
test.before(
  () =>
    new Promise((r) => {
      server = app.listen(0, () => {
        base = "http://127.0.0.1:" + server.address().port;
        r();
      });
    }),
);
test.after(() => {
  server?.close();
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("phone leads save with one name and never expose an invented email", async () => {
  const r = await call("POST", "/api/couples", {
    partner1_name: "Phone enquiry",
    phone: "555-0100",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.email, "");
  assert.equal(r.body.partner2_name, "");
  assert.equal(
    (await call("POST", "/api/couples", { partner1_name: "No contact" }))
      .status,
    400,
  );
  assert.equal((await call("GET", "/api/couples/" + r.body.id)).body.email, "");
});
test("partial payments agree across invoice, booking, overview, analytics and printed statement", async () => {
  const id = couple(),
    inv = invoice(id);
  db.prepare(
    "INSERT INTO bookings(couple_id,event_date,total_price) VALUES(?,'2027-06-11',8000)",
  ).run(id);
  const r = await call("POST", `/api/invoices/${inv}/payments`, {
    amount: 500,
    received_at: "2026-09-25",
    reference: "transfer-1",
    send_receipt: false,
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.invoice.balance, 1500);
  assert.equal(r.body.invoice.paid, 0);
  const b = (await call("GET", `/api/bookings/couple/${id}`)).body[0];
  assert.equal(b.paid_total, 500);
  assert.equal(b.payment_status, "partial");
  assert.equal(
    (await call("GET", `/api/couples/${id}/overview`)).body.balance.paid,
    500,
  );
  assert.equal(
    (await call("GET", "/api/analytics/summary")).body.revenue_collected,
    500,
  );
  const print = (
    await call("GET", `/api/invoices/couple/${id}/statement/print`)
  ).body;
  assert.match(print, /\$500\.00/);
  assert.match(print, /\$1,500\.00/);
});
test("payment retries are idempotent and conflicting retries fail", async () => {
  const inv = invoice(couple()),
    input = { amount: 25, idempotency_key: "retry-key" };
  assert.equal(
    (await call("POST", `/api/invoices/${inv}/payments`, input)).status,
    201,
  );
  const retry = await call("POST", `/api/invoices/${inv}/payments`, input);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.duplicate, true);
  assert.equal(
    (
      await call("POST", `/api/invoices/${inv}/payments`, {
        ...input,
        amount: 26,
      })
    ).status,
    400,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM payment_entries WHERE invoice_id=?")
      .get(inv).n,
    1,
  );
});
test("refunds need an admin and reason, cannot exceed receipts, and never erase history", async () => {
  const inv = invoice(couple(), 100);
  await call("POST", `/api/invoices/${inv}/payments`, { amount: 100 });
  assert.equal(
    (
      await call(
        "POST",
        `/api/invoices/${inv}/payments`,
        { amount: -10, reason: "Changed plans" },
        token(2),
      )
    ).status,
    403,
  );
  assert.equal(
    (await call("POST", `/api/invoices/${inv}/payments`, { amount: -10 }))
      .status,
    400,
  );
  assert.equal(
    (
      await call("POST", `/api/invoices/${inv}/payments`, {
        amount: -101,
        reason: "Refund",
      })
    ).status,
    400,
  );
  const r = await call("POST", `/api/invoices/${inv}/payments`, {
    amount: -40,
    reason: "Refund agreed",
  });
  assert.equal(r.body.invoice.balance, 40);
  assert.equal(r.body.invoice.amount_paid, 60);
  assert.equal((await call("DELETE", `/api/invoices/${inv}`)).status, 409);
  assert.equal(
    (await call("PUT", `/api/invoices/${inv}`, { amount: 120 })).status,
    409,
  );
  assert.throws(
    () => db.prepare("DELETE FROM payment_entries WHERE invoice_id=?").run(inv),
    /cannot be deleted/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE payment_entries SET amount_cents=1 WHERE invoice_id=?")
        .run(inv),
    /immutable/,
  );
});
test("schedule regeneration retains partial obligations and never adds an extra deposit", async () => {
  const id = couple(),
    inv = invoice(id, 2000);
  await call("POST", `/api/invoices/${inv}/payments`, { amount: 500 });
  assert.equal(
    (
      await call("POST", `/api/invoices/schedule/${id}`, {
        total_price: 8000,
        wedding_date: "2027-06-11",
      })
    ).status,
    201,
  );
  const rows = (await call("GET", `/api/invoices/couple/${id}`)).body;
  assert.equal(
    rows.reduce((n, i) => n + i.amount, 0),
    8000,
  );
  assert.equal(
    rows.reduce((n, i) => n + i.balance, 0),
    7500,
  );
  assert.ok(rows.some((i) => i.id === inv && i.amount_paid === 500));
  assert.equal(
    (await call("POST", `/api/invoices/schedule/${id}`, { total_price: 1000 }))
      .status,
    400,
  );
});
test("legacy settlements preserve unknown payment dates", () => {
  const inv = invoice(couple(), 100);
  db.prepare("UPDATE invoices SET paid=1 WHERE id=?").run(inv);
  assert.equal(
    require("../services/ledger").invoiceView(
      db.prepare("SELECT * FROM invoices WHERE id=?").get(inv),
    ).amount_paid,
    100,
  );
  assert.equal(
    db
      .prepare("SELECT received_at FROM payment_entries WHERE invoice_id=?")
      .get(inv).received_at,
    null,
  );
});
let assignment, field;
test("mapped forms prefill, public saves stay separate, and staff must review changes", async () => {
  const id = couple();
  db.prepare(
    "INSERT INTO bookings(couple_id,event_date,guest_count) VALUES(?,'2027-07-09',85)",
  ).run(id);
  const f = (
    await call("POST", "/api/forms", {
      title: "Planning",
      fields: [
        {
          label: "Guests",
          field_type: "number",
          record_field: "guest_count",
          required: true,
        },
      ],
    })
  ).body;
  field = f.fields[0].id;
  assignment = (
    await call("POST", `/api/forms/${f.id}/assign`, { couple_id: id })
  ).body.id;
  assert.equal(
    (await call("GET", `/api/forms/assignments/${assignment}`)).body.fields[0]
      .value,
    85,
  );
  const link = require("../services/forms").issueLink(assignment);
  assert.equal(
    (
      await call("POST", "/api/forms/public/" + link.token, {
        answers: { [field]: "90" },
        revision: 0,
      })
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT guest_count FROM bookings WHERE couple_id=?").get(id)
      .guest_count,
    85,
  );
  assert.equal(
    (
      await call("POST", `/api/forms/assignments/${assignment}/apply`, {
        field_ids: [field],
        revision: 1,
      })
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT guest_count FROM bookings WHERE couple_id=?").get(id)
      .guest_count,
    90,
  );
});
test("draft corrections become pending, preserve previous answers and reject stale writes", async () => {
  const r = await call(
    "PUT",
    `/api/forms/assignments/${assignment}/responses`,
    { answers: {}, complete: false, revision: 1 },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.assignment.status, "pending");
  assert.equal(
    (
      await call("PUT", `/api/forms/assignments/${assignment}/responses`, {
        answers: { [field]: "99" },
        revision: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    JSON.parse(
      (await call("GET", `/api/forms/assignments/${assignment}/history`))
        .body[0].answers,
    )[field],
    "90",
  );
  assert.equal(
    (
      await call("PUT", `/api/forms/assignments/${assignment}/responses`, {
        answers: {},
        complete: true,
        revision: 2,
      })
    ).status,
    400,
  );
  await call("PUT", `/api/forms/assignments/${assignment}/responses`, {
    answers: { [field]: "101" },
    revision: 2,
  });
  assert.equal(
    (
      await call("POST", `/api/forms/assignments/${assignment}/apply`, {
        field_ids: [field],
        revision: 3,
      })
    ).status,
    400,
  );
});
test("booking milestones reschedule open work, retain completed work and require deliberate cancellation", async () => {
  const id = couple();
  const b = await call("POST", "/api/bookings", {
    couple_id: id,
    event_date: "2027-08-06",
    end_date: "2027-08-08",
    wedding_date: "2027-08-07",
    package_name: "3-Day Weekend",
  });
  assert.equal(b.status, 201);
  assert.equal(
    (await call("GET", "/api/couples/" + id)).body.wedding_date,
    "2027-08-07",
  );
  const tasks = db
    .prepare("SELECT * FROM tasks WHERE couple_id=? ORDER BY id")
    .all(id);
  assert.equal(tasks.length, 5);
  db.prepare("UPDATE tasks SET completed=1 WHERE id=?").run(tasks[0].id);
  assert.equal(
    (
      await call("PUT", "/api/bookings/" + b.body.id, {
        event_date: "2027-08-13",
        end_date: "2027-08-15",
        wedding_date: "2027-08-14",
      })
    ).status,
    200,
  );
  const after = db
    .prepare("SELECT * FROM tasks WHERE couple_id=? ORDER BY id")
    .all(id);
  assert.equal(after.length, 5);
  assert.equal(after[0].due_date, tasks[0].due_date);
  assert.notEqual(after[1].due_date, tasks[1].due_date);
  assert.equal(
    (
      await call("PATCH", `/api/couples/${id}/stage`, {
        pipeline_stage: "lost",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("POST", `/api/couples/${id}/cancel`, {
        reason: "Changed plans",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("PUT", `/api/couples/${id}`, { status: "booked" })).status,
    409,
  );
});
test("next actions remain due after contact, and printed handovers escape supplied text", async () => {
  const id = couple();
  await call("PATCH", `/api/couples/${id}/contacted`, { contacted: true });
  await call("PATCH", `/api/couples/${id}/next-action`, {
    title: "<script>alert(1)</script>",
    due_date: "2026-01-01",
    owner: "Kris",
  });
  assert.ok(
    (await call("GET", "/api/analytics/today")).body.next_actions.some(
      (a) => a.couple_id === id,
    ),
  );
  const sheet = (await call("GET", `/api/couples/${id}/event-sheet`)).body;
  assert.match(sheet, /&lt;script&gt;/);
  assert.doesNotMatch(sheet, /<script>/);
});
test("proposal agreements use a frozen rental packet, Schedule A, and quoted totals", async () => {
  const id = couple(),
    pid = db
      .prepare(
        "INSERT INTO proposals(couple_id,title,event_date,end_date,package_name,guest_count,total) VALUES(?,'Quote','2027-09-10','2027-09-12','3-Day Weekend',85,8000)",
      )
      .run(id).lastInsertRowid;
  const r = await call("POST", "/api/contracts/from-proposal/" + pid);
  assert.equal(r.status, 201);
  assert.equal(r.body.template_key, "rental-2027");
  assert.equal(r.body.guest_count, 85);
  assert.equal(JSON.parse(r.body.packet_snapshot).documents.length, 2);
  assert.equal(
    require("../services/contractTemplate").getValues(r.body.id).values
      .total_package_fee,
    "8000",
  );
  assert.doesNotMatch(r.body.content, /maximum 80/);
});
test("removed staff and password-reset sessions cannot use old tokens", async () => {
  const add = (email) =>
    db
      .prepare(
        "INSERT INTO users(name,email,password_hash,role) VALUES('Test',?,'x','staff')",
      )
      .run(email).lastInsertRowid;
  const id = add("removed@test.invalid"),
    old = token(id);
  db.prepare("DELETE FROM users WHERE id=?").run(id);
  assert.equal((await call("GET", "/api/couples", undefined, old)).status, 401);
  const id2 = add("reset@test.invalid"),
    old2 = token(id2);
  assert.equal(
    (
      await call("PATCH", `/api/auth/users/${id2}/password`, {
        password: "new-test-password",
      })
    ).status,
    200,
  );
  assert.equal(
    (await call("GET", "/api/couples", undefined, old2)).status,
    401,
  );
});
test("a read-only recovered backup retains receipts, answers and signed attachment bytes", async () => {
  const id = couple(),
    ct = db
      .prepare(
        "INSERT INTO contracts(couple_id,title,content,status) VALUES(?,'Signed','Terms','signed')",
      )
      .run(id).lastInsertRowid;
  db.prepare(
    "INSERT INTO contract_files(contract_id,filename,mime_type,size,data) VALUES(?,'signed.pdf','application/pdf',3,?)",
  ).run(ct, Buffer.from("pdf"));
  const copy = path.join(tmp, "restore.db");
  await db.backup(copy);
  const v = require("../services/verifyBackup").verifyBackup(copy);
  assert.equal(v.integrity, "ok");
  assert.ok(v.counts.payment_entries > 0);
  assert.ok(v.counts.form_responses > 0);
  assert.equal(v.counts.contract_files, 1);
  const restored = new (require("better-sqlite3"))(copy, { readonly: true });
  assert.equal(
    restored
      .prepare("SELECT data FROM contract_files WHERE contract_id=?")
      .get(ct)
      .data.toString(),
    "pdf",
  );
  restored.close();
});

test("a structured signing journey without cookies reserves access dates and creates one payment schedule", async () => {
  const id = couple();
  db.prepare(
    "UPDATE couples SET partner2_email='river@synthetic.invalid' WHERE id=?",
  ).run(id);
  const c = (
    await call("POST", "/api/contracts", {
      couple_id: id,
      title: "SYNTHETIC agreement",
      template_packet: "rental-2027",
      wedding_date: "2027-10-09",
      check_in: "2027-10-08",
      check_out: "2027-10-10",
      package_name: "3-Day Weekend",
      guest_count: 85,
      total_price: 9000,
    })
  ).body;
  const tpl = require("../services/contractTemplate"),
    packet = tpl.packetFor(c),
    venue = { ...tpl.defaultValues(packet, "venue") };
  for (const f of tpl.collectFields(packet, "venue").filter((f) => f.required))
    venue[f.key] =
      f.type === "date"
        ? "2027-10-09"
        : f.type === "time"
          ? "12:00"
          : f.type === "money"
            ? "9000"
            : f.type === "choice"
              ? f.options.find((o) => !o.retired)?.value
              : f.type === "select"
                ? f.options[0]
                : f.type === "email"
                  ? "synthetic@synthetic.invalid"
                  : "Synthetic test";
  Object.assign(venue, {
    client1_name: "Alex",
    client2_name: "River",
    client1_email: `alex-${id}@synthetic.invalid`,
    client2_email: `river-${id}@synthetic.invalid`,
    event_date: "2027-10-09",
    setup_date: "2027-10-08",
    teardown_date: "2027-10-10",
    package: "3-day",
    total_package_fee: "9000",
  });
  assert.equal(
    (await call("PUT", `/api/contracts/${c.id}/fields`, { fields: venue }))
      .status,
    200,
  );
  const v = await call("POST", `/api/contracts/${c.id}/sign-venue`, {
    signature_data: "SYNTHETIC-TEST",
    signer_name: "Synthetic Venue",
    agreed: true,
  });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  const client = Object.fromEntries(
    tpl
      .collectFields(packet, "client")
      .filter((f) => f.required)
      .map((f) => [
        f.key,
        f.type === "date"
          ? "2027-10-09"
          : f.type === "choice"
            ? f.options[0].value
            : f.type === "select"
              ? f.options[0]
              : "Synthetic test",
      ]),
  );
  const initials = Object.fromEntries(
    tpl.initialsBlocks(packet).map((b) => [b.key, "AT"]),
  );
  for (const role of ["partner1", "partner2"]) {
    const signer = db
      .prepare("SELECT * FROM contract_signers WHERE contract_id=? AND role=?")
      .get(c.id, role);
    assert.equal(
      (
        await call(
          "GET",
          "/api/contracts/sign/" + signer.signing_token,
          undefined,
          "",
        )
      ).status,
      200,
    );
    const signed = await call(
      "POST",
      "/api/contracts/sign/" + signer.signing_token,
      {
        signer_name: signer.name,
        signature_data: "SYNTHETIC-TEST",
        agreed: true,
        fields: client,
        initials,
      },
      "",
    );
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
  }
  const b = db.prepare("SELECT * FROM bookings WHERE couple_id=?").get(id);
  assert.equal(b.event_date, "2027-10-08");
  assert.equal(b.end_date, "2027-10-10");
  assert.equal(
    db.prepare("SELECT wedding_date FROM couples WHERE id=?").get(id)
      .wedding_date,
    "2027-10-09",
  );
  assert.equal(
    db
      .prepare("SELECT SUM(amount) AS total FROM invoices WHERE couple_id=?")
      .get(id).total,
    9000,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM tasks WHERE couple_id=?").get(id).n,
    5,
  );
  assert.equal(
    (await call("DELETE", `/api/contracts/${c.id}?confirm=signed`)).status,
    409,
  );
});

test("public signing displays the stored agreement packet and locked records survive archive deletion", async () => {
  const id = couple(),
    packet = structuredClone(
      require("../services/contractTemplate").getPacket("rental-2027"),
    );
  packet.title = "Frozen synthetic packet";
  packet.documents[0].title = "Frozen synthetic terms";
  const cid = db
    .prepare(
      "INSERT INTO contracts(couple_id,title,content,template_key,packet_snapshot,signing_token,locked_at) VALUES(?,'Frozen','Terms','rental-2027',?,'frozen-test-token',datetime('now'))",
    )
    .run(id, JSON.stringify(packet)).lastInsertRowid;
  const publicView = await call(
    "GET",
    "/api/contracts/sign/frozen-test-token",
    undefined,
    "",
  );
  assert.equal(publicView.status, 200);
  assert.equal(publicView.body.template.packet.title, packet.title);
  assert.equal(
    publicView.body.template.packet.documents[0].title,
    packet.documents[0].title,
  );
  await call("DELETE", "/api/couples/" + id);
  assert.equal(
    (await call("DELETE", `/api/couples/${id}?permanent=1`)).status,
    409,
  );
  assert.ok(db.prepare("SELECT id FROM contracts WHERE id=?").get(cid));
});

test("proposal preparation reuses a known ceremony date separately from access dates", async () => {
  const id = couple();
  db.prepare("UPDATE couples SET wedding_date='2027-09-11' WHERE id=?").run(id);
  const pid = db
    .prepare(
      "INSERT INTO proposals(couple_id,title,event_date,end_date,package_name,guest_count,total) VALUES(?,'Quote','2027-09-10','2027-09-12','3-Day Weekend',85,8000)",
    )
    .run(id).lastInsertRowid;
  const c = (await call("POST", "/api/contracts/from-proposal/" + pid)).body;
  assert.equal(c.wedding_date, "2027-09-11");
  assert.equal(c.check_in, "2027-09-10");
  assert.equal(
    require("../services/contractTemplate").getValues(c.id).values.event_date,
    "2027-09-11",
  );
});
