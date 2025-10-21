import type { Polygon } from "geojson";
import type { ParcelMetrics } from "@/engine/metrics/parcelMetrics";
import { generateBuildingFootprints } from "@/engine/building";
import { generateParking } from "@/engine/parking";
import { calculateMetrics } from "@/engine/analysis";

type PlannerInput = { 
  parcel: Polygon; 
  config: any; 
  metrics: ParcelMetrics; 
};

export async function generateSitePlan({ parcel, config, metrics }: PlannerInput) {
  const buildings = generateBuildingFootprints(parcel, config, metrics);
  const parking = generateParking(parcel, config, metrics);
  return { 
    pads: buildings, 
    parking, 
    report: {/* optional */} 
  };
}
