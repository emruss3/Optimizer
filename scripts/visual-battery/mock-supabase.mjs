// Local stand-in for the Supabase REST surface: serves pre-fetched REAL
// responses (pulled via the MCP SQL channel) so the visual battery renders
// genuine solver output in a sandbox whose egress blocks supabase.co.
// Unknown requests are logged to misses.log and answered 404 — the recorder.
import http from 'node:http';
import fs from 'node:fs';

const STORE_PATH = process.env.MOCK_STORE || '/tmp/claude-0/-home-user-Optimizer/95899e1b-c1d4-5d12-92bb-5bf376ae4c76/scratchpad/mock_store.json';
const MISS_LOG = '/tmp/claude-0/-home-user-Optimizer/95899e1b-c1d4-5d12-92bb-5bf376ae4c76/scratchpad/mock_misses.log';
let store = {};
try { store = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { store = {}; }

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
      fs.appendFileSync(MISS_LOG.replace('misses', 'hits'), `${Date.now()} HIT ${key}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(store[key]));
      return;
    }
    // Table reads default to empty sets rather than errors (site_plans etc.)
    if (!req.url.includes('/rpc/')) {
      fs.appendFileSync(MISS_LOG, `TABLE ${req.method} ${req.url}\n`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
      return;
    }
    fs.appendFileSync(MISS_LOG, `${key}\t${req.url}\t${body.slice(0, 300)}\n`);
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: `mock miss: ${key}` }));
  });
}).listen(54321, () => console.log('mock supabase on :54321'));
