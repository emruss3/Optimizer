import type { Element } from '../../../engine/types';
import { lotsFromElements } from './apply';
import { fitDesignToLot } from './fit';
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
 * Fit-first browse for one selected lot: only concept designs that place on that house.
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

/** Stock plans that clear fitDesignToLot on a given lot envelope. */
export function stockDesignsFittingLot(
  designs: readonly HousingDesignRecord[],
  lot: LotFitInput,
): HousingDesignRecord[] {
  return designs.filter((d) => fitDesignToLot(d, lot).status === 'placed');
}

/**
 * Resolve a LotFitInput for the selected house pad.
 * Prefers the parallel SF lot ring (same index as residentialHomes); falls back
 * to the pad’s own ring as a zero-setback envelope when lots are not drawn.
 */
export function lotFitInputForHouse(
  house: Element,
  elements: Element[],
  setbacks: { front: number; side: number; rear: number } = { front: 20, side: 5, rear: 20 },
): LotFitInput | null {
  const houses = residentialHomes(elements);
  const idx = houses.findIndex((h) => h.id === house.id);
  if (idx < 0) return null;
  const lots = lotsFromElements(elements, setbacks);
  if (lots[idx]) return lots[idx]!;

  const coords = house.geometry?.coordinates?.[0];
  if (!Array.isArray(coords) || coords.length < 3) return null;
  const ringFt = coords.map((c) => [Number(c[0]), Number(c[1])] as [number, number]);
  return {
    ringFt,
    frontage: null,
    // Pad is already the drawn house envelope — do not subtract setbacks again.
    setbacks: { front: 0, side: 0, rear: 0 },
    lotKind: null,
    lotIndex: idx,
  };
}

/** Stock designs that fit the selected house lot (or any lot when none selected). */
export function eligibleStockDesigns(
  designs: readonly HousingDesignRecord[],
  elements: Element[],
  opts?: {
    selectedHouseId?: string | null;
    setbacks?: { front: number; side: number; rear: number };
  },
): HousingDesignRecord[] {
  if (!designs.length) return [];
  const houses = residentialHomes(elements);
  if (!houses.length) return [];
  const setbacks = opts?.setbacks ?? { front: 20, side: 5, rear: 20 };
  const selected = opts?.selectedHouseId
    ? houses.find((h) => h.id === opts.selectedHouseId)
    : undefined;
  if (selected) {
    const lot = lotFitInputForHouse(selected, elements, setbacks);
    return lot ? stockDesignsFittingLot(designs, lot) : [];
  }
  // Scheme-level: keep designs that clear at least one house lot.
  return designs.filter((design) =>
    houses.some((house) => {
      const lot = lotFitInputForHouse(house, elements, setbacks);
      return lot != null && fitDesignToLot(design, lot).status === 'placed';
    }),
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
  /** Optional SF stock; when present, enables the control if any stock fits a lot. */
  stockDesigns?: readonly HousingDesignRecord[];
}): { show: boolean; enabled: boolean; houses: Element[]; eligible: HomeDesign[] } {
  const houses = residentialHomes(opts.elements);
  if (
    !schemeAllowsHomeDesigns({
      layoutShown: opts.layoutShown,
      product: opts.product,
      houseCount: houses.length,
    })
  ) {
    return { show: false, enabled: false, houses, eligible: [] };
  }
  const eligible = eligibleHomeDesigns(opts.designs, opts.elements, opts.siteBoundary);
  const stockOk =
    opts.stockDesigns && opts.stockDesigns.length > 0
      ? eligibleStockDesigns(opts.stockDesigns, opts.elements).length > 0
      : false;
  return {
    show: true,
    enabled: eligible.length > 0 || stockOk || (opts.stockDesigns != null && opts.stockDesigns.length > 0),
    houses,
    eligible,
  };
}
