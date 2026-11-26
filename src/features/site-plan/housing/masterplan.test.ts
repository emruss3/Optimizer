/**
 * The masterplan acceptance story (audit 2026-11-26), on the Delk five-lot plan with the
 * designs this repo carries: three different homes on three lots of one scheme, a change
 * to one of them only, the schedule and the drawing scene describing the same plan, a
 * reopened save that still knows its choices, and a re-solve that puts them back.
 */
import { describe, it, expect } from 'vitest';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { buildDrawingScene } from '../scene/buildScene';
import { buildableStockPlans } from './catalogue';
import { applyStockDesignToHouse } from './apply';
import { houseEligibility } from './eligibility';
import { assignmentsFromElements, carryAssignments, commitConcept } from './carry';
import { HOME_DESIGNS } from './originalDesigns';
import { designsFittingHouse } from './homeDesignsGate';
import { homesSchedule } from './schedule';
import type { Element } from '../../../engine/types';

const plan = () => sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
const SB = { front: 20, side: 5, rear: 20 };
const stockOn = (els: Element[], house: string, nth: number) =>
  houseEligibility(els.find(e => e.id === house)!, buildableStockPlans(), els, SB).eligible[nth]!.design.id;

function mixedPlan() {
  let els = plan();
  const a = stockOn(els, 'sfv1-pad-1', 0);
  let r = applyStockDesignToHouse({ designId: a, houseId: 'sfv1-pad-1', elements: els, setbacks: SB });
  if (!r.ok) throw new Error(r.reason);
  els = r.elements;
  const b = stockOn(els, 'sfv1-pad-2', 3);
  r = applyStockDesignToHouse({ designId: b, houseId: 'sfv1-pad-2', elements: els, setbacks: SB });
  if (!r.ok) throw new Error(r.reason);
  els = r.elements;
  const concept = designsFittingHouse(HOME_DESIGNS, els.find(e => e.id === 'sfv1-pad-3')!, els)[0];
  if (!concept) throw new Error('no concept study fits lot 3');
  const c = commitConcept(concept.id, 'sfv1-pad-3', els);
  if (!c.ok) throw new Error(c.reason);
  return { els: c.elements, a, b, concept: concept.id };
}

describe('a mixed-home masterplan on one scheme', () => {
  it('three lots carry three different designs; the other two keep the engine homes', () => {
    const { els, a, b, concept } = mixedPlan();
    const id = (h: string) => els.find(e => e.id === h)!.properties.housingDesignId;
    expect([id('sfv1-pad-1'), id('sfv1-pad-2'), id('sfv1-pad-3')]).toEqual([a, b, concept]);
    expect(new Set([a, b, concept]).size).toBe(3);
    const fresh = plan();
    for (const h of ['sfv1-pad-4', 'sfv1-pad-5']) {
      const x = els.find(e => e.id === h)!, y = fresh.find(e => e.id === h)!;
      expect([x.geometry, x.properties]).toEqual([y.geometry, y.properties]);
    }
  });

  it('changing one house changes only that house and its lot', () => {
    const { els } = mixedPlan();
    const other = stockOn(els, 'sfv1-pad-2', 1);
    const r = applyStockDesignToHouse({ designId: other, houseId: 'sfv1-pad-2', elements: els, setbacks: SB });
    if (!r.ok) throw new Error(r.reason);
    const changed = r.elements.filter((e, i) => e !== els[i]).map(e => e.id).sort();
    expect(changed).toEqual(['sfv1-lot-2', 'sfv1-pad-2']);
  });

  it('placing a second concept on the same house replaces the earlier porch and walk, not adds to them', () => {
    const { els } = mixedPlan();
    const parts = (xs: Element[]) => xs.filter(e => e.id.startsWith('sfv1-pad-3-home-')).length;
    const fits = designsFittingHouse(HOME_DESIGNS, els.find(e => e.id === 'sfv1-pad-3')!, els.filter(e => !e.id.startsWith('sfv1-pad-3-home-')));
    const again = commitConcept(fits[fits.length - 1]!.id, 'sfv1-pad-3', els);
    if (!again.ok) throw new Error(again.reason);
    expect(parts(again.elements)).toBeGreaterThan(0);
    expect(parts(again.elements)).toBeLessThanOrEqual(parts(els) + 2);
    expect(again.elements.filter(e => e.id === 'sfv1-pad-3')).toHaveLength(1);
  });

  it('the schedule and the drawing scene describe the same plan', () => {
    const { els, a, b, concept } = mixedPlan();
    const s = homesSchedule(els);
    expect(s.rows.map(r => r.lot)).toEqual(['Lot 1', 'Lot 2', 'Lot 3', 'Lot 4', 'Lot 5']);
    expect(s.rows.slice(0, 3).map(r => r.kind)).toEqual(['stock', 'stock', 'concept']);
    expect(s.totals.reduce((n, t) => n + t.homes, 0)).toBe(5);
    const scene = buildDrawingScene({ parcelId: '675423', schemeId: 'deep', elements: els });
    const before = buildDrawingScene({ parcelId: '675423', schemeId: 'deep', elements: plan() });
    expect(scene?.identity.revision).not.toBe(before?.identity.revision);
    const designs = (scene?.buildings ?? []).map(bd => bd.housing?.designId).filter(Boolean);
    expect(designs).toEqual(expect.arrayContaining([a, b, concept]));
  });

  it('a reopened save still knows its choices, and a re-solve puts all three back', () => {
    const { els, a, b, concept } = mixedPlan();
    const saved = JSON.parse(JSON.stringify(els)) as Element[]; // what save stores and load returns
    const remembered = assignmentsFromElements(saved);
    expect(remembered.map(x => x.designId).sort()).toEqual([a, b, concept].sort());
    expect(remembered.find(x => x.designId === concept)?.kind).toBe('concept');
    const resolved = carryAssignments(remembered, plan(), SB);
    expect(resolved.lost).toEqual([]);
    const id = (h: string) => resolved.elements.find(e => e.id === h)!.properties.housingDesignId;
    expect([id('sfv1-pad-1'), id('sfv1-pad-2'), id('sfv1-pad-3')]).toEqual([a, b, concept]);
  });
});
