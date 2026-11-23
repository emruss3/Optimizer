// The November 23 field audit on build 32a264a. No writes or plan generation.
const cohort = [
  {
    "address": "2600 W HEIMAN ST",
    "id": 553450,
    "apn": "08100003100"
  },
  {
    "address": "2031 HERMAN ST",
    "id": 651425,
    "apn": "09207014700"
  },
  {
    "address": "5525 MT VIEW RD",
    "id": 660125,
    "apn": "16300013600"
  },
  {
    "address": "6404 EATONS CREEK RD",
    "id": 661661,
    "apn": "02200001000"
  },
  {
    "address": "0 NASHBORO BLVD",
    "id": 672524,
    "apn": "13500041800"
  },
  {
    "address": "0 HOMELAND DR",
    "id": 674961,
    "apn": "05800022100"
  },
  {
    "address": "0 RIVER LANDING WAY",
    "id": 676430,
    "apn": "04300027500"
  },
  {
    "address": "0 BRITTANY PARK DR",
    "id": 678964,
    "apn": "16200029600"
  },
  {
    "address": "0 HESSEY RD",
    "id": 679226,
    "apn": "11000021800"
  },
  {
    "address": "1109 W TRINITY LN"
  }
];

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the target deployment.');
const endpoint = new URL('/rest/v1/rpc/find_planner_parcels', url);
const headers = { apikey: key, 'Content-Type': 'application/json' };
if (!key.startsWith('sb_publishable_')) headers.Authorization = 'Bearer ' + key;

async function lookup(input, matches, mode) {
  const start = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers, body: JSON.stringify({ p_query: input, p_limit: 10 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + await response.text());
    const hits = await response.json();
    const hit = hits.find(item => matches(item, hits));
    if (!hit) throw new Error('expected parcel missing from ' + hits.length + ' hits');
    return { input, mode, ms: Math.round(performance.now() - start), hit };
  } catch (error) {
    return { input, mode, ms: Math.round(performance.now() - start), error: error.message };
  }
}

async function runCase(parcel, mode) {
  // Trinity uses the APN returned for its unique full address as a round-trip
  // check. The other nine also have independently verified parcel identities.
  const address = await lookup(parcel.address, (hit, hits) =>
    hit.address === parcel.address && (parcel.id === undefined ? hits.length === 1 : hit.ogc_fid === parcel.id), mode);
  const id = parcel.id ?? address.hit?.ogc_fid;
  const apn = parcel.apn ?? address.hit?.parcelnumb;
  const checks = [address];
  if (apn) checks.push(await lookup(apn, hit => hit.ogc_fid === id && hit.address === parcel.address, mode));
  return checks;
}

for (const mode of ['serial', 'concurrent']) {
  const results = [];
  if (mode === 'serial') {
    for (const parcel of cohort) results.push(...await runCase(parcel, mode));
  } else {
    results.push(...(await Promise.all(cohort.map(parcel => runCase(parcel, mode)))).flat());
  }
  console.table(results.map(({input, ms, hit, error}) => ({input, ms, id: hit?.ogc_fid, error})));
  const sorted = results.map(r => r.ms).sort((a, b) => a - b);
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  const passed = results.filter(r => r.hit).length;
  console.log(`${mode}: ${passed}/${cohort.length * 2} correct; p95 ${p95} ms`);
  if (passed !== cohort.length * 2 || p95 >= 1000) process.exitCode = 1;
}
