import type { Face, HomeDesign, Point, Rect, Room } from './originalDesigns';

export interface Cut {
  at: number;
  width: number;
  sill: number;
  head: number;
  kind: 'window' | 'entry' | 'garden' | 'garage' | 'door' | 'passage';
}
export interface WallRun {
  face: Face;
  fixed: number;
  lo: number;
  hi: number;
  room: string;
  other?: string | undefined;
  cuts: Cut[];
}
export const horizontal = (face: Face) => face === 'front' || face === 'back';
export function pointOn(wall: WallRun, at: number): Point {
  return horizontal(wall.face) ? [at, wall.fixed] : [wall.fixed, at];
}
export const normal: Record<Face, Point> = { front: [0, -1], right: [1, 0], back: [0, 1], left: [-1, 0] };
export const corners = ([x, y, w, d]: Rect): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + d],
  [x, y + d],
];
export function bounds(rects: Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r[0])),
    y = Math.min(...rects.map((r) => r[1]));
  return [x, y, Math.max(...rects.map((r) => r[0] + r[2])) - x, Math.max(...rects.map((r) => r[1] + r[3])) - y];
}
export const designBounds = (h: HomeDesign) =>
  bounds([...h.volumes, ...h.porches, ...(h.roofBulkhead ? [h.roofBulkhead] : [])].map((v) => v.rect));
export const floorBase = (h: HomeDesign, index: number) =>
  1 + h.heights.slice(0, index).reduce((sum, n) => sum + n, 0);
export function floorArea(h: HomeDesign, floor: number, heated = false) {
  return h.levels[floor]!.rooms.reduce(
    (n, r) => n + (heated && (r.name === 'Garage' || r.name === 'Covered balcony') ? 0 : r.rect[2] * r.rect[3]),
    0,
  );
}
export function program(h: HomeDesign) {
  const rooms = h.levels.flatMap((l) => l.rooms),
    beds = rooms.filter((r) => /bedroom|Guest room/i.test(r.name)).length;
  const baths = rooms.reduce((n, r) => n + (/bath/i.test(r.name) ? 1 : r.name === 'Powder' ? 0.5 : 0), 0);
  return { beds, baths, heated: h.levels.reduce((sum, _, i) => sum + floorArea(h, i, true), 0) };
}
function edges({ name, rect: [x, y, w, d] }: Room): WallRun[] {
  return [
    { face: 'front', fixed: y, lo: x, hi: x + w },
    { face: 'back', fixed: y + d, lo: x, hi: x + w },
    { face: 'left', fixed: x, lo: y, hi: y + d },
    { face: 'right', fixed: x + w, lo: y, hi: y + d },
  ].map((e) => ({ ...e, face: e.face as Face, room: name, cuts: [] }));
}
const reverse: Record<Face, Face> = { front: 'back', back: 'front', left: 'right', right: 'left' };
const snapFt = (n: number) => Math.round(n * 1e7) / 1e7;
export function wallsFor(h: HomeDesign, index: number, exposedEnds: Face[] = []): WallRun[] {
  const level = h.levels[index]!,
    edgesAtLevel = level.rooms.flatMap(edges).map(e => ({
      ...e, fixed: snapFt(e.fixed), lo: snapFt(e.lo), hi: snapFt(e.hi),
    })),
    walls: WallRun[] = [];
  for (const edge of edgesAtLevel) {
    const neighbours = edgesAtLevel.filter(
      (e) => e.face === reverse[edge.face] && e.fixed === edge.fixed && e.hi > edge.lo && e.lo < edge.hi,
    );
    const stops = [
      ...new Set([
        edge.lo,
        edge.hi,
        ...neighbours.flatMap((e) => [Math.max(e.lo, edge.lo), Math.min(e.hi, edge.hi)]),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 1; i < stops.length; i++) {
      const lo = stops[i - 1]!,
        hi = stops[i]!,
        other = neighbours.find((e) => e.lo < hi && e.hi > lo)?.room;
      if (other && (edge.face === 'left' || edge.face === 'front')) continue;
      walls.push({ ...edge, lo, hi, other, cuts: [] });
    }
  }
  for (const link of level.links) {
    const passage = link.includes('~'),
      [a, b] = link.split(passage ? '~' : '|');
    const w = walls
      .filter((w) => (w.room === a && w.other === b) || (w.room === b && w.other === a))
      .sort((x, y) => y.hi - y.lo - (x.hi - x.lo))[0];
    const balconyDoor = h.balconyScreen?.level === index && [a, b].includes('Covered balcony');
    if (w && w.hi - w.lo >= 3)
      w.cuts.push({
        kind: balconyDoor ? 'garden' : passage ? 'passage' : 'door',
        at: (w.lo + w.hi) / 2,
        width: Math.min(balconyDoor ? 6 : passage ? 8 : 3, w.hi - w.lo - 0.35),
        sill: 0,
        head: 7,
      });
  }
  for (const w of walls.filter((w) => !w.other)) {
    if (index === 0)
      for (const door of h.doors.filter(
        (d) => d.room === w.room && d.face === w.face && d.at - d.width / 2 >= w.lo && d.at + d.width / 2 <= w.hi,
      )) {
        w.cuts.push({
          kind: door.kind,
          at: door.at,
          width: door.width,
          sill: 0,
          head: door.kind === 'garage' ? 7.5 : 7,
        });
      }
    if (h.attached && !horizontal(w.face) && !exposedEnds.includes(w.face)) continue;
    if (w.room === 'Covered balcony') continue;
    if (h.sideWindows && !horizontal(w.face)) {
      for (const cut of h.sideWindows)
        if (cut.level === index && cut.face === w.face
          && cut.at - cut.width / 2 >= w.lo && cut.at + cut.width / 2 <= w.hi)
          w.cuts.push({ kind: 'window', at: cut.at, width: cut.width, sill: cut.sill, head: cut.head });
      continue;
    }
    if (/Garage|Closet|Pantry|Dressing|Storage|Linen|Coats/.test(w.room)) continue;
    const privacy = /Bath|bath|Powder|Laundry/.test(w.room),
      stair = /Stair|hall|Landing|Foyer|Entry|Gallery/i.test(w.room);
    const width = privacy
      ? 2
      : stair
        ? 2.3
        : /Primary bedroom|Living|Great|Dining|Parlor|Family/.test(w.room)
          ? 4.5
          : 3;
    const keep = w.cuts.slice().sort((a, b) => a.at - b.at);
    const gaps: Point[] = [];
    let start = w.lo + 1.1;
    for (const c of keep) {
      gaps.push([start, c.at - c.width / 2 - 1.1]);
      start = c.at + c.width / 2 + 1.1;
    }
    gaps.push([start, w.hi - 1.1]);
    for (const [a, b] of gaps) {
      if (b - a < width || (privacy && !horizontal(w.face) && w.hi - w.lo < 5)) continue;
      const count = !privacy && !stair && b - a > 13 ? 2 : 1;
      for (let i = 0; i < count; i++)
        w.cuts.push({
          kind: 'window',
          at: a + ((b - a) * (i + 0.5)) / count,
          width,
          sill: privacy ? 4.7 : w.room === 'Kitchen' ? 3.5 : 2.6,
          head: privacy ? 7.1 : h.heights[index]! >= 10 ? 8 : 7.4,
        });
    }
  }
  return walls;
}
export function doorAnchors(h: HomeDesign) {
  return wallsFor(h, 0).flatMap((w) =>
    w.cuts
      .filter((c) => c.kind === 'entry' || c.kind === 'garage' || c.kind === 'garden')
      .map((c) => ({ kind: c.kind, width: c.width, face: w.face, point: pointOn(w, c.at), room: w.room })),
  );
}
export function wallSegments(w: WallRun): Point[] {
  const result: Point[] = [];
  let lo = w.lo;
  for (const c of w.cuts.slice().sort((a, b) => a.at - b.at)) {
    result.push([lo, c.at - c.width / 2]);
    lo = c.at + c.width / 2;
  }
  result.push([lo, w.hi]);
  return result.filter(([a, b]) => b > a);
}
/** The authored ridge/parapet elevation and actual floor lines share the design's datum. */
export function roofHeight(h: HomeDesign) {
  return Math.max(
    ...(h.roofBulkhead ? [floorBase(h, h.levels.length) + h.roofBulkhead.heightFt + 0.08 / 0.3048] : []),
    ...h.volumes.map((v) => {
      const span = v.ridge === 'depth' ? v.rect[2] : v.rect[3];
      const rise = v.ridge === 'flat' ? 1.05 : ((v.ridge === 'shed' ? span : span / 2) * v.pitch) / 12;
      return floorBase(h, v.first + v.count) + rise;
    }),
  );
}
