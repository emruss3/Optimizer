import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import { accessBreak, formatGapFt, mfAccessSummary, ringDistance } from './mfAccess';
import { createGroundFrame } from '../scene/frame';

const meta = { createdAt: 't', updatedAt: 't', source: 'ai-generated' as const };
const rect = (x1: number, y1: number, x2: number, y2: number) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
const el = (id: string, type: Element['type'], ring: number[][], props: Record<string, unknown> = {}): Element =>
  ({ id, type, name: id, geometry: { type: 'Polygon', coordinates: [ring] }, properties: props, metadata: meta }) as Element;

const parcel = rect(0, 0, 100, 100);

describe('mfAccessSummary — does the parking have a road?', () => {
  it('counts the curb and the bays a drive reaches', () => {
    const drive = el('drive', 'circulation', rect(0, 0, 8, 60)); // from the parcel line up the side
    const near = el('bay-a', 'parking', rect(10, 50, 30, 60)); // 2 m off the drive
    const far = el('bay-b', 'parking', rect(60, 20, 80, 40)); // nowhere near it
    const apron = el('apron', 'parking', rect(60, 80, 62, 84), { apron: true }); // a garage apron, not a bay
    const s = mfAccessSummary([drive, near, far, apron], parcel);
    expect(s).toMatchObject({ curb: true, bays: 2, served: 1, drives: 1 });
    // stall counts absent on these fixtures → usable figure stays null
    expect(s.stallsServed).toBeNull();
    expect(s.stallsStriped).toBeNull();
  });

  it('sums stalls on curb-reachable bays for the usable figure', () => {
    const drive = el('drive', 'circulation', rect(0, 0, 8, 60));
    const near = el('bay-a', 'parking', rect(10, 50, 30, 60), { stalls: 10 });
    const far = el('bay-b', 'parking', rect(60, 20, 80, 40), { stalls: 8 });
    const s = mfAccessSummary([drive, near, far], parcel);
    expect(s.served).toBe(1);
    expect(s.stallsServed).toBe(10);
    expect(s.stallsStriped).toBe(18);
  });

  it('a drive that stops inside the site never reaches the curb', () => {
    const stub = el('drive', 'circulation', rect(40, 20, 48, 50));
    const bay = el('bay', 'parking', rect(60, 20, 80, 40));
    const s = mfAccessSummary([stub, bay], parcel);
    expect(s.curb).toBe(false);
    expect(s.served).toBe(0);
  });

  // Field audit 32a264a P0: proximity ≠ route. One drive at the boundary and
  // another isolated beside a bay must not report curb+served with no path.
  it('does not count an isolated bay as served when a different drive touches the curb', () => {
    const curbDrive = el('curb', 'circulation', rect(0, 10, 8, 18));
    const island = el('island', 'circulation', rect(60, 60, 65, 65));
    const bay = el('bay', 'parking-bay', rect(66, 60, 74, 68));
    const s = mfAccessSummary([curbDrive, island, bay], parcel);
    expect(s.curb).toBe(true);
    expect(s.bays).toBe(1);
    expect(s.served).toBe(0);
    expect(s.drives).toBe(2);
  });

  it('serves a bay only through overlapping drives that reach the curb', () => {
    const curbDrive = el('curb', 'circulation', rect(0, 10, 40, 18));
    const aisle = el('aisle', 'circulation', rect(38, 10, 46, 70)); // overlaps curb drive
    const bay = el('bay', 'parking', rect(48, 60, 66, 70));
    const s = mfAccessSummary([curbDrive, aisle, bay], parcel);
    expect(s.curb).toBe(true);
    expect(s.served).toBe(1);
  });

  // Side property line is not the street when a frontage edge is known.
  it('ignores a non-street parcel boundary when a street edge is supplied', () => {
    const sideDrive = el('side', 'circulation', rect(0, 40, 6, 56)); // west lot line, not the street
    const bay = el('bay', 'parking', rect(8, 42, 26, 54));
    const street = [[100, 0], [100, 100]]; // east frontage
    const s = mfAccessSummary([sideDrive, bay], parcel, 3, street);
    expect(s.curb).toBe(false);
    expect(s.served).toBe(0);
  });

  // Through lot (909 Buchanan St): streets on two opposite sides. A drive to either street reaches the curb,
  // and the break is measured to the nearer street.
  it('counts a drive to any of the lot\'s streets when several street edges are supplied', () => {
    const backDrive = el('back', 'circulation', rect(40, 0, 56, 30)); // reaches the south street
    const bay = el('bay', 'parking', rect(58, 2, 76, 28));
    const north = [[0, 100], [100, 100]];
    const south = [[0, 0], [100, 0]];
    expect(mfAccessSummary([backDrive, bay], parcel, 3, north).curb).toBe(false);
    const s = mfAccessSummary([backDrive, bay], parcel, 3, [north, south]);
    expect(s.curb).toBe(true);
    expect(s.served).toBe(1);
    expect(accessBreak([backDrive, bay], parcel, [north, south])).toBeNull();
    const stub = el('stub', 'circulation', rect(40, 10, 56, 30)); // 10 short of the south street, 70 of the north
    const brk = accessBreak([stub], parcel, [north, south]);
    expect(brk?.gap3857).toBeCloseTo(10, 6);
  });

  // Placeholder frontage (667574 / 408571 / Herman / W Heiman): do not pass a
  // guessed street edge — fall back to the parcel ring so a drive on any lot
  // line still clears curb and does not false-red to NO_DRIVE_TO_STREET.
  it('falls back to the parcel ring when street edge is omitted (placeholder frontage)', () => {
    const sideDrive = el('side', 'circulation', rect(0, 40, 6, 56));
    const bay = el('bay', 'parking', rect(8, 42, 26, 54));
    const distantStreet = [[100, 0], [100, 100]];
    expect(mfAccessSummary([sideDrive, bay], parcel, 3, distantStreet).curb).toBe(false);
    expect(mfAccessSummary([sideDrive, bay], parcel, 3, null).curb).toBe(true);
    expect(mfAccessSummary([sideDrive, bay], parcel).curb).toBe(true);
  });

  it('measures ring-to-ring distance edge to vertex both ways, zero when edges cross', () => {
    expect(ringDistance(rect(0, 0, 10, 10), rect(12, 4, 20, 6))).toBeCloseTo(2, 6);
    expect(ringDistance(rect(0, 0, 10, 10), rect(8, 8, 12, 12))).toBe(0);
    // a ring wholly inside another reads as the gap between the boundaries
    expect(ringDistance(rect(0, 0, 10, 10), rect(5, 5, 6, 6))).toBe(4);
  });
});

describe('accessBreak — where the route to the street stops', () => {
  it('is null when a curb-connected network serves the plan, or when there is no drive', () => {
    expect(accessBreak([el('drive', 'circulation', rect(0, 0, 8, 60))], parcel)).toBeNull();
    expect(accessBreak([el('bay', 'parking', rect(60, 20, 80, 40))], parcel)).toBeNull();
    expect(accessBreak([el('drive', 'circulation', rect(40, 20, 48, 50))], null)).toBeNull();
  });

  it('marks the gap between a curb stub and an isolated parking network', () => {
    const curbDrive = el('curb', 'circulation', rect(0, 10, 8, 18));
    const island = el('island', 'circulation', rect(60, 60, 65, 65));
    const bay = el('bay', 'parking-bay', rect(66, 60, 74, 68));
    const b = accessBreak([curbDrive, island, bay], parcel);
    expect(b).not.toBeNull();
    expect(b!.gap3857).toBeGreaterThan(3);
    // break runs from the island toward the curb stub (east→west)
    expect(b!.from[0]).toBeGreaterThan(b!.to[0]!);
  });

  // PARKING_NOT_REACHABLE with orphan bays (no drive touches them): still draw red.
  it('marks the gap from an orphan bay to the curb network when no drive touches the bay', () => {
    const curbDrive = el('curb', 'circulation', rect(0, 10, 8, 18));
    const bay = el('bay', 'parking', rect(66, 60, 74, 68));
    const b = accessBreak([curbDrive, bay], parcel);
    expect(b).not.toBeNull();
    expect(b!.gap3857).toBeGreaterThan(3);
    // break runs from the bay toward the curb stub (east→west)
    expect(b!.from[0]).toBeGreaterThan(b!.to[0]!);
  });

  it('marks the end of the drive and the nearest point on the parcel line', () => {
    const b = accessBreak([el('drive', 'circulation', rect(40, 20, 48, 50))], parcel);
    // the south edge (y = 0) is the nearest line: 20 below the drive's south end
    expect(b?.from[1]).toBe(20);
    expect(b?.to[1]).toBe(0);
    expect(b?.from[0]).toBe(b?.to[0]);
    expect(b?.gap3857).toBeCloseTo(20, 6);
    // without a ground frame, hide feet (no raw Mercator-as-feet flash)
    expect(b?.gapFt).toBeNull();
  });

  // Live Design P2: partner sheet / inspector must name the measured gap
  it('reports the gap in feet so a reviewer can check it against the graphic scale', () => {
    const flatFt = (a: ArrayLike<number>, b: ArrayLike<number>) =>
      Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1])) / 0.3048;
    const b = accessBreak([el('drive', 'circulation', rect(40, 20, 48, 50))], parcel, null, 3, flatFt);
    expect(b).not.toBeNull();
    expect(b!.gapFt).not.toBeNull();
    expect(b!.gapFt!).toBeGreaterThan(65);
    expect(b!.gapFt!).toBeLessThan(66);
  });

  it('aims at the street edge when the frontage is known, not at whichever parcel line is nearest', () => {
    // frontage is the east edge, though the south edge is closer
    const frontage = [[100, 0], [100, 100]];
    const b = accessBreak([el('drive', 'circulation', rect(40, 20, 48, 50))], parcel, frontage);
    expect(b?.to[0]).toBe(100);
    expect(b?.from[0]).toBe(48);
  });

  it('uses the drive nearest the street when the plan has several', () => {
    const b = accessBreak([
      el('a', 'circulation', rect(40, 40, 48, 60)),
      el('b', 'circulation', rect(40, 6, 48, 30)),
    ], parcel);
    expect(b?.from[1]).toBe(6);
  });

  it('measures ground feet at Nashville latitude (W Heiman ~20.85 ft), not raw Mercator', () => {
    // 2600 W Heiman St (553450): ~36.17°N, lon −86.82 → EPSG:3857 origin for the frame
    const lon = -86.8177415864042;
    const lat = 36.1708695412901;
    const a = 6378137;
    const ox = (lon * Math.PI) / 180 * a;
    const oy = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * a;
    const frame = createGroundFrame(ox, oy);
    expect(frame.latDeg).toBeCloseTo(36.17, 1);
    expect(frame.groundScale).toBeCloseTo(0.806, 2);

    // Place a drive whose south end is 20.85 ground feet north of the parcel's south edge.
    const south = frame.fromFeet([0, 0]);
    const northGap = frame.fromFeet([0, 20.85]);
    const driveNE = frame.fromFeet([26, 80]);
    const driveNW = frame.fromFeet([-26, 80]);
    const parcelRing = [
      frame.fromFeet([-200, 0]),
      frame.fromFeet([200, 0]),
      frame.fromFeet([200, 400]),
      frame.fromFeet([-200, 400]),
      frame.fromFeet([-200, 0]),
    ];
    const driveRing = [
      [driveNW[0], northGap[1]],
      [driveNE[0], northGap[1]],
      [driveNE[0], driveNE[1]],
      [driveNW[0], driveNW[1]],
      [driveNW[0], northGap[1]],
    ];

    const b = accessBreak(
      [el('drive', 'circulation', driveRing)],
      parcelRing,
      null,
      3,
      frame.distanceFt,
    );
    expect(b).not.toBeNull();
    expect(Math.abs(b!.gapFt - 20.85)).toBeLessThan(0.5);
    expect(b!.gapFt).toBeCloseTo(20.85, 1);
    // Raw Mercator → feet would print ~26 ft; ground feet must not.
    expect(b!.gap3857 / 0.3048).toBeGreaterThan(25);
    expect(b!.gapFt).toBeLessThan(22);
    // the gap is north–south: endpoints differ by ~20.85 ft in local northing
    const fromFt = frame.toFeet(b!.from);
    const toFt = frame.toFeet(b!.to);
    expect(Math.abs(fromFt[1]! - toFt[1]!)).toBeCloseTo(20.85, 1);
    expect(Math.abs(fromFt[0]! - toFt[0]!)).toBeLessThan(1);
    expect(formatGapFt(b!.gapFt!)).toBe('21');
  });
});

describe('formatGapFt', () => {
  it('uses one decimal under 10 ft, whole feet otherwise', () => {
    expect(formatGapFt(9.4)).toBe('9.4');
    expect(formatGapFt(20.85)).toBe('21');
    expect(formatGapFt(10)).toBe('10');
  });
});
