// The few figures a decision turns on, as rows a sheet can print.
//
// A sheet that leaves the app has to carry what the screen says: how many
// stalls are drawn against how many are required, what the floor area is a
// share of, how the building is stacked, and whether a car can reach the
// street. Each row is the workspace's own figure. Nothing here is measured.
//
// Zero carries a value. An absent supply carries a reason. A shortfall is
// said in words so it survives a grey print. Townhome guest parking is a
// target of the engine, kept distinct from a required multifamily test.
import type { CaptureBasis } from './maxBuildout';

export interface ScheduleRow { label: string; value: string }

export interface ExhibitScheduleInput {
  units?: number | null;
  /** stalls the plan draws, bay by bay */
  stallsDrawn?: number | null;
  /** stalls the engine's summary reports */
  stallsReported?: number | null;
  /**
   * Curb-reachable stalls (mfAccess.stallsServed). When set and below drawn,
   * the Parking row names usable supply separately from the striped total.
   */
  stallsUsable?: number | null;
  /** stalls the placed program requires */
  stallsRequired?: number | null;
  /**
   * Townhome guest stalls drawn on the plan. Distinct from multifamily
   * required parking: a target of the engine, not one of its graded tests
   * unless the engine says so.
   */
  guestStalls?: number | null;
  /** Townhome guest-parking target (e.g. Mt View 8). */
  guestTarget?: number | null;
  /** True when the engine's own test list grades guest parking. */
  guestGraded?: boolean | null;
  builtGsf?: number | null;
  capture?: CaptureBasis | null;
  /** parking levels of a garage on the plan, and the residential levels over it */
  garageLevels?: number | null;
  residentialLevels?: number | null;
  /** true when no drive on the plan reaches the street */
  routeUnresolved?: boolean;
  /** true when the massing context for this parcel was not verified */
  contextUnverified?: boolean;
}

const n = (v: number, d = 0) => v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Multifamily (or any counted) parking: drawn / reported / usable / required. */
function parkingRow(i: ExhibitScheduleInput): ScheduleRow | null {
  const drawn = i.stallsDrawn ?? null, reported = i.stallsReported ?? null, required = i.stallsRequired ?? null;
  const usable = i.stallsUsable ?? null;
  const hasDrawn = i.stallsDrawn != null;
  const hasReported = i.stallsReported != null;
  const hasRequired = required != null && required > 0;
  // nothing named about supply or need → no parking row
  if (!hasDrawn && !hasReported && !hasRequired) return null;

  // Adequacy stands on curb-reachable supply when access excludes some striped bays.
  const accessCuts = usable != null && drawn != null && usable < drawn;
  const supplied = accessCuts ? usable : (drawn ?? reported);
  const parts: string[] = [];

  if (supplied == null) {
    // absent supply carries a reason; the required count still prints
    parts.push('Unknown · supply not measured');
  } else if (accessCuts) {
    parts.push(`${n(drawn!)} drawn`, `${n(usable!)} usable`);
    if (hasReported && reported !== drawn) parts.push(`${n(reported!)} reported`);
  } else if (hasDrawn && hasReported && drawn !== reported) {
    parts.push(`${n(drawn!)} drawn`, `${n(reported!)} reported`);
  } else {
    parts.push(`${n(supplied)} ${hasDrawn ? 'drawn' : 'supplied'}`);
  }

  if (hasRequired) parts.push(`${n(required!)} required`);

  const disagree = hasDrawn && hasReported && drawn !== reported && !accessCuts;
  // a per-home ratio needs one count to stand on: it is left off when the two disagree or supply is unknown
  if (i.units && supplied != null && !disagree) parts.push(`${n(supplied / i.units, 2)} per home`);

  // a shortfall is said in words, so it reads on a grey print as well as in colour
  if (hasRequired && supplied != null) {
    if (supplied < required!) parts.push(`${n(required! - supplied)} short of required`);
    else if (disagree && reported != null && reported < required!) parts.push(`reported count ${n(required! - reported)} short of required`);
  }

  return { label: 'Parking', value: parts.join(' · ') };
}

/** Townhome guest parking: target and shortfall in words (Mt View 0 of 8). */
function guestParkingRow(i: ExhibitScheduleInput): ScheduleRow | null {
  if (i.guestStalls == null) return null;
  const graded = i.guestGraded === true;
  const basis = graded ? 'graded by the engine' : 'a target of the engine, not one of its tests';
  if (i.guestTarget == null) return { label: 'Parking', value: `Guest parking ${n(i.guestStalls)} stalls · ${basis}` };
  const gap = i.guestTarget - i.guestStalls;
  const text = gap > 0
    ? `Guest parking ${n(i.guestStalls)} of ${n(i.guestTarget)} stalls · ${n(gap)} short · ${basis}`
    : `Guest parking ${n(i.guestStalls)} of ${n(i.guestTarget)} stalls · ${basis}`;
  return { label: 'Parking', value: text };
}

export function exhibitSchedule(i: ExhibitScheduleInput): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  // multifamily counted parking first; guest-only townhome sheets use the guest row
  const parking = parkingRow(i) ?? guestParkingRow(i);
  if (parking) rows.push(parking);
  if (i.capture && i.builtGsf) {
    rows.push({ label: 'Floor area', value: `${n(i.builtGsf)} of ${n(i.capture.denominatorGsf)} GSF ${i.capture.label} (${n(i.capture.pct, 1)}%)` });
  }
  if (i.garageLevels && i.garageLevels > 0) {
    rows.push({ label: 'Program', value: `${n(i.garageLevels)} parking level${i.garageLevels === 1 ? '' : 's'}${i.residentialLevels ? ` + ${n(i.residentialLevels)} residential` : ''}` });
  }
  if (i.routeUnresolved) {
    rows.push({
      label: 'Street access',
      value: 'Unresolved: no traversable drive from parking to the street',
    });
  }
  if (i.contextUnverified) rows.push({ label: 'Context', value: 'Not verified' });
  return rows;
}

/** Which product owns the decision schedule on the sheet. */
export type ExhibitProductKind = 'seed' | 'home-study' | 'apartment' | 'townhome' | 'detached' | 'conditional' | 'none';

export type ExhibitProduct =
  | { product: 'seed'; revision?: string | null }
  | { product: 'home-study'; revision?: string | null }
  | { product: 'apartment'; input: ExhibitScheduleInput; revision?: string | null }
  | {
      product: 'townhome';
      guestStalls?: number | null;
      guestTarget?: number | null;
      guestGraded?: boolean | null;
      contextUnverified?: boolean;
      revision?: string | null;
    }
  | { product: 'detached'; revision?: string | null }
  | { product: 'conditional'; input: ExhibitScheduleInput; revision?: string | null }
  | { product: 'none'; revision?: string | null };

export interface ResolveExhibitProductInput {
  seedViewOn?: boolean;
  homeStudyOn?: boolean;
  apartmentOnSheet?: boolean;
  apartment?: ExhibitScheduleInput | null;
  townhomeOnSheet?: boolean;
  guestStalls?: number | null;
  guestTarget?: number | null;
  guestGraded?: boolean | null;
  /** Detached SF only — must not include thv3 (see isDetachedSfPlanElement). */
  detachedSfOnSheet?: boolean;
  conditional?: ExhibitScheduleInput | null;
  contextUnverified?: boolean;
  revision?: string | null;
}

/**
 * Product order: seed → apartment → home-study → townhome → detached → conditional.
 * - Apartment beats home-study so an MF schedule is not wiped by a leftover study
 *   overlay (home study suppresses SF/TH decision rows only).
 * - Apartment beats detached SF when both families are present.
 * - Townhome must win over detached so Mt View guest parking is not emptied by the
 *   old `seedViewOn || sfPlanOnSheet` short-circuit (thv3 was inside isSfPlanElement).
 */
export function resolveExhibitProduct(i: ResolveExhibitProductInput): ExhibitProduct {
  const revision = i.revision ?? null;
  if (i.seedViewOn) return { product: 'seed', revision };
  if (i.apartmentOnSheet) {
    return { product: 'apartment', input: i.apartment ?? {}, revision };
  }
  // Home study clears decision rows on SF / townhome sheets so a preview does not
  // mix underwriting facts with the study. Apartment already returned above.
  if (i.homeStudyOn) return { product: 'home-study', revision };
  if (i.townhomeOnSheet) {
    return {
      product: 'townhome',
      guestStalls: i.guestStalls ?? null,
      guestTarget: i.guestTarget ?? null,
      guestGraded: i.guestGraded ?? false,
      contextUnverified: i.contextUnverified,
      revision,
    };
  }
  if (i.detachedSfOnSheet) return { product: 'detached', revision };
  if (i.conditional) return { product: 'conditional', input: i.conditional, revision };
  return { product: 'none', revision };
}

/** Schedule rows for the selected product. Seed / detached / home-study carry none. */
export function scheduleForProduct(product: ExhibitProduct): ScheduleRow[] {
  switch (product.product) {
    case 'apartment':
    case 'conditional':
      return exhibitSchedule(product.input);
    case 'townhome':
      return exhibitSchedule({
        guestStalls: product.guestStalls,
        guestTarget: product.guestTarget,
        guestGraded: product.guestGraded,
        contextUnverified: product.contextUnverified,
      });
    default:
      return [];
  }
}

export type GuestBasis = 'engine-target' | 'engine-graded';

export interface LayoutDecisionFacts {
  rows: ScheduleRow[];
  parking: string | null;
  floorArea: string | null;
  guestSupply: number | null;
  guestTarget: number | null;
  guestBasis: GuestBasis | null;
  revision: string | null;
}

/**
 * Workspace / Compare / sheet facts for the product on the sheet. Guest supply,
 * target, and basis travel as data so a generic stall count cannot stand in.
 */
export function layoutDecisionFacts(opts: {
  product: ExhibitProduct;
  builtGsf?: number | null;
  maxGsf?: number | null;
}): LayoutDecisionFacts {
  const rows = scheduleForProduct(opts.product);
  const parking = rows.find(r => r.label === 'Parking')?.value ?? null;
  const floorFromRows = rows.find(r => r.label === 'Floor area')?.value ?? null;
  const built = opts.builtGsf ?? null;
  const max = opts.maxGsf ?? null;
  const floorArea = floorFromRows
    ?? (built != null ? `${n(Math.round(built))} GSF` : null)
    ?? (max != null ? `Unknown · upper bound ${n(Math.round(max))} GSF` : null);

  if (opts.product.product === 'townhome') {
    const graded = opts.product.guestGraded === true;
    const supply = opts.product.guestStalls ?? null;
    const target = opts.product.guestTarget ?? null;
    // Townhome carries no placed floor area: the ceiling is said as a ceiling
    // (Unknown · upper bound), never as the plan's area.
    // Guest basis names how the target was set; supply alone (no target) is not a basis.
    return {
      rows,
      parking,
      floorArea,
      guestSupply: supply,
      guestTarget: target,
      guestBasis: target == null
        ? null
        : graded ? 'engine-graded' : 'engine-target',
      revision: opts.product.revision ?? null,
    };
  }

  return {
    rows,
    parking,
    floorArea,
    guestSupply: null,
    guestTarget: null,
    guestBasis: null,
    revision: opts.product.revision ?? null,
  };
}
