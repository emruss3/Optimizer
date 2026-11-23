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

/** Multifamily (or any counted) parking: drawn / reported / required. */
function parkingRow(i: ExhibitScheduleInput): ScheduleRow | null {
  const drawn = i.stallsDrawn ?? null, reported = i.stallsReported ?? null, required = i.stallsRequired ?? null;
  const hasDrawn = i.stallsDrawn != null;
  const hasReported = i.stallsReported != null;
  const hasRequired = required != null && required > 0;
  // nothing named about supply or need → no parking row
  if (!hasDrawn && !hasReported && !hasRequired) return null;

  const supplied = drawn ?? reported;
  const parts: string[] = [];

  if (supplied == null) {
    // absent supply carries a reason; the required count still prints
    parts.push('Unknown · supply not measured');
  } else if (hasDrawn && hasReported && drawn !== reported) {
    parts.push(`${n(drawn!)} drawn`, `${n(reported!)} reported`);
  } else {
    parts.push(`${n(supplied)} ${hasDrawn ? 'drawn' : 'supplied'}`);
  }

  if (hasRequired) parts.push(`${n(required!)} required`);

  const disagree = hasDrawn && hasReported && drawn !== reported;
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
  if (i.routeUnresolved) rows.push({ label: 'Street access', value: 'Unresolved: no drive reaches the street' });
  if (i.contextUnverified) rows.push({ label: 'Context', value: 'Not verified' });
  return rows;
}
