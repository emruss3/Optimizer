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
  // use metrics.areaSqft instead of reading from undefined
  // pass metrics down to all generators
  const buildings = generateBuildingFootprints(parcel, config, metrics.areaSqft);
  const parking = generateParking(parcel, config, Math.ceil(buildings.reduce((sum, b) => sum + (b.properties.units || 0), 0) * (config.parking?.targetRatio || 1.5)));
  
  // Combine all elements
  const allElements = [...buildings, ...parking.features];
  
  // Calculate compliance metrics
  const report = calculateMetrics(allElements, metrics.areaSqft, config);
  
  return { 
    elements: allElements, 
    metrics: report,
    envelope: {
      geometry: parcel,
      areaSqFt: metrics.areaSqft,
      bounds: {
        minX: metrics.bbox[0],
        minY: metrics.bbox[1], 
        maxX: metrics.bbox[2],
        maxY: metrics.bbox[3]
      }
    },
    processingTime: 0 // Will be calculated by caller
  };
}
