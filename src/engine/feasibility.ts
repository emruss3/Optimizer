import type { Polygon } from 'geojson';
import { areaM2, intersection, polygons } from './geometry';
import type { FeasibilityViolation } from './types';

type BuildingFootprint = {
  id: string;
  footprint: Polygon;
  floors: number;
};

type FeasibilityInput = {
  envelope: Polygon;
  buildings: BuildingFootprint[];
  parkingSolution: { stallsAchieved: number } | null;
  zoningLimits: {
    maxFar?: number;
    maxCoveragePct?: number;
    parkingRatio?: number;
  };
};

type FeasibilityResult = {
  far: number;
  coverage: number;
  gfaSqft: number;
  footprintSqft: number;
  stallsProvided: number;
  stallsRequired: number;
  violations: FeasibilityViolation[];
};

const SQM_TO_SQFT = 10.7639;

const intersectionAreaM2 = (a: Polygon, b: Polygon): number => {
  const intersected = intersection(a, b);
  const polys = polygons(intersected);
  return polys.reduce((sum, poly) => sum + areaM2(poly), 0);
};

export function computeFeasibility({
  envelope,
  buildings,
  parkingSolution,
  zoningLimits
}: FeasibilityInput): FeasibilityResult {
  const siteAreaM2 = areaM2(envelope);
  const footprintAreaM2 = buildings.reduce((sum, b) => sum + areaM2(b.footprint), 0);
  const gfaM2 = buildings.reduce((sum, b) => sum + areaM2(b.footprint) * Math.max(1, b.floors), 0);

  const gfaSqft = gfaM2 * SQM_TO_SQFT;
  const footprintSqft = footprintAreaM2 * SQM_TO_SQFT;
  const far = siteAreaM2 > 0 ? gfaM2 / siteAreaM2 : 0;
  const coverage = siteAreaM2 > 0 ? footprintAreaM2 / siteAreaM2 : 0;

  const units = Math.floor(gfaSqft / 800);
  const parkingRatio = zoningLimits.parkingRatio ?? 1.5;
  const stallsRequired = Math.ceil(units * parkingRatio);
  const stallsProvided = parkingSolution?.stallsAchieved ?? 0;

  const violations: FeasibilityViolation[] = [];

  if (zoningLimits.maxFar != null && far > zoningLimits.maxFar) {
    violations.push({
      code: 'farExceeded',
      message: `FAR ${far.toFixed(2)} exceeds maximum ${zoningLimits.maxFar}`,
      delta: far - zoningLimits.maxFar,
      severity: 'error'
    });
  }

  if (zoningLimits.maxCoveragePct != null && coverage * 100 > zoningLimits.maxCoveragePct) {
    violations.push({
      code: 'coverageExceeded',
      message: `Coverage ${(coverage * 100).toFixed(1)}% exceeds maximum ${zoningLimits.maxCoveragePct}%`,
      delta: coverage * 100 - zoningLimits.maxCoveragePct,
      severity: 'error'
    });
  }

  if (stallsProvided < stallsRequired) {
    violations.push({
      code: 'parkingShortfall',
      message: `Parking shortfall: ${stallsRequired - stallsProvided} stalls`,
      delta: stallsRequired - stallsProvided,
      severity: 'error'
    });
  }

  const overlappingIds = new Set<string>();
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      const overlapArea = intersectionAreaM2(buildings[i].footprint, buildings[j].footprint);
      if (overlapArea > 0.5) {
        overlappingIds.add(buildings[i].id);
        overlappingIds.add(buildings[j].id);
      }
    }
  }

  if (overlappingIds.size > 0) {
    violations.push({
      code: 'buildingOverlap',
      message: `Building overlap detected (${overlappingIds.size} buildings)`,
      severity: 'error'
    });
  }

  for (const building of buildings) {
    const footprintArea = areaM2(building.footprint);
    const insideArea = intersectionAreaM2(envelope, building.footprint);
    const outsideArea = Math.max(0, footprintArea - insideArea);

    if (outsideArea > 0.5) {
      violations.push({
        code: 'buildingOutsideEnvelope',
        message: `Building ${building.id} extends outside envelope`,
        delta: outsideArea,
        severity: 'error'
      });
    }
  }

  return {
    far,
    coverage,
    gfaSqft,
    footprintSqft,
    stallsProvided,
    stallsRequired,
    violations
  };
}
