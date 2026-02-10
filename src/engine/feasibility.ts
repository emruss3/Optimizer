import type { Polygon } from 'geojson';
import { areaM2, intersection, polygons } from './geometry';
import type { FeasibilityViolation } from './types';
import type { UnitMixEntry } from './model';
import { totalUnitsFromMix } from './model';

type BuildingFootprint = {
  id: string;
  footprint: Polygon;
  floors: number;
  /** Unit mix for this building (if computed) */
  unitMix?: UnitMixEntry[];
};

type FeasibilityInput = {
  envelope: Polygon;
  buildings: BuildingFootprint[];
  parkingSolution: { stallsAchieved: number } | null;
  /** Area used by parking (bays + aisles) in sq metres */
  parkingAreaM2?: number;
  zoningLimits: {
    maxFar?: number;
    maxCoveragePct?: number;
    parkingRatio?: number;
    maxHeightFt?: number;
    maxDensityDuPerAcre?: number;
    maxImperviousPct?: number;
    minOpenSpacePct?: number;
  };
  /** Total parcel area in acres (for density calc). Derived from envelope if omitted. */
  parcelAcres?: number;
};

type FeasibilityResult = {
  far: number;
  coverage: number;
  gfaSqft: number;
  footprintSqft: number;
  stallsProvided: number;
  stallsRequired: number;
  totalUnits: number;
  violations: FeasibilityViolation[];
};

const SQM_TO_SQFT = 10.7639;
const SQM_TO_ACRES = 0.000247105;

const intersectionAreaM2 = (a: Polygon, b: Polygon): number => {
  const intersected = intersection(a, b);
  const polys = polygons(intersected);
  return polys.reduce((sum, poly) => sum + areaM2(poly), 0);
};

export function computeFeasibility({
  envelope,
  buildings,
  parkingSolution,
  parkingAreaM2: parkingAreaParam,
  zoningLimits
}: FeasibilityInput): FeasibilityResult {
  const siteAreaM2 = areaM2(envelope);
  const footprintAreaM2 = buildings.reduce((sum, b) => sum + areaM2(b.footprint), 0);
  const gfaM2 = buildings.reduce((sum, b) => sum + areaM2(b.footprint) * Math.max(1, b.floors), 0);

  const gfaSqft = gfaM2 * SQM_TO_SQFT;
  const footprintSqft = footprintAreaM2 * SQM_TO_SQFT;
  const far = siteAreaM2 > 0 ? gfaM2 / siteAreaM2 : 0;
  const coverage = siteAreaM2 > 0 ? footprintAreaM2 / siteAreaM2 : 0;

  // ── Unit count from actual unit mixes (no more /800 assumption) ──────────
  const totalUnits = buildings.reduce((sum, b) => sum + totalUnitsFromMix(b.unitMix), 0)
    || Math.max(1, Math.floor(gfaSqft * 0.85 / 720)); // fallback: weighted avg sqft

  const parkingRatio = zoningLimits.parkingRatio ?? 1.5;
  const stallsRequired = Math.ceil(totalUnits * parkingRatio);
  const stallsProvided = parkingSolution?.stallsAchieved ?? 0;

  const violations: FeasibilityViolation[] = [];

  // ── FAR ──────────────────────────────────────────────────────────────────
  if (zoningLimits.maxFar != null && far > zoningLimits.maxFar) {
    violations.push({
      code: 'farExceeded',
      message: `FAR ${far.toFixed(2)} exceeds maximum ${zoningLimits.maxFar}`,
      delta: far - zoningLimits.maxFar,
      severity: 'error'
    });
  }

  // ── Coverage ─────────────────────────────────────────────────────────────
  if (zoningLimits.maxCoveragePct != null && coverage * 100 > zoningLimits.maxCoveragePct) {
    violations.push({
      code: 'coverageExceeded',
      message: `Coverage ${(coverage * 100).toFixed(1)}% exceeds maximum ${zoningLimits.maxCoveragePct}%`,
      delta: coverage * 100 - zoningLimits.maxCoveragePct,
      severity: 'error'
    });
  }

  // ── Parking shortfall ────────────────────────────────────────────────────
  if (stallsProvided < stallsRequired) {
    violations.push({
      code: 'parkingShortfall',
      message: `Parking shortfall: ${stallsRequired - stallsProvided} stalls`,
      delta: stallsRequired - stallsProvided,
      severity: 'error'
    });
  }

  // ── HEIGHT_EXCEEDED ──────────────────────────────────────────────────────
  if (zoningLimits.maxHeightFt != null) {
    for (const building of buildings) {
      // Ground floor 14ft, upper floors 10ft each
      const heightFt = building.floors <= 1
        ? 14
        : 14 + (building.floors - 1) * 10;
      if (heightFt > zoningLimits.maxHeightFt) {
        violations.push({
          code: 'heightExceeded',
          message: `Building ${building.id} height ${heightFt}ft exceeds max ${zoningLimits.maxHeightFt}ft`,
          delta: heightFt - zoningLimits.maxHeightFt,
          severity: 'error'
        });
      }
    }
  }

  // ── DENSITY_EXCEEDED ─────────────────────────────────────────────────────
  if (zoningLimits.maxDensityDuPerAcre != null) {
    const parcelAcres = siteAreaM2 * SQM_TO_ACRES;
    const maxDU = zoningLimits.maxDensityDuPerAcre * parcelAcres;
    if (totalUnits > maxDU) {
      violations.push({
        code: 'densityExceeded',
        message: `${totalUnits} DU exceeds max ${Math.floor(maxDU)} DU (${zoningLimits.maxDensityDuPerAcre} DU/ac)`,
        delta: totalUnits - maxDU,
        severity: 'error'
      });
    }
  }

  // ── IMPERVIOUS_EXCEEDED ──────────────────────────────────────────────────
  if (zoningLimits.maxImperviousPct != null) {
    const parkingAreaM2Used = parkingAreaParam ?? 0;
    const imperviousM2 = footprintAreaM2 + parkingAreaM2Used;
    const imperviousPct = siteAreaM2 > 0 ? (imperviousM2 / siteAreaM2) * 100 : 0;
    if (imperviousPct > zoningLimits.maxImperviousPct) {
      violations.push({
        code: 'imperviousExceeded',
        message: `Impervious ${imperviousPct.toFixed(1)}% exceeds max ${zoningLimits.maxImperviousPct}%`,
        delta: imperviousPct - zoningLimits.maxImperviousPct,
        severity: 'error'
      });
    }
  }

  // ── OPEN_SPACE_INSUFFICIENT ──────────────────────────────────────────────
  if (zoningLimits.minOpenSpacePct != null) {
    const parkingAreaM2Used = parkingAreaParam ?? 0;
    const usedM2 = footprintAreaM2 + parkingAreaM2Used;
    const openPct = siteAreaM2 > 0 ? ((siteAreaM2 - usedM2) / siteAreaM2) * 100 : 0;
    if (openPct < zoningLimits.minOpenSpacePct) {
      violations.push({
        code: 'openSpaceInsufficient',
        message: `Open space ${openPct.toFixed(1)}% below min ${zoningLimits.minOpenSpacePct}%`,
        delta: zoningLimits.minOpenSpacePct - openPct,
        severity: 'error'
      });
    }
  }

  // ── Building overlap ─────────────────────────────────────────────────────
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

  // ── Building containment ─────────────────────────────────────────────────
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
    totalUnits,
    violations
  };
}
