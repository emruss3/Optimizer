import type { Polygon, MultiPolygon, Position } from "geojson";

// Return a Polygon: if input is Polygon, keep it; if MultiPolygon, pick largest by area (outer ring).
export function toPolygon(geom: Polygon | MultiPolygon): Polygon {
  if (!geom) throw new Error("No geometry provided");
  if (geom.type === "Polygon") return geom;

  let best: { poly: Polygon | null; area: number } = { poly: null, area: -1 };
  for (const coords of geom.coordinates) {
    // coords is PolygonCoords (LinearRings[])
    const poly: Polygon = { type: "Polygon", coordinates: coords as Position[][] };
    const a = ringArea(poly.coordinates[0]);
    if (a > best.area) best = { poly, area: a };
  }
  if (!best.poly) throw new Error("Could not choose polygon from MultiPolygon");
  return best.poly;
}

// Quick shoelace area (planar, good enough for choosing largest ring)
function ringArea(ring: Position[]): number {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    s += (x1 * y2 - x2 * y1);
  }
  return Math.abs(s) / 2;
}
