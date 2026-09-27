// Phase 2: the daily job runner, backup retention and off-site copies, the
// email log, and the daily tidy-ups.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-jobs-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.JWT_SECRET = 'test-secret-jobs';
process.env.NODE_ENV = 'test';
delete process.env.RESEND_API_KEY; delete process.env.SMTP_HOST;

const db = require('../db');
const schedule = require('../services/schedule');
test.after(() => { db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// 2026-07-10 15:00 UTC is 09:00 in Alberta (MDT, UTC-6).
const at = (iso) => new Date(iso);

test('Alberta day and hour are computed in America/Edmonton', () => {
  assert.deepEqual(schedule.albertaNow(at('2026-07-10T15:00:00Z')), { day: '2026-07-10', hour: 9 });
  assert.deepEqual(schedule.albertaNow(at('2026-07-11T03:30:00Z')), { day: '2026-07-10', hour: 21 }, 'still the 10th in Alberta');
  assert.deepEqual(schedule.albertaNow(at('2026-12-01T06:59:00Z')), { day: '2026-11-30', hour: 23 }, 'MST in winter');
});

test('a job runs once per Alberta day after its hour, survives restarts, and catches up', async () => {
  const runs = [];
  schedule.registerJob('test-daily', 8, ({ day }) => { runs.push(day); return { ok: 1 }; });
  await schedule.tick(at('2026-07-10T13:00:00Z')); // 07:00 Alberta — too early
  assert.deepEqual(runs, []);
  await schedule.tick(at('2026-07-10T15:00:00Z')); // 09:00
  await schedule.tick(at('2026-07-10T20:00:00Z')); // 14:00, same day
  assert.deepEqual(runs, ['2026-07-10'], 'once per day');
  // A "restart": the in-memory state is gone but job_runs remembers today.
  await schedule.tick(at('2026-07-10T22:00:00Z'));
  assert.deepEqual(runs, ['2026-07-10']);
  // Next day, booted late in the day: it still runs (catch-up).
  await schedule.tick(at('2026-07-11T23:00:00Z'));
  assert.deepEqual(runs, ['2026-07-10', '2026-07-11']);
  const row = schedule.jobStatus().find(j => j.name === 'test-daily');
  assert.equal(row.last_status, 'ok');
});

test('a job with a cut-off hour does not catch up late in the day', async () => {
  const runs = [];
  schedule.registerJob('test-morning', 7, ({ day }) => { runs.push(day); }, { until: 11 });
  await schedule.tick(at('2026-07-13T02:00:00Z')); // 20:00 on the 12th in Alberta — too late
  assert.deepEqual(runs, []);
  await schedule.tick(at('2026-07-13T14:00:00Z')); // 08:00 on the 13th
  assert.deepEqual(runs, ['2026-07-13']);
  schedule._jobs.splice(schedule._jobs.findIndex(j => j.name === 'test-morning'), 1);
});

test('a failing job is recorded and reported to the failure handler', async () => {
  const alerts = [];
  schedule.setFailureHandler((name, err) => alerts.push([name, err.message]));
  schedule.registerJob('test-broken', 0, () => { throw new Error('disk full'); });
  await schedule.tick(at('2026-07-12T15:00:00Z'));
  assert.deepEqual(alerts, [['test-broken', 'disk full']]);
  const row = schedule.jobStatus().find(j => j.name === 'test-broken');
  assert.equal(row.last_status, 'error');
  assert.equal(row.last_error, 'disk full');
  schedule._jobs.splice(0); // leave no test jobs registered
});

test('backups: a snapshot is taken before data migrations', () => {
  const backup = require('../services/backup');
  assert.ok(backup.listBackups().some(b => b.kind === 'pre-migration'), 'pre-migration snapshot exists');
});

test('backups are pruned per kind, and each daily copy goes off-site with bucket pruning', async () => {
  const backup = require('../services/backup');
  const offsite = require('../services/offsite');
  const sent = [];
  let stored = Array.from({ length: 61 }, (_, i) => `crm-backups/rusticretreat-2020-01-${String(i % 28 + 1).padStart(2, '0')}T00-00-${String(i).padStart(2, '0')}Z.db`);
  offsite.setClientForTests({
    send: async (cmd) => {
      const name = cmd.constructor.name;
      sent.push(name);
      if (name === 'PutObjectCommand') stored.push(cmd.input.Key);
      if (name === 'ListObjectsV2Command') return { Contents: stored.map(Key => ({ Key })), IsTruncated: false };
      if (name === 'DeleteObjectsCommand') { const gone = new Set(cmd.input.Delete.Objects.map(o => o.Key)); stored = stored.filter(k => !gone.has(k)); }
      return {};
    },
  });
  // More daily files than KEEP (30) on disk already.
  fs.mkdirSync(backup.BACKUP_DIR, { recursive: true });
  for (let i = 0; i < 32; i++) {
    fs.writeFileSync(path.join(backup.BACKUP_DIR, `rusticretreat-2020-02-01T00-00-${String(i).padStart(2, '0')}Z.db`), 'x');
    const t = new Date(Date.UTC(2020, 1, 1, 0, 0, i)); fs.utimesSync(path.join(backup.BACKUP_DIR, `rusticretreat-2020-02-01T00-00-${String(i).padStart(2, '0')}Z.db`), t, t);
  }
  const r = await backup.dailyBackup();
  assert.equal(r.offsite, true);
  assert.deepEqual(sent, ['PutObjectCommand', 'ListObjectsV2Command', 'DeleteObjectsCommand']);
  assert.equal(stored.length, 60, 'the bucket keeps the newest 60');
  assert.ok(stored.includes(`crm-backups/${r.name}`), 'today\'s copy is kept');
  const files = backup.listBackups();
  assert.equal(files.filter(f => f.kind === 'daily').length, 30);
  assert.ok(files.some(f => f.name === r.name));
  assert.ok(files.some(f => f.kind === 'pre-migration'), 'pre-migration copies are not pruned by daily retention');

  // An off-site failure fails the daily job (so the venue is told)...
  offsite.setClientForTests({ send: async () => { throw new Error('bucket unreachable'); } });
  await assert.rejects(backup.dailyBackup(), /off-site copy failed: bucket unreachable/);
  // ...but not a manual backup, which still saves locally and reports it.
  const manual = await backup.createBackup();
  assert.equal(manual.offsite.uploaded, false);
  assert.match(manual.offsite.error, /bucket unreachable/);
  offsite.setClientForTests(null);
});

test('every email is logged, matched to its couple by address, delivered or not', async () => {
  const email = require('../services/email');
  const id = db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, partner2_email, status) VALUES ('Log', 'Me', 'log@test.invalid', 'p2log@test.invalid', 'booked')").run().lastInsertRowid;
  const r = await email.sendPaymentReminder({ to: ['LOG@test.invalid'], coupleNames: 'Log & Me', description: 'Deposit', amount: 10, dueDate: 'July 1, 2027', daysUntilDue: 3 });
  assert.equal(r.delivered, false, 'email is not configured in tests');
  const row = db.prepare('SELECT * FROM email_log WHERE couple_id = ? ORDER BY id DESC').get(id);
  assert.equal(row.kind, 'payment-reminder');
  assert.equal(row.delivered, 0);
  assert.match(row.error, /not configured/);
  assert.match(row.subject, /^Payment reminder: Deposit due in 3 days/);
});

test('past weddings are marked completed and old proposals expire, on Alberta dates', () => {
  const hk = require('../services/housekeeping');
  const c = (status) => db.prepare("INSERT INTO couples (partner1_name, partner2_name, email, status) VALUES ('H', 'K', ?, ?)").run(`hk${Math.random()}@test.invalid`, status).lastInsertRowid;
  const done = c('booked'), during = c('booked'), later = c('booked');
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2026-07-03', '3-Day Weekend')").run(done);   // ends Jul 5
  db.prepare("INSERT INTO bookings (couple_id, event_date, package_name) VALUES (?, '2026-07-04', '3-Day Weekend')").run(during); // ends Jul 6
  db.prepare("INSERT INTO bookings (couple_id, event_date, end_date) VALUES (?, '2026-08-01', '2026-08-03')").run(later);
  const r = hk.completePastWeddings('2026-07-06');
  const status = id => db.prepare('SELECT status FROM couples WHERE id = ?').get(id).status;
  assert.equal(status(done), 'completed');
  assert.equal(status(during), 'booked', 'still on site on its last day');
  assert.equal(status(later), 'booked');
  assert.ok(r.completed >= 1);
  assert.ok(db.prepare("SELECT 1 FROM activity_log WHERE action = 'couple.completed' AND couple_id = ?").get(done));

  const p = (valid) => db.prepare("INSERT INTO proposals (couple_id, title, status, valid_until) VALUES (?, 'P', 'sent', ?)").run(later, valid).lastInsertRowid;
  const old = p('2026-07-05'), today = p('2026-07-06');
  hk.expireProposals('2026-07-06');
  const ps = id => db.prepare('SELECT status FROM proposals WHERE id = ?').get(id).status;
  assert.equal(ps(old), 'expired');
  assert.equal(ps(today), 'sent', 'valid through its last day');
});
