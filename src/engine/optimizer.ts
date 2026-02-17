// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { Polygon } from 'geojson';
import type { Element, PlannerConfig, PlannerOutput, FeasibilityViolation } from './types';
import type { BuildingSpec, BuildingType, PlanState, UnitMixEntry } from './model';
import { createBuildingSpec, typologyToBuildingType, generateDefaultUnitMix, totalUnitsFromMix } from './model';
import { buildBuildingFootprint, clampBuildingToEnvelope } from './buildingGeometry';
import { solveParkingBayPacking } from './parkingBaySolver';
import { computeFeasibility } from './feasibility';
import { computeProForma } from './proforma';
import { areaM2, correctedAreaM2, mercatorCorrectionFactor, normalizeToPolygon, safeBbox, intersection, difference, polygons } from './geometry';

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
  /** Max iterations (default 500) */
  maxIterations?: number;
  /** Callback for progress reporting */
  onProgress?: (iteration: number, score: number) => void;
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
};

const SQM_TO_SQFT = 10.7639;

// ─── helpers ─────────────────────────────────────────────────────────────────

function cloneBuildings(buildings: BuildingSpec[]): BuildingSpec[] {
  return buildings.map(b => ({ ...b, anchor: { ...b.anchor }, locked: b.locked ? { ...b.locked } : undefined }));
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
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
  cached: { siteAreaM2: number; siteAreaSqft: number; maxReasonableUnits: number }
): { score: number; clampedBuildings: BuildingSpec[] } {
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
      : generateDefaultUnitMix(gfaSqft);
    return { id: spec.id, footprint, floors: spec.floors, unitMix };
  });

  // Estimate units for parking cap
  const estUnits = buildingFootprints.reduce(
    (sum, b) => sum + (b.unitMix?.reduce((s, e) => s + e.count, 0) ?? 0), 0
  );
  const targetRatio = zoningLimits.parkingRatio ?? 1.5;
  const maxStalls = estUnits > 0 ? Math.ceil(estUnits * targetRatio * 1.1) : undefined;

  // Solve parking
  const parkingSolution = solveParkingBayPacking(
    envelope,
    buildingFootprints.map(b => b.footprint),
    parkingSpec,
    maxStalls
  );

  const parkingAreaM2 = parkingSolution.bays.reduce((s, b) => s + areaM2(b), 0) +
    parkingSolution.aisles.reduce((s, a) => s + areaM2(a), 0);

  // Feasibility (lightweight — no element building)
  const feasibility = computeFeasibility({
    envelope,
    buildings: buildingFootprints,
    parkingSolution,
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
  const footprintAreaM2 = buildingFootprints.reduce((s, b) => s + areaM2(b.footprint), 0);
  const circulationAreaM2 = parkingSolution.circulationAreaSqM ?? 0;
  const usedArea = footprintAreaM2 + parkingAreaM2 + circulationAreaM2;
  const openSpacePct = cached.siteAreaM2 > 0 ? Math.max(0, 1 - usedArea / cached.siteAreaM2) : 0;
  const openSpaceScore = Math.min(1, openSpacePct * 2);

  // 6. No violations bonus
  const errorViolations = feasibility.violations.filter(v => v.severity === 'error');
  const noViolationsScore = errorViolations.length === 0 ? 1 : 0;

  // 7. Yield on cost — SKIP during iterations (expensive), use a quick heuristic
  // Rough proxy: higher GFA + lower cost ≈ higher yield. Normalize via FAR score.
  const yieldOnCostScore = farScore * 0.5 + unitScore * 0.5; // cheap proxy

  const totalScore =
    WEIGHTS.unitCount * unitScore +
    WEIGHTS.parkingCompliance * parkingScore +
    WEIGHTS.farUtilization * farScore +
    WEIGHTS.coverageCompliance * coverageScore +
    WEIGHTS.openSpace * openSpaceScore +
    WEIGHTS.noViolations * noViolationsScore +
    WEIGHTS.yieldOnCost * yieldOnCostScore;

  return { score: totalScore, clampedBuildings: clamped };
}

/**
 * FULL scoring — builds elements, metrics, pro forma.
 * Used only for the final best result and top-3 alternatives (called ~4 times total).
 */
function computeFullResult(
  envelope: Polygon,
  buildings: BuildingSpec[],
  parkingSpec: { stallW: number; stallD: number; aisleW: number; anglesDeg: number[] },
  zoningLimits: { maxFar?: number; maxCoveragePct?: number; parkingRatio?: number }
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
      : generateDefaultUnitMix(gfaSqft);
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

  const totalScore =
    WEIGHTS.unitCount * unitScore +
    WEIGHTS.parkingCompliance * parkingScore +
    WEIGHTS.farUtilization * farScore +
    WEIGHTS.coverageCompliance * coverageScore +
    WEIGHTS.openSpace * openSpaceScore +
    WEIGHTS.noViolations * noViolationsScore +
    WEIGHTS.yieldOnCost * yieldOnCostScore;

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

  const metrics: PlannerOutput['metrics'] = {
    totalBuiltSF: feasibility.gfaSqft,
    siteCoveragePct: feasibility.coverage * 100,
    achievedFAR: feasibility.far,
    parkingRatio,
    openSpacePct: openSpacePct * 100,
    stallsProvided: feasibility.stallsProvided,
    stallsRequired: feasibility.stallsRequired,
    parkingAngleDeg: parkingSolution.chosenAngleDeg,
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
  buildingFootprints: Array<{ id: string; footprint: Polygon; floors: number }>,
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
        floors: building.floors
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

function mutateMove(building: BuildingSpec): BuildingSpec {
  if (building.locked?.position) return building;
  const shift = randomInRange(5, 20);
  const angle = Math.random() * Math.PI * 2;
  return {
    ...building,
    anchor: {
      x: building.anchor.x + Math.cos(angle) * shift,
      y: building.anchor.y + Math.sin(angle) * shift
    }
  };
}

function mutateResize(building: BuildingSpec): BuildingSpec {
  if (building.locked?.dimensions) return building;
  const dw = randomInRange(-10, 10);
  const dd = randomInRange(-10, 10);
  return {
    ...building,
    widthM: Math.max(5, building.widthM + dw),
    depthM: Math.max(5, building.depthM + dd)
  };
}

function mutateRotate(building: BuildingSpec): BuildingSpec {
  if (building.locked?.rotation) return building;
  const dAngle = randomInRange(-30, 30) * (Math.PI / 180);
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
  } = input;

  const buildingType = typologyToBuildingType(designParams.buildingTypology);
  const numBuildings = designParams.numBuildings ?? 2;

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

  // ── 1. Generate initial layout ──────────────────────────────────────────
  const edge = longestEdge(envelope);
  const [sx, sy] = edge.start;
  const [dx, dy] = edge.dir;
  const bbox = safeBbox(envelope);
  const envCenterX = (bbox[0] + bbox[2]) / 2;
  const envCenterY = (bbox[1] + bbox[3]) / 2;

  // Normal to longest edge (perpendicular, inward)
  const nx = -dy;
  const ny = dx;
  // Offset inward by some amount
  const insetDist = Math.min(edge.len * 0.1, 20);

  const initialBuildings: BuildingSpec[] = [];
  for (let i = 0; i < numBuildings; i++) {
    const t = (i + 1) / (numBuildings + 1); // evenly spaced along edge
    const px = sx + dx * edge.len * t + nx * insetDist;
    const py = sy + dy * edge.len * t + ny * insetDist;
    initialBuildings.push(
      createBuildingSpec(
        `building-${i + 1}`,
        { x: px, y: py },
        undefined, undefined, undefined,
        buildingType
      )
    );
  }

  // ── 2. Pre-compute cached values for fast scoring ───────────────────────
  const siteAreaM2 = areaM2(envelope);
  const siteAreaSqft = correctedAreaM2(envelope) * SQM_TO_SQFT;
  const maxReasonableUnits = Math.max(1, Math.floor(siteAreaSqft * 3 * 0.85 / 720));
  const cached = { siteAreaM2: siteAreaM2, siteAreaSqft, maxReasonableUnits };

  // ── 3. Simulated annealing loop (fast — score only, no element building) ─
  let currentBuildings = cloneBuildings(initialBuildings);
  let { score: currentScore } = scoreOnly(envelope, currentBuildings, parkingSpec, zoningLimits, cached);

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
    const mutationType = Math.random();
    const buildingIdx = Math.floor(Math.random() * candidateBuildings.length);

    if (mutationType < 0.35) {
      candidateBuildings[buildingIdx] = mutateMove(candidateBuildings[buildingIdx]);
    } else if (mutationType < 0.6) {
      candidateBuildings[buildingIdx] = mutateResize(candidateBuildings[buildingIdx]);
    } else if (mutationType < 0.8) {
      candidateBuildings[buildingIdx] = mutateRotate(candidateBuildings[buildingIdx]);
    } else if (mutationType < 0.9 && candidateBuildings.length < numBuildings) {
      const newId = `building-${candidateBuildings.length + 1}`;
      candidateBuildings.push(
        createBuildingSpec(
          newId,
          {
            x: envCenterX + randomInRange(-20, 20),
            y: envCenterY + randomInRange(-20, 20)
          },
          undefined, undefined, undefined,
          buildingType
        )
      );
    } else if (candidateBuildings.length > 1) {
      candidateBuildings.splice(buildingIdx, 1);
    } else {
      candidateBuildings[buildingIdx] = mutateMove(candidateBuildings[buildingIdx]);
    }

    // Fast score (no element building, no pro forma, no boolean ops)
    const { score: candidateScore } = scoreOnly(
      envelope, candidateBuildings, parkingSpec, zoningLimits, cached
    );

    // Accept/reject
    const scoreDiff = candidateScore - currentScore;
    const accept = scoreDiff > 0 || Math.random() < Math.exp(scoreDiff / temperature);

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
  const bestResult = computeFullResult(envelope, bestBuildings, parkingSpec, zoningLimits);

  const top3Alternatives = topN
    .filter(a => Math.abs(a.score - bestScore) > 0.005)
    .slice(0, 3)
    .map(a => {
      const full = computeFullResult(envelope, a.buildings, parkingSpec, zoningLimits);
      return {
        elements: full.elements,
        metrics: full.metrics,
        violations: full.violations,
        score: full.score
      };
    });

  return {
    bestElements: bestResult.elements,
    bestMetrics: bestResult.metrics,
    bestViolations: bestResult.violations,
    bestBuildings: bestBuildings,
    top3Alternatives,
    iterations: maxIterations,
    finalScore: bestScore
  };
}
