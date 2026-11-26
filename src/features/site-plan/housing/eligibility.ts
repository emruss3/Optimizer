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
  for (const design of designs) {
    const fit = fitStockDesignInLot(design, geo, lotIndex);
    if (fit.status === 'placed' && fit.placement) eligible.push({ design, fit });
    else rejected.push({ design, reason: fit.reason });
  }
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
