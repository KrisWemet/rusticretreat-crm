const db = require("../db");

// Stable identifiers keep retries and rescheduling from duplicating work.
const TASKS = [
  ["planning", "Review event plans and outstanding forms", -60],
  ["vendors", "Confirm vendors, insurance and alcohol arrangements", -30],
  ["balance", "Check final balance and payment arrangements", -14],
  ["weekend", "Confirm arrival, departure and weekend handover", -7],
  ["closeout", "Complete departure inspection and deposit review", 1],
];
function ensureTasks(coupleId, date, { reschedule = false } = {}) {
  if (!date) return;
  for (const template of db
    .prepare("SELECT * FROM workflow_templates WHERE active=1 ORDER BY id")
    .all()) {
    const key =
      template.id <= 5 ? TASKS[template.id - 1][0] : `template-${template.id}`;
    const title = template.title,
      offset = template.offset_days;
    const id = `booking-workflow:${key}`;
    const booking =
      template.reference_date === "checkout"
        ? db
            .prepare(
              "SELECT event_date,end_date,package_name FROM bookings WHERE couple_id=?",
            )
            .get(coupleId)
        : null;
    const base =
      booking?.end_date ||
      (booking
        ? require("./bookingRules").defaultEndDate(
            booking.event_date,
            booking.package_name,
          )
        : null) ||
      date;
    const due = new Date(base + "T12:00:00Z");
    due.setUTCDate(due.getUTCDate() + offset);
    const dueDate = due.toISOString().slice(0, 10);
    const existing = db
      .prepare("SELECT * FROM tasks WHERE couple_id = ? AND workflow_key = ?")
      .get(coupleId, id);
    if (!existing)
      db.prepare(
        "INSERT INTO tasks (title, couple_id, due_date, priority, workflow_key) VALUES (?, ?, ?, ?, ?)",
      ).run(title, coupleId, dueDate, "medium", id);
    if (template.owner && !existing)
      db.prepare(
        "UPDATE tasks SET assigned_to=? WHERE couple_id=? AND workflow_key=?",
      ).run(template.owner, coupleId, id);
    else if (existing && reschedule && !existing.completed)
      db.prepare("UPDATE tasks SET due_date = ? WHERE id = ?").run(
        dueDate,
        existing.id,
      );
  }
}
module.exports = { ensureTasks, TASKS };
