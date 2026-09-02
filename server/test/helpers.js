const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Spawns a real server process on a throwaway port and database, then waits
// for /api/health. index.js listens on require, so driving it over HTTP is
// both simpler than stubbing and closer to how it actually runs.
//
// DB_PATH lands in a temp dir rather than the repo, which also satisfies the
// production guard that refuses a database inside the application directory.
async function startServer(env = {}) {
  const port = 4100 + Math.floor(Math.random() * 800);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-test-'));
  const dbPath = path.join(dir, 'test.db');
  const child = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      // A developer's own .env must not decide what these tests assert.
      NODE_ENV: '',
      SEED_DEMO: '',
      CRM_GATE_KEY: '',
      CRM_PUBLIC: '',
      ADMIN_BOOTSTRAP_PASSWORD: '',
      BACKUP_INTERVAL_HOURS: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });

  const base = `http://localhost:${port}`;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) {
      throw new Error(`server exited with ${child.exitCode}:\n${output}`);
    }
    try {
      const r = await fetch(base + '/api/health');
      if (r.status === 200) return { base, child, dir, getOutput: () => output };
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`server never became healthy:\n${output}`);
}

function stopServer(server) {
  server.child.kill();
  fs.rmSync(server.dir, { recursive: true, force: true });
}

async function call(base, method, urlPath, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(base + urlPath, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

module.exports = { startServer, stopServer, call };
