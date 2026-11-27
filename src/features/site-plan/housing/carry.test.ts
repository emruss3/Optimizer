import { describe, it, expect } from 'vitest';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { buildableStockPlans } from './catalogue';
import { applyStockDesignToHouse } from './apply';
import { houseEligibility } from './eligibility';
import { assignmentFor, carryAssignments } from './carry';

const plan = (k: 'deep' | 'default') => sfV1ToElements((fixture as Record<string, unknown>)[k] as SfV1Response).elements;
const SB = { front: 20, side: 5, rear: 20 };

describe('house choices through a re-solve (masterplan audit 2026-11-26)', () => {
  const choose = () => {
    let els = plan('deep');
    const picks: Array<{ house: string; design: string }> = [];
    for (const house of ['sfv1-pad-1', 'sfv1-pad-2', 'sfv1-pad-3']) {
      const row = houseEligibility(els.find(e => e.id === house)!, buildableStockPlans(), els, SB);
      const design = row.eligible[picks.length]!.design.id; // three different plans
      const res = applyStockDesignToHouse({ designId: design, houseId: house, elements: els, setbacks: SB });
      if (!res.ok) throw new Error(res.reason);
      els = res.elements;
      picks.push({ house, design });
    }
    return { els, picks, assignments: picks.map(p => assignmentFor(p.house, els, p.design)!) };
  };

  it('three different plans on three lots come back on the same lots after the same plan is drawn again', () => {
    const { picks, assignments } = choose();
    expect(new Set(picks.map(p => p.design)).size).toBe(3);
    const res = carryAssignments(assignments, plan('deep'), SB);
    expect(res.lost).toEqual([]);
    expect(res.kept.map(k => k.lotLabel)).toEqual(['Lot 1', 'Lot 2', 'Lot 3']);
    for (const p of picks) expect(res.elements.find(e => e.id === p.house)!.properties.housingDesignId).toBe(p.design);
    // houses that carried no choice are untouched
    const fresh = plan('deep');
    for (const id of ['sfv1-pad-4', 'sfv1-pad-5']) expect(res.elements.find(e => e.id === id)!.geometry).toEqual(fresh.find(e => e.id === id)!.geometry);
    expect(res.next).toHaveLength(3);
  });

  it('on a different plan, a choice whose ground is gone is reported by lot, not moved to another lot', () => {
    const { assignments } = choose();
    const res = carryAssignments(assignments, plan('default'), SB);
    expect(res.kept.length + res.lost.length).toBe(3);
    for (const l of res.lost) expect(l.reason).toMatch(/not on this plan|does not fit/);
    // every choice stays remembered: back on the first plan, all three return
    expect(res.next).toHaveLength(3);
    const back = carryAssignments(res.next, plan('deep'), SB);
    expect(back.kept).toHaveLength(3);
    expect(back.lost).toEqual([]);
  });

  it('a choice that no longer fits its lot is reported with the reason and the lot keeps its own house', () => {
    const { assignments } = choose();
    // the lots' own engine setbacks govern; tighten them as a changed ordinance would
    const tighter = plan('deep').map(e => (/lot-\d+$/.test(e.id) ? { ...e, properties: { ...e.properties, homeSetbacksFt: { front: 60, side: 20, rear: 60 } } } : e));
    const tight = carryAssignments(assignments, tighter, SB);
    expect(tight.kept).toEqual([]);
    expect(tight.lost).toHaveLength(3);
    expect(tight.lost[0]!.reason).toMatch(/does not fit Lot 1/);
  });
});

describe('hard locks (audit 9379472 item 3)', () => {
  it('a locked choice the new plan cannot keep is flagged locked; a soft one is not', () => {
    let els = plan('deep');
    const d = houseEligibility(els.find(e => e.id === 'sfv1-pad-1')!, buildableStockPlans(), els, SB).eligible[0]!.design.id;
    const r = applyStockDesignToHouse({ designId: d, houseId: 'sfv1-pad-1', elements: els, setbacks: SB });
    if (!r.ok) throw new Error(r.reason);
    els = r.elements;
    const a = assignmentFor('sfv1-pad-1', els, d)!;
    const tighter = plan('deep').map(e => (/lot-\d+$/.test(e.id) ? { ...e, properties: { ...e.properties, homeSetbacksFt: { front: 60, side: 20, rear: 60 } } } : e));
    const locked = carryAssignments([{ ...a, lock: true }], tighter, SB);
    expect(locked.lost[0]?.locked).toBe(true);
    expect(locked.next[0]?.lock).toBe(true); // still remembered, still locked
    const soft = carryAssignments([a], tighter, SB);
    expect(soft.lost[0]?.locked).toBe(false);
  });

  it('a kept locked choice stays locked on the new plan', () => {
    let els = plan('deep');
    const d = houseEligibility(els.find(e => e.id === 'sfv1-pad-2')!, buildableStockPlans(), els, SB).eligible[0]!.design.id;
    const r = applyStockDesignToHouse({ designId: d, houseId: 'sfv1-pad-2', elements: els, setbacks: SB });
    if (!r.ok) throw new Error(r.reason);
    els = r.elements;
    const kept = carryAssignments([{ ...assignmentFor('sfv1-pad-2', els, d)!, lock: true }], plan('deep'), SB);
    expect(kept.kept).toHaveLength(1);
    expect(kept.next[0]?.lock).toBe(true);
  });
});
