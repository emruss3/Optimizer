import type { Element } from '../../../engine/types';
import { METERS_PER_FOOT } from '../../../engine/units';
import { lotsFromElements } from './apply';
import { DELK_PARCEL_ID } from './catalogue';
import { fitDelkCottage, fitDesignToLot } from './fit';
import type { HomeDesign } from './originalDesigns';
import { placeHome, residentialHomes } from './placement';
import type { HousingDesignRecord, LotFitInput } from './types';

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

/**
 * Fit-first browse for one selected lot: only designs that place on that house.
 * Empty when typology cannot match (e.g. attached design on a detached pad).
 */
export function designsFittingHouse(
  designs: readonly HomeDesign[],
  house: Element,
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
): HomeDesign[] {
  return designs.filter(
    (design) =>
      designMatchesHouseTypology(design, house) &&
      Boolean(placeHome(design, house, elements, siteBoundary).placement),
  );
}

/** Wrap catalogue index for ← / → browsing without dropping the selected lot. */
export function stepHomeDesignIndex(index: number, length: number, delta: number): number {
  if (length <= 0) return 0;
  return ((index + delta) % length + length) % length;
}

/** Toolbar copy when the scheme allows Home designs but none of the catalogue fit. */
export const HOME_DESIGNS_NONE_FIT_TITLE =
  'No home designs fit the house lots on this plan';

/** True when lot rings look like local feet (not web-mercator metres). */
function ringsLookLikeFeet(lots: LotFitInput[]): boolean {
  let maxAbs = 0;
  for (const lot of lots) {
    for (const [x, y] of lot.ringFt) {
      maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
    }
  }
  return maxAbs > 0 && maxAbs < 10_000;
}

function lotExtentsFt(lot: LotFitInput, assumeMeters: boolean): { w: number; d: number } | null {
  if (lot.ringFt.length < 3) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of lot.ringFt) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  let w = maxX - minX;
  let d = maxY - minY;
  if (assumeMeters) {
    w /= METERS_PER_FOOT;
    d /= METERS_PER_FOOT;
  }
  if (!(w > 0 && d > 0)) return null;
  return { w, d };
}

/** Listing-overall footprint clears a lot AABB in either orientation (rough setback allowance). */
function footprintClearsLot(design: HousingDesignRecord, ext: { w: number; d: number }): boolean {
  const { widthFt: W, depthFt: D } = design.footprint;
  if (!(W > 0 && D > 0)) return false;
  const clearW = ext.w - 10;
  const clearD = ext.d - 25;
  return (W <= clearW && D <= clearD) || (D <= clearW && W <= clearD);
}

/**
 * ABHP / publisher stock that can clear at least one SF lot.
 * Delk uses the trial-cleared cottage path; feet rings use fitDesignToLot;
 * web-mercator sheets fall back to an AABB footprint check in feet.
 * No typed lots → empty (cannot prove fit).
 */
export function eligibleStockPlans(
  designs: readonly HousingDesignRecord[],
  elements: Element[],
  opts?: { parcelId?: string },
): HousingDesignRecord[] {
  if (!designs.length) return [];
  const lots = lotsFromElements(elements);
  if (!lots.length) return [];

  if (opts?.parcelId === DELK_PARCEL_ID) {
    return designs.filter((d) => fitDelkCottage(d, lots).some((f) => f.status === 'placed'));
  }

  if (ringsLookLikeFeet(lots)) {
    return designs.filter((d) => lots.some((lot) => fitDesignToLot(d, lot).status === 'placed'));
  }

  // Sheet rings are metres (EPSG:3857) — convert AABB to feet for a conservative fit.
  return designs.filter((d) =>
    lots.some((lot) => {
      const ext = lotExtentsFt(lot, true);
      return ext ? footprintClearsLot(d, ext) : false;
    }),
  );
}

/**
 * Full toolbar visibility: hide on apartment massing / no house lots.
 * When the scheme allows homes but nothing fits, still show the control disabled.
 */
export function showHomeDesignsControl(opts: {
  layoutShown: 'multifamily' | 'neighborhood' | null;
  product: 'apartments' | 'townhomes';
  elements: Element[];
  designs: readonly HomeDesign[];
  siteBoundary?: Element['geometry'] | null;
  /** Zoning-allowed ABHP stock; further filtered by eligibleStockPlans when provided. */
  stockPlans?: readonly HousingDesignRecord[];
  parcelId?: string;
}): {
  show: boolean;
  enabled: boolean;
  houses: Element[];
  eligible: HomeDesign[];
  eligibleStock: HousingDesignRecord[];
} {
  const houses = residentialHomes(opts.elements);
  if (
    !schemeAllowsHomeDesigns({
      layoutShown: opts.layoutShown,
      product: opts.product,
      houseCount: houses.length,
    })
  ) {
    return { show: false, enabled: false, houses, eligible: [], eligibleStock: [] };
  }
  const eligible = eligibleHomeDesigns(opts.designs, opts.elements, opts.siteBoundary);
  const eligibleStock = opts.stockPlans?.length
    ? eligibleStockPlans(opts.stockPlans, opts.elements, { parcelId: opts.parcelId })
    : [];
  return {
    show: true,
    enabled: eligible.length > 0 || eligibleStock.length > 0,
    houses,
    eligible,
    eligibleStock,
  };
}
