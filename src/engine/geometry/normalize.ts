import type { Polygon, MultiPolygon, Position } from "geojson";

export function toPolygon(g: Polygon | MultiPolygon): Polygon {
  if (g.type === "Polygon") return g;
  let best: { poly: Polygon | null; a: number } = { poly: null, a: -1 };
  for (const coords of g.coordinates) {
    const poly: Polygon = { type: "Polygon", coordinates: coords as Position[][] };
    const a = ringArea(poly.coordinates[0]);
    if (a > best.a) best = { poly, a };
  }
  if (!best.poly) throw new Error("normalize failed");
  return best.poly;
}

function ringArea(r: Position[]) { 
  let s = 0; 
  for (let i = 0; i < r.length - 1; i++) {
    const [a, b] = r[i], [c, d] = r[i + 1]; 
    s += a * d - c * b;
  } 
  return Math.abs(s) / 2; 
}
