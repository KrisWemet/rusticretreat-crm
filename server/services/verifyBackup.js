const Database = require("better-sqlite3");
const fs = require("fs");
const crypto = require("crypto");

// Open the saved copy read-only. Never run migrations or start jobs during recovery QA.
function verifyBackup(filename) {
  const db = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    const integrity = db.pragma("integrity_check", { simple: true });
    if (integrity !== "ok")
      throw new Error(`Integrity check failed: ${integrity}`);
    const foreignKeys = db.pragma("foreign_key_check");
    if (foreignKeys.length)
      throw new Error(`Backup has ${foreignKeys.length} broken references`);
    const counts = {};
    for (const name of [
      "couples",
      "bookings",
      "contracts",
      "contract_signers",
      "contract_files",
      "invoices",
      "payment_entries",
      "form_responses",
      "tasks",
      "date_holds",
      "event_operations",
      "event_inspections",
      "damage_deposit_entries",
      "email_jobs",
    ]) {
      if (
        db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
          .get(name)
      )
        counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
    }
    return {
      integrity,
      foreign_keys: "ok",
      counts,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(filename))
        .digest("hex"),
    };
  } finally {
    db.close();
  }
}
if (require.main === module) {
  try {
    if (!process.argv[2])
      throw new Error(
        "Usage: node services/verifyBackup.js /path/to/saved-copy.db",
      );
    console.log(JSON.stringify(verifyBackup(process.argv[2]), null, 2));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}
module.exports = { verifyBackup };
