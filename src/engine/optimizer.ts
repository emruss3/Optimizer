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
};

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
function scorePrecedentFit(
  precedent: WorkerSolverBrief['precedent'],
  avgBarFootprintSqft: number,
  coveragePct: number,
  avgFloors: number
): number {
  if (!precedent) return 0.5;
  return (
    0.5 * similarity(avgBarFootprintSqft, precedent.footprintP75SqFt) +
    0.25 * similarity(coveragePct, precedent.coverageP75Pct) +
    0.25 * similarity(avgFloors, precedent.storiesP75)
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
  cached: { siteAreaM2: number; siteAreaSqft: number; maxReasonableUnits: number },
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

  // 8. Precedent fit — similarity to the local Regrid built form (only scored
  // when the context's objective weights ask for it)
  let precedentFitScore = 0;
  if (weights.precedentFit > 0) {
    const avgBarFpSqft = clamped.length > 0
      ? (buildingFootprintTotal / clamped.length) * SQM_TO_SQFT
      : 0;
    const coveragePct = cached.siteAreaM2 > 0 ? (100 * buildingFootprintTotal) / cached.siteAreaM2 : 0;
    const avgFloors = clamped.length > 0
      ? clamped.reduce((s, b) => s + Math.max(1, b.floors), 0) / clamped.length
      : 0;
    precedentFitScore = scorePrecedentFit(precedent, avgBarFpSqft, coveragePct, avgFloors);
  }

  const totalScore =
    weights.unitCount * unitScore +
    weights.parkingCompliance * parkingScore +
    weights.farUtilization * farScore +
    weights.coverageCompliance * coverageScore +
    weights.openSpace * openSpaceScore +
    weights.noViolations * noViolationsScore +
    weights.yieldOnCost * yieldOnCostScore +
    weights.precedentFit * precedentFitScore;

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
  precedent?: WorkerSolverBrief['precedent']
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
    const avgBarFpSqft = buildingFootprints.length > 0
      ? (footprintAreaM2 / buildingFootprints.length) * SQM_TO_SQFT
      : 0;
    const avgFloors = buildingFootprints.length > 0
      ? buildingFootprints.reduce((s, b) => s + Math.max(1, b.floors), 0) / buildingFootprints.length
      : 0;
    precedentFitScore = scorePrecedentFit(precedent, avgBarFpSqft, feasibility.coverage * 100, avgFloors);
  }

  const totalScore =
    weights.unitCount * unitScore +
    weights.parkingCompliance * parkingScore +
    weights.farUtilization * farScore +
    weights.coverageCompliance * coverageScore +
    weights.openSpace * openSpaceScore +
    weights.noViolations * noViolationsScore +
    weights.yieldOnCost * yieldOnCostScore +
    weights.precedentFit * precedentFitScore;

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

  // Auto-calculate how many buildings are needed to achieve target FAR.
  // Honor the user's target FAR (the slider) and fall back to the zoning max.
  // zoning.maxFar remains the COMPLIANCE cap, enforced in computeFeasibility.
  const SQM_TO_SQFT_CONST = 10.7639;
  const envelopeAreaSqft = correctedAreaM2(envelope) * SQM_TO_SQFT_CONST;
  const targetFAR = designParams.targetFAR ?? zoning.maxFar ?? 1.5;
  const targetGFA = envelopeAreaSqft * targetFAR;
  const defaultFloors = 3;
  const defaultBuildingFootprintSqft = (200 * 0.3048) * (60 * 0.3048) * SQM_TO_SQFT_CONST; // ~12,000 sqft
  const calculatedNumBuildings = Math.max(1, Math.min(8, Math.ceil(targetGFA / (defaultBuildingFootprintSqft * defaultFloors))));
  const numBuildings = designParams.numBuildings === undefined
    ? calculatedNumBuildings
    : designParams.numBuildings; // Use explicit value directly

  const parkingSpec = input.parkingSpec ?? {
    stallW: 2.7432,  // 9ft
    stallD: 5.4864,  // 18ft
    aisleW: 7.3152,  // 24ft
    anglesDeg: [0, 60, 90]
  };

  const zoningLimits = {
    maxFar: zoning.maxFar,
    maxCoveragePct: zoning.maxCoveragePct,
    parkingRatio: zoning.minParkingRatio ?? 1.5
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

  // Align building rotation to the longest edge
  const edgeAngleRad = Math.atan2(edge.dir[1], edge.dir[0]);

  // Calculate how many buildings can actually fit physically.
  // Regrid built-form priors (planner_context_v2, sample ≥ 5): local geometry
  // seeds bar depth/length as SOFT priors, clamped to the multifamily
  // constructable range — the same initialization rules the server generator
  // uses. Legal constraints stay hard; priors never exceed them.
  const prec = input.solverBrief?.precedent;
  const hasPrecedentPrior = (prec?.sampleSize ?? 0) >= 5;
  // Depth: local median, clamped to the MF constructable range (45–72 ft —
  // double-loaded corridor depths that can actually be built).
  let defaultDepthFt = 60;
  if (hasPrecedentPrior && prec?.depthP50Ft != null && prec.depthP50Ft > 0) {
    defaultDepthFt = Math.min(72, Math.max(45, Math.round(prec.depthP50Ft)));
  }
  const defaultDepthM = defaultDepthFt * 0.3048;
  // Length: local 75th percentile clamped to 90–300 ft; when v2 length data
  // is absent, the v1 footprint-p90-at-depth heuristic remains the fallback.
  let defaultWidthFt = 200;
  if (hasPrecedentPrior && prec?.lengthP75Ft != null && prec.lengthP75Ft > 0) {
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

  // Constructive fast path: let target COVERAGE drive the building count (FAR
  // then drives floors below). Buildings sit in spaced grid cells, so a
  // coverage-driven count stays overlap-free — no scaling/clamp churn. Uses raw
  // EPSG:3857 areas so the ratio matches feasibility's coverage (Mercator cancels).
  // An explicitly requested numBuildings always wins over the coverage target.
  if (maxIterations === 0 && designParams.numBuildings == null) {
    const maxCov = (zoning.maxCoveragePct ?? 60) / 100;
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
      const maxFloorsByHeight = zoning.maxHeightFt
        ? Math.max(1, Math.floor((zoning.maxHeightFt - 4) / 10))
        : 100;
      // Compliance cap: never let rounding push achieved FAR past zoning.maxFar
      // (mirrors how the coverage-driven count caps at maxCoveragePct).
      const maxFloorsByFar = zoning.maxFar != null
        ? Math.max(1, Math.floor(zoning.maxFar / coverage + 1e-9))
        : Infinity;
      // Precedent stories prior (same rule as the server generator): p50–p75
      // midpoint, min 2 for MF viability — a CAP on the legal/FAR-driven
      // count, never a way to exceed it.
      let precedentFloorsCap = Infinity;
      const precStories = input.solverBrief?.precedent;
      if (
        precStories?.storiesP50 != null &&
        precStories?.storiesP75 != null &&
        (precStories.sampleSize ?? 0) >= 5
      ) {
        precedentFloorsCap = Math.max(2, Math.round((precStories.storiesP50 + precStories.storiesP75) / 2));
      }
      const floors = Math.max(1, Math.min(
        maxFloorsByHeight,
        maxFloorsByFar,
        Math.round(targetFAR / coverage),
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
  const cached = { siteAreaM2: siteAreaM2, siteAreaSqft, maxReasonableUnits };

  // Context objective weights (when compiled) replace the hardcoded constants
  // for EVERY score in this run — SA acceptance, best tracking, and finals.
  const weights = resolveScoreWeights(input.solverBrief);

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

  let bestResult = computeFullResult(envelope, bestBuildings, parkingSpec, zoningLimits, parkingQuotas, weights, prec);
  let bestSpecs = bestBuildings;
  let bestValidation = validatePlanElements(bestResult.elements);

  const rankedAlternatives = topN
    .filter(a => Math.abs(a.score - bestScore) > 0.005)
    .slice(0, 3)
    .map(a => ({
      buildings: a.buildings,
      full: computeFullResult(envelope, a.buildings, parkingSpec, zoningLimits, parkingQuotas, weights, prec),
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
