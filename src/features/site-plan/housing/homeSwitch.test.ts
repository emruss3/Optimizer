/**
 * Audit 2026-11-26 home switch: one shared eligibility result, a true lot
 * polygon in ground feet, and a change that touches one house only.
 */
import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { buildableStockPlans, housingDesignById } from './catalogue';
import { applyStockDesignToHouse } from './apply';
import { houseEligibility, parentLotOf, stockEligibility } from './eligibility';
import { fitStockDesignInLot, lotGeometry, pointInPolygon, type Pt } from './lotFit';
import { createGroundFrame } from '../scene/frame';
import { eligibleStockDesigns } from './homeDesignsGate';

const delk = () => sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
const stock = buildableStockPlans();

/** A lot drawn in EPSG:3857 from a ground-feet outline near Nashville. */
const ORIGIN: Pt = [-9655000, 4318000];
function lotEl(id: string, ringFt: Pt[], props: Record<string, unknown> = {}): Element {
  const f = createGroundFrame(ORIGIN[0], ORIGIN[1]);
  const ring = [...ringFt, ringFt[0]!].map(p => f.fromFeet(p));
  return { id, type: 'other', name: `Lot ${id.split('-').pop()}`, geometry: { type: 'Polygon', coordinates: [ring] }, properties: props } as unknown as Element;
}
function polyEl(id: string, ringFt: Pt[], type: string, props: Record<string, unknown>): Element {
  const e = lotEl(id, ringFt, props);
  return { ...e, type, name: id } as Element;
}
const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  return [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
};

describe('stock eligibility on the Delk five-lot plan (675423)', () => {
  it('fits at least two different plans on standard lots 1–3; the irregular and pie lots 4–5 report their own, smaller counts', () => {
    const rows = stockEligibility(stock, delk());
    expect(rows.map(r => r.lotLabel)).toEqual(['Lot 1', 'Lot 2', 'Lot 3', 'Lot 4', 'Lot 5']);
    for (const r of rows.slice(0, 3)) {
      expect(r.eligible.length).toBeGreaterThanOrEqual(2);
      expect(new Set(r.eligible.map(e => `${e.design.footprint.widthFt}x${e.design.footprint.depthFt}`)).size).toBeGreaterThanOrEqual(2);
    }
    // lots 4 (8 edges) and 5 (pie) are fitted on their true outline, their front fixed by their driveway
    for (const r of rows.slice(3)) {
      expect(r.eligible.length).toBeLessThan(rows[0]!.eligible.length);
      expect(r.rejected.length).toBeGreaterThan(0);
      expect(r.rejected[0]!.reason).toMatch(/does not fit inside the lot/);
    }
  });

  it('matches each house to its lot by reference, not by list order', () => {
    const els = delk();
    const shuffled = [...els].reverse();
    for (const h of els.filter(e => e.properties?.house)) {
      expect(parentLotOf(h, shuffled)?.id).toBe(h.id.replace('pad-', 'lot-'));
    }
    // an older save with renamed pads still finds the lot that contains the pad
    const pad = els.find(e => e.id === 'sfv1-pad-2')!;
    const renamed = { ...pad, id: 'legacy-house-a' };
    expect(parentLotOf(renamed, els)?.id).toBe('sfv1-lot-2');
  });

  it('places every eligible footprint inside its lot, clear of the driveway', () => {
    const els = delk();
    for (const r of stockEligibility(stock, els)) {
      const lot = els.find(e => e.id === r.lotId)!;
      const geo = lotGeometry(lot, els, { front: 20, side: 5, rear: 20 })!;
      for (const { fit } of r.eligible) {
        for (const p of fit.footprintFt!.slice(0, -1)) expect(pointInPolygon(p, geo.ringFt)).toBe(true);
      }
    }
  });
});

describe('true-polygon fit (rotated and tapered lots)', () => {
  const lotRect: Pt[] = [[0, 0], [60, 0], [60, 110], [0, 110]];
  const driveRect: Pt[] = [[44, -2], [54, -2], [54, 30], [44, 30]];

  it('gives the same answer on a lot turned 35° as on the same lot square to the grid', () => {
    const design = housingDesignById('abhp:5633-00358') ?? stock[0]!;
    const square = [lotEl('t-lot-1', lotRect), polyEl('t-drive-1', driveRect, 'circulation', { kind: 'driveway' })];
    const turned = [lotEl('t-lot-1', lotRect.map(p => rot(p, 35))), polyEl('t-drive-1', driveRect.map(p => rot(p, 35)), 'circulation', { kind: 'driveway' })];
    const a = fitStockDesignInLot(design, lotGeometry(square[0]!, square, { front: 20, side: 5, rear: 20 })!, 0);
    const b = fitStockDesignInLot(design, lotGeometry(turned[0]!, turned, { front: 20, side: 5, rear: 20 })!, 0);
    expect(a.status).toBe(b.status);
    expect(b.placement?.rotationDeg).toBeCloseTo(a.placement!.rotationDeg + 35, 0);
  });

  it('does not let a turned lot pass on its bounding box', () => {
    // 40 ft wide lot turned 45°: its box is ~106 ft square, the lot is not
    const narrow: Pt[] = [[0, 0], [40, 0], [40, 110], [0, 110]];
    const wide = { ...stock[0]!, id: 'test:wide', footprint: { widthFt: 50, depthFt: 45 }, porchFace: 'width' as const };
    const els = [lotEl('n-lot-1', narrow.map(p => rot(p, 45))), polyEl('n-drive-1', [[2, -2], [12, -2], [12, 20], [2, 20]].map(p => rot(p as Pt, 45)), 'circulation', { kind: 'driveway' })];
    const fit = fitStockDesignInLot(wide, lotGeometry(els[0]!, els, { front: 20, side: 5, rear: 20 })!, 0);
    expect(fit.status).toBe('unplaced');
    expect(fit.reason).toMatch(/does not fit inside the lot/);
  });

  it('keeps the side setback on a lot that narrows toward the rear', () => {
    const tapered: Pt[] = [[0, 0], [70, 0], [55, 120], [15, 120]];
    const els = [lotEl('p-lot-1', tapered), polyEl('p-drive-1', [[58, -2], [66, -2], [66, 25], [58, 25]], 'circulation', { kind: 'driveway' })];
    const geo = lotGeometry(els[0]!, els, { front: 20, side: 5, rear: 20 })!;
    const deep = { ...stock[0]!, id: 'test:deep', footprint: { widthFt: 44, depthFt: 70 }, porchFace: 'width' as const };
    expect(fitStockDesignInLot(deep, geo, 0).status).toBe('unplaced');
    const ok = { ...stock[0]!, id: 'test:ok', footprint: { widthFt: 36, depthFt: 40 }, porchFace: 'width' as const };
    const fit = fitStockDesignInLot(ok, geo, 0);
    expect(fit.status).toBe('placed');
  });

  it('refuses a pie lot with only a street beside it: the driveway decides the front', () => {
    const pie: Pt[] = [[0, 0], [30, 0], [80, 90], [40, 120], [-20, 100]];
    const street = polyEl('z-street-1', [[-10, -30], [40, -30], [40, -2], [-10, -2]], 'circulation', { kind: 'street' });
    const els = [lotEl('z-lot-1', pie, { lotKind: 'pie' }), street];
    const fit = fitStockDesignInLot(stock[0]!, lotGeometry(els[0]!, els, { front: 20, side: 5, rear: 20 })!, 0);
    expect(fit.status).toBe('unplaced');
    expect(fit.reason).toMatch(/pie lot with no driveway/);
  });

  it('refuses a lot no driveway or street meets: the front is not guessed', () => {
    const els = [lotEl('q-lot-1', lotRect)];
    const fit = fitStockDesignInLot(stock[0]!, lotGeometry(els[0]!, els, { front: 20, side: 5, rear: 20 })!, 0);
    expect(fit.reason).toMatch(/frontage unresolved/);
  });
});

describe('changing the home on one lot', () => {
  it('changes only the selected house; every neighbour keeps its identity and outline', () => {
    const els = delk();
    const row = houseEligibility(els.find(e => e.id === 'sfv1-pad-2')!, stock, els);
    const pick = row.eligible[1]!.design;
    const res = applyStockDesignToHouse({ designId: pick.id, houseId: 'sfv1-pad-2', elements: els });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const changed = res.elements.filter((e, i) => e !== els[i]).map(e => e.id).sort();
    expect(changed).toEqual(['sfv1-lot-2', 'sfv1-pad-2']);
    const pad = res.elements.find(e => e.id === 'sfv1-pad-2')!;
    expect(pad.properties.housingDesignId).toBe(pick.id);
    expect(pad.properties.lotId).toBe('sfv1-lot-2');
    expect(pad.geometry).not.toEqual(els.find(e => e.id === 'sfv1-pad-2')!.geometry);
    for (const n of ['sfv1-pad-1', 'sfv1-pad-3', 'sfv1-pad-4', 'sfv1-pad-5']) {
      expect(res.elements.find(e => e.id === n)).toBe(els.find(e => e.id === n));
    }
  });

  it('a second change on a different lot keeps the first', () => {
    const els = delk();
    const r2 = houseEligibility(els.find(e => e.id === 'sfv1-pad-2')!, stock, els).eligible;
    const first = applyStockDesignToHouse({ designId: r2[0]!.design.id, houseId: 'sfv1-pad-2', elements: els });
    if (!first.ok) throw new Error(first.reason);
    const r3 = houseEligibility(first.elements.find(e => e.id === 'sfv1-pad-3')!, stock, first.elements).eligible;
    const second = applyStockDesignToHouse({ designId: r3[r3.length - 1]!.design.id, houseId: 'sfv1-pad-3', elements: first.elements });
    if (!second.ok) throw new Error(second.reason);
    expect(second.elements.find(e => e.id === 'sfv1-pad-2')!.properties.housingDesignId).toBe(r2[0]!.design.id);
    expect(second.elements.find(e => e.id === 'sfv1-pad-3')!.properties.housingDesignId).toBe(r3[r3.length - 1]!.design.id);
  });

  it('refuses a stale choice and a lot the plan does not fit, changing nothing', () => {
    const els = delk();
    const gone = applyStockDesignToHouse({ designId: stock[0]!.id, houseId: 'sfv1-pad-9', elements: els });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.reason).toMatch(/redrawn/);
    const tooBig = houseEligibility(els.find(e => e.id === 'sfv1-pad-5')!, stock, els).rejected[0]!.design;
    const pie = applyStockDesignToHouse({ designId: tooBig.id, houseId: 'sfv1-pad-5', elements: els });
    expect(pie.ok).toBe(false);
    if (!pie.ok) expect(pie.reason).toMatch(/does not fit Lot 5/);
  });

  it('the studio list for a lot is the same set apply accepts', () => {
    const els = delk();
    const listed = eligibleStockDesigns(stock, els, { selectedHouseId: 'sfv1-pad-1' });
    for (const d of stock) {
      const res = applyStockDesignToHouse({ designId: d.id, houseId: 'sfv1-pad-1', elements: els });
      expect(res.ok).toBe(listed.some(l => l.id === d.id));
    }
  });
});
