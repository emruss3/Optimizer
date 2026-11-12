import type { Element } from '../../../engine/types';
import { METERS_PER_FOOT } from '../../../engine/units';
import { pointsAlongSegment, type Segment } from '../../../components/site-planner/planRendering';
import { createGroundFrame } from '../scene/frame';
import { buildingHeight } from '../scene/heights';
import { buildingUse, pavementKind } from '../scene/buildScene';
import { clearestAzimuth, MAX_WINDOWS, type RenderSlab, type RenderWindow } from './renderModel';
import { buildArchitecture } from './architecture';
import { stallStripes } from '../scene/sheetSvg';
import { seeded } from '../scene/landscape';

export interface MassingPolygon {
  /** The plan element's id: the same id the plan and the sheets use. Absent on context. */
  id?: string;
  /** True for a plan building: the only solids that can be selected. */
  building?: boolean;
  /** The plan element's type, for a view that chooses its own materials. */
  kind?: string;
  /** Polygon rings in local metres, centred on the plan's bbox centre */
  polygon: number[][][];
  /** Extrusion height in metres */
  elevation: number;
  color: [number, number, number, number];
  label: string;
}

const TYPE_COLORS: Record<string, [number, number, number, number]> = {
  building: [59, 130, 246, 230],
  'parking-bay': [226, 232, 240, 210],
  parking: [226, 232, 240, 210],
  'parking-aisle': [203, 213, 225, 190],
  circulation: [148, 163, 184, 190],
  greenspace: [134, 239, 172, 170],
};

/** Everything the 3D views draw, in local metres. */
export type MassingData = ReturnType<typeof buildMassingData>;

/** Site materials of the rendered view: pavement, parking and planted
 *  ground. A building's own materials are in renderModel. */
export const SITE_MATERIALS: Record<string, [number, number, number, number]> = {
  street: [128, 128, 126, 255],
  drive: [150, 150, 146, 255],
  driveway: [208, 204, 194, 255],
  'parking-bay': [212, 212, 207, 255],
  parking: [212, 212, 207, 255],
  'parking-aisle': [158, 158, 154, 255],
  circulation: [158, 158, 154, 255],
  greenspace: [170, 202, 144, 255],
};

/** Height of an existing neighborhood building from its story count, in
 *  metres: an estimate, from the one table of story heights (scene/heights). */
export function buildingHeightM(floors: number): number {
  return buildingHeight('existing', floors).aboveGradeFt * METERS_PER_FOOT;
}

/**
 * Convert plan elements (EPSG:3857) into centred, true-ground-metre massing
 * polygons for the 3D view. Applies the Mercator scale factor cos(lat) so
 * horizontal distances match the extrusion heights (which are real metres) —
 * otherwise buildings at Nashville's latitude would look ~24% too squat.
 */
export function buildMassingData(
  elements: Element[],
  ground?: {
    parcelRing?: number[][];
    envelopeRing?: number[][];
    /** Existing neighborhood buildings (3857) — extruded white context */
    contextBuildings?: Array<{ polygon: { coordinates: number[][][] }; stories: number }>;
    /** Neighbor parcel outlines (3857) — flat ground plates */
    contextParcels?: Array<{ coordinates: number[][][] }>;
    /** Front property edges (3857) — street trees plant along these, exactly
     *  like the 2D landscape pass (10 m spacing, 4 m end inset, drive skip) */
    frontEdges?: Segment[];
    /** Trees (3857, canopy radius in metres) from the drawing scene. When
     *  given they are used as they are, so the model and the sheet plant the
     *  same trees. */
    treePoints?: Array<{ at: number[]; radiusM: number }>;
    /** Street centre lines of the block (3857). */
    contextRoads?: Array<{ line: { coordinates: number[][] } }>;
  }
): {
  polygons: MassingPolygon[];
  extent: number;
  groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }>;
  contextPolygons: MassingPolygon[];
  /** Street-tree positions in the same centred local frame */
  trees: Array<{ position: [number, number]; radiusM?: number }>;
  /** Foundation planting from the rendered buildings: x, y, radius. */
  shrubs: Array<[number, number, number]>;
  /** Walks, as lines to be drawn wide under what they follow: the plan's own
   *  streets (with a planted strip inside the walk) and the larger buildings. */
  walks: Array<{ path: number[][]; widthM: number; strip: boolean }>;
  /** Curbs: the edges of the plan's streets and drives. */
  curbs: Array<{ path: number[][] }>;
  /** The block's streets, centre lines in local metres. */
  roads: Array<{ path: number[][] }>;
  /** Stall stripes, where a bay's reported count divides into whole stalls. */
  stripes: Array<{ path: number[][] }>;
  /** Parked cars in some of those stalls. Illustration. */
  cars: RenderSlab[];
  /** Where to look from for an aerial view: degrees clockwise from south,
   *  the diagonal least blocked by the existing buildings. */
  aerialAzimuth: number;
  /** A projected point (EPSG:3857) in this model's local metres. */
  toLocal: (p: number[]) => number[];
  /** Spandrel rings at every floor line + parapet — the massing reads as a
   *  building with real floors, not an extruded slab. */
  floorLines: Array<{ path: number[][] }>;
  /** The rendered buildings: stacked stories in their materials. */
  slabs: RenderSlab[];
  /** Window bays on their walls. Illustration: the plan carries no elevations. */
  windows: RenderWindow[];
  /** Pitched roofs of houses and townhomes. Illustration above the eaves. */
  roofs: RenderWindow[];
  /** The site itself as a planted plate, when the parcel is known. */
  lawn: MassingPolygon[];
  /** Roof-line ring of each building, for the selection outline. */
  roofLines: Array<{ id: string; path: number[][] }>;
  /** Scene origin (derived from the plan's own Mercator frame) — feeds the
   *  sun-study light; never a hardcoded city. */
  origin: { latDeg: number; lonDeg: number };
} {
  const drawable = elements.filter(
    e => TYPE_COLORS[e.type] && e.geometry?.coordinates?.[0]?.length >= 4
  );
  if (drawable.length === 0)
    return {
      polygons: [], extent: 100, groundPaths: [], contextPolygons: [], trees: [],
      floorLines: [], slabs: [], windows: [], roofs: [], lawn: [], roofLines: [], shrubs: [], walks: [], curbs: [], roads: [], stripes: [], cars: [], aerialAzimuth: -38, toLocal: p => p, origin: { latDeg: 0, lonDeg: 0 },
    };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of drawable) {
    for (const ring of el.geometry.coordinates) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // EPSG:3857 → ground metres: the drawing workspace's one frame (scene/frame)
  const frame = createGroundFrame(cx, cy);
  const m = (p: number[]): number[] => frame.toMeters(p);
  // A building's height comes from the one place a story count becomes a
  // height (scene/heights), so the model, the plan and the sheets agree.
  const heightOf = (el: Element) =>
    buildingHeight(buildingUse(el), (el.properties?.floors as number) ?? (el.properties?.stories as number) ?? 1, el.properties?.heightFt);

  const polygons: MassingPolygon[] = drawable.map(el => ({
    id: el.id,
    building: el.type === 'building',
    kind: pavementKind(el) ?? el.type,
    polygon: el.geometry.coordinates.map(ring => ring.map(m)),
    elevation:
      el.type === 'building'
        ? heightOf(el).aboveGradeFt * METERS_PER_FOOT
        : 0.15, // flatwork gets a sliver of height so it reads above the ground plane
    color: TYPE_COLORS[el.type],
    label:
      el.type === 'building'
        ? `${el.name ?? el.id} · ${Math.max(1, Math.floor((el.properties?.floors as number) ?? 1))} floors`
        : el.name ?? el.id,
  }));

  // Parcel + envelope outlines on the ground plane, in the SAME centred frame
  const groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }> = [];
  const toLocal = (ring: number[][]) => ring.map(p => [...m(p), 0.05]);
  if (ground?.parcelRing && ground.parcelRing.length >= 4) {
    groundPaths.push({ path: toLocal(ground.parcelRing), color: [71, 85, 105, 255], widthM: 0.9 });
  }
  if (ground?.envelopeRing && ground.envelopeRing.length >= 4) {
    groundPaths.push({ path: toLocal(ground.envelopeRing), color: [37, 99, 235, 200], widthM: 0.5 });
  }

  // Neighborhood context in the SAME centred frame: existing buildings as
  // white massing (ed_stories × 10 ft), neighbor parcels as ground plates.
  const contextPolygons: MassingPolygon[] = [];
  for (const p of ground?.contextParcels ?? []) {
    const ring = p.coordinates?.[0];
    if (!ring || ring.length < 4) continue;
    contextPolygons.push({
      polygon: [ring.map(m)],
      elevation: 0.05,
      color: [241, 245, 249, 160],
      label: 'Neighboring parcel',
    });
  }
  for (const b of ground?.contextBuildings ?? []) {
    const ring = b.polygon?.coordinates?.[0];
    if (!ring || ring.length < 4) continue;
    contextPolygons.push({
      polygon: [ring.map(m)],
      elevation: buildingHeightM(b.stories),
      color: [255, 255, 255, 235],
      label: `Existing · ${Math.max(1, Math.round(b.stories))} floors`,
    });
  }

  // Street trees mirror the 2D landscape pass: planted along FRONT property
  // edges at 10 m spacing (4 m end inset), skipping points near a drive so
  // the curb cut stays clear. Same rules, same trees — only the projection
  // into the centred frame differs.
  const trees: Array<{ position: [number, number]; radiusM?: number }> = [];
  if (ground?.treePoints) {
    for (const t of ground.treePoints) trees.push({ position: m(t.at) as [number, number], radiusM: t.radiusM });
  } else if (ground?.frontEdges?.length) {
    const driveRings = elements
      .filter(e => e.type === 'circulation')
      .map(e => e.geometry?.coordinates?.[0])
      .filter((r): r is number[][] => Array.isArray(r));
    const nearDrive = (x: number, y: number): boolean =>
      driveRings.some(ring => ring.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 8));
    for (const edge of ground.frontEdges) {
      for (const [tx, ty] of pointsAlongSegment(edge, 10, 4)) {
        if (nearDrive(tx, ty)) continue;
        trees.push({ position: m([tx, ty]) as [number, number] });
      }
    }
  }

  // Floor banding: a spandrel ring at the top of every story, the last at the
  // roof line. The levels are the scene's (scene/heights).
  const floorLines: Array<{ path: number[][] }> = [];
  for (const el of drawable) {
    if (el.type !== 'building') continue;
    const ring = el.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    const local = ring.map(m);
    for (const zFt of heightOf(el).levelsFt.slice(0, 30)) {
      const z = zFt * METERS_PER_FOOT;
      floorLines.push({ path: local.map(([x, y]) => [x, y, z]) });
    }
  }

  // The rendered buildings (architecture.ts). A house turns its front to the
  // nearest pavement; bays widen on a very large plan so the model stays light.
  const roofLines: Array<{ id: string; path: number[][] }> = [];
  const buildings = drawable.filter(el => el.type === 'building');
  const pavement: Array<[number, number]> = drawable
    .filter(el => el.type === 'circulation' || el.type === 'parking-aisle')
    .flatMap(el => densify((el.geometry.coordinates[0] ?? []).map(m)));
  const draw = (scale: number) => {
    const slabs: RenderSlab[] = [], windows: RenderWindow[] = [], roofs: RenderWindow[] = [];
    const shrubs: Array<[number, number, number]> = [];
    for (const el of buildings) {
      const rings = el.geometry.coordinates.map(r => r.map(m));
      const label = `${el.name ?? el.id} · ${Math.max(1, Math.floor((el.properties?.floors as number) ?? 1))} floors`;
      const a = buildArchitecture(el.id, label, rings, buildingUse(el), heightOf(el), pavement, scale);
      slabs.push(...a.slabs);
      windows.push(...a.glass);
      roofs.push(...a.flats);
      shrubs.push(...a.shrubs);
    }
    return { slabs, windows, roofs, shrubs };
  };
  let model = draw(1);
  for (let scale = 1.5; model.windows.length + model.roofs.length > MAX_WINDOWS * 3 && scale <= 6; scale *= 1.5) model = draw(scale);
  const { slabs, windows, roofs, shrubs } = model;
  // walks and curbs follow the plan's own shapes
  const walks: Array<{ path: number[][]; widthM: number; strip: boolean }> = [];
  const curbs: Array<{ path: number[][] }> = [];
  for (const el of drawable) {
    const kind = pavementKind(el);
    const use = el.type === 'building' ? buildingUse(el) : null;
    for (const ring of el.geometry.coordinates) {
      const path = ring.map(p => [...m(p)]);
      if (kind === 'street') walks.push({ path, widthM: 22 * METERS_PER_FOOT, strip: true });
      if (use === 'apartments' || use === 'amenity' || use === 'other') walks.push({ path, widthM: 12 * METERS_PER_FOOT, strip: false });
      if (kind === 'street' || kind === 'drive') curbs.push({ path });
    }
  }
  // stalls: stripes only where they show exactly the count the plan reports
  // (scene/sheetSvg stallStripes), and a car in about half of them
  const stripes: Array<{ path: number[][] }> = [];
  const cars: RenderSlab[] = [];
  const CAR_COLORS: Array<[number, number, number, number]> = [[236, 236, 234, 255], [52, 56, 62, 255], [150, 154, 160, 255], [122, 36, 36, 255], [40, 66, 104, 255], [196, 198, 200, 255]];
  for (const el of drawable) {
    if (el.type !== 'parking' && el.type !== 'parking-bay') continue;
    const count = (el.properties?.parkingSpaces as number | undefined) ?? null;
    const ringM = (el.geometry.coordinates[0] ?? []).map(m);
    const FT = METERS_PER_FOOT;
    const layout = stallStripes(ringM.map(p => [(p[0] ?? 0) / FT, (p[1] ?? 0) / FT] as [number, number]), count);
    if (!layout) continue;
    for (const [u, v] of layout.lines) stripes.push({ path: [[u[0] * FT, u[1] * FT, 0.17], [v[0] * FT, v[1] * FT, 0.17]] });
    const rnd = seeded(el.id.length * 7919 + (count ?? 0));
    layout.stalls.forEach((q, n) => {
      if (rnd() > 0.55) return;
      const [a, b, c, d] = q.map(p => [p[0] * FT, p[1] * FT] as [number, number]) as [[number, number], [number, number], [number, number], [number, number]];
      // the stall's own frame: w across it, l down its depth
      const mid = (p: [number, number], r: [number, number], t: number): [number, number] => [p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t];
      const box = (w0: number, w1: number, l0: number, l1: number): number[][] => {
        const p = (w: number, l: number) => mid(mid(a, b, w), mid(d, c, w), l);
        return [p(w0, l0), p(w1, l0), p(w1, l1), p(w0, l1), p(w0, l0)];
      };
      const color = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] ?? [200, 200, 200, 255];
      const body = box(0.16, 0.84, 0.1, 0.9), cabin = box(0.2, 0.8, 0.32, 0.72);
      cars.push({ id: `car-${el.id}-${n}`, building: true, polygon: [body.map(p => [p[0] ?? 0, p[1] ?? 0, 0.3])], elevation: 0.75, color, part: 'detail', label: 'Parked car' });
      cars.push({ id: `car-${el.id}-${n}`, building: true, polygon: [cabin.map(p => [p[0] ?? 0, p[1] ?? 0, 1.05])], elevation: 0.45, color: [44, 52, 62, 255], part: 'detail', label: 'Parked car' });
    });
  }
  // a car on about half of the driveways, along the drive
  for (const el of drawable) {
    if (pavementKind(el) !== 'driveway') continue;
    const r = (el.geometry.coordinates[0] ?? []).map(m);
    if (r.length !== 5) continue;
    const [a, b, c, d] = r.slice(0, 4).map(p => [p[0] ?? 0, p[1] ?? 0] as [number, number]) as [[number, number], [number, number], [number, number], [number, number]];
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    // p0 to p1 and q0 to q1 are the long sides
    const [p0, p1, q0, q1, long, wide] = lab >= lbc ? [a, b, d, c, lab, lbc] : [b, c, a, d, lbc, lab];
    const rnd = seeded(el.id.length * 104729 + Math.round(long * 100));
    if (long < 6.5 || wide < 2.6 || rnd() > 0.55) continue;
    const mid = (u: [number, number], v: [number, number], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
    const at = (l: number, w: number) => mid(mid(p0, p1, l), mid(q0, q1, l), w);
    const l0 = 0.5 - 2.25 / long, l1 = 0.5 + 2.25 / long, w0 = 0.5 - 0.9 / wide, w1 = 0.5 + 0.9 / wide;
    const body = [at(l0, w0), at(l1, w0), at(l1, w1), at(l0, w1), at(l0, w0)];
    const c0 = l0 + (l1 - l0) * 0.28, c1 = l0 + (l1 - l0) * 0.74, cw0 = w0 + (w1 - w0) * 0.06, cw1 = w1 - (w1 - w0) * 0.06;
    const cabin = [at(c0, cw0), at(c1, cw0), at(c1, cw1), at(c0, cw1), at(c0, cw0)];
    const color = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] ?? [200, 200, 200, 255];
    cars.push({ id: `car-${el.id}`, building: true, polygon: [body.map(p => [p[0], p[1], 0.3])], elevation: 0.75, color, part: 'detail', label: 'Parked car' });
    cars.push({ id: `car-${el.id}`, building: true, polygon: [cabin.map(p => [p[0], p[1], 1.05])], elevation: 0.45, color: [44, 52, 62, 255], part: 'detail', label: 'Parked car' });
  }
  const roads = (ground?.contextRoads ?? [])
    .filter(r => (r.line?.coordinates?.length ?? 0) >= 2)
    .map(r => ({ path: r.line.coordinates.map(p => [...m(p)]) }));
  for (const el of buildings) {
    const top = heightOf(el).aboveGradeFt * METERS_PER_FOOT + 0.05;
    for (const ring of el.geometry.coordinates) roofLines.push({ id: el.id, path: ring.map(p => [...m(p), top]) });
  }

  const lawn: MassingPolygon[] = ground?.parcelRing && ground.parcelRing.length >= 4
    ? [{ polygon: [ground.parcelRing.map(m)], elevation: 0.06, color: [206, 222, 188, 255], label: 'Site' }]
    : [];

  const { lonDeg, latDeg } = frame;

  const extent = Math.max((maxX - minX) * frame.kx, (maxY - minY) * frame.ky, 10);
  return { polygons, extent, groundPaths, contextPolygons, trees, floorLines, slabs, windows, roofs, lawn, roofLines, shrubs, walks, curbs, roads, stripes, cars, toLocal: m, origin: { latDeg, lonDeg },
    aerialAzimuth: clearestAzimuth(
      contextPolygons.filter(c => c.elevation > 1).map(c => {
        const r = c.polygon[0] ?? [];
        const n = Math.max(1, r.length);
        return [r.reduce((a, p) => a + (p[0] ?? 0), 0) / n, r.reduce((a, p) => a + (p[1] ?? 0), 0) / n, c.elevation] as [number, number, number];
      }),
      extent / 2,
    ),
  };
}

/** Points along a ring no more than 4 m apart: a long drive has few corners,
 *  and a house looks for the pavement nearest its door. */
function densify(ring: number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!a || !b) continue;
    const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 0, by = b[1] ?? 0;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}
