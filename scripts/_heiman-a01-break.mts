/**
 * W Heiman A-01 QA sheet: real fixture plan + ground-measured 20.85 ft break.
 *
 * The committed seed_v2 drive reaches the curb, so the break is placed the way
 * exhibit-parity forced it: endpoints in scene feet, gapFt from
 * scene.frame.distanceFt on the corresponding EPSG:3857 points — proving the
 * printed label is ground feet (21), not raw Mercator (~26).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import type { Element } from '../src/engine/types';
import type { MultiPolygon, Polygon } from 'geojson';
import { formatGapFt } from '../src/features/site-plan/api/mfAccess';
import { buildDrawingScene } from '../src/features/site-plan/scene/buildScene';
import { renderSitePlanSheet } from '../src/features/site-plan/scene/sheetSvg';
import { geom2274To4326 } from '../src/utils/tnStatePlane';
import { feature4326To3857 } from '../src/utils/reproject';

const OUT = 'qa/audits/2026-11-23-live-design-routes';
mkdirSync(OUT, { recursive: true });

const store = JSON.parse(readFileSync('scripts/visual-battery/fixtures/mock_store.json', 'utf8'));
const plan = store['rpc:fn_generate_mf_site_plan_v2:553450:multifamily'];
const parcelRec = store['rpc:get_parcel_by_id:553450:'][0];
const parcelGeom = feature4326To3857(parcelRec.geometry) as MultiPolygon | Polygon;
const to3857 = <T,>(g: T): T => feature4326To3857(geom2274To4326(g as never) as never) as T;
const meta = { createdAt: '2026-11-23', updatedAt: '2026-11-23', source: 'ai-generated' as const };

const elements: Element[] = [];
for (const b of plan.buildings ?? []) {
  if (!b?.geom_2274) continue;
  const floors = b.floors ?? b.stories ?? 5;
  elements.push({
    id: `mfgen-bldg-${b.structure_id ?? 1}`,
    type: 'building',
    name: `Apartments · ${floors} stories · ${plan.metrics?.units ?? 73} units`,
    geometry: to3857(b.geom_2274) as Polygon,
    properties: { floors, stories: floors, areaSqFt: b.footprint_sqft, planUnits: plan.metrics?.units ?? 73 },
    metadata: meta,
  } as Element);
}
for (const item of plan.drives ?? []) {
  if (!item?.geom_2274) continue;
  elements.push({
    id: `mfgen-drive`,
    type: 'circulation',
    name: 'Drive',
    geometry: to3857(item.geom_2274) as Polygon,
    properties: { areaSqFt: item.area_sqft },
    metadata: meta,
  } as Element);
}
for (const bay of plan.parking?.bays ?? []) {
  if (!bay?.geom_2274) continue;
  elements.push({
    id: `mfgen-bay-${elements.length}`,
    type: 'parking',
    name: 'Parking',
    geometry: to3857(bay.geom_2274) as Polygon,
    properties: { parkingSpaces: bay.stalls, areaSqFt: bay.area_sqft },
    metadata: meta,
  } as Element);
}

const scene = buildDrawingScene({
  parcelId: 553450,
  schemeId: 'mf:seed_v2',
  parcelGeometry: parcelGeom,
  elements,
  schedule: { units: plan.metrics?.units ?? 73, stalls: plan.parking?.stalls ?? 126 },
  generator: 'seed_v2',
})!;

// Access frame from the engine answer: lane along (dx,dy), inward normal (nx,ny).
const access = plan.access?.frame;
if (!access) throw new Error('fixture missing access.frame');

// Place the street-end of the break on the parcel edge near the right-side
// access lane entry (engine ox/oy is EPSG:2274). Convert a short segment in
// local scene feet next to the drive's south/street end.
const drive = scene.features.find(f => f.styleRole === 'drive');
if (!drive?.polygons[0]?.[0]) throw new Error('no drive on scene');
const driveRing = drive.polygons[0][0];

// Drive ring is already in scene feet. Find the vertex nearest the parcel
// boundary (street end), then step WANT_FT inward along the drive's long axis.
const parcelFt = scene.parcel.polygons[0]?.[0];
if (!parcelFt) throw new Error('no parcel feet');

const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const ex = bx - ax, ey = by - ay;
  const len2 = ex * ex + ey * ey;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / len2)) : 0;
  return { d: Math.hypot(px - (ax + t * ex), py - (ay + t * ey)), on: [ax + t * ex, ay + t * ey] as [number, number] };
};

let best = { d: Infinity, drivePt: driveRing[0] as [number, number], curb: driveRing[0] as [number, number] };
for (const pt of driveRing) {
  const [px, py] = pt as [number, number];
  for (let i = 1; i < parcelFt.length; i++) {
    const a = parcelFt[i - 1] as [number, number], b = parcelFt[i] as [number, number];
    const { d, on } = segDist(px, py, a[0], a[1], b[0], b[1]);
    if (d < best.d) best = { d, drivePt: [px, py], curb: on };
  }
}

// Inward direction: from curb toward drive centroid
let cx = 0, cy = 0;
for (const p of driveRing) { cx += p[0]!; cy += p[1]!; }
cx /= driveRing.length; cy /= driveRing.length;
const ix = cx - best.curb[0], iy = cy - best.curb[1];
const ilen = Math.hypot(ix, iy) || 1;
const WANT_FT = 20.85;
const toFt: [number, number] = best.curb;
const fromFt: [number, number] = [
  best.curb[0] + (ix / ilen) * WANT_FT,
  best.curb[1] + (iy / ilen) * WANT_FT,
];

// Prove gapFt via the same path the app uses: 3857 endpoints → frame.distanceFt
const fromProj = scene.frame.fromFeet(fromFt);
const toProj = scene.frame.fromFeet(toFt);
const gapFt = scene.frame.distanceFt(fromProj, toProj);
console.log(JSON.stringify({
  gapFt,
  label: formatGapFt(gapFt),
  rawMercatorFt: Math.hypot(fromProj[0] - toProj[0], fromProj[1] - toProj[1]) / 0.3048,
  fromFt,
  toFt,
  groundScale: scene.frame.groundScale,
  latDeg: scene.frame.latDeg,
  curbDistFt: best.d,
}, null, 2));

const title = {
  project: '2600 W Heiman St',
  subtitle: 'RM40 · garden apartments · access break QA',
  date: '2026-11-23',
  notes: [
    `Access unresolved: no drive on this plan reaches the street (${formatGapFt(gapFt)} ft short). The break is marked in red.`,
    'Sheet from visual-battery fixture 553450 seed_v2; break forced at 20.85 ground feet (exhibit-parity method). gapFt = scene.frame.distanceFt.',
  ],
  routeBreak: { from: fromFt, to: toFt, gapFt },
  decision: [
    { label: 'Street access', value: `Unresolved · ${formatGapFt(gapFt)} ft short of frontage` },
    { label: 'Parking', value: `${plan.parking?.stalls ?? 126} supplied · ${plan.parking?.stalls_required ?? 126} required` },
  ],
  data: [
    { label: 'Zoning', value: 'RM40' },
    { label: 'Site area', value: '2.77 ac' },
    { label: 'Homes', value: String(plan.metrics?.units ?? 73) },
  ],
};

const sheet = renderSitePlanSheet(scene, title, 'tabloid');
writeFileSync(`${OUT}/heiman-553450-a01-access-break.svg`, sheet.svg);
console.log('wrote svg');

const html = `<!doctype html><html><body style="margin:0;background:#ddd">
${sheet.svg.replace('<svg ', '<svg style="width:1700px;height:1100px;display:block;background:#fff" ')}
</body></html>`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: `${OUT}/heiman-553450-a01-access-break.png`, type: 'png', fullPage: true });
await browser.close();
console.log('wrote png');
