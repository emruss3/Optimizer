import type { Polygon } from "geojson";
import { area as turfArea, bbox as turfBbox } from "@turf/turf";

export type ParcelMetrics = { 
  areaSqft: number; 
  bbox: [number, number, number, number]; 
  perimeterFeet: number; 
};

export function computeParcelMetrics(parcel: Polygon): ParcelMetrics {
  const f = { type: "Feature", properties: {}, geometry: parcel } as const;
  const SQM_TO_SQFT = 10.7639;
  const areaSqft = turfArea(f) * SQM_TO_SQFT;
  const bbox = turfBbox(f) as [number, number, number, number];
  const ring = parcel.coordinates[0]; 
  let per = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[i + 1]; 
    per += Math.hypot(x2 - x1, y2 - y1);
  }
  return { areaSqft, bbox, perimeterFeet: per };
}
