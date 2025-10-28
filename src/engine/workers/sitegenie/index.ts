import { computeParcelMetrics } from "@/engine/metrics/parcelMetrics";
import { generateSitePlan } from "./planner";

self.onmessage = async (ev) => {
  const { type, reqId, parcel, config } = ev.data || {};
  if (type !== "generate" || !parcel) return;
  const metrics = computeParcelMetrics(parcel);                 // <-- new
  const result = await generateSitePlan({ parcel, config, metrics });
  (self as any).postMessage({ type: "generated", reqId, ...result });
};
