// Headless visual battery: drives the real app (landing → tour → drawer →
// Site Planner) against either the mock Supabase (fixture mode) or a live
// backend, screenshots 2D + 3D per parcel, and — in ASSERT mode — machine-
// checks each parcel against expectations.json so it can gate merges.
//
// Env:
//   ASSERT=1        fail (exit 1) when a parcel violates expectations.json
//   SHOTS_DIR=...   output dir (screenshots + results.json + console_errors.json)
//   ONE_PARCEL=1    first parcel only (debug)
//   ALL_CONSOLE=1   capture all console output, not just errors
//   LIVE_RANDOM=1   append one random cohort parcel (advisory: never asserted)
//   CHROMIUM_PATH   explicit chromium binary (sandbox); default = playwright's
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SHOTS_DIR
  || '/tmp/claude-0/-home-user-Optimizer/95899e1b-c1d4-5d12-92bb-5bf376ae4c76/scratchpad/shots';
fs.mkdirSync(OUT, { recursive: true });

const ONE = process.env.ONE_PARCEL === '1';
// ONLY_FID=<ogc_fid> runs that one battery parcel (iteration on a new fixture)
const ONLY = process.env.ONLY_FID ? String(process.env.ONLY_FID) : null;
const ASSERT = process.env.ASSERT === '1';

const PARCELS = [
  { ogc_fid: 553450, address: '2600 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 667574, address: '2622 W HEIMAN ST', zoning: 'RM40' },
  { ogc_fid: 669046, address: '1200 W H DAVIS DR', zoning: 'RM40' },
  { ogc_fid: 488278, address: '1710 MEHARRY BLVD', zoning: 'RM20' },
  // Order-6 item 1: MF-refused parcel whose refusal carries the server-
  // verified single-family suggestion — the tap must render the house.
  { ogc_fid: 393306, address: '303 E PALESTINE AVE', zoning: 'RS10' },
  // Order-8 audit: commercial-only lot (CS) — the capacity card, never a house.
  { ogc_fid: 408571, address: '2405 12TH AVE S', zoning: 'CS' },
  // Plan-pattern layer: the MDHA subdivision parcel — the pattern must be named
  // and the generator's non-alignment admitted.
  { ogc_fid: 550510, address: '2400 W HEIMAN ST', zoning: 'R6' },
  // 2026-10-07 the Texas wrap (The Caroline pattern): a compact MUG-A block in
  // the structured regime — four bars round a garage, the court on the deck.
  { ogc_fid: 469303, address: '535 MAIN ST', zoning: 'MUG-A' },
  // 2026-11-03 the by-right subdivision (sf_v1): an R8 loop, and the
  // floodplain case where by right is 0 lots and the fill scenario (the
  // override pressed below) grades its own earthwork.
  { ogc_fid: 682644, address: '4701 BOWFIELD DR', zoning: 'R8' },
  { ogc_fid: 680719, address: '0 MARTINGALE DR', zoning: 'R10', sfV1Override: 'floodway' },
  // 2026-11-04 the layout choice on multifamily land: the neighborhood (27
  // townhomes, the townhome engine) places more homes than the apartment
  // plan (24), so it takes the sheet by itself; the four RM parcels above
  // keep their apartments and offer the neighborhood one tap away.
  { ogc_fid: 660125, address: '5525 MT VIEW RD', zoning: 'RM15' },
  // 2026-11-06: the max-GSF generator (mf_max_gsf_v1) draws native
  // structures under legacy metric names; its 42 apartments must count, and
  // stay the default over the neighborhood's 26 lots.
  { ogc_fid: 670533, address: '0 SMITH SPRINGS RD', zoning: 'RM6' },
  // 2026-11-06 engine g13: the competition's best takes the sheet at equal
  // lots (0 Union Hill Rd: the neighborhood's 3 lots on 384 ft of street
  // against the loop's 699 ft), the shared private drive takes it with more
  // lots (6404 Eatons Creek Rd: 5 estate lots on a private drive, no public
  // street), and a flood skip draws its hold (0 Hickory Bend Dr: 5.24 ac,
  // all in the SFHA — the sheet was blank beside "skipped").
  { ogc_fid: 680001, address: '0 UNION HILL RD', zoning: 'RS40' },
  { ogc_fid: 661661, address: '6404 EATONS CREEK RD', zoning: 'R40' },
  { ogc_fid: 672526, address: '0 HICKORY BEND DR', zoning: 'RS10' },
  // 2026-11-09 engine g14: the hillside hold as geometry (4255 Brick Church
  // Pike: 3.35 of 4.09 ac steeper than 25%, hatched beside the flood hold, 0
  // lots) and the competition's best at MORE lots (0 Hills Ln: the grid's 17
  // over the default's 14 frontage lots, buildable).
  { ogc_fid: 686430, address: '4255 BRICK CHURCH PIKE', zoning: 'R20' },
  { ogc_fid: 680391, address: '0 HILLS LN', zoning: 'R10' },
  // 2026-11-09 batch 4: RM9 in the floodplain — the competition skips, the multifamily engine draws anyway
  { ogc_fid: 675099, address: '0 TODD PREIS DR', zoning: 'RM9' },
  // 2026-11-09 the scope's P0.1: one plan across header, tabulation and canvas (the Whites Creek reproduction)
  { ogc_fid: 680339, address: '0 WHITES CREEK PIKE', zoning: 'RM9' },
];

// Live mode only: one extra parcel drawn from the sweep cohort, advisory —
// it must load and screenshot without crashing, but is never asserted
// (fixture mode has nothing stored for it, and floors need a history).
if (process.env.LIVE_RANDOM === '1') {
  try {
    const cohort = JSON.parse(fs.readFileSync(path.join(HERE, 'cohort.json'), 'utf8'));
    const pick = cohort[Math.floor(Math.random() * cohort.length)];
    PARCELS.push({ ogc_fid: pick, address: `COHORT ${pick}`, zoning: '', advisory: true });
  } catch { /* no cohort file — skip */ }
}

let expectations = {};
if (ASSERT) {
  expectations = JSON.parse(fs.readFileSync(path.join(HERE, 'expectations.json'), 'utf8'));
}

const consoleErrors = {};
const results = {};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });

/** Judge one parcel's evidence against its expectation. Returns [] when clean. */
function judge(exp, ev) {
  if (!exp) return [];
  if (!ev) return ['no plan evidence surfaced (window.__planEvidence missing — did the workspace mount?)'];
  const errs = [];
  // Whatever the mode, the sheet must have drawn: a plan that computed but
  // crashed the canvas is not a rendered plan.
  if (ev._domPlannerError) errs.push('the canvas error boundary rendered ("Site Planner Error") — the plan computed but could not be drawn');
  if (exp.mode === 'server-plan') {
    if (ev.solvedBy !== 'server') {
      errs.push(`expected the SERVER plan to render, got solvedBy=${ev.solvedBy ?? 'none'}`);
    }
    if ((ev.violationCodes ?? []).includes('server-plan-rejected')) {
      errs.push('server plan was rejected by the geometry gate');
    }
    // Capture from the server basis line: "achieved N (X%)"; utilization is
    // the fallback (same number, KPI-derived).
    const m = /achieved\s[\d,]+\s\((\d+(?:\.\d+)?)%\)/.exec(ev.basis ?? '');
    const capture = m ? parseFloat(m[1]) : (typeof ev.utilizationPct === 'number' ? ev.utilizationPct : null);
    if (typeof exp.minCapturePct === 'number') {
      if (capture == null) errs.push('capture % not found in basis or KPI');
      else if (capture < exp.minCapturePct) {
        errs.push(`capture ${capture}% below the floor ${exp.minCapturePct}% — floors only ratchet UP`);
      }
    }
  } else if (exp.mode === 'honest-refusal') {
    // Order-6 item 5c: a failed server plan is an ERROR CARD naming its
    // cause — the worker fallback never renders in its place.
    if (!ev.serverPlanError) {
      errs.push('expected the server-plan error card (evidence.serverPlanError) to name the failure');
    }
    if (ev.solvedBy === 'worker') {
      errs.push('the improvised worker plan rendered — order-6 item 5c forbids that path');
    }
  } else if (exp.mode === 'commercial-capacity') {
    // Order-8: a commercial-only lot shows the capacity card with the FAR
    // ceiling and never offers a residential plan.
    if (!ev.nonResidentialLot) errs.push('expected nonResidentialLot=true (permitted uses carry no residential use)');
    if (!(ev.commercialAllowableGsf > 0)) errs.push('expected the FAR-derived allowable area on the capacity card');
    if (!ev._domCommercialCard) errs.push('commercial capacity card not rendered');
    if (ev._domSfSwitch) errs.push('a "draw the house" switch rendered on a lot with no residential use');
    if (ev.solvedBy) errs.push(`a plan rendered (solvedBy=${ev.solvedBy}) where no residential use is permitted`);
  } else if (exp.mode === 'sf-suggestion') {
    // The MF refusal must carry the server-verified suggestion, and the tap
    // must have rendered the house (the post-click evidence is judged).
    if (!(ev.buildabilityVerdict ?? '').startsWith('unbuildable')) {
      errs.push(`expected an MF refusal verdict, got ${ev.buildabilityVerdict ?? 'none'}`);
    }
    if (ev.suggestedTypology !== 'single_family') {
      errs.push(`expected suggested_typology=single_family on the refusal, got ${ev.suggestedTypology ?? 'none'}`);
    }
    if (!ev._houseRendered) {
      errs.push('the SF seed house did not render after the suggestion tap');
    }
  } else if (exp.mode === 'subdivision') {
    // 2026-09-03: a subdivision-pattern parcel renders the NEIGHBOURHOOD the
    // server drew — streets first, rear alleys, whole lots, courts — never
    // strips sliced across the parcel. Lot floors only ratchet UP.
    if (ev.solvedBy !== 'server') {
      errs.push(`expected the server subdivision to render, got solvedBy=${ev.solvedBy ?? 'none'}`);
    }
    if (!(ev.subdivisionLots >= (exp.minLots ?? 1))) {
      errs.push(`subdivision lots ${ev.subdivisionLots ?? 'none'} below the floor ${exp.minLots ?? 1}`);
    }
    if (exp.network && ev.subdivisionNetwork !== exp.network) {
      errs.push(`expected a '${exp.network}' street network, got '${ev.subdivisionNetwork ?? 'none'}'`);
    }
    if (typeof exp.maxPctRow === 'number' && !(ev.subdivisionPctRow <= exp.maxPctRow)) {
      errs.push(`ROW takes ${ev.subdivisionPctRow ?? '?'}% of the land, over the ${exp.maxPctRow}% ceiling`);
    }
    // v1.1: floodplain and wetlands are HELD OUT from real geometry — a parcel with
    // hazards must show them carved (coverage ingested, % held out at or above the floor).
    if (typeof exp.minPctHazard === 'number') {
      if (ev.subdivisionHazardCoverage !== 'ingested') {
        errs.push(`hazard layers not ingested for the parcel (coverage=${ev.subdivisionHazardCoverage ?? 'none'}) — the flood/wetland carve did not run`);
      }
      if (!(ev.subdivisionPctHazard >= exp.minPctHazard)) {
        errs.push(`held-out hazard ${ev.subdivisionPctHazard ?? 'none'}% below the ${exp.minPctHazard}% floor (floodplain/wetland must be carved)`);
      }
    }
    // v1.2: a street never runs through the greenway on an assumption — where the expectation
    // says so, the network must STOP at the greenway (a cul-de-sac or a loop) at that end, and
    // the crossing it did take must stay under the ceiling (a culvert, not a bridge).
    if (exp.requireGreenwayStop) {
      const ends = ev.subdivisionStreetEnds ?? {};
      if (ends.start !== 'greenway' && ends.end !== 'greenway') {
        errs.push(`expected the streets to stop at the greenway, got ends start=${ends.start ?? 'none'} end=${ends.end ?? 'none'}`);
      }
    }
    if (typeof exp.maxCrossingFt === 'number' && !(ev.subdivisionCrossingFt <= exp.maxCrossingFt)) {
      errs.push(`streets cross ${ev.subdivisionCrossingFt ?? '?'} ft of held-out land, over the ${exp.maxCrossingFt}-ft ceiling`);
    }
    if (!ev._domSubdivision) errs.push('neighbourhood plan panel not rendered');
    if ((ev.violationCodes ?? []).includes('server-plan-rejected')) {
      errs.push('the subdivision was rejected by the geometry gate (overlapping pavement/lots)');
    }
  }
  // 2026-11-03 by-right subdivision (sf_v1): the district's own answer, graded
  // by its own tests — lots floors ratchet UP, the fails it admits must show.
  const judgeSfV1 = (want, got, label) => {
    if (!want) return;
    if (!got) { errs.push(`${label}: by-right evidence missing (sfV1 absent — the route did not run or fn_sf_v1_plan_app was unreachable)`); return; }
    if (want.status && got.status !== want.status) errs.push(`${label}: status '${got.status}', expected '${want.status}'`);
    if (typeof want.minLots === 'number' && !(got.lots >= want.minLots)) errs.push(`${label}: ${got.lots} lots below the floor ${want.minLots} — floors only ratchet UP`);
    if (typeof want.maxLots === 'number' && !(got.lots <= want.maxLots)) errs.push(`${label}: ${got.lots} lots, expected at most ${want.maxLots}`);
    if (want.pattern && got.pattern !== want.pattern) errs.push(`${label}: pattern '${got.pattern ?? 'none'}', expected '${want.pattern}'`);
    if (want.basis && got.basis !== want.basis) errs.push(`${label}: basis '${got.basis}', expected '${want.basis}'`);
    if (want.floodHold && got.floodHold !== want.floodHold) errs.push(`${label}: flood hold '${got.floodHold ?? 'none'}', expected '${want.floodHold}'`);
    if (typeof want.hasFlood === 'boolean' && !!got.hasFlood !== want.hasFlood) errs.push(`${label}: in the flood hazard area = ${!!got.hasFlood}, expected ${want.hasFlood}`);
    if (want.fillView && !got.fillView) errs.push(`${label}: the fill-depth view did not render (per-pad fill from the DEM missing)`);
    if (want.bfeContour && !got.bfeContour) errs.push(`${label}: the ground-at-BFE contour did not load`);
    for (const f of want.failsInclude ?? []) {
      if (!(got.fails ?? []).includes(f)) errs.push(`${label}: expected the plan to admit failing '${f}', fails were [${(got.fails ?? []).join(', ')}]`);
    }
    if (typeof want.minTests === 'number' && !(got.tests >= want.minTests)) errs.push(`${label}: ${got.tests} tests shown, expected at least ${want.minTests}`);
    // 2026-11-04: the flood hold drawn (the land taken out before the layout), and the competition state
    if (typeof want.heldLayer === 'boolean' && !!got.heldLayer !== want.heldLayer) errs.push(`${label}: flood-hold layer on the sheet = ${!!got.heldLayer}, expected ${want.heldLayer}`);
    if (want.competitionState && got.competition?.state !== want.competitionState) errs.push(`${label}: pattern competition '${got.competition?.state ?? 'absent'}', expected '${want.competitionState}'`);
    // 2026-11-06 engine g13: the competition's best on the sheet in place of the
    // default — at equal lots (a better plan) and at more lots (buildable) — and why
    if (want.autoBest !== undefined) {
      const a = got.autoBest ?? null;
      if (want.autoBest === null) {
        if (a) errs.push(`${label}: the competition's '${a.requested}' plan took the sheet (${a.why}); the default answer should stand`);
      } else if (!a) {
        errs.push(`${label}: the competition's best did not take the sheet (expected '${want.autoBest.requested}', ${want.autoBest.why})`);
      } else {
        if (a.requested !== want.autoBest.requested) errs.push(`${label}: the '${a.requested}' plan took the sheet, expected '${want.autoBest.requested}'`);
        if (a.why !== want.autoBest.why) errs.push(`${label}: the best took the sheet because '${a.why}', expected '${want.autoBest.why}'`);
        if (ev._domAutoBestWhy !== want.autoBest.why) errs.push(`${label}: the panel's auto-best note says '${ev._domAutoBestWhy ?? 'nothing'}'`);
      }
    }
    if (want.privateDriveNote && !(ev._domPrivateDrive ?? '').includes('share a private drive')) errs.push(`${label}: the shared private drive is not said on the panel`);
    if (want.heldNote && !(ev._domHeld ?? '').includes(want.heldNote)) errs.push(`${label}: the flood hold line says '${ev._domHeld ?? 'nothing'}', expected it to include '${want.heldNote}'`);
    // 2026-11-09 engine g14: the hillside hold as geometry, hatched like the flood hold, and said in acres
    if (typeof want.hillsideLayer === 'boolean' && !!got.hillsideLayer !== want.hillsideLayer) errs.push(`${label}: hillside-hold layer on the sheet = ${!!got.hillsideLayer}, expected ${want.hillsideLayer}`);
    if (want.hillsideNote && !(ev._domHillside ?? '').includes(want.hillsideNote)) errs.push(`${label}: the hillside line says '${ev._domHillside ?? 'nothing'}', expected it to include '${want.hillsideNote}'`);
    for (const w of want.whyIncludes ?? []) {
      if (!(ev._domWhy ?? []).some(line => line.includes(w))) errs.push(`${label}: the engine's why does not say '${w}' (lines: ${JSON.stringify(ev._domWhy ?? [])})`);
    }
  };
  // 2026-11-04 the pattern competition (fn_sf_v1_candidates): best and structured
  // side by side, the price of the structure stated; the structured plan can be
  // put on the sheet and is still by right.
  const judgeCompetition = (want, gotEv, label) => {
    if (!want) return;
    const c = gotEv?.sfV1?.competition;
    if (!c) { errs.push(`${label}: the pattern competition never ran (sfV1.competition absent)`); return; }
    if (c.state !== (want.state ?? 'done')) { errs.push(`${label}: competition '${c.state}'${c.error ? ` (${c.error})` : ''}, expected '${want.state ?? 'done'}'`); return; }
    if (want.bestRequested && c.bestRequested !== want.bestRequested) errs.push(`${label}: best plan from the '${c.bestRequested}' grammar, expected '${want.bestRequested}'`);
    if (typeof want.minBestLots === 'number' && !(c.bestLots >= want.minBestLots)) errs.push(`${label}: best plan ${c.bestLots} lots below the floor ${want.minBestLots}`);
    if (typeof want.structuredLots === 'number' && c.structuredLots !== want.structuredLots) errs.push(`${label}: structured plan ${c.structuredLots} lots, expected ${want.structuredLots}`);
    if (typeof want.forgone === 'number' && c.forgone !== want.forgone) errs.push(`${label}: ${c.forgone} lots forgone for structure, expected ${want.forgone}`);
    if (typeof want.rows === 'number' && (c.rows ?? []).length !== want.rows) errs.push(`${label}: ${(c.rows ?? []).length} candidates listed, expected ${want.rows}`);
    // 2026-11-04 third audit: the engine's verdict on its best plan, shown verbatim
    if (want.verdict && c.verdict !== want.verdict) errs.push(`${label}: verdict '${c.verdict ?? 'none'}', expected '${want.verdict}'`);
    if (!gotEv._domCompetition) errs.push(`${label}: the competition block did not render`);
    for (const id of want.overLimitMarked ?? []) {
      if (!(gotEv._domOverLimit ?? []).includes(`sfv1-test-${id}`)) errs.push(`${label}: '${id}' passes over its limit but the panel shows a plain tick`);
    }
    if (want.viewStructured) {
      const v = gotEv._viewStructured;
      if (!v) errs.push(`${label}: "View this plan" on the structured row was not offered`);
      else {
        if (v.shown !== 'neighborhood') errs.push(`${label}: after viewing the structured plan the sheet shows '${v.shown}'`);
        if (typeof want.structuredLots === 'number' && v.lots !== want.structuredLots) errs.push(`${label}: structured plan on the sheet has ${v.lots} lots, expected ${want.structuredLots}`);
        if (v.basis !== 'by_right') errs.push(`${label}: the structured plan is labelled '${v.basis}' — a pattern choice is not an override`);
        if (v._domPlannerError) errs.push(`${label}: the canvas error boundary rendered on the structured plan`);
      }
    }
  };
  if (exp.requireSfV1) {
    judgeSfV1(exp.requireSfV1, ev.sfV1, 'by right');
    if (!ev._domSfV1Panel) errs.push('by-right panel not rendered');
    // 2026-11-03: 0 new lots is not "nothing can be built" — the lot itself carries a house
    if (exp.requireSfV1.offersOneHouse && !ev._domSfV1OneHouse) errs.push('by right: 0 new lots, but the one-house offer (sfv1-draw-house) did not render');
  }
  judgeCompetition(exp.requireSfV1Competition, ev, 'competition');
  // 2026-11-04 the layout choice on multifamily land (the owner: a traditional
  // multifamily design by default where it makes more sense — more homes —
  // with an option to switch to a neighborhood layout).
  const judgeLayout = (want, gotEv) => {
    if (!want) return;
    const l = gotEv?.layout;
    if (!l) { errs.push('layout: the layout choice never showed (evidence.layout absent)'); return; }
    if (!gotEv._domLayout) errs.push('layout: the layout panel did not render');
    if (l.competitionState !== 'done') { errs.push(`layout: the neighborhood plans are '${l.competitionState}', expected 'done'`); return; }
    if (want.defaultKind && l.defaultKind !== want.defaultKind) errs.push(`layout: default '${l.defaultKind}', expected '${want.defaultKind}' (${l.sentence})`);
    if (want.shown && l.shown !== want.shown) errs.push(`layout: the sheet shows '${l.shown}', expected '${want.shown}'`);
    if (typeof want.auto === 'boolean' && !!l.auto !== want.auto) errs.push(`layout: the neighborhood went on the sheet by itself = ${!!l.auto}, expected ${want.auto}`);
    if (typeof want.multifamilyHomes === 'number' && l.multifamilyHomes !== want.multifamilyHomes) errs.push(`layout: multifamily ${l.multifamilyHomes} homes, expected ${want.multifamilyHomes}`);
    if (typeof want.neighborhoodHomes === 'number' && l.neighborhoodHomes !== want.neighborhoodHomes) errs.push(`layout: neighborhood ${l.neighborhoodHomes} homes, expected ${want.neighborhoodHomes}`);
    if (want.neighborhoodRequested && l.neighborhoodRequested !== want.neighborhoodRequested) errs.push(`layout: the neighborhood's best from '${l.neighborhoodRequested}', expected '${want.neighborhoodRequested}'`);
    if (typeof want.densityCap === 'number' && l.densityCap !== want.densityCap) errs.push(`layout: density allows ${l.densityCap}, expected ${want.densityCap}`);
    // 2026-11-09 (0 Todd Preis Dr): the competition skipped for the floodplain; the multifamily plan is flagged and the hold hatched over it
    if (typeof want.floodHold === 'boolean' && !!l.floodHold !== want.floodHold) errs.push(`layout: flood hold = ${!!l.floodHold}, expected ${want.floodHold} (${l.sentence})`);
    if (typeof want.holdOnSheet === 'boolean' && !!l.holdOnSheet !== want.holdOnSheet) errs.push(`layout: the flood hold ${l.holdOnSheet ? 'is' : 'is not'} on the sheet beside the plan, expected ${want.holdOnSheet}`);
    if (want.sentenceIncludes && !String(l.sentence ?? '').includes(want.sentenceIncludes)) errs.push(`layout: the sentence lacks '${want.sentenceIncludes}' (${l.sentence})`);
    if (typeof want.homesDrawn === 'number' && gotEv.thV3?.homesDrawn !== want.homesDrawn) errs.push(`layout: ${gotEv.thV3?.homesDrawn ?? 'no'} townhomes drawn on the sheet, expected ${want.homesDrawn}`);
    if (want.switchAndBack) {
      const sw = gotEv._layoutSwitch;
      const other = l.shown === 'multifamily' ? 'neighborhood' : 'multifamily';
      if (!sw) errs.push(`layout: the switch to the ${other} layout was not offered`);
      else {
        if (sw.shown !== other) errs.push(`layout: after the switch the sheet shows '${sw.shown}', expected '${other}'`);
        if (other === 'neighborhood' && typeof want.switchHomesDrawn === 'number' && sw.homesDrawn !== want.switchHomesDrawn) errs.push(`layout: the neighborhood on the sheet draws ${sw.homesDrawn} homes, expected ${want.switchHomesDrawn}`);
        if (sw._domPlannerError) errs.push('layout: the canvas error boundary rendered after the switch');
        if (sw.backShown !== l.shown) errs.push(`layout: switching back left the sheet on '${sw.backShown}', expected '${l.shown}'`);
      }
    }
  };
  judgeLayout(exp.requireLayout, ev);
  // 2026-11-09 (the scope's P0.1): every surface reads one plan — the engine's
  // unit count, the buildings' mixes summed, the stalls the drawn bays hold
  // against the header, and the requirement (0 Whites Creek Pike).
  if (exp.requireMfTabulation) {
    const w = exp.requireMfTabulation;
    const t = ev?.mfTabulation;
    if (!t) errs.push('mf: no multifamily tabulation in the evidence (no apartment plan on the sheet?)');
    else {
      if (typeof w.units === 'number' && t.units !== w.units) errs.push(`mf: ${t.units} units, expected ${w.units}`);
      if (w.mixSumEqualsUnits && t.mixUnits !== t.units) errs.push(`mf: the buildings' mixes sum to ${t.mixUnits} under a header of ${t.units}`);
      if (w.baysEqualProvided && t.bayStalls !== t.stallsProvided) errs.push(`mf: the drawn bays hold ${t.bayStalls} stalls but the header says ${t.stallsProvided}`);
      if (typeof w.stallsProvided === 'number' && t.stallsProvided !== w.stallsProvided) errs.push(`mf: ${t.stallsProvided} stalls provided, expected ${w.stallsProvided}`);
      if (typeof w.stallsRequired === 'number' && t.stallsRequired !== w.stallsRequired) errs.push(`mf: ${t.stallsRequired} stalls required, expected ${w.stallsRequired}`);
      if (typeof w.stallsReported === 'number' && t.stallsReported !== w.stallsReported) errs.push(`mf: the engine's summary reported ${t.stallsReported}, expected ${w.stallsReported}`);
    }
  }
  if (exp.requireSfV1Override) {
    const o = ev._override;
    if (!o) errs.push('override: the fill-scenario control was never pressed (button missing on the panel?)');
    else {
      judgeSfV1(exp.requireSfV1Override, o.sfV1, 'override');
      if (o._domPlannerError) errs.push('override: the canvas error boundary rendered');
    }
  }
  // Plan-organization layer: every gated parcel must resolve the expected
  // pattern, and the alignment verdict must be honest where asserted.
  if (exp.requirePlanPattern && ev.planPattern !== exp.requirePlanPattern) {
    errs.push(`expected plan pattern '${exp.requirePlanPattern}', got '${ev.planPattern ?? 'none'}'`);
  }
  if (typeof exp.requirePatternAligned === 'boolean' && ev.planPatternAligned !== exp.requirePatternAligned) {
    errs.push(`expected generator alignment ${exp.requirePatternAligned}, got ${ev.planPatternAligned}`);
  }
  if (exp.requirePlanPattern && !ev._domPlanPattern) errs.push('plan-pattern panel not rendered');
  if (exp.mode === 'server-plan' && ev.serverPlanError) {
    errs.push(`server-plan error card raised unexpectedly: ${ev.serverPlanError}`);
  }
  // Order-6 item 3: the generator said parking capacity trimmed units — the
  // amber chip must say so on the strip.
  if (exp.requireParkingLimitedChip && !ev._domParkingChip) {
    errs.push('parking-limited chip missing (metrics.parking_limited=true in the served payload)');
  }
  // CC-3a: the legacy client-frame envelope construction must never serve a
  // reference parcel — the brief's EPSG:2274-true envelope is the staging.
  if (exp.requireBriefEnvelope && ev.envelopeSource !== 'brief_2274_true') {
    errs.push(`expected envelopeSource=brief_2274_true, got ${ev.envelopeSource ?? 'none'} (legacy envelope path fired)`);
  }
  // Render-path smoke (ops lesson from the buildings RLS deny-all): a layer
  // that has data in the served responses must actually LOAD — an RLS change
  // can never silently blank the neighborhood render again.
  if (exp.requireNeighborLayers) {
    const nl = ev.neighborsLoaded;
    if (!nl) errs.push('neighbor layers never loaded (neighborsLoaded missing)');
    else {
      for (const layer of ['parcels', 'buildings', 'roads']) {
        if (exp.requireNeighborLayers[layer] && !(nl[layer] > 0)) {
          errs.push(`neighbor layer '${layer}' is EMPTY (RLS/data regression — expected > 0)`);
        }
      }
    }
  }
  // 2026-09-04 (Eric, 2622 W Heiman: "random parking, with no road to get to
  // it"): a multifamily plan's parking must have a road — a drive that
  // reaches the parcel line and a drive at every bay. Read from the rendered
  // elements, so the seed's lane, the client mapper and the geometry gate are
  // all on the path.
  if (exp.requireAccess) {
    const a = ev.mfAccess;
    if (!a) errs.push('access check missing (mfAccess evidence absent)');
    else {
      if (!a.curb) errs.push('no drive reaches the parcel line — the parking has no road from the street');
      if (!(a.bays > 0)) errs.push('no parking bays rendered');
      else if (a.served < a.bays) errs.push(`${a.bays - a.served} of ${a.bays} parking bays have no drive at them`);
    }
  }
  // 2026-11-11 drawing scene: the plan on the sheet must reach the scene the
  // plan, the 3D view and the printed sheets all read, with the engine's own
  // building figures, a height marked as estimated, a frame checked against
  // the engine's footprint and drawn counts that add up to the schedule.
  if (exp.requireScene) {
    const want = exp.requireScene;
    const sc = ev.scene;
    if (!sc) errs.push('drawing scene missing (evidence.scene absent)');
    else {
      const b = (sc.buildings ?? []).find(x => x.tag === want.tag);
      if ((sc.buildings ?? []).length !== want.buildings) errs.push(`scene: ${(sc.buildings ?? []).length} buildings, expected ${want.buildings}`);
      if (!b) errs.push(`scene: no building tagged ${want.tag}`);
      else {
        for (const k of ['floors', 'footprintSqFt', 'heightFt', 'heightBasis']) {
          if (want[k] != null && b[k] !== want[k]) errs.push(`scene: building ${want.tag} ${k} is ${b[k]}, expected ${want[k]}`);
        }
      }
      if (want.frame && sc.frame?.check?.status !== want.frame) errs.push(`scene: frame check is ${sc.frame?.check?.status}, expected ${want.frame}`);
      if (want.consistent && !sc.schedule?.consistent) errs.push('scene: the drawn features do not add up to the scheme schedule');
    }
  }
  // 2026-09-04 civil sheet: the topography must LOAD and render (contours in
  // the canvas frame). On a subdivision every through-street must carry a
  // profile and spot grades — the DEM fetch, the fn_parcel_topo grant and the
  // centreline travelling on the street elements are all on that path.
  if (exp.requireTopo) {
    const t = ev.topoLoaded;
    if (!t) errs.push('topography never loaded (topoLoaded missing — fn_parcel_topo unreachable or refused)');
    else if (!(t.contours > 0)) errs.push(`topography loaded with no contours (${t.samples ?? '?'} samples)`);
    if (exp.mode === 'subdivision') {
      if (!(ev.profileStreets > 0)) errs.push('no through-street profile built (centreline missing from the street elements?)');
      if (!(ev.sheetAnnotations?.spots > 0)) errs.push('no spot grades written on the plan (stations without a grade)');
      if (ev.sheetTitle !== 'CONCEPT LAYOUT PLAN') errs.push(`title block reads '${ev.sheetTitle ?? 'none'}', expected CONCEPT LAYOUT PLAN`);
    }
  }
  return errs;
}

for (const p of (ONLY ? PARCELS.filter(q => String(q.ogc_fid) === ONLY) : ONE ? PARCELS.slice(0, 1) : PARCELS)) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => {
    const t = m.text();
    if (process.env.ALL_CONSOLE === '1') errs.push(`[${m.type()}] ${t.slice(0, 300)}`);
    else if (m.type() === 'error') errs.push(t.slice(0, 220));
  });
  page.on('pageerror', e => errs.push(String(e).slice(0, 220)));
  try {
    await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    // Past the landing page into the app shell.
    const trial = page.getByText('Start Free Trial').first();
    if (await trial.isVisible().catch(() => false)) {
      await trial.click();
      await page.waitForTimeout(2500);
    }
    // Dismiss the quick-tour overlay (it intercepts all clicks).
    const skip = page.getByText('Skip Tour').first();
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(800);
    }
    // Open the drawer via the app's own test event, then the planner.
    await page.evaluate(parcel => {
      document.dispatchEvent(new CustomEvent('openParcelDrawer', { detail: parcel }));
    }, p);
    await page.waitForTimeout(1200);
    await page.getByText('Site Planner', { exact: true }).first().click({ timeout: 10000 });
    // Wait for the plan canvas, then let the solve settle.
    await page.waitForSelector('canvas[data-export="site-plan"]', { timeout: 45000 });
    await page.waitForTimeout(12000);
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_2d.png` });
    // Order-6 item 1: when the refusal card offers the server-verified house,
    // tap it and shoot the render — the SF seed is the deliverable.
    const sfSwitch = page.getByTestId('sf-seed-switch');
    let houseRendered = false;
    if (await sfSwitch.isVisible().catch(() => false)) {
      await sfSwitch.click();
      await page.waitForTimeout(4000);
      await page.screenshot({ path: `${OUT}/${p.ogc_fid}_house.png` });
      houseRendered = await page.evaluate(() =>
        /sf_seed|single_family as-of-right/.test(window.__planEvidence?.basis ?? ''));
    }
    // Evidence hook (DEV builds): what actually rendered, from the workspace.
    // DOM probes ride along: the parking-limited chip is a strip artifact the
    // evidence object doesn't carry.
    const evidence = await page.evaluate(() => {
      const ev = window.__planEvidence ?? null;
      if (!ev) return null;
      return {
        ...ev,
        _domParkingChip: !!document.querySelector('[data-testid="parking-limited-chip"]'),
        _domCommercialCard: !!document.querySelector('[data-testid="commercial-capacity-card"]'),
        _domPlanPattern: !!document.querySelector('[data-testid="plan-pattern-panel"]'),
        _domSfSwitch: !!document.querySelector('[data-testid="sf-seed-switch"]'),
        _domSubdivision: !!document.querySelector('[data-testid="subdivision-panel"]'),
        // 2026-10-07: the canvas error boundary. The evidence hook reads the
        // workspace, so a plan that computed but could not DRAW (the house and
        // the wrap's pool deck both hit an undefined-import crash in the canvas)
        // passed every assertion while the sheet showed "Site Planner Error".
        _domPlannerError: /Site Planner Error/.test(document.body.innerText ?? ''),
        _domSfV1Panel: !!document.querySelector('[data-testid="sfv1-panel"]'),
        _domSfV1OneHouse: !!document.querySelector('[data-testid="sfv1-draw-house"]'),
        _domCompetition: !!document.querySelector('[data-testid="sfv1-competition"]'),
        _domOverLimit: Array.from(document.querySelectorAll('[data-over-limit="true"]')).map(e => e.getAttribute('data-testid')),
        _domLayout: !!document.querySelector('[data-testid="layout-choice"]'),
        // 2026-11-06 engine g13: the auto-best note (and why), the shared drive, the hold on a skip, the engine's why
        _domAutoBestWhy: document.querySelector('[data-testid="sfv1-auto-best"]')?.getAttribute('data-why') ?? null,
        _domPrivateDrive: document.querySelector('[data-testid="sfv1-private-drive"]')?.textContent ?? null,
        _domHeld: document.querySelector('[data-testid="sfv1-held"]')?.textContent ?? null,
        _domHillside: document.querySelector('[data-testid="sfv1-hillside"]')?.textContent ?? null,
        _domWhy: Array.from(document.querySelectorAll('[data-testid="sfv1-competition-why"] li')).map(e => e.textContent),
      };
    });
    if (evidence) evidence._houseRendered = houseRendered;
    // 2026-11-04 the pattern competition: put the structured plan on the sheet
    // and read what the page says about it.
    if (evidence && expectations[String(p.ogc_fid)]?.requireSfV1Competition?.viewStructured) {
      const view = page.getByTestId('sfv1-cand-view-neighborhood');
      if (await view.isVisible().catch(() => false)) {
        await view.click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${OUT}/${p.ogc_fid}_structured.png` });
        evidence._viewStructured = await page.evaluate(() => {
          const ev = window.__planEvidence ?? null;
          return ev?.sfV1
            ? { shown: ev.sfV1.shown, lots: ev.sfV1.lots, basis: ev.sfV1.basis, pattern: ev.sfV1.pattern, _domPlannerError: /Site Planner Error/.test(document.body.innerText ?? '') }
            : null;
        });
      } else {
        evidence._viewStructured = null;
      }
    }
    // 2026-11-04 the layout choice: switch to the other layout, read the sheet,
    // and come back to the default.
    if (evidence && expectations[String(p.ogc_fid)]?.requireLayout?.switchAndBack && evidence.layout) {
      const first = evidence.layout.shown;
      const other = first === 'multifamily' ? 'neighborhood' : 'multifamily';
      const btn = page.getByTestId(`layout-option-${other}`);
      if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(6000);
        await page.screenshot({ path: `${OUT}/${p.ogc_fid}_layout_${other}.png` });
        const after = await page.evaluate(() => {
          const ev = window.__planEvidence ?? null;
          return {
            shown: ev?.layout?.shown ?? null,
            homesDrawn: ev?.thV3?.homesDrawn ?? ev?.sfV1?.lots ?? null,
            _domPlannerError: /Site Planner Error/.test(document.body.innerText ?? ''),
          };
        });
        await page.getByTestId(`layout-option-${first}`).click();
        await page.waitForTimeout(8000);
        after.backShown = await page.evaluate(() => window.__planEvidence?.layout?.shown ?? null);
        evidence._layoutSwitch = after;
      } else {
        evidence._layoutSwitch = null;
      }
    }
    // 2026-11-03 by-right subdivision: the override the parcel asks for (the
    // floodway-only fill scenario) is pressed and judged on its own evidence.
    if (evidence && p.sfV1Override === 'floodway') {
      const btn = page.getByTestId('sfv1-override-floodway');
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(9000);
        await page.screenshot({ path: `${OUT}/${p.ogc_fid}_override.png` });
        evidence._override = await page.evaluate(() => {
          const ev = window.__planEvidence ?? null;
          return ev
            ? { ...ev, _domSfV1Panel: !!document.querySelector('[data-testid="sfv1-panel"]'), _domPlannerError: /Site Planner Error/.test(document.body.innerText ?? '') }
            : null;
        });
      } else {
        evidence._override = null;
      }
    }
    // Seed view (order-4 item 1): when the engine emits a placed seed, shoot
    // the stage-ordered render too — the single-L artifact.
    const seedToggle = page.getByTestId('seed-toggle');
    if (await seedToggle.isVisible().catch(() => false)) {
      await seedToggle.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/${p.ogc_fid}_seed.png` });
      await seedToggle.click();
      await page.waitForTimeout(800);
    }
    // 3D massing
    await page.getByText('3D Massing', { exact: true }).first().click({ timeout: 10000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_3d.png` });

    const verdictErrs = p.advisory ? [] : judge(expectations[String(p.ogc_fid)], evidence);
    results[p.ogc_fid] = {
      ok: verdictErrs.length === 0,
      advisory: p.advisory ?? false,
      evidence,
      violations: verdictErrs,
    };
    console.log(
      `${verdictErrs.length === 0 ? 'OK' : 'GATE-FAIL'} ${p.ogc_fid} (${p.address})` +
      (verdictErrs.length ? ` — ${verdictErrs.join(' | ')}` : '')
    );
  } catch (e) {
    await page.screenshot({ path: `${OUT}/${p.ogc_fid}_FAIL.png` }).catch(() => {});
    results[p.ogc_fid] = { ok: false, advisory: p.advisory ?? false, evidence: null, violations: [`battery flow failed: ${String(e).slice(0, 200)}`] };
    console.log(`FAIL ${p.ogc_fid}: ${String(e).slice(0, 200)}`);
  }
  consoleErrors[p.ogc_fid] = errs;
  await page.close();
}

fs.writeFileSync(`${OUT}/console_errors.json`, JSON.stringify(consoleErrors, null, 2));
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();

const gateFailures = Object.entries(results).filter(([, r]) => !r.ok && !r.advisory);
if (ASSERT && gateFailures.length) {
  console.log(`BATTERY GATE: ${gateFailures.length} parcel(s) violated expectations — see results.json`);
  process.exit(1);
}
console.log('done');
