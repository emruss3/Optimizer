/**
 * One eligibility result for stock house plans, shared by the list, the
 * preview, apply and export (audit 2026-11-26, "one shared eligibility
 * result"). Every caller asks this module; none re-derives fit on its own.
 *
 * Each detached house on the sheet is matched to its parent lot by a stable
 * reference, not by array order: the pad's own `lotId`, then the engine's
 * shared number (`…pad-3` → `…lot-3`), then the lot that contains the pad's
 * centre (older saves). Townhome pads are left out: stock plans are detached.
 */
import type { Element } from '../../../engine/types';
import { residentialHomes } from './placement';
import { fitStockDesignInLot, lotGeometry, pointInPolygon, type LotFitResult, type Pt, type Setbacks } from './lotFit';
import { createGroundFrame } from '../scene/frame';
import type { HousingDesignRecord } from './types';

export const DEFAULT_HOME_SETBACKS: Setbacks = { front: 20, side: 5, rear: 20 };

export interface HouseLotEligibility {
  houseId: string;
  houseName: string;
  lotId: string | null;
  /** "Lot 2", or the house name when no lot is drawn. */
  lotLabel: string;
  /** Designs that place, in catalogue order, each with its placement. */
  eligible: Array<{ design: HousingDesignRecord; fit: LotFitResult }>;
  /** Designs that do not place, with the reason. Diagnostic only, never selectable. */
  rejected: Array<{ design: HousingDesignRecord; reason: string }>;
  /** Why nothing could be tried on this lot (no lot found, front unresolved…). */
  lotProblem: string | null;
}

const isLot = (e: Element) => /(^|[-:])lot-\d+$/.test(e.id) || (/^Lot\s+\d+$/i.test(e.name ?? '') && e.type !== 'building');

const numberOf = (id: string) => /(\d+)$/.exec(id)?.[1] ?? null;

function ring3857(el: Element): Pt[] | null {
  const c = (el.geometry as { coordinates?: number[][][] } | undefined)?.coordinates?.[0];
  return Array.isArray(c) && c.length >= 3 ? c.map(p => [Number(p[0]), Number(p[1])] as Pt) : null;
}

function centre(ring: Pt[]): Pt {
  const pts = ring.slice(0, -1).length >= 3 ? ring.slice(0, -1) : ring;
  return pts.reduce<Pt>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
}

/** The parent lot of a house pad, by stable reference. */
export function parentLotOf(house: Element, elements: Element[]): Element | null {
  const lots = elements.filter(isLot);
  if (!lots.length) return null;
  const ref = house.properties?.lotId;
  if (typeof ref === 'string') {
    const hit = lots.find(l => l.id === ref);
    if (hit) return hit;
  }
  const n = numberOf(house.id);
  const prefix = house.id.replace(/pad-\d+$/, '');
  if (n && prefix !== house.id) {
    const hit = lots.find(l => l.id === `${prefix}lot-${n}`);
    if (hit) return hit;
  }
  const pad = ring3857(house);
  if (!pad) return null;
  const c = centre(pad);
  return lots.find(l => {
    const r = ring3857(l);
    return r != null && pointInPolygon(c, r);
  }) ?? null;
}

/** The 2D drawing can select a lot outline rather than the building on it. */
export function houseForSelection(selected: string | null | undefined, houses: Element[], elements: Element[]): Element | undefined {
  if (!selected) return undefined;
  const direct = houses.find(h => h.id === selected);
  if (direct) return direct;
  if (!elements.some(e => e.id === selected && isLot(e))) return undefined;
  const matches = houses.filter(h => parentLotOf(h, elements)?.id === selected);
  // A shared townhome row can contain several homes. Don't arbitrarily target one.
  return matches.length === 1 ? matches[0] : undefined;
}

/** Detached house pads the stock catalogue can be offered on. */
export function detachedHouses(elements: Element[]): Element[] {
  return residentialHomes(elements).filter(h => !h.properties?.townhome);
}

/** Eligibility of every design on one house's lot. */
export function houseEligibility(
  house: Element,
  designs: readonly HousingDesignRecord[],
  elements: Element[],
  setbacks: Setbacks = DEFAULT_HOME_SETBACKS,
): HouseLotEligibility {
  const lot = parentLotOf(house, elements);
  const base = {
    houseId: house.id,
    houseName: house.name ?? house.id,
    lotId: lot?.id ?? null,
    lotLabel: lot?.name ?? house.name ?? house.id,
  };
  if (!lot) {
    return { ...base, eligible: [], rejected: designs.map(design => ({ design, reason: 'no lot is drawn for this house' })), lotProblem: 'no lot is drawn for this house' };
  }
  const geo = lotGeometry(lot, elements, setbacks);
  if (!geo) {
    return { ...base, eligible: [], rejected: designs.map(design => ({ design, reason: 'lot outline unreadable' })), lotProblem: 'lot outline unreadable' };
  }
  const lotIndex = Math.max(0, Number(numberOf(lot.id) ?? 1) - 1);
  const eligible: HouseLotEligibility['eligible'] = [];
  const rejected: HouseLotEligibility['rejected'] = [];
  // Smallest footprints first: a plan at least as wide and as deep as one that did not fit
  // cannot fit either (both orientations are tried), so it is refused without a search.
  const dims = (d: HousingDesignRecord) => {
    const a = d.footprint.widthFt, b = d.footprint.depthFt;
    return [Math.min(a, b), Math.max(a, b)] as const;
  };
  // only like with like: a plan with a different parking arrangement, porch face or vehicle door
  // meets the lot differently, so its failure says nothing about another (PR 221 audit)
  const kindOf = (d: HousingDesignRecord) => `${d.parking}|${d.porchFace}|${d.vehicle ? d.vehicle.wall : 'none'}`;
  const failed: Array<{ lo: number; hi: number; kind: string; design: HousingDesignRecord; reason: string }> = [];
  const order = designs.map((d, i) => ({ d, i })).sort((x, y) => dims(x.d)[0] * dims(x.d)[1] - dims(y.d)[0] * dims(y.d)[1]);
  const byIndex = new Map<number, { fit?: LotFitResult; reason?: string }>();
  for (const { d: design, i } of order) {
    const [lo, hi] = dims(design);
    const beaten = lo > 0 ? failed.find(f => f.kind === kindOf(design) && f.lo <= lo && f.hi <= hi) : undefined;
    if (beaten) {
      byIndex.set(i, { reason: `footprint ${design.footprint.widthFt}×${design.footprint.depthFt} ft is no smaller than ${beaten.design.planNumber}, which does not fit: ${beaten.reason}` });
      continue;
    }
    const fit = fitStockDesignInLot(design, geo, lotIndex);
    if (fit.status === 'placed' && fit.placement) byIndex.set(i, { fit });
    else {
      byIndex.set(i, { reason: fit.reason });
      if (lo > 0 && geo.frontEdge != null) failed.push({ lo, hi, kind: kindOf(design), design, reason: fit.reason });
    }
  }
  // back in catalogue order
  designs.forEach((design, i) => {
    const r = byIndex.get(i)!;
    if (r.fit) eligible.push({ design, fit: r.fit });
    else rejected.push({ design, reason: r.reason ?? 'not placed' });
  });
  const lotProblem = geo.frontEdge == null
    ? 'frontage unresolved: no driveway or street meets this lot'
    : (geo.lotKind === 'pie' || geo.ringFt.length > 4) && geo.frontSource !== 'driveway'
      ? 'irregular or pie lot with no driveway: resolve the frontage edge before placing a stock plan'
      : null;
  return { ...base, eligible, rejected, lotProblem };
}

/** Eligibility for every detached house on the sheet, in lot order. */
export function stockEligibility(
  designs: readonly HousingDesignRecord[],
  elements: Element[],
  setbacks: Setbacks = DEFAULT_HOME_SETBACKS,
): HouseLotEligibility[] {
  const out = detachedHouses(elements).map(h => houseEligibility(h, designs, elements, setbacks));
  const order = (e: HouseLotEligibility) => Number(numberOf(e.lotId ?? e.houseId) ?? 0);
  return out.sort((a, b) => order(a) - order(b));
}

/** Parcel-wide union: each design that fits somewhere, with the lots it fits. */
export function designsWithLots(rows: HouseLotEligibility[]): Array<{ design: HousingDesignRecord; lots: string[] }> {
  const byId = new Map<string, { design: HousingDesignRecord; lots: string[] }>();
  for (const row of rows) {
    for (const { design } of row.eligible) {
      const hit = byId.get(design.id) ?? { design, lots: [] };
      hit.lots.push(row.lotLabel);
      byId.set(design.id, hit);
    }
  }
  return [...byId.values()];
}

/** Placed footprint centre, for focusing the drawing on the changed house. */
export function footprintCentre3857(fit: LotFitResult): Pt | null {
  return fit.footprint3857 ? centre(fit.footprint3857) : null;
}

/** Ground-feet area of a closed 3857 ring (for the changed footprint's sf). */
export function ringAreaSf(ring: Pt[]): number {
  if (ring.length < 3) return 0;
  const f = createGroundFrame(ring[0]![0], ring[0]![1]);
  const ft = ring.map(p => f.toFeet(p) as Pt);
  let a = 0;
  for (let i = 0; i < ft.length - 1; i++) a += ft[i]![0] * ft[i + 1]![1] - ft[i + 1]![0] * ft[i]![1];
  return Math.abs(a) / 2;
}
