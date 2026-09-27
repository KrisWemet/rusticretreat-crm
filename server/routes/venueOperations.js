const express = require("express"),
  db = require("../db"),
  multer = require("multer");
const { authenticateToken, requireAdmin } = require("../middleware/auth");
const { logActivity } = require("../services/activity");
const { assertBookable, sendRuleError } = require("../services/bookingRules");
const { cents, money } = require("../services/ledger");
const router = express.Router();
router.use(authenticateToken);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
});
const failure = (res, e) => {
  if (!sendRuleError(res, e))
    res.status(e.status || 400).json({ error: e.message });
};
const deposit = (id) => {
  const entries = db
    .prepare(
      "SELECT * FROM damage_deposit_entries WHERE couple_id=? ORDER BY id",
    )
    .all(id);
  const sum = (k) =>
    entries.filter((e) => e.kind === k).reduce((n, e) => n + e.amount_cents, 0);
  return {
    entries,
    received: money(sum("received")),
    returned: money(sum("returned")),
    retained: money(sum("retained")),
    held: money(sum("received") - sum("returned") - sum("retained")),
  };
};
router.get("/assigned", (req, res) =>
  res.json(
    db
      .prepare(
        `SELECT c.id,c.partner1_name,c.partner2_name,c.venue_package,b.event_date,b.end_date FROM event_staff es JOIN couples c ON c.id=es.couple_id LEFT JOIN bookings b ON b.couple_id=c.id WHERE es.user_id=? AND c.archived_at IS NULL AND c.status!='cancelled' ORDER BY b.event_date`,
      )
      .all(req.user.userId),
  ),
);
router.use((req, res, next) => {
  if (
    req.user.access_scope === "operations" &&
    !/^\/\d+(?:\/inspections(?:\/\d+\/photo)?|\/assigned-tasks(?:\/\d+)?)?$/.test(
      req.path,
    )
  )
    return res.status(403).json({ error: "Assigned event operations only" });
  next();
});
router.get("/email-jobs", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,couple_id,kind,status,attempts,provider_id,error,accepted_at,created_at FROM email_jobs ORDER BY id DESC LIMIT 100",
      )
      .all(),
  ),
);
router.post("/email-jobs/:id/retry", async (req, res) => {
  try {
    const result = await require("../services/email").retryJob(
      Number(req.params.id),
      { reviewedUnknown: req.body.reviewed_unknown === true },
    );
    logActivity(req, {
      action: "email.retried",
      entity: "email",
      entityId: req.params.id,
      summary: "Staff retried a failed email",
    });
    res.status(result.accepted ? 200 : 502).json(result);
  } catch (e) {
    res.status(409).json({ error: e.message });
  }
});
router.get("/unmatched-card-receipts", requireAdmin, (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT * FROM unmatched_card_receipts WHERE resolved_at IS NULL ORDER BY created_at DESC",
      )
      .all(),
  ),
);
router.post(
  "/unmatched-card-receipts/:id/resolve",
  requireAdmin,
  (req, res) => {
    const row = db
      .prepare(
        "SELECT * FROM unmatched_card_receipts WHERE id=? AND resolved_at IS NULL",
      )
      .get(req.params.id);
    if (!row)
      return res.status(404).json({ error: "Unresolved receipt not found" });
    if (!req.body.reason?.trim())
      return res.status(400).json({
        error:
          "Record how you matched or refunded this receipt in the provider history",
      });
    db.prepare(
      "UPDATE unmatched_card_receipts SET resolved_at=datetime('now'),resolution=? WHERE id=?",
    ).run(req.body.reason.trim(), row.id);
    logActivity(req, {
      action: "checkout.unmatched-resolved",
      entity: "checkout",
      entityId: row.id,
      summary: "Owner reviewed and closed an unmatched provider receipt",
      detail: { reason: req.body.reason },
    });
    res.json({ success: true });
  },
);
router.get("/checkout-review", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT s.*,c.partner1_name,c.partner2_name FROM checkout_sessions s JOIN invoices i ON i.id=s.invoice_id JOIN couples c ON c.id=i.couple_id WHERE s.status='review' ORDER BY s.created_at",
      )
      .all(),
  ),
);
router.post("/checkout-review/:id/accept", requireAdmin, (req, res) => {
  const row = db
    .prepare("SELECT * FROM checkout_sessions WHERE id=? AND status='review'")
    .get(req.params.id);
  if (!row) return res.status(404).json({ error: "Payment review not found" });
  if (!req.body.reason?.trim())
    return res
      .status(400)
      .json({ error: "A reconciliation reason is required" });
  try {
    const result = db.transaction(() => {
      const r = require("../services/ledger").record(
        row.invoice_id,
        {
          amount: row.amount_cents / 100,
          method: "Credit Card",
          reference: row.id,
          reason: req.body.reason,
          idempotency_key: `stripe:${row.id}`,
        },
        req.user.userId,
      );
      db.prepare(
        "UPDATE checkout_sessions SET status='recorded',error=NULL WHERE id=?",
      ).run(row.id);
      logActivity(req, {
        action: "checkout.reconciled",
        entity: "invoice",
        entityId: row.invoice_id,
        coupleId: r.invoice.couple_id,
        summary: "Reconciled card receipt against changed invoice",
        detail: { session: row.id, reason: req.body.reason },
      });
      return r;
    })();
    res.json(result);
  } catch (e) {
    failure(res, e);
  }
});
router.get("/templates", (req, res) =>
  res.json(
    db.prepare("SELECT * FROM workflow_templates ORDER BY offset_days").all(),
  ),
);
router.post("/templates", requireAdmin, (req, res) => {
  const { title, offset_days, owner } = req.body;
  if (
    !String(title || "").trim() ||
    !Number.isInteger(Number(offset_days)) ||
    Math.abs(Number(offset_days)) > 730
  )
    return res.status(400).json({
      error: "Enter a task title and an offset from -730 to 730 days",
    });
  const r = db
    .prepare(
      "INSERT INTO workflow_templates(title,offset_days,owner,reference_date) VALUES(?,?,?,?)",
    )
    .run(
      title.trim(),
      Number(offset_days),
      owner || null,
      req.body.reference_date === "checkout" ? "checkout" : "ceremony",
    );
  res
    .status(201)
    .json(
      db
        .prepare("SELECT * FROM workflow_templates WHERE id=?")
        .get(r.lastInsertRowid),
    );
});
router.put("/templates/:id", requireAdmin, (req, res) => {
  const t = db
    .prepare("SELECT * FROM workflow_templates WHERE id=?")
    .get(req.params.id);
  if (!t) return res.status(404).json({ error: "Template not found" });
  if (
    !String(req.body.title || t.title).trim() ||
    !Number.isInteger(Number(req.body.offset_days ?? t.offset_days)) ||
    Math.abs(Number(req.body.offset_days ?? t.offset_days)) > 730
  )
    return res.status(400).json({ error: "Invalid task template" });
  db.prepare(
    "UPDATE workflow_templates SET title=?,offset_days=?,owner=?,active=?,reference_date=? WHERE id=?",
  ).run(
    req.body.title || t.title,
    Number(req.body.offset_days ?? t.offset_days),
    req.body.owner ?? t.owner,
    req.body.active === undefined ? t.active : Number(!!req.body.active),
    t.id,
  );
  res.json({ success: true });
});
router.use("/:coupleId", (req, res, next) => {
  req.couple = db
    .prepare("SELECT * FROM couples WHERE id=?")
    .get(req.params.coupleId);
  if (!req.couple) return res.status(404).json({ error: "Couple not found" });
  if (
    req.user.access_scope === "operations" &&
    !db
      .prepare("SELECT 1 FROM event_staff WHERE couple_id=? AND user_id=?")
      .get(req.couple.id, req.user.userId)
  )
    return res.status(403).json({ error: "This event is not assigned to you" });
  next();
});
router.post("/:coupleId/assign", requireAdmin, (req, res) => {
  const user = db
    .prepare("SELECT id FROM users WHERE id=?")
    .get(req.body.user_id);
  if (!user)
    return res.status(400).json({ error: "Choose an existing staff login" });
  db.prepare(
    "INSERT OR IGNORE INTO event_staff(couple_id,user_id) VALUES(?,?)",
  ).run(req.couple.id, user.id);
  logActivity(req, {
    action: "event.staff-assigned",
    entity: "couple",
    entityId: req.couple.id,
    coupleId: req.couple.id,
    summary: "Assigned staff to event operations",
    detail: { userId: user.id },
  });
  res.json({ success: true });
});
router.delete("/:coupleId/assign/:userId", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM event_staff WHERE couple_id=? AND user_id=?").run(
    req.couple.id,
    req.params.userId,
  );
  logActivity(req, {
    action: "event.staff-unassigned",
    entity: "couple",
    entityId: req.couple.id,
    coupleId: req.couple.id,
    summary: "Removed event staff assignment",
  });
  res.json({ success: true });
});
router.get("/:coupleId/assigned-tasks", (req, res) =>
  res.json(
    db
      .prepare(
        "SELECT id,title,due_date,completed FROM tasks WHERE couple_id=? ORDER BY due_date",
      )
      .all(req.couple.id),
  ),
);
router.patch("/:coupleId/assigned-tasks/:id", (req, res) => {
  db.prepare("UPDATE tasks SET completed=? WHERE id=? AND couple_id=?").run(
    req.body.completed ? 1 : 0,
    req.params.id,
    req.couple.id,
  );
  logActivity(req, {
    action: "task.updated",
    entity: "task",
    entityId: req.params.id,
    coupleId: req.couple.id,
    summary: "Updated event task completion",
  });
  res.json({ success: true });
});
router.get("/:coupleId", (req, res) => {
  const id = req.couple.id,
    row = db
      .prepare("SELECT * FROM event_operations WHERE couple_id=?")
      .get(id);
  res.json({
    details: JSON.parse(row?.details || "{}"),
    revision: row?.revision || 0,
    holds: db
      .prepare(
        `SELECT *,CASE WHEN released_at IS NOT NULL THEN 'released' WHEN datetime(expires_at)<=datetime('now') THEN 'expired' ELSE 'active' END AS status FROM date_holds WHERE couple_id=? ORDER BY id DESC`,
      )
      .all(id),
    assigned_staff: db
      .prepare(
        "SELECT u.id,u.name FROM event_staff es JOIN users u ON u.id=es.user_id WHERE es.couple_id=?",
      )
      .all(id),
    deposit: req.user.access_scope === "operations" ? null : deposit(id),
    inspections: db
      .prepare(
        "SELECT id,stage,notes,filename,mime_type,user_id,created_at FROM event_inspections WHERE couple_id=? ORDER BY id DESC",
      )
      .all(id),
  });
});
router.put("/:coupleId", (req, res) => {
  try {
    db.transaction(() => {
      const id = req.couple.id,
        row = db
          .prepare("SELECT * FROM event_operations WHERE couple_id=?")
          .get(id);
      if (req.body.revision !== (row?.revision || 0))
        throw Object.assign(
          new Error("Someone changed the event plans. Reload before saving."),
          { status: 409 },
        );
      const d = req.body.details || {},
        allowed = [
          "arrival_instructions",
          "departure_instructions",
          "day_of_contact",
          "vendor_power",
          "setup_responsibilities",
          "readiness",
          "closeout",
          "camping",
        ];
      const details = Object.fromEntries(
        allowed.map((k) => [k, d[k] ?? (k === "camping" ? [] : "")]),
      );
      for (const [k, v] of Object.entries(details))
        if (k !== "camping" && (typeof v !== "string" || v.length > 10000))
          throw new Error("Event notes must be text under 10,000 characters");
      if (!Array.isArray(details.camping) || details.camping.length > 14)
        throw new Error("Enter at most 14 camping nights");
      const booking = db
        .prepare("SELECT * FROM bookings WHERE couple_id=?")
        .get(id);
      const nights = new Set();
      for (const n of details.camping) {
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(n.date || "") ||
          new Date(n.date + "T00:00:00Z").toISOString().slice(0, 10) !==
            n.date ||
          nights.has(n.date) ||
          !booking ||
          n.date < booking.event_date ||
          n.date >= (booking.end_date || booking.event_date)
        )
          throw new Error(
            "Camping nights must be unique nights within the reserved stay",
          );
        nights.add(n.date);
        for (const k of ["guests", "tents", "rvs"])
          if (!Number.isSafeInteger(Number(n[k])) || Number(n[k]) < 0)
            throw new Error(
              "Camping counts must be non-negative whole numbers",
            );
      }
      db.prepare(
        `INSERT INTO event_operations(couple_id,details,revision) VALUES(?,?,1) ON CONFLICT(couple_id) DO UPDATE SET details=excluded.details,revision=event_operations.revision+1,updated_at=CURRENT_TIMESTAMP`,
      ).run(id, JSON.stringify(details));
      logActivity(req, {
        action: "operations.updated",
        entity: "couple",
        entityId: id,
        coupleId: id,
        summary: "Updated event preparation and closeout plans",
        detail: { before: JSON.parse(row?.details || "{}"), after: details },
      });
    })();
    res.json({ success: true });
  } catch (e) {
    failure(res, e);
  }
});
router.post("/:coupleId/holds", (req, res) => {
  try {
    const id = req.couple.id,
      { event_date, end_date, package_name, reason } = req.body,
      days = Number(req.body.days ?? 7);
    if (req.couple.status === "cancelled" || req.couple.archived_at)
      throw new Error("Restore an active couple before holding dates");
    if (!reason?.trim() || !Number.isInteger(days) || days < 1 || days > 30)
      throw new Error("Enter a hold reason and 1–30 days");
    if (db.prepare("SELECT 1 FROM bookings WHERE couple_id=?").get(id))
      throw new Error("This couple already has a reservation");
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const hold = db.transaction(() => {
      assertBookable(db, { couple_id: id, event_date, end_date, package_name });
      db.prepare(
        "UPDATE date_holds SET released_at=datetime('now') WHERE couple_id=? AND released_at IS NULL",
      ).run(id);
      const r = db
        .prepare(
          "INSERT INTO date_holds(couple_id,event_date,end_date,package_name,expires_at,reason,user_id) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          event_date,
          end_date || event_date,
          package_name || null,
          expires,
          reason.trim(),
          req.user.userId,
        );
      return db
        .prepare("SELECT * FROM date_holds WHERE id=?")
        .get(r.lastInsertRowid);
    })();
    logActivity(req, {
      action: "hold.created",
      entity: "hold",
      entityId: hold.id,
      coupleId: id,
      summary: `Held ${event_date} to ${end_date || event_date} until ${expires}`,
      detail: hold,
    });
    res.status(201).json(hold);
  } catch (e) {
    failure(res, e);
  }
});
router.delete("/:coupleId/holds/:id", (req, res) => {
  const r = db
    .prepare(
      "UPDATE date_holds SET released_at=datetime('now') WHERE id=? AND couple_id=? AND released_at IS NULL",
    )
    .run(req.params.id, req.couple.id);
  if (!r.changes)
    return res.status(404).json({ error: "Active hold not found" });
  logActivity(req, {
    action: "hold.released",
    entity: "hold",
    entityId: req.params.id,
    coupleId: req.couple.id,
    summary: "Released date hold",
  });
  res.json({ success: true });
});
function duePreview(coupleId) {
  const b = db
    .prepare("SELECT * FROM bookings WHERE couple_id=?")
    .get(coupleId);
  if (!b) throw new Error("Reserve the stay first");
  const rows = db
    .prepare("SELECT * FROM invoices WHERE couple_id=? ORDER BY id")
    .all(coupleId)
    .map(require("../services/ledger").invoiceView);
  const plan = require("../services/paymentSchedule").buildPaymentSchedule({
    total: rows.reduce((n, i) => n + i.amount, 0),
    checkIn: b.event_date,
    depositDue: rows.find((i) => /booking deposit/i.test(i.description))
      ?.due_date,
  });
  return rows
    .filter((i) => !i.has_payments)
    .map((i) => {
      const p = plan.find((p) => i.description === p.label);
      return p && i.due_date !== p.due_date
        ? {
            id: i.id,
            description: i.description,
            old_due: i.due_date,
            new_due: p.due_date,
          }
        : null;
    })
    .filter(Boolean);
}
router.get("/:coupleId/due-preview", (req, res) => {
  try {
    res.json(duePreview(req.couple.id));
  } catch (e) {
    failure(res, e);
  }
});
router.post("/:coupleId/due-preview", (req, res) => {
  try {
    const changes = db.transaction(() => {
      const rows = duePreview(req.couple.id);
      if (JSON.stringify(rows) !== JSON.stringify(req.body.changes))
        throw Object.assign(
          new Error("The invoice plan changed. Preview again before applying."),
          { status: 409 },
        );
      const update = db.prepare("UPDATE invoices SET due_date=? WHERE id=?");
      for (const r of rows) update.run(r.new_due, r.id);
      logActivity(req, {
        action: "invoice.dates-reviewed",
        entity: "couple",
        entityId: req.couple.id,
        coupleId: req.couple.id,
        summary: "Reviewed and updated unpaid standard payment due dates",
        detail: rows,
      });
      return rows;
    })();
    res.json(changes);
  } catch (e) {
    failure(res, e);
  }
});
router.post("/:coupleId/tasks", (req, res) => {
  const b = db
    .prepare("SELECT * FROM bookings WHERE couple_id=?")
    .get(req.couple.id);
  if (!b)
    return res
      .status(400)
      .json({ error: "Reserve the stay before adding event tasks" });
  require("../services/operations").ensureTasks(
    req.couple.id,
    req.couple.wedding_date || b.event_date,
  );
  res.json({ success: true });
});
router.post("/:coupleId/deposit", requireAdmin, (req, res) => {
  try {
    const id = req.couple.id,
      { kind, reason, reference, received_at, idempotency_key } = req.body,
      amount = cents(req.body.amount);
    if (
      !["received", "returned", "retained"].includes(kind) ||
      !Number.isFinite(Number(req.body.amount)) ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      !reason?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(received_at || "") ||
      new Date(received_at + "T00:00:00Z").toISOString().slice(0, 10) !==
        received_at
    )
      throw new Error("Enter a positive amount, date, disposition and reason");
    db.transaction(() => {
      if (idempotency_key) {
        const e = db
          .prepare(
            "SELECT * FROM damage_deposit_entries WHERE idempotency_key=?",
          )
          .get(idempotency_key);
        if (e) {
          if (
            e.couple_id !== id ||
            e.kind !== kind ||
            e.amount_cents !== amount
          )
            throw new Error("This reference was used for another entry");
          return;
        }
      }
      if (kind !== "received" && amount > cents(deposit(id).held))
        throw new Error(
          "Cannot return or retain more than the damage deposit held",
        );
      db.prepare(
        "INSERT INTO damage_deposit_entries(couple_id,kind,amount_cents,reason,reference,received_at,user_id,idempotency_key) VALUES(?,?,?,?,?,?,?,?)",
      ).run(
        id,
        kind,
        amount,
        reason.trim(),
        reference || null,
        received_at,
        req.user.userId,
        idempotency_key || null,
      );
      logActivity(req, {
        action: "damage-deposit.recorded",
        entity: "couple",
        entityId: id,
        coupleId: id,
        summary: `Damage deposit ${kind}: $${money(amount)}`,
        detail: req.body,
      });
    })();
    res.status(201).json(deposit(id));
  } catch (e) {
    failure(res, e);
  }
});
router.post("/:coupleId/inspections", upload.single("photo"), (req, res) => {
  const { stage, notes } = req.body;
  if (!["arrival", "departure"].includes(stage) || !notes?.trim())
    return res.status(400).json({
      error: "Choose arrival or departure and enter inspection notes",
    });
  if (
    req.file &&
    !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)
  )
    return res
      .status(400)
      .json({ error: "Use a JPEG, PNG or WebP inspection photo" });
  const r = db
    .prepare(
      "INSERT INTO event_inspections(couple_id,stage,notes,filename,mime_type,photo,user_id) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      req.couple.id,
      stage,
      notes,
      req.file?.originalname || null,
      req.file?.mimetype || null,
      req.file?.buffer || null,
      req.user.userId,
    );
  logActivity(req, {
    action: "inspection.recorded",
    entity: "inspection",
    entityId: r.lastInsertRowid,
    coupleId: req.couple.id,
    summary: `Recorded ${stage} inspection`,
  });
  res.status(201).json({ id: r.lastInsertRowid });
});
router.get("/:coupleId/inspections/:id/photo", (req, res) => {
  const i = db
    .prepare("SELECT * FROM event_inspections WHERE id=? AND couple_id=?")
    .get(req.params.id, req.couple.id);
  if (!i?.photo) return res.status(404).json({ error: "Photo not found" });
  res
    .set("Content-Type", i.mime_type)
    .set("Content-Disposition", "inline")
    .send(i.photo);
});
module.exports = router;
module.exports.deposit = deposit;
