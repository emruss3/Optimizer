import type { Polygon, MultiPolygon } from 'geojson';
import { areaM2, bbox, difference, intersection, normalizeToPolygon, polygons, union } from './geometry';

type ParkingBaySpec = {
  stallW: number;
  stallD: number;
  aisleW: number;
  anglesDeg: number[];
  clearanceM?: number;
};

type ParkingBayWithStalls = {
  polygon: Polygon;
  stalls: number;
};

export type ParkingBaySolution = {
  bays: Polygon[];
  aisles: Polygon[];
  stallsAchieved: number;
  chosenAngleDeg: number;
  baysWithStalls?: ParkingBayWithStalls[];
  /** Drive aisle circulation polygons (main drive + connectors) */
  circulationPolygons: Polygon[];
  /** Site access point (midpoint of longest envelope edge) */
  accessPoint: [number, number];
  /** Whether all bays are connected to the main drive */
  isFullyConnected: boolean;
  /** Total area of circulation polygons in sq metres */
  circulationAreaSqM: number;
};

const MIN_POLY_AREA_M2 = 2;
const MAX_OUTPUT_POLYS = 50;
/** Two-way drive aisle width = 24ft ≈ 7.3152m */
const MAIN_DRIVE_WIDTH_M = 7.3152;
/** Connection proximity threshold = 5ft ≈ 1.524m */
const CONNECTION_THRESHOLD_M = 1.524;

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

// ─── Circulation helpers ─────────────────────────────────────────────────────

/**
 * Find the longest edge of the envelope and return its midpoint.
 */
function findAccessPoint(envelope: Polygon): { accessPoint: [number, number]; edgeStart: number[]; edgeEnd: number[]; edgeLen: number } {
  const ring = envelope.coordinates[0];
  let bestLen = 0;
  let bestStart = ring[0];
  let bestEnd = ring[1] || ring[0];

  for (let i = 0; i < ring.length - 1; i++) {
    const dx = ring[i + 1][0] - ring[i][0];
    const dy = ring[i + 1][1] - ring[i][1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > bestLen) {
      bestLen = len;
      bestStart = ring[i];
      bestEnd = ring[i + 1];
    }
  }

  const accessPoint: [number, number] = [
    (bestStart[0] + bestEnd[0]) / 2,
    (bestStart[1] + bestEnd[1]) / 2,
  ];

  return { accessPoint, edgeStart: bestStart, edgeEnd: bestEnd, edgeLen: bestLen };
}

/**
 * Compute the centroid of a polygon's outer ring.
 */
function polyCentroid(poly: Polygon): [number, number] {
  const ring = poly.coordinates[0];
  const n = ring.length - 1; // exclude closing vertex
  if (n <= 0) return [0, 0];
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) {
    cx += ring[i][0];
    cy += ring[i][1];
  }
  return [cx / n, cy / n];
}

/**
 * Minimum distance between two polygon centroids/edges.
 * Simplified: uses bbox proximity.
 */
function minDistBetweenPolygons(a: Polygon, b: Polygon): number {
  const ab = bbox(a);
  const bb = bbox(b);
  // Overlap check
  if (ab.maxX >= bb.minX && ab.minX <= bb.maxX && ab.maxY >= bb.minY && ab.minY <= bb.maxY) {
    return 0;
  }
  // Distance between closest bbox edges
  const dx = Math.max(0, Math.max(ab.minX - bb.maxX, bb.minX - ab.maxX));
  const dy = Math.max(0, Math.max(ab.minY - bb.maxY, bb.minY - ab.maxY));
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build a rectangle polygon representing a drive aisle segment between two points.
 */
function buildDriveSegment(
  x1: number, y1: number,
  x2: number, y2: number,
  width: number
): Polygon {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.01) {
    // Degenerate — return a small square
    const hw = width / 2;
    return createRect(x1 - hw, y1 - hw, x1 + hw, y1 + hw);
  }
  const nx = -dy / len * (width / 2);
  const ny = dx / len * (width / 2);
  return {
    type: 'Polygon',
    coordinates: [[
      [x1 + nx, y1 + ny],
      [x2 + nx, y2 + ny],
      [x2 - nx, y2 - ny],
      [x1 - nx, y1 - ny],
      [x1 + nx, y1 + ny],
    ]]
  };
}

/**
 * Build the main drive aisle from the access point through the site center,
 * and connectors to each bay's aisle.
 */
function buildCirculation(
  envelope: Polygon,
  aisles: Polygon[],
  bays: Polygon[],
  chosenAngleDeg: number
): {
  circulationPolygons: Polygon[];
  accessPoint: [number, number];
  isFullyConnected: boolean;
  circulationAreaSqM: number;
} {
  const { accessPoint, edgeStart, edgeEnd } = findAccessPoint(envelope);
  const envBounds = bbox(envelope);

  // Direction: from access point towards the site interior (perpendicular to the longest edge)
  const edgeDx = edgeEnd[0] - edgeStart[0];
  const edgeDy = edgeEnd[1] - edgeStart[1];
  const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
  // Normal pointing inward
  let nx = -edgeDy / edgeLen;
  let ny = edgeDx / edgeLen;

  // Ensure normal points towards center of envelope
  const envCx = (envBounds.minX + envBounds.maxX) / 2;
  const envCy = (envBounds.minY + envBounds.maxY) / 2;
  const toCenter = [envCx - accessPoint[0], envCy - accessPoint[1]];
  if (nx * toCenter[0] + ny * toCenter[1] < 0) {
    nx = -nx;
    ny = -ny;
  }

  // Main drive: from access point to opposite side of envelope
  const maxDist = Math.sqrt(
    (envBounds.maxX - envBounds.minX) ** 2 + (envBounds.maxY - envBounds.minY) ** 2
  );
  const driveEndX = accessPoint[0] + nx * maxDist;
  const driveEndY = accessPoint[1] + ny * maxDist;

  // Build main drive rectangle
  const mainDriveRaw = buildDriveSegment(
    accessPoint[0], accessPoint[1],
    driveEndX, driveEndY,
    MAIN_DRIVE_WIDTH_M
  );

  // Clip to envelope
  const mainDriveClipped = asPolygonList(intersection(envelope, mainDriveRaw));
  const circulationPolygons: Polygon[] = [...mainDriveClipped];

  // Build connectors: for each bay aisle, if not within threshold of main drive, add connector
  const allAislesAndBays = [...aisles, ...bays];
  let connectedCount = 0;

  for (const aisle of aisles) {
    const aisleCentroid = polyCentroid(aisle);

    // Check if aisle is within threshold of any main drive polygon
    let isConnected = false;
    for (const drive of mainDriveClipped) {
      if (minDistBetweenPolygons(aisle, drive) <= CONNECTION_THRESHOLD_M) {
        isConnected = true;
        break;
      }
    }

    if (isConnected) {
      connectedCount++;
      continue;
    }

    // Not connected — add connector from aisle centroid to nearest point on main drive
    let nearestDist = Infinity;
    let nearestPoint: [number, number] = [envCx, envCy];
    for (const drive of mainDriveClipped) {
      const driveCentroid = polyCentroid(drive);
      const dist = Math.sqrt(
        (aisleCentroid[0] - driveCentroid[0]) ** 2 +
        (aisleCentroid[1] - driveCentroid[1]) ** 2
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPoint = driveCentroid;
      }
    }

    const connector = buildDriveSegment(
      aisleCentroid[0], aisleCentroid[1],
      nearestPoint[0], nearestPoint[1],
      MAIN_DRIVE_WIDTH_M
    );
    const connectorClipped = asPolygonList(intersection(envelope, connector));
    circulationPolygons.push(...connectorClipped);
    connectedCount++;
  }

  const isFullyConnected = aisles.length === 0 || connectedCount >= aisles.length;
  const circulationAreaSqM = circulationPolygons.reduce((s, p) => s + areaM2(p), 0);

  return {
    circulationPolygons,
    accessPoint,
    isFullyConnected,
    circulationAreaSqM,
  };
}

// ─── Main solver ─────────────────────────────────────────────────────────────

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

  // Iterative subtraction to preserve MultiPolygon components
  let candidateParts: Polygon[] = polygons(envelope);
  for (const rect of clearanceRects) {
    const newParts: Polygon[] = [];
    for (const part of candidateParts) {
      const diff = difference(part, rect);
      const diffPolys = polygons(diff);
      newParts.push(...diffPolys);
    }
    candidateParts = newParts.filter(poly => areaM2(poly) > MIN_POLY_AREA_M2);
  }
  const candidatePolys = candidateParts;

  const { accessPoint: siteAccessPoint } = findAccessPoint(envelope);

  if (candidatePolys.length === 0) {
    return {
      bays: [],
      aisles: [],
      stallsAchieved: 0,
      chosenAngleDeg: spec.anglesDeg[0] ?? 0,
      circulationPolygons: [],
      accessPoint: siteAccessPoint,
      isFullyConnected: true,
      circulationAreaSqM: 0,
    };
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
  let bestBaysWithStalls: ParkingBayWithStalls[] = [];

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
    let baysWithStalls: ParkingBayWithStalls[] = [];

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

          const bay1Polys = asPolygonList(intersection(clip, bay1));
          const bay2Polys = asPolygonList(intersection(clip, bay2));

          bay1Polys.forEach(poly => {
            baysWithStalls.push({ polygon: poly, stalls: stallsPerSide });
          });
          bay2Polys.forEach(poly => {
            baysWithStalls.push({ polygon: poly, stalls: stallsPerSide });
          });

          bays = bays.concat(bay1Polys);
          aisles = aisles.concat(asPolygonList(intersection(clip, aisle)));
          bays = bays.concat(bay2Polys);
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
      bestBaysWithStalls = baysWithStalls.map(({ polygon, stalls }) => ({
        polygon: rotatePolygonAround(polygon, origin, angleDeg),
        stalls
      }));
    }
  }

  // Merge bays and aisles for rendering
  const mergedBays = mergePolygons(bestBays);
  const mergedAisles = mergePolygons(bestAisles);

  // Build circulation spine + connectors
  const circulation = buildCirculation(
    envelope,
    mergedAisles,
    mergedBays,
    bestAngle
  );

  return {
    bays: mergedBays,
    aisles: mergedAisles,
    stallsAchieved: bestStalls,
    chosenAngleDeg: bestAngle,
    baysWithStalls: bestBaysWithStalls.length > 0 ? bestBaysWithStalls : undefined,
    circulationPolygons: circulation.circulationPolygons,
    accessPoint: circulation.accessPoint,
    isFullyConnected: circulation.isFullyConnected,
    circulationAreaSqM: circulation.circulationAreaSqM,
  };
}
