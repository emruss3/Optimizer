import type { Element } from '../../../engine/types';
import type { HomeDesign } from './originalDesigns';
import { placeHome, residentialHomes } from './placement';

/** Apartment bars on the sheet — Home Studio has nothing to place against. */
export function isApartmentMassingPlan(opts: {
  layoutShown: 'multifamily' | 'neighborhood' | null;
  product: 'apartments' | 'townhomes';
}): boolean {
  return opts.layoutShown === 'multifamily' && opts.product === 'apartments';
}

/**
 * Toolbar / studio gate from product + sheet layout + house lots.
 * Requires residential house footprints (detached or th_v3 attached).
 * Hidden for multifamily apartment massing even if stray pads remain.
 */
export function schemeAllowsHomeDesigns(opts: {
  layoutShown: 'multifamily' | 'neighborhood' | null;
  product: 'apartments' | 'townhomes';
  houseCount: number;
}): boolean {
  if (opts.houseCount <= 0) return false;
  if (isApartmentMassingPlan(opts)) return false;
  if (opts.layoutShown === 'neighborhood') return true;
  if (opts.product === 'townhomes') return true;
  // SF seed / lot-fit / unclassified sheet that still carries house pads
  return opts.layoutShown !== 'multifamily';
}

export function designMatchesHouseTypology(design: HomeDesign, house: Element): boolean {
  return Boolean(house.properties.townhome) === Boolean(design.attached);
}

/** Cheap prefilter: attached designs need townhome pads; detached need house lots. */
export function typologyEligibleHomeDesigns(
  designs: readonly HomeDesign[],
  houses: Element[],
): HomeDesign[] {
  if (!houses.length) return [];
  const hasAttached = houses.some((h) => Boolean(h.properties.townhome));
  const hasDetached = houses.some((h) => !h.properties.townhome);
  return designs.filter((d) => (d.attached ? hasAttached : hasDetached));
}

/**
 * Designs that clear placeHome on at least one scheme house lot.
 * Callers should memoize on elements (and site boundary) — not per keystroke.
 */
export function eligibleHomeDesigns(
  designs: readonly HomeDesign[],
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
): HomeDesign[] {
  const houses = residentialHomes(elements);
  if (!houses.length) return [];
  const candidates = typologyEligibleHomeDesigns(designs, houses);
  return candidates.filter((design) =>
    houses.some(
      (house) =>
        designMatchesHouseTypology(design, house) &&
        Boolean(placeHome(design, house, elements, siteBoundary).placement),
    ),
  );
}

/** Full toolbar visibility: scheme gate + at least one design that fits. */
export function showHomeDesignsControl(opts: {
  layoutShown: 'multifamily' | 'neighborhood' | null;
  product: 'apartments' | 'townhomes';
  elements: Element[];
  designs: readonly HomeDesign[];
  siteBoundary?: Element['geometry'] | null;
}): { show: boolean; houses: Element[]; eligible: HomeDesign[] } {
  const houses = residentialHomes(opts.elements);
  if (
    !schemeAllowsHomeDesigns({
      layoutShown: opts.layoutShown,
      product: opts.product,
      houseCount: houses.length,
    })
  ) {
    return { show: false, houses, eligible: [] };
  }
  const eligible = eligibleHomeDesigns(opts.designs, opts.elements, opts.siteBoundary);
  return { show: eligible.length > 0, houses, eligible };
}
