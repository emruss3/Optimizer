import type { Polygon } from "geojson";
import type { ParcelMetrics } from "@/engine/metrics/parcelMetrics";

export function generateBuildingFootprints(
  parcel: Polygon,
  config: any,
  metrics: ParcelMetrics
) {
  const siteArea = metrics.areaSqft; // <- crash was here before
  const targetCoverage = (config?.coveragePct ?? 50) / 100;
  const targetBldgArea = siteArea * targetCoverage;

  // … existing footprint layout using targetBldgArea …
  return [];
}
