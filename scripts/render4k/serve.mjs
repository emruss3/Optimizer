import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createReadStream, mkdirSync, linkSync, readFileSync, lstatSync, rmSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { HttpError, UUID, readRenderInput, sha256 } from './inputs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(join(here, '../../src/features/site-plan/render3d/siteAssets.json'), 'utf8'));
const renderScript = join(here, 'render_job.py');
const dir = resolve(process.env.RENDER_DATA_DIR ?? 'out/render-service');
const host = process.env.RENDER_HOST ?? '127.0.0.1';
const test = process.env.RENDER_TEST_MODE === '1';
if (test && host !== '127.0.0.1') throw new Error('Test mode requires a loopback listener.');

function integer(name, fallback, min, max) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}.`);
  return value;
}

const port = integer('RENDER_PORT', 8787, 1, 65_535);
const origins = new Set((process.env.RENDER_APP_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean));
const supabase = new URL(process.env.SUPABASE_URL ?? '');
const apiKey = process.env.SUPABASE_ANON_KEY;
if (!apiKey || !origins.size || (!test && supabase.protocol !== 'https:')) {
  throw new Error('Configure SUPABASE_URL, SUPABASE_ANON_KEY and RENDER_APP_ORIGINS.');
}
const executable = process.env.BLENDER_BIN ?? 'blender';
const version = process.env.BLENDER_VERSION;
const driver = process.env.RENDER_DRIVER_VERSION ?? (test ? 'local-test' : '');
const device = process.env.RENDER_DEVICE ?? 'OPTIX';
if (!version || !(test ? /^4\.\d+\.\d+$/ : /^4\.5\.\d+$/).test(version) ||
    !driver || !['CPU', 'OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'].includes(device)) {
  throw new Error('Set BLENDER_VERSION to the deployed 4.5 LTS patch, RENDER_DEVICE, and RENDER_DRIVER_VERSION.');
}
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  ['PATH', 'HOME', 'TMPDIR', 'LD_LIBRARY_PATH', 'CUDA_VISIBLE_DEVICES', 'HIP_VISIBLE_DEVICES', 'ONEAPI_DEVICE_SELECTOR'].includes(k)));
const foundVersion = /Blender (\d+\.\d+\.\d+)/.exec(execFileSync(executable, ['--version'], { env, encoding: 'utf8', timeout: 10_000 }))?.[1];
if (foundVersion !== version) throw new Error(`The worker expects Blender ${version}, found ${foundVersion ?? 'unknown'}.`);

const samples = integer('RENDER_SAMPLES', test ? 4 : 256, 1, 4096);
const threads = integer('RENDER_THREADS', 0, 0, 256);
const outputScale = test ? 0.125 : 1;
const exr = process.env.RENDER_EXR === '1';
const timeout = integer('RENDER_TIMEOUT_SECONDS', 1800, 10, 21_600) * 1000;
const maxQueue = integer('RENDER_MAX_QUEUE', 20, 1, 200);
const maxStoredJobs = integer('RENDER_MAX_STORED_JOBS', 200, 1, 20_000);
const settings = {
  version, driver, device, samples, threads, exr, outputScale,
  worker: sha256(readFileSync(renderScript)), asset_version: catalog.version,
};
const settingsKey = sha256(JSON.stringify(settings));

mkdirSync(dir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(dir, 'queue.sqlite'));
db.exec(`
  PRAGMA busy_timeout=5000;
  PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    saved_plan_id TEXT,
    parcel_id TEXT NOT NULL,
    scheme_id TEXT NOT NULL,
    revision TEXT NOT NULL,
    appearance TEXT NOT NULL,
    cameras TEXT NOT NULL,
    settings_key TEXT NOT NULL,
    wants_exr INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    lease_until INTEGER,
    attempt TEXT,
    output_attempt TEXT,
    failure TEXT,
    render_seconds REAL,
    UNIQUE (owner_id, cache_key)
  );
  CREATE INDEX IF NOT EXISTS render_queue ON jobs(status, created_at);
`);

const owned = db.prepare('SELECT * FROM jobs WHERE id=? AND owner_id=?');
const cached = db.prepare('SELECT * FROM jobs WHERE owner_id=? AND cache_key=?');
const ready = db.prepare(`UPDATE jobs SET status='running', updated_at=?, lease_until=?, attempt=?
  WHERE id=(SELECT id FROM jobs WHERE status='queued' ORDER BY created_at, id LIMIT 1)
  RETURNING *`);
const recover = db.prepare(`UPDATE jobs SET status='queued', lease_until=NULL, attempt=NULL, updated_at=?
  WHERE status='running' AND lease_until<?`);
const finish = db.prepare(`UPDATE jobs SET status=?, failure=?, output_attempt=?, render_seconds=?, lease_until=NULL, updated_at=?
  WHERE id=? AND status='running' AND attempt=?`);
const add = db.prepare(`INSERT INTO jobs
  (id,owner_id,cache_key,saved_plan_id,parcel_id,scheme_id,revision,appearance,cameras,settings_key,wants_exr,status,created_at,updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,'queued',?,?) RETURNING *`);

function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const pending = db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('queued','running')");
const userPending = db.prepare("SELECT count(*) AS n FROM jobs WHERE owner_id=? AND status IN ('queued','running')");
const stored = db.prepare('SELECT count(*) AS n FROM jobs');
function checkCapacity(owner) {
  if (pending.get().n >= maxQueue || userPending.get(owner).n >= 3) {
    throw new HttpError(429, 'The render queue is full. Try again when a job finishes.');
  }
}

const json = (res, status, data) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};
const unavailable = () => new HttpError(404, 'Render job was not found.');
const signIn = () => new HttpError(401, 'Sign in to render and download your plans.');

async function supabaseRead(path, token) {
  let response;
  try {
    response = await fetch(new URL(path, supabase), {
      headers: { apikey: apiKey, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new HttpError(503, 'The render service could not reach sign-in. Try again.');
  }
  if (response.status === 401) throw signIn();
  if (!response.ok) throw new HttpError(503, 'The render service could not verify access. Try again.');
  return response.json();
}
async function authenticate(req) {
  const token = /^Bearer ([A-Za-z0-9._-]{1,8192})$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) throw signIn();
  const user = await supabaseRead('/auth/v1/user', token);
  if (!UUID.test(user?.id ?? '') || user.is_anonymous || user.role !== 'authenticated') throw signIn();
  return { id: user.id, token };
}
async function verifyPlan(viewer, savedId, parcel) {
  if (!savedId) return;
  const params = new URLSearchParams({ select: 'id,parcel_id', id: `eq.${savedId}`, limit: '1' });
  const rows = await supabaseRead(`/rest/v1/site_plans?${params}`, viewer.token);
  if (!Array.isArray(rows) || rows[0]?.id !== savedId || String(rows[0]?.parcel_id) !== parcel) throw unavailable();
}

const toIso = ms => new Date(ms).toISOString();
function reply(row, reuse = false) {
  const cameras = JSON.parse(row.cameras);
  return {
    id: row.id, status: row.status, revision: row.revision, parcel_id: row.parcel_id, scheme_id: row.scheme_id,
    appearance: JSON.parse(row.appearance), cameras, created_at: toIso(row.created_at), updated_at: toIso(row.updated_at),
    files: row.status === 'completed' ? [...cameras.map(id => `${id}.png`), ...(row.wants_exr ? cameras.map(id => `${id}.exr`) : []),
      'render-report.json', 'render-job.json'] : [],
    error: row.failure, render_seconds: row.render_seconds, reused: reuse,
  };
}

async function submit(req, viewer) {
  const { job, glb, savedPlanId, cameras } = await readRenderInput(req, catalog);
  await verifyPlan(viewer, savedPlanId, job.site.parcel_id);
  const key = sha256(JSON.stringify({ job, savedPlanId, cameras, settings }));
  return transaction(() => {
    const existing = cached.get(viewer.id, key);
    if (existing) return reply(existing, true);
    checkCapacity(viewer.id);
    if (stored.get().n >= maxStoredJobs) {
      throw new HttpError(503, 'The render service has reached its storage limit.');
    }
    const id = randomUUID(), folder = join(dir, id), now = Date.now();
    mkdirSync(folder, { mode: 0o700 });
    try {
      writeFileSync(join(folder, 'render-job.json'), JSON.stringify(job), { flag: 'wx', mode: 0o600 });
      writeFileSync(join(folder, 'scene.glb'), glb, { flag: 'wx', mode: 0o600 });
      return reply(add.get(id, viewer.id, key, savedPlanId, job.site.parcel_id, job.site.scheme_id, job.site.revision,
        JSON.stringify(job.appearance), JSON.stringify(cameras), settingsKey, Number(exr), now, now));
    } catch (error) {
      rmSync(folder, { recursive: true, force: true });
      throw error;
    }
  });
}

const retryRow = db.prepare(`UPDATE jobs SET status='queued', failure=NULL, attempt=NULL, updated_at=?
  WHERE id=? AND status='failed' RETURNING *`);
function retry(id, owner) {
  return transaction(() => {
    const row = owned.get(id, owner);
    if (row.status !== 'failed') return reply(row, true);
    if (row.settings_key !== settingsKey) throw new HttpError(409, 'The worker has changed. Close this panel and request a new render.');
    checkCapacity(owner);
    return reply(retryRow.get(Date.now(), id));
  });
}

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function checkOutput(folder, row) {
  const report = JSON.parse(readFileSync(join(folder, 'render-report.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(dir, row.id, 'render-job.json'), 'utf8'));
  if (!report.checks_passed || report.site?.revision !== row.revision || report.glb_sha256 !== manifest.glb.sha256 ||
    !Number.isFinite(report.timing?.total_seconds)) throw new Error('Render report failed verification.');
  for (const id of JSON.parse(row.cameras)) {
    const img = report.images?.[id];
    const header = Buffer.alloc(24);
    const fd = openSync(join(folder, `${id}.png`), 'r');
    try {
      if (readSync(fd, header) !== header.length) throw new Error('The PNG is incomplete.');
    } finally {
      closeSync(fd);
    }
    if (img?.width !== 3840 * outputScale || img?.height !== 2160 * outputScale ||
      !header.subarray(0, 8).equals(pngSignature) || header.readUInt32BE(16) !== img.width || header.readUInt32BE(20) !== img.height ||
      (exr && (!lstatSync(join(folder, `${id}.exr`)).isFile() || img.master !== `${id}.exr`))) {
      throw new Error('The renderer did not write the requested output.');
    }
  }
  return report.timing.total_seconds;
}

let child;
let busy = false;
let stopping = false;
async function work() {
  if (busy || stopping) return;
  busy = true;
  let row;
  try {
    const now = Date.now(), attempt = randomUUID();
    recover.run(now, now);
    row = ready.get(now, now + timeout + 60_000, attempt);
    if (!row) return;
    if (row.settings_key !== settingsKey) {
      finish.run('failed', 'The worker has changed. Close this panel and request a new render.', null, null, Date.now(), row.id, attempt);
      return;
    }
    const source = join(dir, row.id), folder = join(source, attempt);
    mkdirSync(folder, { mode: 0o700 });
    for (const file of ['scene.glb', 'render-job.json']) linkSync(join(source, file), join(folder, file));

    const args = ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1',
      '--python', renderScript, '--', join(folder, 'render-job.json'), '--require-version', version,
      '--device', device, '--samples', String(samples), '--threads', String(threads), '--scale', String(outputScale),
      '--cameras', JSON.parse(row.cameras).join(',')];
    if (test) args.push('--allow-version');
    if (exr) args.push('--exr');
    let log = '', expired = false;
    try {
      await new Promise((resolve, reject) => {
        child = spawn(executable, args, { cwd: folder, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const limit = setTimeout(() => { expired = true; child?.kill('SIGKILL'); }, timeout);
        for (const channel of [child.stdout, child.stderr]) channel.on('data', buf => {
          log = (log + buf.toString('utf8')).slice(-64 * 1024);
        });
        child.once('error', reject);
        child.once('close', code => {
          clearTimeout(limit);
          code === 0 && !expired ? resolve() : reject(new Error(expired ? 'Render timed out.' : 'Cycles exited with an error.'));
        });
      });
    } finally {
      child = undefined;
      writeFileSync(join(folder, 'worker.log'), log, { mode: 0o600 });
    }
    const seconds = checkOutput(folder, row);
    finish.run('completed', null, attempt, seconds, Date.now(), row.id, attempt);
    console.log(JSON.stringify({ event: 'render_completed', job_id: row.id, backend: device, render_seconds: seconds }));
  } catch (error) {
    if (row) {
      const failure = error.message === 'Render timed out.' ? 'The render exceeded the time limit. Retry the job or export the scene.'
        : 'Cycles could not finish this render. Retry the job or export the scene.';
      finish.run('failed', failure, null, null, Date.now(), row.id, row.attempt);
      console.error('Render job', row.id, error.message);
    } else {
      console.error('Render queue', error.message);
    }
  } finally {
    busy = false;
  }
}

async function download(res, row, file) {
  if (row.status !== 'completed' || !reply(row).files.includes(file)) throw unavailable();
  const folder = file === 'render-job.json' ? join(dir, row.id) : join(dir, row.id, row.output_attempt);
  const path = join(folder, file), stat = lstatSync(path);
  if (!stat.isFile()) throw unavailable();
  const contentType = file.endsWith('.png') ? 'image/png' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  const safe = value => value.replace(/[^a-z0-9_-]/gi, '-');
  res.writeHead(200, {
    'content-type': contentType, 'content-length': stat.size,
    'content-disposition': `attachment; filename="parcel-${safe(row.parcel_id)}-${safe(row.revision)}-${file}"`,
  });
  await pipeline(createReadStream(path), res);
}

let uploads = 0;
const server = createServer({ requestTimeout: 180_000, headersTimeout: 10_000, keepAliveTimeout: 5_000 }, async (req, res) => {
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('vary', 'Origin');
  try {
    const origin = req.headers.origin;
    if (origin) {
      if (!origins.has(origin)) throw new HttpError(403, 'This origin cannot access the render service.');
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
    }
    if (req.method === 'OPTIONS') return res.writeHead(204).end();
    const path = new URL(req.url, 'http://worker.local').pathname;
    if (path === '/health' && req.method === 'GET') return json(res, 200, { ok: true });
    const match = /^\/v1\/jobs\/([a-f0-9-]{36})(?:\/(retry|files\/([a-z0-9.-]+)))?$/.exec(path);
    const requestJob = path === '/v1/jobs' && req.method === 'POST';
    if (!requestJob && (!match || !UUID.test(match[1]))) throw unavailable();
    const viewer = await authenticate(req);
    if (requestJob) {
      if (uploads >= 2) throw new HttpError(429, 'The render service is receiving other scenes. Try again shortly.');
      uploads++;
      try {
        const result = await submit(req, viewer);
        json(res, result.reused ? 200 : 202, result);
        if (result.reused) console.log(JSON.stringify({ event: 'render_reused', job_id: result.id }));
        void work();
        return;
      } finally {
        uploads--;
      }
    }
    const row = owned.get(match[1], viewer.id);
    if (!row) throw unavailable();
    await verifyPlan(viewer, row.saved_plan_id, row.parcel_id);
    if (req.method === 'GET' && !match[2]) return json(res, 200, reply(row));
    if (req.method === 'GET' && match[3]) return await download(res, row, match[3]);
    if (req.method === 'POST' && match[2] === 'retry') {
      json(res, 202, retry(row.id, viewer.id));
      void work();
      return;
    }
    throw unavailable();
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (!(error instanceof HttpError)) console.error('Render request', error.message);
    json(res, error instanceof HttpError ? error.status : 500, {
      error: error instanceof HttpError ? error.message : 'The render service could not complete the request.',
    });
  }
});

server.listen(port, host, () => console.log(`Render service listening on ${host}:${port} (${version}, ${device})`));
const poll = setInterval(() => void work(), 1000);
function stop() {
  stopping = true;
  clearInterval(poll);
  child?.kill('SIGKILL');
  server.close();
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
