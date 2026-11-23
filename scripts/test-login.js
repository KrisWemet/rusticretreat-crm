// TEST COPY ONLY — never merged. Gives the temporary Railway test copy a login
// from TEST_LOGIN_EMAIL / TEST_LOGIN_PASSWORD, then exits. Does nothing when
// those are not set.
const e = process.env.TEST_LOGIN_EMAIL, p = process.env.TEST_LOGIN_PASSWORD;
if (e && p) {
  const Database = require('../server/node_modules/better-sqlite3');
  const bcrypt = require('../server/node_modules/bcryptjs');
  const db = new Database(process.env.DB_PATH);
  const hash = bcrypt.hashSync(p, 10);
  const email = e.trim().toLowerCase();
  const u = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
  if (u) db.prepare("UPDATE users SET password_hash = ?, role = 'admin' WHERE id = ?").run(hash, u.id);
  else db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('Test login', ?, ?, 'admin')").run(email, hash);
  db.close();
  console.log(`[test-login] ready for ${email}`);
}
