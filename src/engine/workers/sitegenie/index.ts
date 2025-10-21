import { GenerateReq } from "./messages";
import { computeParcelMetrics } from "@/engine/metrics/parcelMetrics";
import { generateSitePlan } from "./planner";

let activeReqId: string | null = null;

self.onmessage = async (evt: MessageEvent) => {
  const parsed = GenerateReq.safeParse(evt.data);
  if (!parsed.success) return;
  const { reqId, parcel, config } = parsed.data;
  activeReqId = reqId;

  const metrics = parsed.data.metrics ?? computeParcelMetrics(parcel);

  try {
    const result = await generateSitePlan({ parcel, config, metrics });
    if (activeReqId !== reqId) return; // ignore stale
    (self as any).postMessage({ type: "generated", reqId, ...result });
  } catch (e) {
    if (activeReqId !== reqId) return;
    (self as any).postMessage({ type: "generated", reqId, error: String(e) });
  }
};
