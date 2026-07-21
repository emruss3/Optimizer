// Local stand-in for the Supabase REST surface: serves pre-fetched REAL
// responses (pulled via the MCP SQL channel) so the visual battery renders
// genuine solver output in a sandbox whose egress blocks supabase.co.
// Unknown requests are logged to misses.log and answered 404 — the recorder.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Default store = the committed fixtures, so `node mock-supabase.mjs` works
// out of the box (CI gate). MOCK_STORE overrides for a local refresh cycle.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = process.env.MOCK_STORE || path.join(HERE, 'fixtures', 'mock_store.json');
const LOG_DIR = process.env.MOCK_LOG_DIR || HERE;
const MISS_LOG = path.join(LOG_DIR, 'mock_misses.log');
const log = (file, line) => { try { fs.appendFileSync(file, line); } catch { /* logging is never fatal */ } };
let store = {};
try { store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { store = {}; }
console.log(`mock store: ${STORE_PATH} (${Object.keys(store).length} keys)`);

const keyFor = (path, body) => {
  // RPC calls key on fn name + the discriminating args; table reads key on path.
  const m = path.match(/\/rest\/v1\/rpc\/(\w+)/);
  if (!m) return `GET ${path.split('?')[0]}`;
  const fn = m[1];
  let args = {};
  try { args = JSON.parse(body || '{}'); } catch { /* noop */ }
  const fid = args.p_ogc_fid ?? args.ogc_fid ?? '';
  const use = args.p_use ?? args.p_typology ?? '';
  return `rpc:${fn}:${fid}:${use}`;
};

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    // supabase-js auth endpoints: no session, cleanly.
    if (req.url.startsWith('/auth/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ session: null, user: null }));
      return;
    }
    const key = keyFor(req.url, body);
    if (key in store) {
      log(MISS_LOG.replace('misses', 'hits'), `${Date.now()} HIT ${key}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(store[key]));
      return;
    }
    // Table reads default to empty sets rather than errors (site_plans etc.)
    if (!req.url.includes('/rpc/')) {
      log(MISS_LOG, `TABLE ${req.method} ${req.url}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    log(MISS_LOG, `${key}\t${req.url}\t${body.slice(0, 300)}\n`);
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `mock miss: ${key}` }));
  });
}).listen(54321, () => console.log('mock supabase on :54321'));
