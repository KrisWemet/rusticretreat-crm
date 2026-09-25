// ADMIN_BOOTSTRAP_PASSWORD runs on every boot while set. It must only disable the
// seeded demo portal logins, never a real couple's.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-boot-'));
const env = { ...process.env, DB_PATH: path.join(tmp, 'boot.db'), JWT_SECRET: 'x', NODE_ENV: 'test' };
const serverDir = path.join(__dirname, '..');

// Each boot is a fresh process, as on Railway.
function boot(extraEnv, script) {
  const r = spawnSync(process.execPath, ['-e', `const db = require('./db'); ${script}`], {
    cwd: serverDir, env: { ...env, ...extraEnv }, encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('bootstrap keeps real couples logged in and disables only seeded demo logins', () => {
  boot({}, `
    const bcrypt = require('bcryptjs');
    db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, password_hash) VALUES ('Real', 'Couple', 'real@couple.test', ?)")
      .run(bcrypt.hashSync('their-own-password', 4));
  `);

  const out = boot({ ADMIN_BOOTSTRAP_PASSWORD: 'a-long-new-admin-password' }, `
    const rows = db.prepare('SELECT email, password_hash IS NOT NULL AS has_login FROM couples').all();
    console.log(JSON.stringify(rows));
  `);
  const rows = JSON.parse(out.split('\n').pop());
  const byEmail = Object.fromEntries(rows.map(r => [r.email, r.has_login]));

  assert.equal(byEmail['real@couple.test'], 1, 'a real couple kept their portal login');
  for (const seeded of ['sarah.jake@example.com', 'megan.ryan@example.com', 'kayla.jordan@example.com']) {
    assert.equal(byEmail[seeded], 0, `${seeded} was disabled`);
  }
});
