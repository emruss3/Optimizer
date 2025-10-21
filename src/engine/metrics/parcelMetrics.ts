import type { Polygon } from "geojson";
import { area as turfArea, bbox as turfBbox } from "@turf/turf";

export type ParcelMetrics = {
  areaSqft: number;
  bbox: [number, number, number, number];
  perimeterFeet: number;
};

// quick geodesic-ish perimeter using bbox scale; replace later with turf.length if needed
function estimatePerimeterFeet(ring: number[][]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    total += Math.hypot(dx, dy);
  }
  return total; // placeholder; it's only used for ratios/guards right now
}

export function computeParcelMetrics(parcel: Polygon): ParcelMetrics {
  const f = { type: "Feature", properties: {}, geometry: parcel } as const;
  const sqm = turfArea(f);
  const SQM_TO_SQFT = 10.7639;
  const bbox = turfBbox(f) as [number, number, number, number];
  const perimeterFeet = estimatePerimeterFeet(parcel.coordinates[0]);
  return { areaSqft: sqm * SQM_TO_SQFT, bbox, perimeterFeet };
}
