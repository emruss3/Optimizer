// Baseline manifests for the five review scenes (design handoff 2026-11-22, delivery 1).
//
// Reads the battery's results.json and writes one manifest per scene: which
// revision was drawn, the figures the workspace stated, the access and parking
// state, the warnings, and what drew the 3D picture. Nothing here is measured:
// every figure is what the app reported while the battery drove it.
//
//   node scripts/visual-battery/manifest.mjs <battery output dir> <manifest dir> [commit]
import fs from 'node:fs';
import path from 'node:path';

const [, , IN, OUT, COMMIT] = process.argv;
if (!IN || !OUT) {
  console.error('usage: manifest.mjs <battery output dir> <manifest dir> [commit]');
  process.exit(2);
}

// The handoff's five: four occupied products and the site where zero buildings is the right answer.
// `production` is the revision the handoff audited on the released planner, for comparison.
export const REVIEW_SCENES = [
  { fid: '675423', address: '0 Delk Ave', zoning: 'RS5', product: 'Private-lane cottages', production: '316a0d36' },
  { fid: '660125', address: '5525 Mt View Rd', zoning: 'RM15', product: 'Attached rows on a slope', production: 'dca61670' },
  { fid: '553450', address: '2600 W Heiman St', zoning: 'RM40', product: 'Garden apartments and amenity', production: 'c1d84ac9' },
  { fid: '469303', address: '535 Main St', zoning: 'MUG-A', product: 'Structured wrap and street frontage', production: '82a80810' },
  { fid: '672526', address: '0 Hickory Bend Dr', zoning: 'RS10', product: 'A legitimately empty proposal', production: 'b2b4a6b8' },
];

const results = JSON.parse(fs.readFileSync(path.join(IN, 'results.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const rows = [];
for (const s of REVIEW_SCENES) {
  const r = results[s.fid];
  if (!r?.evidence) {
    console.error(`no battery evidence for ${s.fid} (${s.address})`);
    process.exitCode = 1;
    continue;
  }
  const ev = r.evidence;
  const id = ev.scene?.identity ?? {};
  const buildings = ev.scene?.buildings ?? [];
  const manifest = {
    scene: { parcelId: s.fid, address: s.address, zoning: s.zoning, product: s.product },
    source: {
      // the battery replays saved engine answers; it is not the released planner
      kind: 'fixture replay',
      store: 'scripts/visual-battery/fixtures/mock_store.json',
      commit: COMMIT ?? null,
    },
    revision: {
      schemeId: id.schemeId ?? null,
      revision: id.revision ?? null,
      productionRevisionAudited: s.production,
      matchesProduction: id.revision != null && id.revision === s.production,
    },
    solver: { solvedBy: ev.solvedBy ?? null, basisLine: ev.basis ?? null, envelopeSource: ev.envelopeSource ?? null },
    figures: {
      buildings: buildings.length,
      buildingList: buildings.map(b => b.oneLine ?? b.id),
      apartments: ev.mfTabulation ? { units: ev.mfTabulation.units, stallsDrawn: ev.mfTabulation.stallsDrawn, stallsReported: ev.mfTabulation.stallsReported, stallsRequired: ev.mfTabulation.stallsRequired, parkingStatus: ev.mfTabulation.parkingStatus } : null,
      townhomes: ev.thV3 ? { homes: ev.thV3.homes, homesDrawn: ev.thV3.homesDrawn, pattern: ev.thV3.pattern, requiredFails: ev.thV3.requiredFails } : null,
      subdivision: ev.sfV1 ? { status: ev.sfV1.status, lots: ev.sfV1.lots, pattern: ev.sfV1.pattern, basis: ev.sfV1.basis, fails: ev.sfV1.fails } : null,
      capturePct: ev.utilizationPct ?? null,
    },
    access: {
      drives: ev.mfAccess?.drives ?? null,
      driveReachesParcelLine: ev.mfAccess?.curb ?? null,
      bays: ev.mfAccess?.bays ?? null,
      baysServed: ev.mfAccess?.served ?? null,
      routeBreak: ev.routeBreak ?? null,
    },
    frame: ev.scene?.frame ?? null,
    tasks: ev.tasks ?? null,
    warnings: { violationCodes: ev.violationCodes ?? [], gate: r.violations ?? [] },
    view: {
      viewport: r.viewport ?? null,
      plan: `${s.fid}_2d.png`,
      model: `${s.fid}_3d.png`,
      view3dState: r.view3d?.state ?? null,
      rendererTier: r.view3d?.quality ?? null,
      // the battery opens the 3D view at its default camera; the handoff's fixed cameras are not yet applied
      camera: 'default on open',
    },
    passed: r.ok === true,
  };
  fs.writeFileSync(path.join(OUT, `${s.fid}.json`), JSON.stringify(manifest, null, 2) + '\n');
  for (const shot of [manifest.view.plan, manifest.view.model]) {
    const from = path.join(IN, shot);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(OUT, shot));
  }
  rows.push(manifest);
}

const cell = v => (v == null ? 'none' : String(v));
const lines = [
  '| Scene | Scheme | Revision | Same as production audit | Buildings | 3D | Gate |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(m => `| ${m.scene.address} | ${cell(m.revision.schemeId)} | ${cell(m.revision.revision)} | ${m.revision.matchesProduction ? 'yes' : `no (${m.revision.productionRevisionAudited})`} | ${m.figures.buildings} | ${cell(m.view.view3dState)} | ${m.passed ? 'pass' : 'fail'} |`),
];
fs.writeFileSync(path.join(OUT, 'index.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
