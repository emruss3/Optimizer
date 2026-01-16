import type { Polygon, MultiPolygon } from 'geojson';
import { areaM2, bbox, difference, intersection, normalizeToPolygon, polygons, union } from './geometry';

type ParkingBaySpec = {
  stallW: number;
  stallD: number;
  aisleW: number;
  anglesDeg: number[];
  clearanceM?: number;
};

type ParkingBaySolution = {
  bays: Polygon[];
  aisles: Polygon[];
  stallsAchieved: number;
  chosenAngleDeg: number;
};

const MIN_POLY_AREA_M2 = 2;
const MAX_OUTPUT_POLYS = 50;

const createRect = (minX: number, minY: number, maxX: number, maxY: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]]
});

const rotatePoint = (x: number, y: number, origin: number[], angleDeg: number): [number, number] => {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = x - origin[0];
  const dy = y - origin[1];
  return [dx * cos - dy * sin + origin[0], dx * sin + dy * cos + origin[1]];
};

const rotatePolygonAround = (polygon: Polygon, origin: number[], angleDeg: number): Polygon => {
  const coords = polygon.coordinates[0].map(([x, y]) => rotatePoint(x, y, origin, angleDeg));
  return { type: 'Polygon', coordinates: [coords] };
};

const mergePolygons = (input: Polygon[]): Polygon[] => {
  if (input.length === 0) return [];
  if (input.length === 1) return input;
  const merged = union(...input);
  const mergedPolys = polygons(merged);
  const sorted = mergedPolys
    .filter(poly => areaM2(poly) > MIN_POLY_AREA_M2)
    .sort((a, b) => areaM2(b) - areaM2(a))
    .slice(0, MAX_OUTPUT_POLYS);
  return sorted;
};

const asPolygonList = (geom: Polygon | MultiPolygon | null): Polygon[] => {
  if (!geom) return [];
  return polygons(geom).filter(poly => areaM2(poly) > MIN_POLY_AREA_M2);
};

export function solveParkingBayPacking(
  envelope: Polygon,
  buildingFootprints: Polygon[],
  spec: ParkingBaySpec
): ParkingBaySolution {
  const bayDepth = spec.stallD + spec.aisleW + spec.stallD;
  const clearanceM = spec.clearanceM ?? Math.max(spec.stallD, spec.stallW);

  const clearanceRects = buildingFootprints.map((footprint) => {
    const bounds = bbox(footprint);
    return createRect(
      bounds.minX - clearanceM,
      bounds.minY - clearanceM,
      bounds.maxX + clearanceM,
      bounds.maxY + clearanceM
    );
  });

  const used = clearanceRects.length > 0 ? normalizeToPolygon(union(...clearanceRects)) : null;
  const candidate = used ? difference(envelope, used) : envelope;
  const candidatePolys = asPolygonList(candidate);

  if (candidatePolys.length === 0) {
    return { bays: [], aisles: [], stallsAchieved: 0, chosenAngleDeg: spec.anglesDeg[0] ?? 0 };
  }

  const envelopeBounds = bbox(envelope);
  const origin: [number, number] = [
    (envelopeBounds.minX + envelopeBounds.maxX) / 2,
    (envelopeBounds.minY + envelopeBounds.maxY) / 2
  ];

  let bestScore = -Infinity;
  let bestAngle = spec.anglesDeg[0] ?? 0;
  let bestBays: Polygon[] = [];
  let bestAisles: Polygon[] = [];
  let bestStalls = 0;

  for (const angleDeg of spec.anglesDeg) {
    const rotatedCandidates = candidatePolys.map(poly => rotatePolygonAround(poly, origin, -angleDeg));
    const candidateBounds = rotatedCandidates.reduce(
      (acc, poly) => {
        const bounds = bbox(poly);
        return {
          minX: Math.min(acc.minX, bounds.minX),
          minY: Math.min(acc.minY, bounds.minY),
          maxX: Math.max(acc.maxX, bounds.maxX),
          maxY: Math.max(acc.maxY, bounds.maxY)
        };
      },
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    let stalls = 0;
    let islandCount = 0;
    let bays: Polygon[] = [];
    let aisles: Polygon[] = [];

    for (let y = candidateBounds.minY; y < candidateBounds.maxY; y += bayDepth) {
      const strip = createRect(candidateBounds.minX, y, candidateBounds.maxX, y + bayDepth);

      for (const candidatePoly of rotatedCandidates) {
        const clipped = intersection(candidatePoly, strip);
        const clippedPolys = asPolygonList(clipped);
        if (clippedPolys.length === 0) continue;

        for (const clip of clippedPolys) {
          const clipBounds = bbox(clip);
          const usableLength = Math.max(0, clipBounds.maxX - clipBounds.minX);
          const stallsPerSide = Math.floor(usableLength / spec.stallW);
          if (stallsPerSide <= 0) continue;

          stalls += stallsPerSide * 2;
          islandCount += 1;

          const bay1 = createRect(clipBounds.minX, y, clipBounds.maxX, y + spec.stallD);
          const aisle = createRect(clipBounds.minX, y + spec.stallD, clipBounds.maxX, y + spec.stallD + spec.aisleW);
          const bay2 = createRect(
            clipBounds.minX,
            y + spec.stallD + spec.aisleW,
            clipBounds.maxX,
            y + bayDepth
          );

          bays = bays.concat(asPolygonList(intersection(clip, bay1)));
          aisles = aisles.concat(asPolygonList(intersection(clip, aisle)));
          bays = bays.concat(asPolygonList(intersection(clip, bay2)));
        }
      }
    }

    const bayArea = bays.reduce((sum, poly) => sum + areaM2(poly), 0);
    const aisleArea = aisles.reduce((sum, poly) => sum + areaM2(poly), 0);
    const candidateArea = rotatedCandidates.reduce((sum, poly) => sum + areaM2(poly), 0);
    const wastedAreaPenalty = Math.max(0, candidateArea - bayArea - aisleArea) * 0.001;
    const islandPenalty = islandCount * 2;
    const score = stalls - wastedAreaPenalty - islandPenalty;

    if (score > bestScore) {
      bestScore = score;
      bestAngle = angleDeg;
      bestStalls = stalls;
      bestBays = bays.map(poly => rotatePolygonAround(poly, origin, angleDeg));
      bestAisles = aisles.map(poly => rotatePolygonAround(poly, origin, angleDeg));
    }
  }

  return {
    bays: mergePolygons(bestBays),
    aisles: mergePolygons(bestAisles),
    stallsAchieved: bestStalls,
    chosenAngleDeg: bestAngle
  };
}
