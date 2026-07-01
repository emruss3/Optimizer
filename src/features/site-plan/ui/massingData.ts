import type { Element } from '../../../engine/types';
import { METERS_PER_FOOT } from '../../../engine/units';

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
export function buildMassingData(elements: Element[]): { polygons: MassingPolygon[]; extent: number } {
  const drawable = elements.filter(
    e => TYPE_COLORS[e.type] && e.geometry?.coordinates?.[0]?.length >= 4
  );
  if (drawable.length === 0) return { polygons: [], extent: 100 };

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

  const extent = Math.max((maxX - minX) * k, (maxY - minY) * k, 10);
  return { polygons, extent };
}
