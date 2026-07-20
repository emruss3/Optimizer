import type { Element } from '../../../engine/types';
import { METERS_PER_FOOT } from '../../../engine/units';
import { pointsAlongSegment, type Segment } from '../../../components/site-planner/planRendering';

export interface MassingPolygon {
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

/** Ground floor 14 ft + 10 ft per upper floor, in metres. */
export function buildingHeightM(floors: number): number {
  const f = Math.max(1, Math.floor(Number.isFinite(floors) ? floors : 1));
  return (4 + 10 * f) * METERS_PER_FOOT;
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
  }
): {
  polygons: MassingPolygon[];
  extent: number;
  groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }>;
  contextPolygons: MassingPolygon[];
  /** Street-tree positions in the same centred local frame */
  trees: Array<{ position: [number, number] }>;
  /** Spandrel rings at every floor line + parapet — the massing reads as a
   *  building with real floors, not an extruded slab. */
  floorLines: Array<{ path: number[][] }>;
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
      floorLines: [], origin: { latDeg: 0, lonDeg: 0 },
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
  // EPSG:3857 → ground metres at this latitude
  const latRad = 2 * Math.atan(Math.exp(cy / 6378137)) - Math.PI / 2;
  const k = Math.cos(latRad);

  const polygons: MassingPolygon[] = drawable.map(el => ({
    polygon: el.geometry.coordinates.map(ring =>
      ring.map(([x, y]) => [(x - cx) * k, (y - cy) * k])
    ),
    elevation:
      el.type === 'building'
        ? buildingHeightM((el.properties?.floors as number) ?? 1)
        : 0.15, // flatwork gets a sliver of height so it reads above the ground plane
    color: TYPE_COLORS[el.type],
    label:
      el.type === 'building'
        ? `${el.name ?? el.id} · ${Math.max(1, Math.floor((el.properties?.floors as number) ?? 1))} floors`
        : el.name ?? el.id,
  }));

  // Parcel + envelope outlines on the ground plane, in the SAME centred frame
  const groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }> = [];
  const toLocal = (ring: number[][]) => ring.map(([x, y]) => [(x - cx) * k, (y - cy) * k, 0.05]);
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
      polygon: [ring.map(([x, y]) => [(x - cx) * k, (y - cy) * k])],
      elevation: 0.05,
      color: [241, 245, 249, 160],
      label: 'Neighboring parcel',
    });
  }
  for (const b of ground?.contextBuildings ?? []) {
    const ring = b.polygon?.coordinates?.[0];
    if (!ring || ring.length < 4) continue;
    contextPolygons.push({
      polygon: [ring.map(([x, y]) => [(x - cx) * k, (y - cy) * k])],
      elevation: buildingHeightM(b.stories),
      color: [255, 255, 255, 235],
      label: `Existing · ${Math.max(1, Math.round(b.stories))} floors`,
    });
  }

  // Street trees mirror the 2D landscape pass: planted along FRONT property
  // edges at 10 m spacing (4 m end inset), skipping points near a drive so
  // the curb cut stays clear. Same rules, same trees — only the projection
  // into the centred frame differs.
  const trees: Array<{ position: [number, number] }> = [];
  if (ground?.frontEdges?.length) {
    const driveRings = elements
      .filter(e => e.type === 'circulation')
      .map(e => e.geometry?.coordinates?.[0])
      .filter((r): r is number[][] => Array.isArray(r));
    const nearDrive = (x: number, y: number): boolean =>
      driveRings.some(ring => ring.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 8));
    for (const edge of ground.frontEdges) {
      for (const [tx, ty] of pointsAlongSegment(edge, 10, 4)) {
        if (nearDrive(tx, ty)) continue;
        trees.push({ position: [(tx - cx) * k, (ty - cy) * k] });
      }
    }
  }

  // Floor banding: a spandrel ring at every intermediate floor line (ground
  // floor is 14 ft, uppers 10 ft — same arithmetic as buildingHeightM) plus
  // a parapet ring at the roof line.
  const floorLines: Array<{ path: number[][] }> = [];
  for (const el of drawable) {
    if (el.type !== 'building') continue;
    const floors = Math.max(1, Math.floor((el.properties?.floors as number) ?? 1));
    const ring = el.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    const local = ring.map(([x, y]) => [(x - cx) * k, (y - cy) * k]);
    for (let fl = 1; fl <= Math.min(floors, 30); fl++) {
      const zFt = fl < floors ? 4 + 10 * fl : 4 + 10 * floors; // parapet at roof
      const z = zFt * METERS_PER_FOOT;
      floorLines.push({ path: local.map(([x, y]) => [x, y, z]) });
    }
  }

  const lonDeg = (cx / 6378137) * (180 / Math.PI);
  const latDeg = latRad * (180 / Math.PI);

  const extent = Math.max((maxX - minX) * k, (maxY - minY) * k, 10);
  return { polygons, extent, groundPaths, contextPolygons, trees, floorLines, origin: { latDeg, lonDeg } };
}
