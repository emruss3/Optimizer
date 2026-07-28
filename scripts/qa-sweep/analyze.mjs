// 20-parcel QA sweep of the default fn_generate_mf_site_plan_v2 (Eric's ask
// 2026-07-28): capacity >= 95%?, single structure?, roads/parking sane?
// Seed family checks run in native EPSG:2274 feet; legacy (mf_max_gsf_v1)
// payloads check in a local equirectangular-feet frame around the parcel.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/Optimizer/package.json');
const polyclip = require('polygon-clipping').default ?? require('polygon-clipping');

const SCRATCH = path.dirname(fileURLToPath(import.meta.url));
const rows = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'sweep_all.json'), 'utf8'));
const legacyOutlines = JSON.parse(fs.readFileSync(path.join(SCRATCH, 'legacy_outlines_4326.json'), 'utf8'));

const FT_PER_DEG_LAT = 364000; // ~ at 36.1N
const ftPerDegLon = lat => Math.cos((lat * Math.PI) / 180) * 365228;

const ringArea = ring => {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a) / 2;
};
const mpArea = mp => {
  let a = 0;
  for (const poly of mp) {
    if (!poly.length) continue;
    a += ringArea(poly[0]);
    for (let i = 1; i < poly.length; i++) a -= ringArea(poly[i]);
  }
  return a;
};
const interArea = (aPolys, bPolys) => {
  try { return mpArea(polyclip.intersection(aPolys, bPolys)); } catch { return -1; }
};
const diffArea = (aPolys, bPolys) => {
  try { return mpArea(polyclip.difference(aPolys, bPolys)); } catch { return -1; }
};

/** GeoJSON Polygon/MultiPolygon -> polyclip multipolygon [[ring...]...] */
const toMP = g => {
  if (!g) return null;
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return null;
};
/** project a geojson coord array in-place-ish via fn([x,y]) */
const mapCoords = (coords, fn) =>
  Array.isArray(coords[0]) ? coords.map(c => mapCoords(c, fn)) : fn(coords);

const bufferLine = (line, halfW) => {
  // rectangle around each segment, unioned — enough for a 2-pt spine
  const rects = [];
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i]; const [x2, y2] = line[i + 1];
    const dx = x2 - x1, dy = y2 - y1; const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * halfW, ny = (dx / len) * halfW;
    rects.push([[[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny]]]);
  }
  if (!rects.length) return null;
  try { return polyclip.union(...rects.map(r => [r])); } catch { return rects.map(r => r[0] && [r[0]] ? r : r).map(r => r); }
};

const results = [];
const svgs = [];

for (const [fid, r] of Object.entries(rows)) {
  const plan = r.plan ?? {};
  const isSeed = !!plan.buildings?.[0]?.geom_2274;
  const family = isSeed ? 'seed_v2' : (plan.generator_version ?? 'legacy');
  const met = plan.metrics ?? {};
  const gsf = met.gsf ?? met.gfa_sqft ?? null;
  const maxGsf = typeof r.max_gsf === 'number' ? r.max_gsf : null;
  const capture = gsf != null && maxGsf > 0 ? Math.round((gsf / maxGsf) * 1000) / 10 : null;
  const captureClaim = met.capture_pct ?? null;

  // ---- Build geometry sets in a common ft frame ----
  let frame; // fn([lon,lat] or [x,y]) -> [xft,yft]
  let parcelMP;
  if (isSeed) {
    frame = c => c; // already 2274 ft
    parcelMP = toMP(r.parcel);
  } else {
    const outline = legacyOutlines[fid];
    const lat0 = outline.coordinates[0][0][0][1];
    const lon0 = outline.coordinates[0][0][0][0];
    const kx = ftPerDegLon(lat0), ky = FT_PER_DEG_LAT;
    frame = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky];
    parcelMP = toMP({ type: outline.type, coordinates: mapCoords(outline.coordinates, frame) });
  }

  const buildings = []; // {mp, sqft}
  const parking = [];   // {mp, sqft}
  const drives = [];    // {mp}
  let spineLine = null; // ft coords
  let entryPt = null;
  let frontageLine = null;

  if (isSeed) {
    for (const b of plan.buildings ?? []) {
      const mp = toMP(b.geom_2274); if (mp) buildings.push({ mp, sqft: b.footprint_sqft ?? mpArea(mp) });
    }
    for (const bay of plan.parking?.bays ?? []) {
      const mp = toMP(bay.geom_2274); if (mp) parking.push({ mp, sqft: bay.area_sqft ?? mpArea(mp) });
    }
    for (const d of plan.drives ?? []) {
      if (d.spine_2274?.coordinates) spineLine = d.spine_2274.coordinates;
      if (d.entry_2274?.coordinates) entryPt = d.entry_2274.coordinates;
      if (d.geom_2274) { const mp = toMP(d.geom_2274); if (mp) drives.push({ mp }); }
    }
    const fr = r.frontage?.primary?.geom_2274;
    if (fr?.coordinates) frontageLine = fr.type === 'MultiLineString' ? fr.coordinates.flat() : fr.coordinates;
  } else {
    for (const b of plan.buildings ?? []) {
      const g = typeof b.geom === 'string' ? JSON.parse(b.geom) : b.geom;
      const mp = toMP({ ...g, coordinates: mapCoords(g.coordinates, frame) });
      if (mp) buildings.push({ mp, sqft: b.footprint_sqft ?? mpArea(mp) });
    }
    for (const p of plan.parking ?? []) {
      const g = typeof p.geom === 'string' ? JSON.parse(p.geom) : p.geom;
      const mp = toMP({ ...g, coordinates: mapCoords(g.coordinates, frame) });
      if (mp) parking.push({ mp, sqft: mpArea(mp), stalls: p.stalls });
    }
    for (const d of plan.drives ?? []) {
      const g = typeof d.geom === 'string' ? JSON.parse(d.geom) : d.geom;
      const mp = toMP({ ...g, coordinates: mapCoords(g.coordinates, frame) });
      if (mp) drives.push({ mp });
    }
  }

  // ---- Checks (areas in sqft; overlap threshold 10 sqft ~ 1 m2) ----
  const issues = [];
  const TH = 11;
  const pair = (arrA, arrB, label, sameArr) => {
    let worst = 0;
    for (let i = 0; i < arrA.length; i++) {
      for (let j = sameArr ? i + 1 : 0; j < arrB.length; j++) {
        const a = interArea(arrA[i].mp, arrB[j].mp);
        if (a > worst) worst = a;
      }
    }
    if (worst > TH) issues.push(`${label} overlap ${Math.round(worst)} sqft`);
    return worst;
  };
  pair(buildings, buildings, 'building x building', true);
  pair(buildings, parking, 'building x parking', false);
  pair(parking, parking, 'parking x parking', true);
  pair(drives, buildings, 'drive x building', false);

  // containment: any element leaking outside the parcel
  let outside = 0;
  for (const set of [buildings, parking, drives]) {
    for (const el of set) {
      const d = diffArea(el.mp, parcelMP);
      if (d > outside) outside = d;
    }
  }
  if (outside > TH) issues.push(`element leaks ${Math.round(outside)} sqft outside parcel`);

  // spine centerline under the building (seed) — the upstream observation
  let spineUnderBldg = 0;
  if (isSeed && spineLine && buildings.length) {
    const corr = bufferLine(spineLine, 12); // 24 ft corridor
    if (corr) for (const b of buildings) spineUnderBldg = Math.max(spineUnderBldg, interArea(corr, b.mp));
  }

  // entry near frontage (seed)
  let entryToFrontFt = null;
  if (isSeed && entryPt && frontageLine) {
    let best = Infinity;
    for (let i = 0; i < frontageLine.length - 1; i++) {
      const [x1, y1] = frontageLine[i], [x2, y2] = frontageLine[i + 1];
      const dx = x2 - x1, dy = y2 - y1; const L2 = dx * dx + dy * dy;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((entryPt[0] - x1) * dx + (entryPt[1] - y1) * dy) / L2)) : 0;
      const d = Math.hypot(entryPt[0] - (x1 + t * dx), entryPt[1] - (y1 + t * dy));
      if (d < best) best = d;
    }
    entryToFrontFt = Math.round(best);
    if (best > 60) issues.push(`entry ${Math.round(best)} ft from primary frontage`);
  }

  // parking sanity: sqft per stall
  const stalls = met.stalls ?? plan.parking?.stalls ?? null;
  const parkSqft = parking.reduce((s, p) => s + (p.sqft ?? 0), 0);
  const sqftPerStall = stalls > 0 && parkSqft > 0 ? Math.round(parkSqft / stalls) : null;
  if (sqftPerStall != null && (sqftPerStall < 160 || sqftPerStall > 700)) {
    issues.push(`parking ${sqftPerStall} sqft/stall (sane band 160-700)`);
  }
  const stallsRequired = met.stalls_required ?? plan.parking?.stalls_required ?? null;

  results.push({
    fid: Number(fid), family, structures: (plan.buildings ?? []).length,
    gsf, maxGsf, capture, captureClaim,
    stalls, stallsRequired, sqftPerStall,
    parkingLimited: met.parking_limited ?? null,
    strategy: plan.parking?.strategy ?? met.massing_parti ?? null,
    spineUnderBldgSqft: Math.round(spineUnderBldg),
    entryToFrontFt,
    issues,
  });

  // ---- SVG ----
  const allPts = [];
  const collect = mp => { for (const poly of mp) for (const ring of poly) for (const pt of ring) allPts.push(pt); };
  collect(parcelMP);
  const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 300, H = 260, PAD = 12;
  const s = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD - 30) / (maxY - minY || 1));
  const X = x => PAD + (x - minX) * s;
  const Y = y => H - 30 - PAD - (y - minY) * s;
  const pathOf = mp => mp.map(poly => poly.map(ring =>
    'M' + ring.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('L') + 'Z').join(' ')).join(' ');
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:#fff">`;
  svg += `<path d="${pathOf(parcelMP)}" fill="#F1F5F9" stroke="#334155" stroke-width="1.2" fill-rule="evenodd"/>`;
  for (const d of drives) svg += `<path d="${pathOf(d.mp)}" fill="#E2CE9C" stroke="#B9A15E" stroke-width="0.6" opacity="0.8"/>`;
  for (const p of parking) svg += `<path d="${pathOf(p.mp)}" fill="#CBD5E1" stroke="#94A3B8" stroke-width="0.6"/>`;
  for (const b of buildings) svg += `<path d="${pathOf(b.mp)}" fill="#3B82F6" stroke="#1D4ED8" stroke-width="0.8" opacity="0.85"/>`;
  if (spineLine) svg += `<polyline points="${spineLine.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="#0F172A" stroke-width="1.4" stroke-dasharray="5,3"/>`;
  if (frontageLine) svg += `<polyline points="${frontageLine.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}" fill="none" stroke="#DC2626" stroke-width="2"/>`;
  if (entryPt) svg += `<circle cx="${X(entryPt[0]).toFixed(1)}" cy="${Y(entryPt[1]).toFixed(1)}" r="4" fill="#DC2626"/>`;
  const capTxt = capture != null ? `${capture}%` : 'n/a';
  const flag = (capture ?? 0) >= 95 && (plan.buildings ?? []).length === 1 && issues.length === 0 ? '' : ' ⚠';
  svg += `<text x="8" y="${H - 16}" font-family="monospace" font-size="11" fill="#0F172A">${fid} · ${family} · ${(plan.buildings ?? []).length} bldg · cap ${capTxt}${flag}</text>`;
  svg += `<text x="8" y="${H - 4}" font-family="monospace" font-size="9" fill="#64748B">${(issues[0] ?? (spineUnderBldg > TH ? `spine under bldg ${Math.round(spineUnderBldg)} sqft` : 'clean')).slice(0, 52)}</text>`;
  svg += '</svg>';
  svgs.push({ fid: Number(fid), svg, capture, family });
}

results.sort((a, b) => (a.capture ?? -1) - (b.capture ?? -1));
fs.writeFileSync(path.join(SCRATCH, 'sweep_results.json'), JSON.stringify(results, null, 2));

svgs.sort((a, b) => (a.capture ?? -1) - (b.capture ?? -1));
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:system-ui;margin:16px;background:#fff}
h1{font-size:16px} .grid{display:grid;grid-template-columns:repeat(4,310px);gap:10px}
.card{border:1px solid #E2E8F0;border-radius:6px;overflow:hidden}
.legend{font-size:11px;color:#475569;margin:6px 0}
</style></head><body>
<h1>Seed-default QA sweep · 20 random buildable parcels (RM|OR|MU universe, deterministic draw sweep-2026-07-28) · sorted by capture</h1>
<div class="legend">blue = building · grey = parking · tan = drives (legacy) · dashed = spine centerline · red = primary frontage + entry · ⚠ = misses the 95% bar, multi-structure, or geometry issue</div>
<div class="grid">${svgs.map(s => `<div class="card">${s.svg}</div>`).join('')}</div>
</body></html>`;
fs.writeFileSync(path.join(SCRATCH, 'sweep_contact.html'), html);

// console summary
const seedRows = results.filter(x => x.family === 'seed_v2');
const legacyRows = results.filter(x => x.family !== 'seed_v2');
const ge95 = results.filter(x => (x.capture ?? 0) >= 95).length;
const over100 = results.filter(x => (x.capture ?? 0) > 100.5);
const multi = results.filter(x => x.structures > 1);
console.log(`n=20 · seed_v2=${seedRows.length} legacy=${legacyRows.length} · capture>=95: ${ge95}/20 · multi-structure: ${multi.length} · over-100: ${over100.length}`);
for (const x of results) {
  console.log(`${String(x.fid).padEnd(7)} ${x.family.padEnd(13)} ${String(x.structures).padStart(2)} bldg · cap ${String(x.capture ?? 'n/a').padStart(6)} (claim ${x.captureClaim ?? '—'}) · stalls ${x.stalls ?? '—'}/${x.stallsRequired ?? '—'} · ${x.sqftPerStall ?? '—'} sf/stall · spineU ${x.spineUnderBldgSqft} · entry ${x.entryToFrontFt ?? '—'}ft ${x.issues.length ? '· ISSUES: ' + x.issues.join(' | ') : ''}`);
}
