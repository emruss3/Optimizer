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

/** Runs only on fresh SF-v1 solves, after explicit assignments have been carried.
 * Non-matches keep the surveyed/solver geometry and legacy IDs for traceability. */
export function placeStarterHomes(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
): Element[] {
  const houses = residentialHomes(elements);
  if (!siteBoundary || maxHeightFt == null || !Number.isFinite(maxHeightFt) || maxHeightFt <= 0 || houses.length > MAX_PILOT_LOTS) return elements;
  const candidates = STARTERS.flatMap(id => {
    const design = findHome(id);
    return design && roofHeight(design) <= maxHeightFt ? [design] : [];
  });
  let plan = elements;
  for (const house of houses) {
    if (!isProvisionalPad(house) || house.properties.townhome) continue;
    if (!parentLotOf(house, plan)?.properties.homeSetbacksFt) continue;
    for (const design of candidates) {
      const fit = placeHome(design, house, plan, siteBoundary, maxHeightFt);
      if (!fit.placement) continue;
      plan = fit.placement.elements.map(e => e.id !== house.id ? e : {
        ...e,
        properties: {
          ...e.properties,
          housingAssignmentSource: 'starter',
          housingFitReason: 'Suggested concept. Screened against the drawn lot, recorded setbacks and mapped access. Grading and architectural sheets are not verified.',
          housingPreviousEnginePlan: house.properties.housePlan,
        },
      });
      break;
    }
  }
  return plan;
}
