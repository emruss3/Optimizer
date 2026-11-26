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
 * moved to another lot and never kept without the check.
 */
import type { Element } from '../../../engine/types';
import { applyStockDesignToHouse } from './apply';
import { housingDesignById } from './catalogue';
import { detachedHouses, parentLotOf, ringAreaSf } from './eligibility';
import { pointInPolygon, type Pt, type Setbacks } from './lotFit';

export interface HomeAssignment {
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
  /** the assignments as they stand on the new plan (lost ones dropped) */
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
export function assignmentFor(houseId: string, elements: Element[], designId: string): HomeAssignment | null {
  const house = elements.find(e => e.id === houseId);
  if (!house) return null;
  const lot = parentLotOf(house, elements);
  const r = lot ? ring(lot) : null;
  if (!lot || !r) return null;
  return { designId, lotLabel: lot.name ?? lot.id, lotCentre: centre(r), lotAreaSf: ringAreaSf(r) };
}

/** Put the remembered choices back onto a new plan where they still fit. */
export function carryAssignments(assignments: HomeAssignment[], elements: Element[], setbacks: Setbacks): CarryResult {
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
      lost.push({ lotLabel: a.lotLabel, designId: a.designId, reason: `the lot that carried ${name} is not on the new plan` });
      continue;
    }
    const res = applyStockDesignToHouse({ designId: a.designId, houseId: house.id, elements: els, setbacks });
    if (!res.ok) {
      lost.push({ lotLabel: a.lotLabel, designId: a.designId, reason: res.reason });
      continue;
    }
    els = res.elements;
    kept.push({ lotLabel: res.lotLabel, designId: a.designId });
    const again = assignmentFor(house.id, els, a.designId);
    if (again) next.push(again);
  }
  return { elements: els, kept, lost, next };
}
