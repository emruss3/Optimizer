import type { Element } from '../../../engine/types';
import { parentLotOf } from './eligibility';
import { roofHeight } from './drawings';
import { findHome } from './originalDesigns';
import { placeHome, residentialHomes } from './placement';

// Small-lot pilot: these are authored, dimensioned-in-the-model concepts, NOT
// architect-issued plans. Keep the automatic solver independent of stock listings,
// the project's proposed studies and any geometry that hasn't cleared the same fit as Apply.
const STARTERS = ['tn-waverly-lane-v1', 'tn-lockeland-cottage-v1', 'tn-court-cottage-v1', 'tn-harpeth-ranch-v1'];
const MAX_PILOT_LOTS = 12;

export const PROVISIONAL_PAD = 'Provisional building pad';

export function isProvisionalPad(element: Element): boolean {
  const p = element.properties;
  return element.type === 'building' && Boolean(p.house || p.singleFamilyHouse || p.townhome) && !p.housingDesignId;
}

export function isGeometryBackedHome(element: Element): boolean {
  return element.type === 'building' && !!findHome(element.properties.housingDesignId)
    && Array.isArray(element.properties.homeOrigin) && Array.isArray(element.properties.homeAxis);
}

/** Why a lot kept its engine footprint instead of a suggested starter home (audit eb378b1: every lot
 *  gets either a fit-supported home or a reason). */
export interface StarterReport { houseId: string; lot: string; placed: string | null; reason: string | null }

/** Runs only on fresh SF-v1 solves, after explicit assignments have been carried.
 * Non-matches keep the surveyed/solver geometry and legacy IDs for traceability.
 * The screening is the same as manual selection's: placeHome against the drawn lot, its recorded
 * setbacks, mapped access and the recorded height limit. Without a recorded limit nothing is suggested. */
export function placeStarterHomesWithReport(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
): { elements: Element[]; report: StarterReport[]; skipped: string | null } {
  const houses = residentialHomes(elements);
  const height = maxHeightFt != null && Number.isFinite(maxHeightFt) && maxHeightFt > 0 ? maxHeightFt : null;
  const lotName = (h: Element, plan: Element[]) => parentLotOf(h, plan)?.name ?? h.name ?? h.id;
  if (!siteBoundary) return { elements, report: [], skipped: 'the parcel boundary is not a single polygon, so no lot could be screened' };
  if (houses.length > MAX_PILOT_LOTS) return { elements, report: [], skipped: `more than ${MAX_PILOT_LOTS} lots: suggested homes are placed on small plans only for now` };
  // the height limit is required data: without it nothing is suggested (manual choice still works)
  if (height == null) return { elements, report: [], skipped: 'no height limit is recorded for this parcel yet, so no home was suggested automatically' };
  const candidates = STARTERS.flatMap(id => {
    const design = findHome(id);
    return design && roofHeight(design) <= height ? [design] : [];
  });
  let plan = elements;
  const report: StarterReport[] = [];
  for (const house of houses) {
    if (!isProvisionalPad(house)) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: null }); continue; }
    if (house.properties.townhome) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: 'an attached townhome pad: the suggested homes are detached' }); continue; }
    if (!parentLotOf(house, plan)?.properties.homeSetbacksFt) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: 'the lot carries no recorded setbacks to screen against' }); continue; }
    let first: string | null = null, placed: string | null = null;
    for (const design of candidates) {
      const fit = placeHome(design, house, plan, siteBoundary, height);
      if (!fit.placement) { first ??= `${design.name}: ${fit.reason}`; continue; }
      plan = fit.placement.elements.map(e => e.id !== house.id ? e : {
        ...e,
        properties: {
          ...e.properties,
          housingAssignmentSource: 'starter',
          housingFitReason: 'Suggested concept. Screened against the drawn lot, recorded setbacks, mapped access and the height limit. Grading and architectural sheets are not verified.',
          housingPreviousEnginePlan: house.properties.housePlan,
        },
      });
      placed = design.name;
      break;
    }
    report.push({ houseId: house.id, lot: lotName(house, plan), placed, reason: placed ? null : candidates.length ? `no suggested home fits (${first ?? 'none cleared'})` : 'no suggested home is under the height limit' });
  }
  return { elements: plan, report, skipped: null };
}

export function placeStarterHomes(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
): Element[] {
  return placeStarterHomesWithReport(elements, siteBoundary, maxHeightFt).elements;
}
