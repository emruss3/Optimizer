// The few figures a decision turns on, as rows a sheet can print.
//
// A sheet that leaves the app has to carry what the screen says: how many
// stalls are drawn against how many are required, what the floor area is a
// share of, how the building is stacked, and whether a car can reach the
// street. Each row is the workspace's own figure. Nothing here is measured.
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

export function exhibitSchedule(i: ExhibitScheduleInput): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const drawn = i.stallsDrawn ?? null, reported = i.stallsReported ?? null, required = i.stallsRequired ?? null;
  const supplied = drawn ?? reported;
  if (supplied != null && supplied > 0) {
    const parts: string[] = [];
    // when the drawing and the engine's summary disagree, both are printed and named
    if (drawn != null && reported != null && drawn !== reported) parts.push(`${n(drawn)} drawn`, `${n(reported)} reported`);
    else parts.push(`${n(supplied)} ${drawn != null ? 'drawn' : 'supplied'}`);
    if (required != null && required > 0) parts.push(`${n(required)} required`);
    const disagree = drawn != null && reported != null && drawn !== reported;
    // a per-home ratio needs one count to stand on: it is left off when the two disagree
    if (i.units && !disagree) parts.push(`${n(supplied / i.units, 2)} per home`);
    // a shortfall is said in words, so it reads on a grey print as well as in colour
    if (required != null && required > 0) {
      if (supplied < required) parts.push(`${n(required - supplied)} short of required`);
      else if (disagree && reported != null && reported < required) parts.push(`reported count ${n(required - reported)} short of required`);
    }
    rows.push({ label: 'Parking', value: parts.join(' · ') });
  }
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
