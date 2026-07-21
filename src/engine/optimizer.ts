// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon } from 'geojson';
import type { Element, PlannerConfig, PlannerOutput, FeasibilityViolation } from './types';
import type { BuildingSpec, BuildingType, PlanState, UnitMixEntry } from './model';
import { createBuildingSpec, typologyToBuildingType, generateDefaultUnitMix, totalUnitsFromMix, corridorEfficiency } from './model';
import { buildBuildingFootprint, clampBuildingToEnvelope } from './buildingGeometry';
import { solveParkingBayPacking } from './parkingBaySolver';
import { placeBarsAlongEdges } from './edgePlacement';
import { computeFeasibility } from './feasibility';
import { validatePlanElements, rejectionChip, clipPolysToObstacles, unionPolys } from './validatePlan';
import { computeProForma } from './proforma';
import { areaM2, correctedAreaM2, mercatorCorrectionFactor, normalizeToPolygon, safeBbox, intersection, difference, polygons, isPointInPolygon } from './geometry';

// ─── types ───────────────────────────────────────────────────────────────────

export interface OptimizeInput {
  envelope: Polygon;
  zoning: PlannerConfig['zoning'];
  designParams: PlannerConfig['designParameters'];
  parkingSpec?: {
    stallW: number;
    stallD: number;
    aisleW: number;
    anglesDeg: number[];
  };
  /** Max iterations (default 200) */
  maxIterations?: number;
  /** Callback for progress reporting */
  onProgress?: (iteration: number, score: number) => void;
  /**
   * RNG seed. Fixed by default so the same inputs always produce the same plan
   * (reproducible, diffable results). Pass a varying seed to explore.
   */
  seed?: number;
  /**
   * User-pinned buildings (locked.position). They are kept EXACTLY as given —
   * never moved, resized, or removed — and the solver fills in around them.
   * Pins anchored outside the envelope are ignored (guards against stale state
   * from a previously selected parcel).
   */
  pinnedBuildings?: BuildingSpec[];
  /**
   * Solver-safe planner context (planner_context_v1). The fallback engine and
   * the server generator may use different algorithms, but they read the SAME
   * context values: hard constraints already arrive via `zoning`/`designParams`
   * patches; this adds precedent form priors and the generation gate.
   */
  solverBrief?: WorkerSolverBrief;
}

/** Worker-facing subset of the planner solver brief (all values optional).
 *  planner_context_v2 adds typology-aware Regrid geometry priors — depth,
 *  length, coverage, building count — which seed the layout as SOFT priors.
 *  Legal constraints stay hard limits; priors never exceed them. */
export interface WorkerSolverBrief {
  generationAllowed?: boolean;
  precedent?: {
    storiesP50?: number | null;
    storiesP75?: number | null;
    footprintP75SqFt?: number | null;
    footprintP90SqFt?: number | null;
    depthP50Ft?: number | null;
    lengthP75Ft?: number | null;
    coverageP75Pct?: number | null;
    buildingCountP50?: number | null;
    sampleSize?: number | null;
    confidence?: string | null;
    selectionMode?: string | null;
    precedentParcelIds?: number[];
  };
  programPrior?: {
    averageUnitSqft?: number | null;
  };
  objectiveWeights?: Record<string, number>;
  /** WO-0a: the theoretical envelope the fallback must chase — primary
   *  objective becomes achievedGsf / maxGsf; the ladder drives floors. */
  maxBuildout?: {
    maxGsf?: number | null;
    atStories?: number | null;
    bindingConstraint?: string | null;
    storiesLadder?: Array<{ stories: number | null; maxGsf: number | null; units?: number | null }>;
  };
  /** WO-0a/b: ordinance-sourced constraints from the compiled brief — these
   *  WIN over the legacy zoning arg whenever present. */
  hardConstraints?: {
    frontSetbackFt?: number | null;
    sideSetbackFt?: number | null;
    rearSetbackFt?: number | null;
    maxFar?: number | null;
    maxHeightFt?: number | null;
    maxDensityDuAcre?: number | null;
    maxCoveragePct?: number | null;
    maxImperviousPct?: number | null;
    minOpenSpacePct?: number | null;
  };
  /** WO-0a/b: brief parking — WINS over the legacy parkingSpec arg. */
  parking?: {
    ratio?: number | null;
    stallWidthFt?: number | null;
    stallDepthFt?: number | null;
    aisleWidthFt?: number | null;
  };
  /** WO-1a: fn_unit_program — per-type dims replace generateDefaultUnitMix
   *  assumptions where present (typed now, consumed as it lands in the brief). */
  unitProgram?: {
    corridorClearFt?: number | null;
    impliedBarDepthFt?: number | null;
    units?: Array<{
      type: string;
      gsf?: number | null;
      widthFt?: number | null;
      depthFt?: number | null;
      bedrooms?: number | null;
      parkingRatio?: number | null;
      defaultMixPct?: number | null;
    }>;
  };
  /** WO-1b: derived street frontage — bars orient to this bearing
   *  (street-edge-first) and the entry sits at its midpoint. */
  frontEdge?: {
    bearingDeg?: number | null;
    landlocked?: boolean;
    isPlaceholder?: boolean;
  };
  /** WO3: the engine's COMPOSITION DIRECTIVE — build THIS program.
   *  Building count comes from consolidation (never precedent count);
   *  the worker honors count, bar dims, and stories like server v2. */
  massingProgram?: {
    buildingCount?: number | null;
    barLengthFt?: number | null;
    barDepthFt?: number | null;
    stories?: number | null;
    parti?: string | null;
    constructionType?: string | null;
    constructionMaxStories?: number | null;
    rationale?: string | null;
    targetGsf?: number | null;
  };
  /** Local precedent type mix (form/style evidence only). */
  typeMix?: Record<string, number> | null;
}

export interface OptimizeResult {
  bestElements: Element[];
  bestMetrics: PlannerOutput['metrics'];
  bestViolations: FeasibilityViolation[];
  /** Building specs for the best plan — used to sync worker state after optimization */
  bestBuildings: BuildingSpec[];
  top3Alternatives: Array<{
    elements: Element[];
    metrics: PlannerOutput['metrics'];
    violations: FeasibilityViolation[];
    score: number;
  }>;
  iterations: number;
  finalScore: number;
  /** Candidates the zero-overlap gate rejected (never rendered) — the solves
   *  rail shows these collapsed with their reason chips. */
  rejected?: { count: number; reasons: string[] };
  /** WO-0b receipt: which inputs came from the compiled brief and which
   *  still leaned on legacy side-channel args while a brief was in hand. */
  contract?: { briefFieldsUsed: string[]; legacyFieldsUsed: string[] };
}

// ─── score weights ───────────────────────────────────────────────────────────

const WEIGHTS = {
  unitCount: 0.25,
  parkingCompliance: 0.20,
  farUtilization: 0.15,
  coverageCompliance: 0.10,
  openSpace: 0.05,
  noViolations: 0.15,
  yieldOnCost: 0.10,
  /** Similarity to the local Regrid built form — 0 unless the context sets it */
  precedentFit: 0,
  /** WO-0c: achievedGsf / maxBuildout.maxGsf — 0 until a max-buildout brief
   *  arrives, then it becomes the PRIMARY component (capture is the product's
   *  stated objective; resembling under-built neighbors is not). */
  gsfCapture: 0,
};

/** WO-0c: with a max-buildout target in hand, capture leads the objective.
 *  FAR utilization is subsumed by capture (same axis, worse denominator)
 *  and unit count drops to a supporting role. */
export function applyCapturePrimary(weights: ScoreWeights, hasMaxGsf: boolean): ScoreWeights {
  if (!hasMaxGsf || weights.gsfCapture > 0) return weights;
  return {
    ...weights,
    gsfCapture: weights.farUtilization + Math.max(0, weights.unitCount - 0.15) + 0.05,
    farUtilization: 0,
    unitCount: Math.min(weights.unitCount, 0.15),
    yieldOnCost: Math.max(0, weights.yieldOnCost - 0.05),
  };
}

export type ScoreWeights = typeof WEIGHTS;

/**
 * Objective weights from the compiled context override the hardcoded
 * defaults. The context vocabulary (financial_return, precedent_fit, …) maps
 * onto the worker's score components; unmapped worker terms (coverage
 * compliance, no-violations) keep their defaults, then everything
 * renormalizes to sum 1 so scores stay comparable across runs.
 */
export function resolveScoreWeights(brief?: WorkerSolverBrief): ScoreWeights {
  const resolved: ScoreWeights = { ...WEIGHTS };
  const w = brief?.objectiveWeights;
  if (!w) return resolved;
  const map: Array<[string, keyof ScoreWeights]> = [
    ['financial_return', 'yieldOnCost'],
    ['unit_or_program_yield', 'unitCount'],
    ['parking_compliance', 'parkingCompliance'],
    ['zoning_utilization', 'farUtilization'],
    ['open_space_quality', 'openSpace'],
    ['precedent_fit', 'precedentFit'],
  ];
  let mappedAny = false;
  for (const [contextKey, workerKey] of map) {
    const v = w[contextKey];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      resolved[workerKey] = v;
      mappedAny = true;
    }
  }
  if (!mappedAny) return { ...WEIGHTS };
  const sum = Object.values(resolved).reduce((s, v) => s + v, 0);
  if (sum > 0) {
    for (const k of Object.keys(resolved) as Array<keyof ScoreWeights>) {
      resolved[k] = resolved[k] / sum;
    }
  }
  return resolved;
}

/** Bounded similarity: 1 = identical, → 0 as the values diverge. */
const similarity = (a: number | null | undefined, b: number | null | undefined): number =>
  a != null && b != null && a > 0 && b > 0 ? Math.min(a, b) / Math.max(a, b) : 0.5;

/**
 * Precedent-fit component (mirrors the server's context_score_v2 blend):
 * 50% footprint similarity to the local p75, 25% coverage similarity to the
 * local p75, 25% story similarity to the local p75.
 */
/** WO-0c: FORM-ONLY precedent fit. The old 0.5-weight footprint-area term
 *  rewarded resembling under-built neighbors — quantity is the capture
 *  component's job. Form = bar depth, bar length, stories. */
function scorePrecedentFit(
  precedent: WorkerSolverBrief['precedent'],
  avgDepthFt: number,
  avgLengthFt: number,
  avgFloors: number
): number {
  if (!precedent) return 0.5;
  return (
    0.4 * similarity(avgDepthFt, precedent.depthP50Ft) +
    0.3 * similarity(avgLengthFt, precedent.lengthP75Ft) +
    0.3 * similarity(avgFloors, precedent.storiesP75)
  );
}

const SQM_TO_SQFT = 10.7639;

/** Default RNG seed — keeps optimizer output reproducible across runs. */
const DEFAULT_SEED = 0x9e3779b9;

/** The UI slider default. A target equal to this is treated as "not user-set",
 *  so the local coverage prior may seed it; any other value is a deliberate
 *  user preference and overrides the soft prior. */
const DEFAULT_TARGET_COVERAGE_PCT = 50;

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Deterministic PRNG (mulberry32). Returns a function producing values in
 * [0, 1). Used instead of Math.random() so a given seed always yields the same
 * sequence — and therefore the same site plan.
 */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cloneBuildings(buildings: BuildingSpec[]): BuildingSpec[] {
  return buildings.map(b => ({ ...b, anchor: { ...b.anchor }, locked: b.locked ? { ...b.locked } : undefined }));
}

function randomInRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/**
 * Find the longest edge of the envelope and return its direction + start point.
 */
function longestEdge(envelope: Polygon): { start: number[]; dir: number[]; len: number } {
  const ring = envelope.coordinates[0];
  let bestLen = 0;
  let bestStart = ring[0];
  let bestDir = [1, 0];

  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) {
      bestLen = len;
      bestStart = ring[i];
      bestDir = [dx / len, dy / len];
    }
  }

  return { start: bestStart, dir: bestDir, len: bestLen };
}

/**
 * FAST scoring — used during SA iterations.
 * Skips expensive element building (boolean diff ops for greenspace) and pro forma.
 * Only computes the numeric score + lightweight metrics needed for acceptance.
 */
function scoreOnly(
  envelope: Polygon,
  buildings: BuildingSpec[],
  parkingSpec: { stallW: number; stallD: number; aisleW: number; anglesDeg: number[] },
  zoningLimits: { maxFar?: number; maxCoveragePct?: number; parkingRatio?: number },
  /** Pre-computed values to avoid recalculation every iteration */
  cached: { siteAreaM2: number; siteAreaSqft: number; maxReasonableUnits: number; maxGsfSqft?: number | null },
  weights: ScoreWeights = WEIGHTS,
  precedent?: WorkerSolverBrief['precedent']
): { score: number; clampedBuildings: BuildingSpec[] } {
  // Clamp all buildings (skip expensive overlap checks during SA)
  const clamped: BuildingSpec[] = [];
  for (const spec of buildings) {
    clamped.push(clampBuildingToEnvelope(spec, envelope, clamped, true));
  }

  // Containment check: penalize any building still outside envelope
  let containmentPenalty = 0;
  for (const spec of clamped) {
    const footprint = buildBuildingFootprint(spec);
    const verts = footprint.coordinates[0];
    for (let i = 0; i < verts.length - 1; i++) {
      if (!isPointInPolygon(verts[i], envelope.coordinates[0])) {
        containmentPenalty += 0.5; // heavy penalty per outside vertex
      }
    }
  }

  // Build footprints with unit mix
  const buildingFootprints = clamped.map(spec => {
    const footprint = buildBuildingFootprint(spec);
    const gfaSqft = correctedAreaM2(footprint) * SQM_TO_SQFT * Math.max(1, spec.floors);
    const unitMix = spec.unitMix && spec.unitMix.length > 0
      ? spec.unitMix
      : generateDefaultUnitMix(gfaSqft, corridorEfficiency(spec.depthM));
    return { id: spec.id, footprint, floors: spec.floors, unitMix };
  });

  // FAST parking estimate — skip expensive boolean ops during SA iterations
  const buildingFootprintTotal = buildingFootprints.reduce((s, b) => s + areaM2(b.footprint), 0);
  const availableParkingArea = Math.max(0, cached.siteAreaM2 - buildingFootprintTotal);
  const stallAreaM2 = parkingSpec.stallW * parkingSpec.stallD * 2 + parkingSpec.aisleW * parkingSpec.stallW; // rough per-stall area
  const estimatedStalls = Math.floor(availableParkingArea * 0.6 / stallAreaM2); // 60% efficiency
  const parkingAreaM2 = estimatedStalls * stallAreaM2;

  // Lightweight feasibility with estimated parking
  const feasibility = computeFeasibility({
    envelope,
    buildings: buildingFootprints,
    parkingSolution: { stallsAchieved: estimatedStalls },
    parkingAreaM2,
    zoningLimits
  });

  const units = feasibility.totalUnits;

  // 1. Unit count
  const unitScore = Math.min(1, units / cached.maxReasonableUnits);

  // 2. Parking compliance
  let parkingScore = 0;
  if (feasibility.stallsRequired <= 0) {
    parkingScore = 1;
  } else {
    const ratio = feasibility.stallsProvided / feasibility.stallsRequired;
    parkingScore = ratio >= 1 ? 1 : ratio >= 0.5 ? (ratio - 0.5) / 0.5 : 0;
  }

  // 3. FAR utilization
  const maxFar = zoningLimits.maxFar ?? 2.0;
  const farScore = feasibility.far > maxFar ? 0 : maxFar > 0 ? feasibility.far / maxFar : 0;

  // 4. Coverage compliance
  const maxCoverage = (zoningLimits.maxCoveragePct ?? 60) / 100;
  const coverageScore = feasibility.coverage <= maxCoverage
    ? 1
    : Math.max(0, 1 - (feasibility.coverage - maxCoverage) / maxCoverage);

  // 5. Open space (arithmetic — no boolean ops)
  const usedArea = buildingFootprintTotal + parkingAreaM2;
  const openSpacePct = cached.siteAreaM2 > 0 ? Math.max(0, 1 - usedArea / cached.siteAreaM2) : 0;
  const openSpaceScore = Math.min(1, openSpacePct * 2);

  // 6. No violations bonus
  const errorViolations = feasibility.violations.filter(v => v.severity === 'error');
  const noViolationsScore = errorViolations.length === 0 ? 1 : 0;

  // 7. Yield on cost — cheap proxy during SA (full pro forma only for final results)
  const yieldOnCostScore = farScore * 0.5 + unitScore * 0.5;

  // 8. Precedent fit — FORM similarity to the local Regrid built form (only
  // scored when the context's objective weights ask for it)
  let precedentFitScore = 0;
  if (weights.precedentFit > 0) {
    const avgDepthFt = clamped.length > 0
      ? clamped.reduce((s, b) => s + b.depthM, 0) / clamped.length / 0.3048
      : 0;
    const avgLengthFt = clamped.length > 0
      ? clamped.reduce((s, b) => s + b.widthM, 0) / clamped.length / 0.3048
      : 0;
    const avgFloors = clamped.length > 0
      ? clamped.reduce((s, b) => s + Math.max(1, b.floors), 0) / clamped.length
      : 0;
    precedentFitScore = scorePrecedentFit(precedent, avgDepthFt, avgLengthFt, avgFloors);
  }

  // 9. GSF capture — the primary objective once a max-buildout brief exists
  const totalGfaSqft = buildingFootprints.reduce(
    (s, b) => s + correctedAreaM2(b.footprint) * SQM_TO_SQFT * Math.max(1, b.floors), 0
  );
  const captureScore = cached.maxGsfSqft != null && cached.maxGsfSqft > 0
    ? Math.min(1, totalGfaSqft / cached.maxGsfSqft)
    : 0;

  const totalScore =
    weights.unitCount * unitScore +
    weights.parkingCompliance * parkingScore +
    weights.farUtilization * farScore +
    weights.coverageCompliance * coverageScore +
    weights.openSpace * openSpaceScore +
    weights.noViolations * noViolationsScore +
    weights.yieldOnCost * yieldOnCostScore +
    weights.precedentFit * precedentFitScore +
    weights.gsfCapture * captureScore;

  // Apply containment penalty
  const finalScore = containmentPenalty > 0 ? totalScore * Math.max(0, 1 - containmentPenalty) : totalScore;
  return { score: finalScore, clampedBuildings: clamped };
}

/**
 * FULL scoring — builds elements, metrics, pro forma.
 * Used only for the final best result and top-3 alternatives (called ~4 times total).
 */
function computeFullResult(
  envelope: Polygon,
  buildings: BuildingSpec[],
  parkingSpec: { stallW: number; stallD: number; aisleW: number; anglesDeg: number[] },
  zoningLimits: { maxFar?: number; maxCoveragePct?: number; parkingRatio?: number },
  quotas: { adaPct: number; evPct: number },
  weights: ScoreWeights = WEIGHTS,
  precedent?: WorkerSolverBrief['precedent'],
  maxGsfSqft?: number | null
): {
  score: number;
  elements: Element[];
  metrics: PlannerOutput['metrics'];
  violations: FeasibilityViolation[];
  stallsAchieved: number;
} {
  // Clamp all buildings
  const clamped: BuildingSpec[] = [];
  for (const spec of buildings) {
    clamped.push(clampBuildingToEnvelope(spec, envelope, clamped));
  }

  // Build footprints with unit mix
  const buildingFootprints = clamped.map(spec => {
    const footprint = buildBuildingFootprint(spec);
    const gfaSqft = correctedAreaM2(footprint) * SQM_TO_SQFT * Math.max(1, spec.floors);
    const unitMix = spec.unitMix && spec.unitMix.length > 0
      ? spec.unitMix
      : generateDefaultUnitMix(gfaSqft, corridorEfficiency(spec.depthM));
    return { id: spec.id, footprint, floors: spec.floors, unitMix };
  });

  const estUnits = buildingFootprints.reduce(
    (sum, b) => sum + (b.unitMix?.reduce((s, e) => s + e.count, 0) ?? 0), 0
  );
  const targetRatio = zoningLimits.parkingRatio ?? 1.5;
  const maxStalls = estUnits > 0 ? Math.ceil(estUnits * targetRatio * 1.1) : undefined;

  const parkingSolution = solveParkingBayPacking(
    envelope,
    buildingFootprints.map(b => b.footprint),
    parkingSpec,
    maxStalls
  );

  // Zero-overlap repair: the packer takes buildings as obstacles but can
  // still leak a bay under a bar (found by the validation gate). Clip all
  // parking flatwork against the building footprints and rescale the stall
  // count by surviving bay area — per-bay counts are area-proportional, so
  // the displayed numbers stay consistent with the drawn geometry.
  const obstaclePolys = buildingFootprints.map(b => normalizeToPolygon(b.footprint));
  const preClipBayArea = parkingSolution.bays.reduce((s, b) => s + areaM2(b), 0);
  // The drive corridor is clipped against buildings only; bays and aisles
  // yield to BOTH buildings and the drive (access beats storage).
  if (parkingSolution.circulationPolygons) {
    // Junctions overlap by construction (connector tees into the main
    // drive) — merge the network first, then clip it against buildings.
    parkingSolution.circulationPolygons = clipPolysToObstacles(
      unionPolys(parkingSolution.circulationPolygons.map(c => normalizeToPolygon(c)) as never) as never,
      obstaclePolys as never,
      6
    ) as never;
  }
  const bayObstacles = [
    ...obstaclePolys,
    ...((parkingSolution.circulationPolygons ?? []).map(c => normalizeToPolygon(c))),
  ];
  parkingSolution.bays = clipPolysToObstacles(parkingSolution.bays as never, bayObstacles as never, 13) as never;
  parkingSolution.aisles = clipPolysToObstacles(parkingSolution.aisles as never, bayObstacles as never, 6) as never;
  const postClipBayArea = parkingSolution.bays.reduce((s, b) => s + areaM2(b), 0);
  if (preClipBayArea > 0 && postClipBayArea < preClipBayArea - 1) {
    parkingSolution.stallsAchieved = Math.floor(
      parkingSolution.stallsAchieved * (postClipBayArea / preClipBayArea)
    );
  }

  const parkingAreaM2 = parkingSolution.bays.reduce((s, b) => s + areaM2(b), 0) +
    parkingSolution.aisles.reduce((s, a) => s + areaM2(a), 0);

  const feasibility = computeFeasibility({
    envelope,
    buildings: buildingFootprints,
    parkingSolution,
    parkingAreaM2,
    zoningLimits
  });

  const siteAreaM2Val = areaM2(envelope);
  const siteAreaSqft = correctedAreaM2(envelope) * SQM_TO_SQFT;

  const units = feasibility.totalUnits;
  const maxReasonableUnits = Math.max(1, Math.floor(siteAreaSqft * 3 * 0.85 / 720));
  const unitScore = Math.min(1, units / maxReasonableUnits);

  let parkingScore = 0;
  if (feasibility.stallsRequired <= 0) {
    parkingScore = 1;
  } else {
    const ratio = feasibility.stallsProvided / feasibility.stallsRequired;
    parkingScore = ratio >= 1 ? 1 : ratio >= 0.5 ? (ratio - 0.5) / 0.5 : 0;
  }

  const maxFar = zoningLimits.maxFar ?? 2.0;
  const farScore = feasibility.far > maxFar ? 0 : maxFar > 0 ? feasibility.far / maxFar : 0;

  const maxCoverage = (zoningLimits.maxCoveragePct ?? 60) / 100;
  const coverageScore = feasibility.coverage <= maxCoverage
    ? 1
    : Math.max(0, 1 - (feasibility.coverage - maxCoverage) / maxCoverage);

  const footprintAreaM2 = buildingFootprints.reduce((s, b) => s + areaM2(b.footprint), 0);
  const circulationAreaM2 = parkingSolution.circulationAreaSqM ?? 0;
  const usedArea = footprintAreaM2 + parkingAreaM2 + circulationAreaM2;
  const openSpacePct = siteAreaM2Val > 0 ? Math.max(0, 1 - usedArea / siteAreaM2Val) : 0;
  const openSpaceScore = Math.min(1, openSpacePct * 2);

  const errorViolations = feasibility.violations.filter(v => v.severity === 'error');
  const noViolationsScore = errorViolations.length === 0 ? 1 : 0;

  // Full pro forma (only for final results)
  let yieldOnCostScore = 0;
  try {
    const allMix = buildingFootprints.flatMap(b => b.unitMix || []);
    const pf = computeProForma({
      totalGFASqft: feasibility.gfaSqft,
      siteAreaSqft,
      unitMix: allMix,
      surfaceStalls: parkingSolution.stallsAchieved,
      structuredStalls: 0,
      landCost: 0,
    });
    yieldOnCostScore = Math.min(1, Math.max(0, pf.yieldOnCost / 0.08));
  } catch {
    yieldOnCostScore = 0;
  }

  let precedentFitScore = 0;
  if (weights.precedentFit > 0) {
    const avgDepthFt = clamped.length > 0
      ? clamped.reduce((s, b) => s + b.depthM, 0) / clamped.length / 0.3048
      : 0;
    const avgLengthFt = clamped.length > 0
      ? clamped.reduce((s, b) => s + b.widthM, 0) / clamped.length / 0.3048
      : 0;
    const avgFloors = buildingFootprints.length > 0
      ? buildingFootprints.reduce((s, b) => s + Math.max(1, b.floors), 0) / buildingFootprints.length
      : 0;
    precedentFitScore = scorePrecedentFit(precedent, avgDepthFt, avgLengthFt, avgFloors);
  }

  const captureScore = maxGsfSqft != null && maxGsfSqft > 0
    ? Math.min(1, feasibility.gfaSqft / maxGsfSqft)
    : 0;

  const totalScore =
    weights.unitCount * unitScore +
    weights.parkingCompliance * parkingScore +
    weights.farUtilization * farScore +
    weights.coverageCompliance * coverageScore +
    weights.openSpace * openSpaceScore +
    weights.noViolations * noViolationsScore +
    weights.yieldOnCost * yieldOnCostScore +
    weights.precedentFit * precedentFitScore +
    weights.gsfCapture * captureScore;

  // Build full elements (expensive — boolean ops for greenspace)
  const elements = buildElements(clamped, buildingFootprints, parkingSolution, feasibility, envelope);

  const parkingRatio = units > 0 ? feasibility.stallsProvided / units : 0;

  const allMix = buildingFootprints.flatMap(b => b.unitMix || []);
  const mixByType: Record<string, number> = {};
  for (const entry of allMix) {
    mixByType[entry.type] = (mixByType[entry.type] || 0) + entry.count;
  }
  const unitMixSummary = units > 0
    ? `${units} total (${mixByType['studio'] || 0} studio, ${mixByType['1br'] || 0} 1BR, ${mixByType['2br'] || 0} 2BR, ${mixByType['3br'] || 0} 3BR)`
    : '';

  // ADA / EV are designated subsets of the provided stalls (code/compliance).
  // ADA requires at least one accessible stall whenever parking exists.
  const provided = feasibility.stallsProvided;
  const adaStalls = provided > 0 ? Math.max(1, Math.ceil(provided * quotas.adaPct / 100)) : 0;
  const evStalls = Math.ceil(provided * quotas.evPct / 100);

  const metrics: PlannerOutput['metrics'] = {
    totalBuiltSF: feasibility.gfaSqft,
    siteCoveragePct: feasibility.coverage * 100,
    achievedFAR: feasibility.far,
    parkingRatio,
    openSpacePct: openSpacePct * 100,
    stallsProvided: feasibility.stallsProvided,
    stallsRequired: feasibility.stallsRequired,
    parkingAngleDeg: parkingSolution.chosenAngleDeg,
    adaStalls,
    evStalls,
    totalUnits: units,
    unitMixSummary,
    zoningCompliant: errorViolations.length === 0,
    violations: feasibility.violations.map(v => v.message),
    warnings: feasibility.violations.filter(v => v.severity === 'warning').map(v => v.message)
  };

  return {
    score: totalScore,
    elements,
    metrics,
    violations: feasibility.violations,
    stallsAchieved: parkingSolution.stallsAchieved
  };
}

/**
 * Build Element[] from plan components (same logic as siteEngineWorker.solvePlan)
 */
function buildElements(
  buildings: BuildingSpec[],
  buildingFootprints: Array<{ id: string; footprint: Polygon; floors: number; unitMix?: UnitMixEntry[] }>,
  parkingSolution: { bays: Polygon[]; aisles: Polygon[]; stallsAchieved: number; circulationPolygons?: Polygon[] },
  feasibility: { gfaSqft: number },
  envelope?: Polygon
): Element[] {
  const elements: Element[] = [];
  const now = new Date().toISOString();

  for (const building of buildingFootprints) {
    const footprint = normalizeToPolygon(building.footprint);
    elements.push({
      id: building.id,
      type: 'building',
      name: `Building ${building.id}`,
      geometry: footprint,
      properties: {
        areaSqFt: correctedAreaM2(footprint) * SQM_TO_SQFT,
        floors: building.floors,
        unitMix: building.unitMix
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        source: 'ai-generated'
      }
    });
  }

  const totalBayArea = parkingSolution.bays.reduce((sum, bay) => sum + areaM2(bay), 0);

  parkingSolution.bays.forEach((bay, index) => {
    const footprint = normalizeToPolygon(bay);
    const bayArea = areaM2(footprint);
    const estimatedStalls = totalBayArea > 0
      ? Math.round((bayArea / totalBayArea) * parkingSolution.stallsAchieved)
      : 0;

    elements.push({
      id: `parking-bay-${index + 1}`,
      type: 'parking-bay',
      name: `Parking Bay ${index + 1}`,
      geometry: footprint,
      properties: {
        areaSqFt: correctedAreaM2(footprint) * SQM_TO_SQFT,
        parkingSpaces: estimatedStalls
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        source: 'ai-generated'
      }
    });
  });

  parkingSolution.aisles.forEach((aisle, index) => {
    const footprint = normalizeToPolygon(aisle);
    elements.push({
      id: `parking-aisle-${index + 1}`,
      type: 'parking-aisle',
      name: `Parking Aisle ${index + 1}`,
      geometry: footprint,
      properties: {
        areaSqFt: correctedAreaM2(footprint) * SQM_TO_SQFT
      },
      metadata: {
        createdAt: now,
        updatedAt: now,
        source: 'ai-generated'
      }
    });
  });

  // Circulation elements
  if (parkingSolution.circulationPolygons) {
    parkingSolution.circulationPolygons.forEach((circ, index) => {
      const footprint = normalizeToPolygon(circ);
      elements.push({
        id: `circulation-${index + 1}`,
        type: 'circulation',
        name: index === 0 ? 'Main Drive' : `Drive Connector ${index}`,
        geometry: footprint,
        properties: {
          areaSqFt: correctedAreaM2(footprint) * SQM_TO_SQFT,
          color: '#94A3B8',
        },
        metadata: {
          createdAt: now,
          updatedAt: now,
          source: 'ai-generated'
        }
      });
    });
  }

  // ─── Greenspace: geometric difference (envelope minus all used areas) ───
  if (envelope) {
    try {
      let remaining: Polygon | ReturnType<typeof difference> = envelope;

      for (const b of buildingFootprints) {
        remaining = difference(remaining as Polygon, normalizeToPolygon(b.footprint));
      }
      for (const bay of parkingSolution.bays) {
        remaining = difference(remaining as Polygon, normalizeToPolygon(bay));
      }
      for (const aisle of parkingSolution.aisles) {
        remaining = difference(remaining as Polygon, normalizeToPolygon(aisle));
      }
      if (parkingSolution.circulationPolygons) {
        for (const circ of parkingSolution.circulationPolygons) {
          remaining = difference(remaining as Polygon, normalizeToPolygon(circ));
        }
      }

      const greenPolygons = polygons(remaining as Polygon);
      let gsIdx = 0;
      for (const gp of greenPolygons) {
        const gpAreaSqft = correctedAreaM2(gp) * SQM_TO_SQFT;
        if (gpAreaSqft < 100) continue; // filter slivers
        gsIdx++;
        elements.push({
          id: `greenspace-${gsIdx}`,
          type: 'greenspace',
          name: `Open Space ${gsIdx}`,
          geometry: gp,
          properties: {
            areaSqFt: gpAreaSqft,
            color: '#22C55E',
          },
          metadata: {
            createdAt: now,
            updatedAt: now,
            source: 'ai-generated'
          }
        });
      }
    } catch {
      // If boolean ops fail, skip greenspace (metrics still computed arithmetically)
    }
  }

  return elements;
}

// ─── mutations ───────────────────────────────────────────────────────────────

function mutateMove(building: BuildingSpec, rng: () => number): BuildingSpec {
  if (building.locked?.position) return building;
  const shift = randomInRange(rng, 5, 20);
  const angle = rng() * Math.PI * 2;
  return {
    ...building,
    anchor: {
      x: building.anchor.x + Math.cos(angle) * shift,
      y: building.anchor.y + Math.sin(angle) * shift
    }
  };
}

function mutateResize(building: BuildingSpec, rng: () => number): BuildingSpec {
  if (building.locked?.dimensions) return building;
  const dw = randomInRange(rng, -10, 10);
  const dd = randomInRange(rng, -10, 10);
  return {
    ...building,
    widthM: Math.max(5, building.widthM + dw),
    depthM: Math.max(5, building.depthM + dd)
  };
}

function mutateRotate(building: BuildingSpec, rng: () => number): BuildingSpec {
  if (building.locked?.rotation) return building;
  const dAngle = randomInRange(rng, -30, 30) * (Math.PI / 180);
  return {
    ...building,
    rotationRad: building.rotationRad + dAngle
  };
}

// ─── main optimizer ──────────────────────────────────────────────────────────

/**
 * Simulated annealing optimizer.
 * Generates optimal building layouts within a given envelope.
 */
export function optimize(input: OptimizeInput): OptimizeResult {
  const {
    envelope,
    zoning,
    designParams,
    maxIterations = 200,
    onProgress,
    seed = DEFAULT_SEED,
  } = input;

  // Context gate: not-permitted is a REJECTION, not a low score. The worker
  // must never lay out a use the compiled context says is not as-of-right.
  if (input.solverBrief?.generationAllowed === false) {
    return {
      bestElements: [],
      bestMetrics: {
        totalBuiltSF: 0,
        siteCoveragePct: 0,
        achievedFAR: 0,
        parkingRatio: 0,
        openSpacePct: 100,
        stallsProvided: 0,
        stallsRequired: 0,
        zoningCompliant: false,
        violations: [],
      } as unknown as OptimizeResult['bestMetrics'],
      bestViolations: [{
        code: 'context',
        message: 'Generation blocked: the selected use is not permitted as-of-right for this parcel.',
        severity: 'error',
      }],
      bestBuildings: [],
      top3Alternatives: [],
      iterations: 0,
      finalScore: 0,
    };
  }

  // Seeded RNG → deterministic, reproducible layouts for the same inputs.
  const rng = makeRng(seed);

  const buildingType = typologyToBuildingType(designParams.buildingTypology);

  // ── WO-0b: the compiled brief WINS over the legacy side-channel args.
  // Every field the brief provides replaces its legacy counterpart; anything
  // still taken from a legacy arg while a brief is in hand is recorded in
  // the contract receipt so the lineage can say so.
  const briefHc = input.solverBrief?.hardConstraints;
  const briefParking = input.solverBrief?.parking;
  const briefFieldsUsed: string[] = [];
  const legacyFieldsUsed: string[] = [];
  const pick = <T,>(field: string, briefVal: T | null | undefined, legacyVal: T | undefined): T | undefined => {
    if (briefVal != null) { briefFieldsUsed.push(field); return briefVal; }
    if (legacyVal !== undefined && input.solverBrief) legacyFieldsUsed.push(field);
    return legacyVal ?? undefined;
  };
  const effMaxFar = pick('maxFar', briefHc?.maxFar, zoning.maxFar);
  const effMaxCoveragePct = pick('maxCoveragePct', briefHc?.maxCoveragePct, zoning.maxCoveragePct);
  const effMaxHeightFt = pick('maxHeightFt', briefHc?.maxHeightFt, zoning.maxHeightFt);
  const effParkingRatio = pick('parkingRatio', briefParking?.ratio, zoning.minParkingRatio) ?? 1.5;
  const maxGsfSqft = input.solverBrief?.maxBuildout?.maxGsf ?? null;
  if (maxGsfSqft != null) briefFieldsUsed.push('maxGsf');

  // Auto-calculate how many buildings are needed to achieve target GFA.
  // WO-0c/d: the max-buildout GSF is THE target when known; the user's FAR
  // slider and the zoning max remain the fallbacks. effMaxFar remains the
  // COMPLIANCE cap, enforced in computeFeasibility.
  const SQM_TO_SQFT_CONST = 10.7639;
  const envelopeAreaSqft = correctedAreaM2(envelope) * SQM_TO_SQFT_CONST;
  const targetFAR = designParams.targetFAR ?? effMaxFar ?? 1.5;
  const targetGFA = maxGsfSqft != null && maxGsfSqft > 0
    ? Math.min(maxGsfSqft, envelopeAreaSqft * targetFAR)
    : envelopeAreaSqft * targetFAR;
  const defaultFloors = 3;
  const defaultBuildingFootprintSqft = (200 * 0.3048) * (60 * 0.3048) * SQM_TO_SQFT_CONST; // ~12,000 sqft
  const calculatedNumBuildings = Math.max(1, Math.min(8, Math.ceil(targetGFA / (defaultBuildingFootprintSqft * defaultFloors))));
  const numBuildings = designParams.numBuildings === undefined
    ? calculatedNumBuildings
    : designParams.numBuildings; // Use explicit value directly

  const FT_TO_M = 0.3048;
  const parkingSpec = briefParking?.stallWidthFt != null && briefParking?.stallDepthFt != null && briefParking?.aisleWidthFt != null
    ? (briefFieldsUsed.push('parkingSpec'),
      {
        stallW: briefParking.stallWidthFt * FT_TO_M,
        stallD: briefParking.stallDepthFt * FT_TO_M,
        aisleW: briefParking.aisleWidthFt * FT_TO_M,
        anglesDeg: input.parkingSpec?.anglesDeg ?? [0, 60, 90],
      })
    : (input.parkingSpec && input.solverBrief ? (legacyFieldsUsed.push('parkingSpec'), input.parkingSpec) : input.parkingSpec) ?? {
      stallW: 2.7432,  // 9ft
      stallD: 5.4864,  // 18ft
      aisleW: 7.3152,  // 24ft
      anglesDeg: [0, 60, 90]
    };

  const zoningLimits = {
    maxFar: effMaxFar,
    maxCoveragePct: effMaxCoveragePct,
    parkingRatio: effParkingRatio
  };

  // ADA / EV designation percentages (surfaced in the final metrics).
  const parkingQuotas = {
    adaPct: designParams.parking?.adaPct ?? 5,
    evPct: designParams.parking?.evPct ?? 10
  };

  // ── 1. Generate initial layout ──────────────────────────────────────────
  const edge = longestEdge(envelope);
  const edgeBbox = safeBbox(envelope);
  const envCenterX = (edgeBbox[0] + edgeBbox[2]) / 2;
  const envCenterY = (edgeBbox[1] + edgeBbox[3]) / 2;

  // WO-1b: STREET-EDGE-FIRST. A derived frontage bearing (compass degrees,
  // conformal in Mercator) aligns the massing to the actual street; the
  // longest edge remains the fallback for parcels without one.
  const frontBearingDeg = input.solverBrief?.frontEdge?.landlocked
    ? null
    : input.solverBrief?.frontEdge?.bearingDeg ?? null;
  const edgeAngleRad = frontBearingDeg != null
    ? ((90 - frontBearingDeg) * Math.PI) / 180
    : Math.atan2(edge.dir[1], edge.dir[0]);
  if (frontBearingDeg != null) briefFieldsUsed.push('frontEdgeBearing');

  // Calculate how many buildings can actually fit physically.
  // Regrid built-form priors (planner_context_v2, sample ≥ 5): local geometry
  // seeds bar depth/length as SOFT priors, clamped to the multifamily
  // constructable range — the same initialization rules the server generator
  // uses. Legal constraints stay hard; priors never exceed them.
  const prec = input.solverBrief?.precedent;
  const hasPrecedentPrior = (prec?.sampleSize ?? 0) >= 5;
  // WO3: the massing program is a DIRECTIVE, not a prior — its bar dims and
  // building count win outright (precedents shape facade/style, never mass).
  const mp = input.solverBrief?.massingProgram;
  // Depth: local median, clamped to the MF constructable range (45–72 ft —
  // double-loaded corridor depths that can actually be built).
  let defaultDepthFt = 60;
  if (mp?.barDepthFt != null && mp.barDepthFt > 0) {
    defaultDepthFt = Math.min(80, Math.max(45, Math.round(mp.barDepthFt)));
    briefFieldsUsed.push('barDepthFt');
  } else if (hasPrecedentPrior && prec?.depthP50Ft != null && prec.depthP50Ft > 0) {
    defaultDepthFt = Math.min(72, Math.max(45, Math.round(prec.depthP50Ft)));
  }
  const defaultDepthM = defaultDepthFt * 0.3048;
  // Length: local 75th percentile clamped to 90–300 ft; when v2 length data
  // is absent, the v1 footprint-p90-at-depth heuristic remains the fallback.
  let defaultWidthFt = 200;
  if (mp?.barLengthFt != null && mp.barLengthFt > 0) {
    defaultWidthFt = Math.min(320, Math.max(90, Math.round(mp.barLengthFt)));
    briefFieldsUsed.push('barLengthFt');
  } else if (hasPrecedentPrior && prec?.lengthP75Ft != null && prec.lengthP75Ft > 0) {
    defaultWidthFt = Math.min(300, Math.max(90, Math.round(prec.lengthP75Ft)));
  } else if (hasPrecedentPrior && prec?.footprintP90SqFt != null) {
    defaultWidthFt = Math.min(300, Math.max(90, Math.round(prec.footprintP90SqFt / defaultDepthFt)));
  }
  const defaultWidthM = defaultWidthFt * 0.3048;
  const buildingFootprintArea = defaultWidthM * defaultDepthM;
  const envelopeCorrectedArea = correctedAreaM2(envelope);
  // Buildings should use at most ~40% of envelope area (rest for parking, open space, circulation)
  const maxPhysicalBuildings = Math.max(1, Math.floor(envelopeCorrectedArea * 0.4 / buildingFootprintArea));
  let effectiveNumBuildings = Math.min(numBuildings, maxPhysicalBuildings);
  // WO3: honor massingProgram.building_count (consolidation directive) —
  // an explicit user numBuildings still wins; physical fit still caps.
  if (mp?.buildingCount != null && mp.buildingCount > 0 && designParams.numBuildings == null) {
    effectiveNumBuildings = Math.max(1, Math.min(maxPhysicalBuildings, Math.round(mp.buildingCount)));
    briefFieldsUsed.push('buildingCount');
  }

  // Constructive fast path: let target COVERAGE drive the building count (FAR
  // then drives floors below). Buildings sit in spaced grid cells, so a
  // coverage-driven count stays overlap-free — no scaling/clamp churn. Uses raw
  // EPSG:3857 areas so the ratio matches feasibility's coverage (Mercator cancels).
  // An explicitly requested numBuildings always wins over the coverage target.
  if (maxIterations === 0 && designParams.numBuildings == null && mp?.buildingCount == null) {
    const maxCov = (effMaxCoveragePct ?? 60) / 100;
    // Coverage: the local p75 seeds the target when the user hasn't moved the
    // slider off its default — a user-set value overrides the soft prior, and
    // the legal maximum caps both.
    const userCovPct = designParams.targetCoveragePct;
    const priorCovPct = hasPrecedentPrior && prec?.coverageP75Pct != null && prec.coverageP75Pct > 0
      ? prec.coverageP75Pct
      : null;
    const covPct = userCovPct != null && userCovPct !== DEFAULT_TARGET_COVERAGE_PCT
      ? userCovPct
      : (priorCovPct ?? userCovPct ?? DEFAULT_TARGET_COVERAGE_PCT);
    const targetCov = Math.min(covPct / 100, maxCov);
    const envRawM2 = areaM2(envelope);
    const coverageDrivenCount = Math.max(1, Math.round(targetCov * envRawM2 / buildingFootprintArea));
    // Building count: the local median seeds the count, capped by physical
    // fit and by what the (already prior-informed) coverage target supports.
    const priorCount = hasPrecedentPrior && prec?.buildingCountP50 != null && prec.buildingCountP50 > 0
      ? Math.round(prec.buildingCountP50)
      : null;
    const seedCount = priorCount != null ? Math.min(priorCount, coverageDrivenCount) : coverageDrivenCount;
    effectiveNumBuildings = Math.max(1, Math.min(maxPhysicalBuildings, seedCount));
  }

  // Grid-within-envelope initial placement:
  // Sample candidate positions, keep only those whose footprint is fully inside envelope.
  const cos = Math.cos(edgeAngleRad);
  const sin = Math.sin(edgeAngleRad);
  const gapX = defaultWidthM * 1.25;   // column spacing
  const gapY = defaultDepthM * 1.75;   // row spacing (room for parking)
  const envW = edgeBbox[2] - edgeBbox[0];
  const envH = edgeBbox[3] - edgeBbox[1];
  const cols = Math.max(1, Math.floor(envW / gapX));
  const rows = Math.max(1, Math.floor(envH / gapY));

  const candidatePositions: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const localX = (col + 0.5) * gapX - envW / 2;
      const localY = (row + 0.5) * gapY - envH / 2;
      const px = envCenterX + localX * cos - localY * sin;
      const py = envCenterY + localX * sin + localY * cos;
      candidatePositions.push({ x: px, y: py });
    }
  }

  // User pins are sovereign: seed the layout with them exactly as given.
  // (Anchor-outside-envelope pins are dropped — stale state from another parcel.)
  const pinned = cloneBuildings(
    (input.pinnedBuildings ?? []).filter(b =>
      b.locked?.position && isPointInPolygon([b.anchor.x, b.anchor.y], envelope.coordinates[0])
    )
  );
  const pinnedFootprints = pinned.map(b => buildBuildingFootprint(b));
  const placedFootprints: Polygon[] = [...pinnedFootprints];
  const overlapsPlaced = (fp: Polygon): boolean =>
    placedFootprints.some(pf => {
      const overlap = polygons(intersection(fp, pf)).reduce((s, p) => s + areaM2(p), 0);
      return overlap > 0.5;
    });

  const initialBuildings: BuildingSpec[] = [...pinned];
  let buildingNum = 0;

  // EDGE-HUGGING seeding for ALL solves (constructive AND SA): bars laid flush
  // along the buildable envelope's edges (longest frontage first) instead of a
  // centered grid. On jagged real parcels the grid found no valid cells and
  // collapsed to one shrunken fallback building; edge bars size themselves to
  // each frontage. The grid below remains the fallback filler.
  {
    const need = Math.max(0, effectiveNumBuildings - pinned.length);
    const edgeBars = placeBarsAlongEdges(envelope, {
      widthM: defaultWidthM,
      depthM: defaultDepthM,
      count: need,
      buildingType,
      avoidFootprints: pinnedFootprints,
      preferredBearingDeg: frontBearingDeg,
    });
    for (const bar of edgeBars) {
      initialBuildings.push(bar);
      placedFootprints.push(buildBuildingFootprint(bar));
    }
    buildingNum = edgeBars.length;
  }

  for (const pos of candidatePositions) {
    if (initialBuildings.length >= Math.max(effectiveNumBuildings, pinned.length)) break;
    const spec = createBuildingSpec(
      `building-${++buildingNum}`,
      pos, undefined, undefined, undefined, buildingType
    );
    spec.rotationRad = edgeAngleRad;
    const footprint = buildBuildingFootprint(spec);
    const inside = footprint.coordinates[0].every(
      ([vx, vy]) => isPointInPolygon([vx, vy], envelope.coordinates[0])
    );
    if (inside && !overlapsPlaced(footprint)) {
      initialBuildings.push(spec);
      placedFootprints.push(footprint);
    }
  }

  // Fallback: one building at envelope centroid, sized to fit
  if (initialBuildings.length === 0) {
    const spec = createBuildingSpec(
      'building-1',
      { x: envCenterX, y: envCenterY },
      Math.min(defaultWidthM, envW * 0.5),
      Math.min(defaultDepthM, envH * 0.5),
      undefined, buildingType
    );
    spec.rotationRad = edgeAngleRad;
    initialBuildings.push(spec);
  }

  // ── Size floors so the achieved FAR tracks the target (ALL paths). SA never
  // mutates floor count, so seeding with sized floors is strictly better — and
  // it makes the SA seed identical to the constructive solve, guaranteeing
  // "Generate" can only improve on the auto-plan.
  {
    const placedFootprintM2 = initialBuildings.reduce(
      (s, b) => s + correctedAreaM2(buildBuildingFootprint(b)), 0
    );
    const envCorrectedM2 = correctedAreaM2(envelope);
    const coverage = envCorrectedM2 > 0 ? placedFootprintM2 / envCorrectedM2 : 0;
    if (coverage > 0) {
      // Ground floor 14ft + 10ft per upper floor ≤ maxHeightFt.
      const maxFloorsByHeight = effMaxHeightFt
        ? Math.max(1, Math.floor((effMaxHeightFt - 4) / 10))
        : 100;
      // Compliance cap: never let rounding push achieved FAR past the max FAR
      // (mirrors how the coverage-driven count caps at maxCoveragePct).
      const maxFloorsByFar = effMaxFar != null
        ? Math.max(1, Math.floor(effMaxFar / coverage + 1e-9))
        : Infinity;
      // WO-0d: COVERAGE CLAMP CLIMBS THE STORIES LADDER. When the footprint
      // is coverage-capped, the way to the max-buildout GSF is UP — floors
      // target ceil(maxGsf / placedFootprint), capped only by height/FAR.
      // Precedent stories are FORM EVIDENCE and never cap quantity once a
      // max-buildout target exists (same doctrine as the server generator).
      const placedFootprintSqft = placedFootprintM2 * SQM_TO_SQFT_CONST;
      const ladderStories = input.solverBrief?.massingProgram?.stories
        ?? input.solverBrief?.maxBuildout?.atStories ?? null;
      let targetFloors: number;
      if (maxGsfSqft != null && maxGsfSqft > 0 && placedFootprintSqft > 0) {
        targetFloors = Math.ceil(maxGsfSqft / placedFootprintSqft);
        if (ladderStories != null && ladderStories > 0) {
          targetFloors = Math.min(targetFloors, Math.max(1, Math.round(ladderStories)));
        }
      } else {
        targetFloors = Math.round(targetFAR / coverage);
      }
      let precedentFloorsCap = Infinity;
      const precStories = input.solverBrief?.precedent;
      if (
        maxGsfSqft == null &&
        precStories?.storiesP50 != null &&
        precStories?.storiesP75 != null &&
        (precStories.sampleSize ?? 0) >= 5
      ) {
        precedentFloorsCap = Math.max(2, Math.round((precStories.storiesP50 + precStories.storiesP75) / 2));
      }
      const floors = Math.max(1, Math.min(
        maxFloorsByHeight,
        maxFloorsByFar,
        targetFloors,
        precedentFloorsCap
      ));
      // Pinned buildings keep their own floor count (dimensions are sovereign).
      for (const b of initialBuildings) {
        if (!b.locked?.dimensions) b.floors = floors;
      }
    }
  }

  // ── 2. Pre-compute cached values for fast scoring ───────────────────────
  const siteAreaM2 = areaM2(envelope);
  const siteAreaSqft = correctedAreaM2(envelope) * SQM_TO_SQFT;
  const maxReasonableUnits = Math.max(1, Math.floor(siteAreaSqft * 3 * 0.85 / 720));
  const cached = { siteAreaM2: siteAreaM2, siteAreaSqft, maxReasonableUnits, maxGsfSqft };

  // Context objective weights (when compiled) replace the hardcoded constants
  // for EVERY score in this run — SA acceptance, best tracking, and finals.
  // WO-0c: with a max-buildout target, capture becomes the primary component.
  const weights = applyCapturePrimary(resolveScoreWeights(input.solverBrief), maxGsfSqft != null && maxGsfSqft > 0);

  // ── 3. Simulated annealing loop (fast — score only, no element building) ─
  let currentBuildings = cloneBuildings(initialBuildings);
  let { score: currentScore } = scoreOnly(envelope, currentBuildings, parkingSpec, zoningLimits, cached, weights, prec);

  let bestBuildings = cloneBuildings(currentBuildings);
  let bestScore = currentScore;

  // Track top-N alternative building configs (score + buildings only, no elements)
  const topN: Array<{ buildings: BuildingSpec[]; score: number }> = [
    { buildings: cloneBuildings(currentBuildings), score: currentScore }
  ];

  const T_START = 1.0;
  const T_END = 0.01;

  for (let iter = 0; iter < maxIterations; iter++) {
    const temperature = T_START * Math.pow(T_END / T_START, iter / maxIterations);

    // Clone current state
    const candidateBuildings = cloneBuildings(currentBuildings);

    // Pick a random mutation
    const mutationType = rng();
    const buildingIdx = Math.floor(rng() * candidateBuildings.length);

    if (mutationType < 0.35) {
      candidateBuildings[buildingIdx] = mutateMove(candidateBuildings[buildingIdx], rng);
    } else if (mutationType < 0.6) {
      candidateBuildings[buildingIdx] = mutateResize(candidateBuildings[buildingIdx], rng);
    } else if (mutationType < 0.8) {
      candidateBuildings[buildingIdx] = mutateRotate(candidateBuildings[buildingIdx], rng);
    } else if (mutationType < 0.9 && candidateBuildings.length < effectiveNumBuildings * 1.5) {
      const newId = `building-${candidateBuildings.length + 1}`;
      candidateBuildings.push(
        createBuildingSpec(
          newId,
          {
            x: envCenterX + randomInRange(rng, -20, 20),
            y: envCenterY + randomInRange(rng, -20, 20)
          },
          undefined, undefined, undefined,
          buildingType
        )
      );
    } else if (candidateBuildings.length > Math.max(1, Math.floor(effectiveNumBuildings * 0.5))) {
      // Remove a building — but never a user-pinned one.
      const removable: number[] = [];
      for (let i = 0; i < candidateBuildings.length; i++) {
        if (!candidateBuildings[i].locked?.position) removable.push(i);
      }
      if (removable.length > 0) {
        candidateBuildings.splice(removable[Math.floor(rng() * removable.length)], 1);
      } else {
        candidateBuildings[buildingIdx] = mutateMove(candidateBuildings[buildingIdx], rng);
      }
    } else {
      candidateBuildings[buildingIdx] = mutateMove(candidateBuildings[buildingIdx], rng);
    }

    // Fast score (no element building, no pro forma, no boolean ops)
    const { score: candidateScore } = scoreOnly(
      envelope, candidateBuildings, parkingSpec, zoningLimits, cached, weights, prec
    );

    // Accept/reject
    const scoreDiff = candidateScore - currentScore;
    const accept = scoreDiff > 0 || rng() < Math.exp(scoreDiff / temperature);

    if (accept) {
      currentBuildings = candidateBuildings;
      currentScore = candidateScore;

      if (candidateScore > bestScore) {
        bestBuildings = cloneBuildings(candidateBuildings);
        bestScore = candidateScore;
      }

      // Track top-N alternatives (buildings only — elements built at end)
      topN.push({ buildings: cloneBuildings(candidateBuildings), score: candidateScore });
      topN.sort((a, b) => b.score - a.score);
      const deduped: typeof topN = [];
      for (const entry of topN) {
        const isDup = deduped.some(d => Math.abs(d.score - entry.score) < 0.01);
        if (!isDup) deduped.push(entry);
        if (deduped.length >= 4) break;
      }
      topN.length = 0;
      topN.push(...deduped);
    }

    // Progress callback
    if (onProgress && (iter % 50 === 0 || iter === maxIterations - 1)) {
      onProgress(iter, currentScore);
    }
  }

  // ── 4. Build full results only for best + top 3 (expensive, but only ~4 calls) ─
  // Zero-overlap gate: every candidate is validated before it can be returned.
  // An invalid best is replaced by the best VALID alternative; invalid
  // alternatives are dropped and reported (never rendered).
  const rejectedReasons: string[] = [];

  let bestResult = computeFullResult(envelope, bestBuildings, parkingSpec, zoningLimits, parkingQuotas, weights, prec, maxGsfSqft);
  let bestSpecs = bestBuildings;
  let bestValidation = validatePlanElements(bestResult.elements);

  const rankedAlternatives = topN
    .filter(a => Math.abs(a.score - bestScore) > 0.005)
    .slice(0, 3)
    .map(a => ({
      buildings: a.buildings,
      full: computeFullResult(envelope, a.buildings, parkingSpec, zoningLimits, parkingQuotas, weights, prec, maxGsfSqft),
    }))
    .map(a => ({ ...a, validation: validatePlanElements(a.full.elements) }));

  if (!bestValidation.ok) {
    rejectedReasons.push(rejectionChip(bestValidation));
    const promoted = rankedAlternatives.find(a => a.validation.ok);
    if (promoted) {
      bestResult = promoted.full;
      bestSpecs = promoted.buildings;
      bestValidation = promoted.validation;
    }
  }

  const top3Alternatives = rankedAlternatives
    .filter(a => {
      if (!a.validation.ok) {
        rejectedReasons.push(rejectionChip(a.validation));
        return false;
      }
      return a.full !== bestResult;
    })
    .map(a => ({
      elements: a.full.elements,
      metrics: a.full.metrics,
      violations: a.full.violations,
      score: a.full.score,
    }));

  if (!bestValidation.ok) {
    // Nothing valid survived: an explicit rejection, never rendered garbage.
    return {
      bestElements: [],
      bestMetrics: bestResult.metrics,
      bestViolations: [
        ...bestResult.violations,
        {
          code: 'geometry-overlap',
          message: `Plan rejected: ${bestValidation.reason ?? 'overlapping geometry'} — re-solving`,
          severity: 'error',
        },
      ],
      bestBuildings: [],
      top3Alternatives: [],
      iterations: maxIterations,
      finalScore: 0,
      rejected: { count: rejectedReasons.length, reasons: rejectedReasons },
      contract: input.solverBrief ? { briefFieldsUsed, legacyFieldsUsed } : undefined,
    };
  }

  return {
    bestElements: bestResult.elements,
    bestMetrics: bestResult.metrics,
    bestViolations: bestResult.violations,
    bestBuildings: bestSpecs,
    top3Alternatives,
    iterations: maxIterations,
    finalScore: bestScore,
    rejected: rejectedReasons.length
      ? { count: rejectedReasons.length, reasons: rejectedReasons }
      : undefined,
    contract: input.solverBrief ? { briefFieldsUsed, legacyFieldsUsed } : undefined,
  };
}

/**
 * Deterministic constructive solve — a single pass with no simulated annealing.
 *
 * Generates the target-FAR-driven initial grid layout and evaluates it once
 * (parking, feasibility, pro forma). Fast (no SA loop) and fully reproducible,
 * so it's suitable for live re-solving as the user moves parameter sliders.
 * Use optimize() (with iterations) to refine/explore from there.
 */
export function solveConstructive(input: Omit<OptimizeInput, 'maxIterations'>): OptimizeResult {
  return optimize({ ...input, maxIterations: 0 });
}
