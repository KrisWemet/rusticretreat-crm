// One daily job runner, on Alberta time.
//
// Each job runs once per Alberta calendar day, at or after its hour. The last
// run is recorded in job_runs, so a deploy or restart neither repeats a job
// that already ran today nor skips one: a server that boots at 10:00 simply
// catches up on the 08:00 jobs. This replaces three setIntervals that each ran
// at boot and then every 24 hours, which drifted with every deploy.
const db = require('../db');

const TZ = 'America/Edmonton';

db.exec(`CREATE TABLE IF NOT EXISTS job_runs (
  name TEXT PRIMARY KEY,
  last_day TEXT,
  last_run_at DATETIME,
  last_status TEXT,
  last_error TEXT,
  last_result TEXT
)`);

// The calendar day (YYYY-MM-DD) and hour (0-23) in Alberta.
function albertaNow(at = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map(p => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}
const albertaToday = (at) => albertaNow(at).day;

const jobs = [];
function registerJob(name, hour, fn) {
  jobs.push({ name, hour, fn });
}

let onFailure = null; // (jobName, error) => void — set by the server to email the venue
function setFailureHandler(fn) { onFailure = fn; }

let ticking = false;
async function tick(at = new Date()) {
  if (ticking) return [];
  ticking = true;
  const ran = [];
  try {
    const { day, hour } = albertaNow(at);
    for (const job of jobs) {
      if (hour < job.hour) continue;
      const last = db.prepare('SELECT last_day FROM job_runs WHERE name = ?').get(job.name);
      if (last && last.last_day === day) continue;
      // Claim today before running, so an overlapping tick cannot start it twice.
      db.prepare(`INSERT INTO job_runs (name, last_day, last_run_at, last_status) VALUES (?, ?, datetime('now'), 'running')
                  ON CONFLICT(name) DO UPDATE SET last_day = excluded.last_day, last_run_at = excluded.last_run_at,
                  last_status = 'running', last_error = NULL`).run(job.name, day);
      try {
        const result = await job.fn({ day });
        db.prepare(`UPDATE job_runs SET last_status = 'ok', last_result = ? WHERE name = ?`)
          .run(result == null ? null : JSON.stringify(result).slice(0, 1000), job.name);
        ran.push({ name: job.name, ok: true, result });
      } catch (err) {
        console.error(`[jobs] ${job.name} failed:`, err.message);
        db.prepare(`UPDATE job_runs SET last_status = 'error', last_error = ? WHERE name = ?`)
          .run(String(err.message).slice(0, 1000), job.name);
        ran.push({ name: job.name, ok: false, error: err.message });
        if (onFailure) {
          try { await onFailure(job.name, err); } catch (e) { console.error('[jobs] failure alert failed:', e.message); }
        }
      }
    }
  } finally {
    ticking = false;
  }
  return ran;
}

function startScheduler({ everyMinutes = 15, firstAfterSeconds = 30 } = {}) {
  const run = () => tick().catch(err => console.error('[jobs] tick failed:', err.message));
  const first = setTimeout(run, firstAfterSeconds * 1000);
  const timer = setInterval(run, everyMinutes * 60000);
  first.unref?.(); timer.unref?.();
  console.log(`[jobs] Daily jobs (Alberta time): ${jobs.map(j => `${j.name} ${String(j.hour).padStart(2, '0')}:00`).join(', ')}`);
  return timer;
}

function jobStatus() {
  return db.prepare('SELECT * FROM job_runs ORDER BY name').all();
}

module.exports = { registerJob, tick, startScheduler, setFailureHandler, jobStatus, albertaNow, albertaToday, _jobs: jobs };
