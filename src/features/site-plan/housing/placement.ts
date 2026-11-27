import polygonClipping from 'polygon-clipping';
import type { Element } from '../../../engine/types';
import { isMappedAlley } from '../scene/mappedAlley';
import { createGroundFrame, type GroundFrame } from '../scene/frame';
import { type HomeDesign, type Point, type Rect, type Face } from './originalDesigns';
import { corners, designBounds, doorAnchors, floorArea, floorBase, normal, program, roofHeight } from './drawings';

type Ring = Point[];
type Poly = Ring[];
type Region = polygonClipping.MultiPolygon;
export interface HomePlacement {
  elements: Element[];
  name: string;
  house: string;
  basis: string;
}
export type FitResult = { placement: HomePlacement; reason?: never } | { placement?: never; reason: string };
const add = (p: Point, q: Point): Point => [p[0] + q[0], p[1] + q[1]];
const scale = (p: Point, s: number): Point => [p[0] * s, p[1] * s];
const diff = (p: Point, q: Point): Point => [p[0] - q[0], p[1] - q[1]];
const dot = (p: Point, q: Point) => p[0] * q[0] + p[1] * q[1];
const dist = (p: Point, q: Point) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const left = ([x, y]: Point): Point => [-y, x];
const unit = (p: Point): Point => scale(p, 1 / (Math.hypot(...p) || 1));
const closed = (pts: Ring): Ring => [...pts, pts[0]!];
const rect = (r: Rect): Poly => [closed(corners(r))];
const mean = (r: Ring): Point => scale(r.slice(0, -1).reduce(add, [0, 0]), 1 / (r.length - 1));
function nearest(p: Point, a: Point, b: Point): Point {
  const edge = diff(b, a);
  return add(a, scale(edge, Math.max(0, Math.min(1, dot(diff(p, a), edge) / (dot(edge, edge) || 1)))));
}
function closest(p: Point, polys: Poly[]) {
  let point: Point = p,
    distance = Infinity;
  for (const poly of polys)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const q = nearest(p, ring[i - 1]!, ring[i]!),
          d = dist(p, q);
        if (d < distance) {
          distance = d;
          point = q;
        }
      }
  return { point, distance };
}
const ringArea = (r: Ring) =>
  Math.abs(
    r.reduce((s, p, i) => {
      const q = r[(i + 1) % r.length]!;
      return s + p[0] * q[1] - q[0] * p[1];
    }, 0),
  ) / 2;
const area = (r: Region) =>
  r.reduce((s, p) => s + ringArea(p[0]!) - p.slice(1).reduce((v, h) => v + ringArea(h), 0), 0);
const rounded = new WeakMap<Poly, Poly>();
function snap(poly: Poly): Poly {
  const old = rounded.get(poly);
  if (old) return old;
  const result = poly.map((r) =>
    r.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as Point),
  );
  rounded.set(poly, result);
  return result;
}
const boxes = new WeakMap<Poly, [number, number, number, number]>();
function box(p: Poly) {
  const cached = boxes.get(p);
  if (cached) return cached;
  const r = p[0]!,
    xs = r.map((v) => v[0]),
    ys = r.map((v) => v[1]);
  const b: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  boxes.set(p, b);
  return b;
}
function footprintInside(poly: Poly, limit: Poly) {
  try {
    return area(polygonClipping.difference(snap(poly), snap(limit))) < 0.09;
  } catch {
    return false;
  }
}
function conflicts(poly: Poly, others: Poly[]) {
  const a = box(poly);
  return others.some((p) => {
    const b = box(p);
    if (a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]) return false;
    try {
      return area(polygonClipping.intersection(snap(poly), snap(p))) > 0.14;
    } catch {
      return true;
    }
  });
}
function segmentRect(a: Point, b: Point, width: number): Poly {
  const side = scale(left(unit(diff(b, a))), width / 2);
  return [closed([add(a, side), add(b, side), diff(b, side), diff(a, side)])];
}
function inside(p: Point, poly: Poly) {
  return poly.reduce((val, ring) => {
    let hit = false;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!,
        b = ring[i]!;
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit ? !val : val;
  }, false);
}
function rayDistance(start: Point, direction: Point, pavement: Poly[], limit: number): number | null {
  // Both wheel tracks must meet the same paved polygon; the caller checks the whole route.
  if (pavement.some((p) => inside(start, p))) return 0;
  const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];
  let best = Infinity;
  for (const poly of pavement)
    for (const ring of poly)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1]!,
          edge = diff(ring[i]!, a),
          den = cross(direction, edge);
        if (Math.abs(den) < 1e-7) continue;
        const gap = diff(a, start),
          t = cross(gap, edge) / den,
          u = cross(gap, direction) / den;
        if (t >= 0 && t <= limit && u >= 0 && u <= 1) best = Math.min(best, t);
      }
  return Number.isFinite(best) ? best : null;
}
const groundPoly = (e: Element, fr: GroundFrame): Poly =>
  e.geometry.coordinates.map((r) => r.map((p) => fr.toFeet(p)));
const setbackValues = (s: unknown): Record<'front' | 'rear' | 'side', number> | null => {
  if (!s || typeof s !== 'object') return null;
  const x = s as Record<string, number>;
  return ['front', 'rear', 'side'].every((k) => Number.isFinite(x[k]) && x[k]! >= 0)
    ? { front: x.front!, rear: x.rear!, side: x.side! }
    : null;
};
export const residentialHomes = (elements: Element[]) =>
  elements.filter(
    (e) =>
      e.type === 'building' && (e.properties.house || e.properties.singleFamilyHouse || e.properties.townhome),
  );
export function placeHome(
  h: HomeDesign,
  selected: Element,
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
  maxHeightFt?: number | null,
): FitResult {
  if (maxHeightFt != null && maxHeightFt > 0 && roofHeight(h) > maxHeightFt)
    return { reason: `The roof height exceeds the recorded ${maxHeightFt} ft limit.` };
  try {
    return fitHome(h, selected, elements, siteBoundary);
  } catch {
    return {
      reason: 'The geometry could not be checked reliably for this house. The original scheme is available.',
    };
  }
}
function fitHome(
  h: HomeDesign,
  selected: Element,
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
): FitResult {
  if (Boolean(selected.properties.townhome) !== Boolean(h.attached))
    return { reason: h.attached ? 'Choose an attached row home.' : 'Choose a detached house lot.' };
  // Most detached schemes have no alley. Avoid projecting the whole plan for each rear-load candidate.
  if (h.rearLoadPrecedent && !elements.some(isMappedAlley))
    return { reason: 'The rear garage needs a separately mapped alley.' };
  const first = selected.geometry.coordinates[0]?.[0];
  if (!first) return { reason: 'The house has no placed footprint.' };
  const frame = createGroundFrame(first[0]!, first[1]!),
    pad = groundPoly(selected, frame),
    centre = mean(pad[0]!);
  const local = elements.map((el) => ({ el, poly: groundPoly(el, frame) }));
  const isLot = (el: Element) => el.type !== 'building' && (/(^|[-:])lot-\d+$/.test(el.id) || /^Lot\s+\d+$/i.test(el.name));
  const lot = local.find(({ el }) => isLot(el) && el.id === selected.properties.lotId) ??
    local.find(({ el, poly }) => isLot(el) && inside(centre, poly));
  const setbacks = setbackValues(lot?.el.properties.homeSetbacksFt);
  const drives = local
    .filter(({ el }) => el.name === 'Driveway' || el.properties.kind === 'driveway')
    .map((o) => o.poly);
  const pavedWays = local.filter(
    ({ el }) =>
      el.type === 'road' ||
      (el.type === 'circulation' && !/walk|sidewalk|driveway/i.test(el.name)) ||
      el.type === 'parking-aisle',
  );
  const mappedStreets = pavedWays.map((o) => o.poly);
  let rearLanes: Poly[] = [];
  let rearLoadFrontStreets: Poly[] = [];
  if (h.rearLoadPrecedent) {
    rearLoadFrontStreets = pavedWays
      .filter(({ el }) => !isMappedAlley(el) && (el.type === 'road' || /street|mews|private lane/i.test(el.name)))
      .map((o) => o.poly);
    if (!rearLoadFrontStreets.length) return { reason: 'A separate mapped front street is needed for this rear-load study.' };
    const alleys = pavedWays.filter(({ el }) => isMappedAlley(el)).map((o) => o.poly);
    if (!alleys.length) return { reason: 'The rear garage needs a separately mapped alley.' };
    // Check connected pavement in the drawn scheme, not legal access, turning radius or grade.
    const reaches = (a: Poly, b: Poly) =>
      area(polygonClipping.intersection(a, b)) > 0.01 ||
      a[0]!.some((p) => closest(p, [b]).distance <= 0.06) ||
      b[0]!.some((p) => closest(p, [a]).distance <= 0.06);
    const connectedWays = new Set(rearLoadFrontStreets);
    for (const pavement of connectedWays)
      for (const other of mappedStreets)
        if (!connectedWays.has(other) && reaches(pavement, other)) connectedWays.add(other);
    rearLanes = alleys.filter((lane) => connectedWays.has(lane));
    if (!rearLanes.length) return { reason: 'No drawn alley connects to the street for this rear-load study.' };
  }
  const walks = local.filter(({ el }) => /^(walk|sidewalk|footpath)/i.test(el.name)).map((o) => o.poly);
  const accessBands = local
    .filter(
      ({ el }) => el.properties.kind === 'row' || el.name === 'Access easement' || el.name === 'Right-of-way',
    )
    .map((o) => o.poly);
  const site = siteBoundary?.coordinates.map((r) => r.map((p) => frame.toFeet(p))) ?? null;
  if (!lot && !site) return { reason: 'A parcel or lot boundary is needed to check the porch and approaches.' };
  // Frontage lots with no new street (Brittany Park, Nashboro): pave/street geometry is empty,
  // but each lot still has a driveway that meets the parcel edge at the public street. Treat
  // those edge-meeting drives as the mapped vehicle approach so fit is not blocked wholesale.
  const FRONTAGE_TOUCH_FT = 1.25;
  const frontageApproaches =
    !mappedStreets.length && site
      ? drives.filter((d) => d[0]!.some((p) => closest(p, [site]).distance < FRONTAGE_TOUCH_FT))
      : [];
  const streets = mappedStreets.length ? mappedStreets : frontageApproaches;
  if (!streets.length) return { reason: 'The scheme has no mapped vehicle approach for a driveway check.' };
  const frontStreets = h.rearLoadPrecedent ? rearLoadFrontStreets : streets;
  const routeLimit = lot ? polygonClipping.union(snap(lot.poly), ...accessBands.map(snap)) : site ? [site] : null;
  const allParts = local
    .filter(
      ({ el }) =>
        el.id !== selected.id &&
        (el.type === 'building' ||
          el.type === 'greenspace' ||
          el.properties.hazardKind ||
          el.properties.constraintSource ||
          el.properties.accessStrip),
    )
    .map((o) => o.poly);
  const ownerDrive = drives
    .map((d) => ({ d, near: closest(centre, [d]).distance }))
    .sort((a, b) => a.near - b.near)[0];
  const own = ownerDrive && ownerDrive.near < 55 ? ownerDrive.d : null;
  // A driveway ending in isolation cannot establish vehicle access.
  const connected =
    own &&
    (streets.some((street) => area(polygonClipping.intersection(own, street)) > 0.01) ||
      own[0]!.some((p) => closest(p, streets).distance < 1.25));
  const vehicle = h.rearLoadPrecedent ? rearLanes : [...(connected && own ? [own] : []), ...streets];
  const approach = closest(centre, h.rearLoadPrecedent ? rearLanes : streets).point;
  const toward = unit(diff(approach, centre)),
    outer = lot?.poly[0];
  const edgeBands: Poly[] = [];
  if (outer && setbacks) {
    const lotMid = mean(outer),
      roadNormal = unit(diff(closest(lotMid, frontStreets).point, lotMid));
    const signed = outer.reduce((s, a, i) => {
      const b = outer[(i + 1) % outer.length]!;
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0);
    for (let i = 1; i < outer.length; i++) {
      const a = outer[i - 1]!,
        b = outer[i]!,
        insideN = scale(left(unit(diff(b, a))), signed >= 0 ? 1 : -1);
      const facing = -dot(insideN, roadNormal),
        setback = facing > 0.55 ? setbacks.front : facing < -0.55 ? setbacks.rear : setbacks.side;
      if (setback > 0)
        edgeBands.push([closed([a, b, add(b, scale(insideN, setback)), add(a, scale(insideN, setback))])]);
    }
  }
  const axes: Point[] = [];
  for (const ring of [pad[0]!, ...(outer ? [outer] : [])])
    for (let i = 1; i < ring.length; i++) {
      if (dist(ring[i]!, ring[i - 1]!) < 7) continue;
      const v = unit(diff(ring[i]!, ring[i - 1]!));
      for (const a of [v, scale(v, -1), left(v), scale(left(v), -1)])
        if (!axes.some((q) => dot(a, q) > 0.998)) axes.push(a);
    }
  const anchors = doorAnchors(h),
    entry = anchors.find((a) => a.kind === 'entry')!,
    garages = anchors.filter((a) => a.kind === 'garage');
  const serviceFace = garages[0]?.face ?? 'front',
    orientation = h.attached ? 'back' : serviceFace;
  const direction = (axis: Point, face: Face) =>
    add(scale(axis, normal[face][0]), scale(left(axis), normal[face][1]));
  axes.sort((a, b) => dot(direction(b, orientation), toward) - dot(direction(a, orientation), toward));
  const [bx, by, bw, bd] = designBounds(h);
  const mainPolys = h.volumes.filter((v) => v.first === 0).map((v) => rect(v.rect));
  const union = polygonClipping
    .union(mainPolys[0]!, ...mainPolys.slice(1))
    .sort((a, b) => ringArea(b[0]!) - ringArea(a[0]!));
  const positions = [0, -4, 4, -8, 8, -12, 12];
  for (const axis of axes) {
    const depth = left(axis);
    if (dot(direction(axis, orientation), toward) < 0.3) continue;
    const centreOrigin = add(centre, add(scale(axis, -bx - bw / 2), scale(depth, -by - bd / 2)));
    const origins: Point[] = [];
    if (own && connected && garages.length && !h.attached && !h.rearLoadPrecedent) {
      const g = garages[0]!,
        out = direction(axis, g.face),
        ring = own[0]!.slice(0, -1);
      const start = Math.min(...ring.map((p) => dot(p, out)));
      const end = ring.filter((p) => dot(p, out) < start + 1.5);
      const meet = scale(end.reduce(add, [0, 0]), 1 / end.length);
      const local = add(scale(axis, g.point[0]), scale(depth, g.point[1]));
      for (const gap of [0.25, 2, 5, 9, 13, 18, 24]) origins.push(diff(diff(meet, local), scale(out, gap)));
    }
    for (const offsetY of positions)
      for (const offsetX of positions)
        origins.push(add(centreOrigin, add(scale(axis, offsetX), scale(depth, offsetY))));
    for (const origin of origins) {
      const pt = (p: Point) => add(origin, add(scale(axis, p[0]), scale(depth, p[1])));
      const poly = (shape: Poly): Poly => shape.map((r) => r.map(pt));
      const solids = [...h.volumes, ...(h.roofBulkhead ? [h.roofBulkhead] : [])].map(v => poly(rect(v.rect)));
      const accessSolids = h.volumes.filter((v) => floorBase(h, v.first) < 9).map((v) => poly(rect(v.rect)));
      const porches = h.porches.map((p) => poly(rect(p.rect)));
      const occupied = [...solids, ...porches];
      if (h.attached && solids.some((p) => !footprintInside(p, pad))) continue;
      if (lot && setbacks) {
        if (occupied.some((p) => !footprintInside(p, lot.poly) || conflicts(p, edgeBands))) continue;
      } else {
        // Older schemes have no setback record. Restrict new enclosed construction to the accepted pad.
        if (solids.some((p) => !footprintInside(p, pad))) continue;
        if (lot && porches.some((p) => !footprintInside(p, lot.poly))) continue;
        if (!lot && !h.attached && porches.some((p) => !footprintInside(p, pad))) continue;
      }
      if (site && occupied.some((p) => !footprintInside(p, site))) continue;
      if (occupied.some((p) => conflicts(p, [...allParts, ...accessBands, ...streets]))) continue;
      if ([...accessSolids, ...porches].some((p) => conflicts(p, drives))) continue;
      const paths: Array<{ poly: Poly; kind: 'driveway' | 'walk' | 'pad' | 'court' }> = [];
      const blocked = (path: Poly) =>
        (routeLimit && area(polygonClipping.difference(path, routeLimit)) > 0.09) ||
        conflicts(path, [...allParts, ...accessSolids]);
      const ride = (from: Point, out: Point, width: number) => {
        const edges = [-1, 1].map((side) => add(from, scale(left(out), side * (width / 2 - 0.35))));
        let reach = Infinity;
        for (const surface of vehicle) {
          const gaps = edges.map((p) => rayDistance(p, out, [surface], 65));
          if (gaps.every((g): g is number => g != null)) reach = Math.min(reach, Math.max(...(gaps as number[])));
        }
        if (!Number.isFinite(reach)) return false;
        if (reach < 0.15) return true;
        const route = segmentRect(from, add(from, scale(out, reach)), width);
        // The last few inches may lie inside the recorded street at a skewed boundary.
        const newParts = polygonClipping.difference(snap(route), snap(vehicle[0]!), ...vehicle.slice(1).map(snap));
        if (newParts.some(blocked)) return false;
        for (const part of newParts) paths.push({ poly: part, kind: 'driveway' });
        return true;
      };
      let walkTarget: Poly[] = h.rearLoadPrecedent ? frontStreets : [...walks, ...(own && connected ? [own] : []), ...streets];
      if (garages.length) {
        if (!garages.every((g) => ride(pt(g.point), direction(axis, g.face), g.width + 0.5))) continue;
        if (h.parking === 'side') {
          const v = h.volumes.find(
            (v) => v.rect[0] + v.rect[2] === Math.max(...h.volumes.map((w) => w.rect[0] + w.rect[2])),
          )!;
          const court = poly(rect([v.rect[0] + v.rect[2], v.rect[1], 28, v.rect[3]]));
          if (blocked(court)) continue;
          paths.push({ poly: court, kind: 'court' });
        }
      } else {
        // A dimensioned parking space can sit on the already connected driveway independently
        // of the house. This retains the recorded curb opening on the Delk private lane.
        let stall: Poly | null = null;
        if (own && connected) {
          const c = mean(own[0]!);
          for (const shift of [0, 2, -2, 4, -4]) {
            const middle = add(c, scale(depth, shift));
            const a = add(middle, scale(depth, -9)),
              b = add(middle, scale(depth, 9));
            const candidate = segmentRect(a, b, 9);
            if (
              footprintInside(candidate, own) &&
              (!lot || footprintInside(candidate, lot.poly)) &&
              !blocked(candidate) &&
              !conflicts(candidate, occupied)
            ) {
              stall = candidate;
              break;
            }
          }
        }
        if (!stall) {
          const x = bx + bw - 5.25;
          stall = poly(rect([x - 4.5, -18, 9, 18]));
          if (
            (lot && !footprintInside(stall, lot.poly)) ||
            blocked(stall) ||
            conflicts(stall, [...porches, ...accessBands, ...streets])
          )
            continue;
          if (!ride(pt([x, -18]), direction(axis, 'front'), 9)) continue;
        }
        paths.push({ poly: stall, kind: 'pad' });
        walkTarget = [stall, ...walkTarget];
      }
      const en = entry.point;
      const porch = h.porches.find(
        (p) => en[0] >= p.rect[0] && en[0] <= p.rect[0] + p.rect[2] && en[1] === p.rect[1] + p.rect[3],
      );
      const threshold = pt([en[0], porch ? porch.rect[1] : en[1]]),
        front = direction(axis, entry.face),
        landing = add(threshold, scale(front, 2.4));
      const nearestWalk = closest(landing, h.rearLoadPrecedent ? walkTarget : [...walkTarget, ...paths.map((p) => p.poly)]);
      if (nearestWalk.distance > 90) continue;
      const target = nearestWalk.point;
      if (h.rearLoadPrecedent && dot(diff(target, landing), front) < -0.06) continue;
      const walk = segmentRect(threshold, landing, 3.5);
      const end = dist(landing, target) > 0.5 ? segmentRect(landing, target, 3.5) : null;
      if (blocked(walk) || (end && blocked(end))) continue;
      paths.push({ poly: walk, kind: 'walk' });
      if (end) paths.push({ poly: end, kind: 'walk' });
      const geometry = (g: Poly): Element['geometry'] => ({
        type: 'Polygon',
        coordinates: g.map((r) => r.map((p) => frame.fromFeet(p))),
      });
      const info = program(h),
        houseName = h.name + ' · concept';
      const accessory = union.slice(1);
      const placed: Element = {
        ...selected,
        name: houseName,
        geometry: geometry(poly(union[0]!)),
        properties: {
          ...selected.properties,
          housingDesignId: h.id,
          housingAssetVersion: '1',
          housingAssignmentSource: 'manual',
          housingPreviousEnginePlan: undefined,
          housingPlacementStatus: 'placed',
          housingParking:
            h.parking === 'pad' ? 'pad' : h.id === 'tn-garden-infill-v1' ? 'detached-garage' : 'attached-garage',
          housingElevation: 'Original',
          housingMirror: 'none',
          housingRotationDeg: (Math.atan2(axis[1], axis[0]) * 180) / Math.PI,
          housingBeds: info.beds,
          housingBaths: info.baths,
          housingHeatedSf: info.heated,
          housingStories: h.levels.length,
          housingSource: h.rearLoadPrecedent?.source ?? 'Parcel Proforma original schematic design',
          housingVerification: 'provisional',
          housingAttachedGarage: garages.length > 0 && h.id !== 'tn-garden-infill-v1',
          housingFitReason:
            lot && setbacks
              ? 'Full-size study with the recorded setbacks and mapped approaches.'
              : 'Full-size study within the accepted enclosed pad.',
          homeEntry3857: frame.fromFeet(pt(entry.point)),
          homeVehicle3857: garages.length ? frame.fromFeet(pt(garages[0]!.point)) : null,
          homeOrigin: frame.fromFeet(origin),
          homeAxis: frame.fromFeet(add(origin, axis)),
          floors: h.levels.length,
          stories: h.levels.length,
          storiesAssumed: false,
          heightFt: roofHeight(h),
          housePlan: h.name,
          floorplanId: undefined,
          houseSource: h.rearLoadPrecedent?.source ?? 'Parcel Proforma original design',
          houseGarage: garages.length > 0 && h.id !== 'tn-garden-infill-v1',
          houseBeds: info.beds,
          houseBaths: info.baths,
          houseFootprintSf: floorArea(h, 0),
          areaSqFt: area([union[0]!]),
          homeGrossSf: h.levels.reduce((sum, level, i) => sum + floorArea(h, i)
            - level.rooms.filter(r => r.name === 'Covered balcony').reduce((out, r) => out + r.rect[2] * r.rect[3], 0), 0),
          label: h.name,
        },
      };
      const extra = (
        id: string,
        name: string,
        type: Element['type'],
        geom: Poly,
        properties: Element['properties'],
      ): Element => ({
        id: selected.id + '-home-' + id,
        name,
        type,
        geometry: geometry(geom),
        properties: { ...properties, homeStudyPart: true },
        metadata: selected.metadata,
      });
      const additions: Element[] = [];
      accessory.forEach((a, i) =>
        additions.push(
          extra('wing-' + i, 'Carriage house', 'other', poly(a), {
            styleOverride: true,
            color: '#b8a765',
            strokeColor: '#756642',
            label: 'Carriage house',
          }),
        ),
      );
      for (const [i, p] of porches.entries())
        additions.push(
          extra('porch-' + i, 'Porch', 'other', p, {
            styleOverride: true,
            color: '#d8c6aa',
            strokeColor: '#9f896b',
          }),
        );
      const parkingSpace = paths.find((path) => path.kind === 'pad');
      if (parkingSpace)
        additions.push(
          extra('parking-space', 'Parking pad · 9 × 18 ft', 'other', parkingSpace.poly, {
            styleOverride: true,
            opacity: 0.15,
            color: '#b3a593',
            strokeColor: '#89775f',
            label: '9 × 18 ft parking pad',
          }),
        );
      const paved = [...streets, ...drives, ...walks];
      for (const [i, path] of paths.entries()) {
        const pieces = paved.length
          ? polygonClipping.difference(snap(path.poly), snap(paved[0]!), ...paved.slice(1).map(snap))
          : [path.poly];
        for (const [j, part] of pieces.entries())
          if (area([part]) > 0.2) {
            const walk = path.kind === 'walk';
            additions.push(
              extra('path-' + i + '-' + j, walk ? 'Walk' : 'Driveway', 'circulation', part, {
                kind: walk ? 'walk' : 'driveway',
                styleOverride: true,
                color: walk ? '#e2d9c8' : '#c3bcb1',
                strokeColor: '#a69c8c',
              }),
            );
          }
        paved.push(path.poly);
      }
      const result = elements.flatMap((el) =>
        el.id === selected.id
          ? [placed, ...additions]
          : el.id === lot?.el.id
            ? [
                {
                  ...el,
                  properties: {
                    ...el.properties,
                    houseBeds: info.beds,
                    houseBaths: info.baths,
                    houseLabel: h.name + ' · ' + info.beds + ' bed',
                    houseFootprintSf: floorArea(h, 0),
                  },
                },
              ]
            : [el],
      );
      return {
        placement: {
          elements: result,
          name: h.name,
          house: selected.id,
          basis:
            lot && setbacks
              ? 'Screened against the drawn lot, reported setbacks and mapped access.'
              : 'Enclosed footprint fits the existing pad with mapped access.',
        },
      };
    }
  }
  return {
    reason:
      h.rearLoadPrecedent
        ? 'No full-size placement cleared the available footprint, setbacks, rear garage approach and separate front walk.'
        : 'No full-size placement cleared the available footprint, setbacks and mapped approaches. The base scheme is available.',
  };
}
