/**
 * Apply a chosen housing design onto SF pad/lot elements for the session.
 * Mutates a shallow copy of elements — does not rewrite engine geometry.
 */
import type { Element } from '../../../engine/types';
import { DELK_COTTAGE_1754_00010, DELK_PARCEL_ID, housingDesignById } from './catalogue';
import { fitDelkCottage, fitDesignToLot } from './fit';
import { placementToElementProps, rememberHousingChoice } from './handoff';
import type { DesignFitResult, HousingDesignRecord, LotFitInput } from './types';
import { DEFAULT_HOME_SETBACKS, houseEligibility, ringAreaSf } from './eligibility';

export interface ApplyHousingResult {
  elements: Element[];
  fits: DesignFitResult[];
  design: HousingDesignRecord;
  /** Lots that stay unplaced, with reason strings. */
  unplaced: Array<{ lotIndex: number; reason: string }>;
}

function ringFromElement(el: Element): Array<[number, number]> | null {
  const coords = el.geometry?.coordinates?.[0];
  if (!Array.isArray(coords) || coords.length < 3) return null;
  return coords.map(c => [Number(c[0]), Number(c[1])] as [number, number]);
}

/** Build lot fit inputs from SF lot elements (order = lot index). */
export function lotsFromElements(
  elements: Element[],
  setbacks: { front: number; side: number; rear: number } = { front: 20, side: 5, rear: 20 },
): LotFitInput[] {
  const lots = elements
    .filter(el => /^sfv1:lot-/.test(el.id) || /^Lot\s+\d+/i.test(el.name ?? ''))
    .sort((a, b) => {
      const na = Number(/(\d+)/.exec(a.id)?.[1] ?? /Lot\s+(\d+)/i.exec(a.name ?? '')?.[1] ?? 0);
      const nb = Number(/(\d+)/.exec(b.id)?.[1] ?? /Lot\s+(\d+)/i.exec(b.name ?? '')?.[1] ?? 0);
      return na - nb;
    });
  return lots.map((el, i) => {
    const ring = ringFromElement(el) ?? [];
    const kind = typeof el.properties?.lotKind === 'string' ? el.properties.lotKind : null;
    return {
      ringFt: ring,
      frontage: null, // unresolved unless a typed frontage edge is supplied later
      setbacks,
      lotKind: kind,
      lotIndex: i,
    };
  });
}

/**
 * Stamp the chosen design onto each pad that fits; leave others with an
 * unplaced reason on the matching lot. Remembers the choice for the scheme key.
 */
export function applyHousingDesign(opts: {
  parcelId: string;
  schemeKey: string;
  designId: string;
  elements: Element[];
  setbacks?: { front: number; side: number; rear: number };
}): ApplyHousingResult | null {
  const design = housingDesignById(opts.designId);
  if (!design || design.footprint.widthFt <= 0) return null;

  rememberHousingChoice(opts.schemeKey, design.id);
  const lots = lotsFromElements(opts.elements, opts.setbacks);
  const fits =
    String(opts.parcelId) === DELK_PARCEL_ID && design.id === DELK_COTTAGE_1754_00010.id
      ? fitDelkCottage(design, lots)
      : lots.map(lot => fitDesignToLot(design, lot));

  const pads = opts.elements
    .filter(el => el.type === 'building' && (el.properties as Record<string, unknown> | undefined)?.house === true)
    .sort((a, b) => {
      const na = Number(/(\d+)/.exec(a.id)?.[1] ?? 0);
      const nb = Number(/(\d+)/.exec(b.id)?.[1] ?? 0);
      return na - nb;
    });

  const byId = new Map(opts.elements.map(el => [el.id, { ...el, properties: { ...(el.properties ?? {}) } }]));
  const unplaced: ApplyHousingResult['unplaced'] = [];

  fits.forEach((fit, i) => {
    const pad = pads[i];
    const lot = lots[i];
    if (!fit.placement || fit.status !== 'placed') {
      unplaced.push({ lotIndex: i, reason: fit.reason });
      if (pad) {
        const el = byId.get(pad.id);
        if (el) {
          Object.assign(el.properties!, placementToElementProps(design, null, {
            schematic: true,
            unrecoveredReason: fit.reason,
          }), {
            housingPlacementStatus: 'unplaced',
            housingFitReason: fit.reason,
          });
        }
      }
      if (lot) {
        const lotEl = opts.elements.find(e => e.id.endsWith(`lot-${i + 1}`));
        if (lotEl) {
          const el = byId.get(lotEl.id);
          if (el) {
            el.properties = {
              ...el.properties,
              housingFitReason: fit.reason,
              housingPlacementStatus: 'unplaced',
              housingDesignId: design.id,
            };
          }
        }
      }
      return;
    }
    if (pad) {
      const el = byId.get(pad.id);
      if (el) {
        Object.assign(el.properties!, placementToElementProps(design, fit.placement));
        el.name = `House ${i + 1} · ${design.beds} bed · ${design.heatedSf.toLocaleString()} sf`;
      }
    }
  });

  return {
    elements: opts.elements.map(el => byId.get(el.id) ?? el),
    fits,
    design,
    unplaced,
  };
}

export type ApplyHouseResult =
  | { ok: true; elements: Element[]; design: HousingDesignRecord; houseId: string; lotLabel: string; reason: string }
  | { ok: false; reason: string };

/**
 * Change the home on one lot (audit 2026-11-26): re-check the chosen design
 * against that house's lot through the shared eligibility result, then
 * replace that pad's outline with the placed footprint and stamp the design
 * on that pad and its lot only. Every other house keeps its identity and
 * geometry. A design that no longer fits (the scheme was redrawn) is refused
 * with the reason; nothing changes.
 */
export function applyStockDesignToHouse(opts: {
  designId: string;
  houseId: string;
  elements: Element[];
  setbacks?: { front: number; side: number; rear: number };
  schemeKey?: string;
}): ApplyHouseResult {
  const design = housingDesignById(opts.designId);
  if (!design) return { ok: false, reason: 'that plan is not in the catalogue' };
  const house = opts.elements.find(e => e.id === opts.houseId);
  if (!house) return { ok: false, reason: 'that house is no longer on the plan — the scheme was redrawn' };
  const row = houseEligibility(house, [design], opts.elements, opts.setbacks ?? DEFAULT_HOME_SETBACKS);
  const hit = row.eligible[0];
  if (!hit || !hit.fit.placement || !hit.fit.footprint3857) {
    return { ok: false, reason: `${design.name} does not fit ${row.lotLabel}: ${row.rejected[0]?.reason ?? row.lotProblem ?? 'not placed'}` };
  }
  const footprintSf = Math.round(ringAreaSf(hit.fit.footprint3857));
  const n = /(\d+)$/.exec(row.lotId ?? house.id)?.[1] ?? '';
  // a concept study placed here before leaves its own anchors, gross area and parts (porch,
  // walk, pad): none of them belongs to the stock plan (PR 221 audit, stale product metadata)
  const conceptKeys = ['homeEntry3857', 'homeVehicle3857', 'homeOrigin', 'homeAxis', 'homeGrossSf', 'heightFt', 'storiesAssumed', 'floorplanId', 'label'];
  const isPart = (e: Element) => e.id.startsWith(house.id + '-home-');
  const elements = opts.elements.filter(e => !isPart(e)).map(el => {
    if (el.id === house.id) {
      const kept = Object.fromEntries(Object.entries(el.properties ?? {}).filter(([k]) => !conceptKeys.includes(k)));
      return {
        ...el,
        name: `House ${n} · ${design.beds} bed · ${design.heatedSf.toLocaleString()} sf`,
        geometry: { type: 'Polygon', coordinates: [hit.fit.footprint3857!.map(p => [p[0], p[1]])] } as Element['geometry'],
        properties: {
          ...kept,
          ...placementToElementProps(design, hit.fit.placement),
          lotId: row.lotId ?? undefined,
          floors: design.stories,
          stories: design.stories,
          houseBeds: design.beds,
          houseBaths: design.baths ?? undefined,
          houseFootprintSf: footprintSf,
          areaSqFt: footprintSf,
          housePlan: design.planNumber,
          houseSource: design.source.publisher,
          housingFitReason: hit.fit.reason,
        },
      };
    }
    if (row.lotId && el.id === row.lotId) {
      return {
        ...el,
        properties: {
          ...(el.properties ?? {}),
          housingDesignId: design.id,
          housingPlacementStatus: 'placed',
          housingFitReason: hit.fit.reason,
          houseLabel: `${design.beds} bed · ${design.heatedSf.toLocaleString()} sf`,
          houseBeds: design.beds,
          houseBaths: design.baths ?? undefined,
          houseFootprintSf: footprintSf,
        },
      };
    }
    return el;
  });
  if (opts.schemeKey) rememberHousingChoice(`${opts.schemeKey}|${house.id}`, design.id);
  return { ok: true, elements, design, houseId: house.id, lotLabel: row.lotLabel, reason: hit.fit.reason };
}

export interface ApplyHousesResult {
  elements: Element[];
  applied: Array<{ houseId: string; lotLabel: string }>;
  refused: Array<{ houseId: string; reason: string }>;
  design: HousingDesignRecord | null;
}

/**
 * Apply one stock plan to several chosen lots as one change (PR 221 audit: "Apply to selected
 * lots"). Each lot is re-checked on the plan as it stands after the lots before it, so a lot the
 * plan no longer fits is refused with its reason and the others still change.
 */
export function applyStockDesignToHouses(opts: {
  designId: string;
  houseIds: string[];
  elements: Element[];
  setbacks?: { front: number; side: number; rear: number };
  schemeKey?: string;
}): ApplyHousesResult {
  let elements = opts.elements;
  const applied: ApplyHousesResult['applied'] = [];
  const refused: ApplyHousesResult['refused'] = [];
  let design: HousingDesignRecord | null = null;
  for (const houseId of opts.houseIds) {
    const r = applyStockDesignToHouse({ designId: opts.designId, houseId, elements, setbacks: opts.setbacks, schemeKey: opts.schemeKey });
    if (r.ok) { elements = r.elements; applied.push({ houseId, lotLabel: r.lotLabel }); design = r.design; }
    else refused.push({ houseId, reason: r.reason });
  }
  return { elements, applied, refused, design };
}
