/**
 * House choices that outlive a re-solve (masterplan audit 2026-11-26: "a
 * solver rerun keeps explicit accepted assignments where still feasible; if
 * one conflicts, present the conflict").
 *
 * The engine numbers lots by position, so `sfv1-lot-3` after a re-solve need
 * not be the same piece of ground. A choice is therefore remembered with the
 * centre and area of the lot it was made on. On the next plan it goes back
 * onto the lot that contains that centre and is within 15% of that area,
 * re-checked through the same fit as a manual change. A choice whose lot is
 * gone, or whose plan no longer fits, is reported by lot and design — never
 * moved to another lot and never kept without the check — and stays
 * remembered, so going back to a plan where it fits puts it back.
 */
import type { Element } from '../../../engine/types';
import { applyStockDesignToHouse } from './apply';
import { housingDesignById } from './catalogue';
import { detachedHouses, parentLotOf, ringAreaSf } from './eligibility';
import { pointInPolygon, type Pt, type Setbacks } from './lotFit';
import { HOME_DESIGNS } from './originalDesigns';
import { placeHome } from './placement';

/** The parts a concept placement adds for a house (porch, walk, pad, carriage house). */
export const homePartsOf = (houseId: string) => (e: Element) => e.id.startsWith(houseId + '-home-');

/** The plan with a house's concept parts taken off, ready for that house to be placed again. */
export function withoutHomeParts(elements: Element[], houseId: string): Element[] {
  const isPart = homePartsOf(houseId);
  return elements.filter(e => !isPart(e));
}

/**
 * Commit a concept placement on one house: the placement's plan, with any parts an earlier
 * concept left on that house removed first (placeHome was asked on the plan without them).
 */
export function commitConcept(designId: string, houseId: string, elements: Element[], siteBoundary?: Element['geometry'] | null, maxHeightFt?: number | null):
  { ok: true; elements: Element[]; name: string } | { ok: false; reason: string } {
  const design = HOME_DESIGNS.find(d => d.id === designId);
  if (!design) return { ok: false, reason: 'that concept study is not in the catalogue' };
  const base = withoutHomeParts(elements, houseId);
  const house = base.find(e => e.id === houseId);
  if (!house) return { ok: false, reason: 'that house is no longer on the plan — the scheme was redrawn' };
  const fit = placeHome(design, house, base, siteBoundary, maxHeightFt);
  if (!fit.placement) return { ok: false, reason: fit.reason ?? `${design.name} does not fit this lot` };
  return { ok: true, elements: fit.placement.elements, name: design.name };
}

export interface HomeAssignment {
  /** stock: a publisher plan (housing catalogue); concept: an original concept study */
  kind?: 'stock' | 'concept';
  designId: string;
  lotLabel: string;
  /** centre and area of the lot the choice was made on, EPSG:3857 / ground sf */
  lotCentre: Pt;
  lotAreaSf: number;
}

export interface CarryResult {
  elements: Element[];
  kept: Array<{ lotLabel: string; designId: string }>;
  lost: Array<{ lotLabel: string; designId: string; reason: string }>;
  /** the assignments to remember from here: kept ones re-read off the new plan, and the ones
   *  not kept left as they were, so a return to a plan where they fit restores them */
  next: HomeAssignment[];
}

function ring(el: Element): Pt[] | null {
  const c = (el.geometry as { coordinates?: number[][][] } | undefined)?.coordinates?.[0];
  return Array.isArray(c) && c.length >= 3 ? c.map(p => [Number(p[0]), Number(p[1])] as Pt) : null;
}
function centre(r: Pt[]): Pt {
  const pts = r.length > 3 ? r.slice(0, -1) : r;
  return pts.reduce<Pt>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
}

/** The assignment for a house that now carries `designId`, read off its lot. */
export function assignmentFor(houseId: string, elements: Element[], designId: string, kind: 'stock' | 'concept' = 'stock'): HomeAssignment | null {
  const house = elements.find(e => e.id === houseId);
  if (!house) return null;
  const lot = parentLotOf(house, elements);
  const r = lot ? ring(lot) : null;
  if (!lot || !r) return null;
  return { kind, designId, lotLabel: lot.name ?? lot.id, lotCentre: centre(r), lotAreaSf: ringAreaSf(r) };
}

/**
 * The choices a plan already carries (a reopened saved plan): every detached house whose
 * design was placed by a change — a stock plan (it records its lot) or a concept study.
 */
export function assignmentsFromElements(elements: Element[]): HomeAssignment[] {
  const out: HomeAssignment[] = [];
  for (const h of detachedHouses(elements)) {
    const p = h.properties ?? {};
    const id = typeof p.housingDesignId === 'string' ? p.housingDesignId : null;
    if (!id || p.housingPlacementStatus !== 'placed') continue;
    const concept = HOME_DESIGNS.some(d => d.id === id);
    if (!concept && typeof p.lotId !== 'string') continue; // a stamp without a placement, not a choice
    const a = assignmentFor(h.id, elements, id, concept ? 'concept' : 'stock');
    if (a) out.push(a);
  }
  return out;
}

/** Put the remembered choices back onto a new plan where they still fit. */
export function carryAssignments(assignments: HomeAssignment[], elements: Element[], setbacks: Setbacks, maxHeightFt?: number | null): CarryResult {
  let els = elements;
  const kept: CarryResult['kept'] = [];
  const lost: CarryResult['lost'] = [];
  const next: HomeAssignment[] = [];
  for (const a of assignments) {
    const name = housingDesignById(a.designId)?.planNumber ?? a.designId;
    const house = detachedHouses(els).find(h => {
      const lot = parentLotOf(h, els);
      const r = lot ? ring(lot) : null;
      if (!r || !pointInPolygon(a.lotCentre, r)) return false;
      const area = ringAreaSf(r);
      return a.lotAreaSf > 0 && Math.abs(area - a.lotAreaSf) / a.lotAreaSf <= 0.15;
    });
    if (!house) {
      lost.push({ lotLabel: a.lotLabel, designId: a.designId, reason: `the lot that carried ${name} is not on this plan` });
      next.push(a);
      continue;
    }
    const res = a.kind === 'concept'
      ? (() => { const c = commitConcept(a.designId, house.id, els, undefined, maxHeightFt); return c.ok ? { ok: true as const, elements: c.elements, lotLabel: parentLotOf(house, els)?.name ?? a.lotLabel } : c; })()
      : applyStockDesignToHouse({ designId: a.designId, houseId: house.id, elements: els, setbacks });
    if (!res.ok) {
      lost.push({ lotLabel: a.lotLabel, designId: a.designId, reason: res.reason });
      next.push(a);
      continue;
    }
    els = res.elements;
    kept.push({ lotLabel: res.lotLabel, designId: a.designId });
    const again = assignmentFor(house.id, els, a.designId, a.kind ?? 'stock');
    if (again) next.push(again);
  }
  return { elements: els, kept, lost, next };
}
