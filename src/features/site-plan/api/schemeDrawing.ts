// The drawing of a saved scheme, fetched without touching the workspace: a
// view-only replay from the scheme's seed and pins under the context it was
// saved with. Nothing is persisted and the plan on screen does not change.
import type { Element } from '../../../engine/types';
import {
  generateMfSitePlan,
  generateMfSitePlanV2,
  generateThSitePlan,
  isSeedFamilyResponse,
  mfPlanToElements,
  seedFamilyPlanToElements,
  type MfCandidate,
} from './generateMfPlan';

export const isTownhomeScheme = (c: MfCandidate): boolean => c.metrics.unit_w_ft != null;

export async function loadSchemeDrawing(ogcFid: number, c: MfCandidate): Promise<Element[] | null> {
  const opts = { seed: c.seed, pins: c.pins, parentId: c.parentId, persist: false };
  const resp = c.contextId
    ? isTownhomeScheme(c)
      ? await generateThSitePlan(ogcFid, c.contextId, opts)
      : await generateMfSitePlanV2(ogcFid, c.contextId, opts)
    : await generateMfSitePlan(ogcFid, opts);
  if (!resp || resp.error || !resp.buildings || resp.buildings.length === 0) return null;
  const mapped = isSeedFamilyResponse(resp) ? seedFamilyPlanToElements(resp) : mfPlanToElements(resp);
  return mapped.elements.length > 0 ? mapped.elements : null;
}
