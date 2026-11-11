import { describe, it, expect } from 'vitest';
import { chooseLayout, neighborhoodOption, homesPhrase, isFloodSkip } from './layoutChoice';
import { summarizeCandidates, type SfV1CandidatesResponse } from './sfV1Plan';

const row = (requested: string, pattern: string | null, lots: number, fails: string[] = [], extra: Record<string, unknown> = {}) =>
  ({ requested, pattern, status: 'done', lots, fails, ...extra });

const comp = (resp: Partial<SfV1CandidatesResponse> & Record<string, unknown>) => summarizeCandidates({ status: 'done', ...resp } as SfV1CandidatesResponse);

// 2622 W Heiman (RM40, 3.25 ac), live 2026-11-04: townhomes 32, density 129
const HEIMAN = comp({
  best_requested: 'townhome', best_lots: 32, best_buildable: true, verdict: 'buildable as drawn', best_code_fails: [],
  homes_allowed_by_density: 129, attached_permitted: true,
  candidates: [
    row('grid', 'grid', 10, ['cost.street_ft_per_lot']), row('neighborhood', 'neighborhood', 10, ['cost.street_ft_per_lot']),
    row('loop', 'frontage lots, no new street', 6), row('townhome', 'townhomes (mews)', 32, [], { product: 'attached', engine: 'v3' }),
  ] as never,
});

describe('chooseLayout (the owner, 2026-11-04: multifamily where it makes more sense, a switch to the neighborhood)', () => {
  it('2622 W Heiman: apartments place 89 homes, the neighborhood 32 townhomes — multifamily is the default', () => {
    const c = chooseLayout({ multifamilyHomes: 89, competition: HEIMAN });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.neighborhood).toMatchObject({ requested: 'townhome', homes: 32, attached: true, buildable: true, drawable: true, label: 'townhomes (mews)' });
    expect(c.densityCap).toBe(129);
    expect(c.sentence).toBe('Apartments place more homes here: 89 apartments against the neighborhood\'s best of 32 townhomes (mews), so they are the default.');
  });

  it('5525 Mt View Rd: 24 apartments, 27 townhomes — the neighborhood is the default', () => {
    const mtView = comp({
      best_requested: 'townhome', best_lots: 27, best_buildable: true, verdict: 'buildable as drawn', homes_allowed_by_density: 32,
      candidates: [row('grid', 'grid', 10, ['street.grade_max']), row('townhome', 'townhomes (mews)', 27, [], { product: 'attached', engine: 'v3' })] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 24, competition: mtView });
    expect(c.defaultKind).toBe('neighborhood');
    expect(c.sentence).toBe('The neighborhood places more homes here: 27 townhomes (mews) against 24 apartments, so it is the default.');
  });

  it('407 Old Hickory Blvd (RM4): both reach the density cap of 8 — multifamily stays', () => {
    const tie = comp({
      best_requested: 'townhome', best_lots: 8, best_buildable: true, homes_allowed_by_density: 8,
      candidates: [row('loop', 'frontage lots, no new street', 2), row('townhome', 'townhomes (lane)', 8, [], { product: 'attached', engine: 'v3' })] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 8, competition: tie });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.sentence).toBe('Both place 8 homes, the most the district\'s density allows; apartments stay the default.');
  });

  it('a neighborhood that places more homes but fails a code test is never the default', () => {
    const fails = comp({
      best_requested: 'grid', best_lots: 30, best_buildable: false, verdict: 'the best plan fails a code test: not buildable as drawn',
      best_code_fails: ['street.grade_max'], candidates: [row('grid', 'grid', 30, ['street.grade_max'])] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 20, competition: fails });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.neighborhood?.buildable).toBe(false);
    expect(c.sentence).toContain('fails a code test (street.grade_max)');
  });

  it('townhomes from the v2 engine cannot be drawn here, so they are not the default', () => {
    const v2 = comp({
      best_requested: 'townhome', best_lots: 40, best_buildable: true,
      candidates: [row('townhome', 'townhomes (alleys)', 40, [], { product: 'attached', engine: 'v2' })] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 30, competition: v2 });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.neighborhood?.drawable).toBe(false);
    expect(c.sentence).toContain('cannot draw yet');
  });

  it('a multifamily plan that failed: a buildable neighborhood takes the sheet', () => {
    const c = chooseLayout({ multifamilyHomes: null, competition: HEIMAN });
    expect(c.defaultKind).toBe('neighborhood');
    expect(c.sentence).toBe('The multifamily plan did not draw; the neighborhood places 32 townhomes (mews), so it is the default.');
  });

  it('a multifamily plan that drew without a reported count is never weighed as zero (0 Smith Springs Rd)', () => {
    const c = chooseLayout({ multifamilyHomes: null, multifamilyFailed: false, competition: HEIMAN });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.sentence).toBe('The multifamily plan on the sheet does not report its unit count, so it stays the default; the neighborhood\'s best places 32 townhomes (mews).');
    // one that failed to draw is weighed as none
    expect(chooseLayout({ multifamilyHomes: null, multifamilyFailed: true, competition: HEIMAN }).defaultKind).toBe('neighborhood');
  });

  it('house lots count one home each; townhome rows of the multifamily engine say so', () => {
    const lots = comp({
      best_requested: 'loop', best_lots: 12, best_buildable: true,
      candidates: [row('loop', 'frontage lots, no new street', 12), row('townhome', 'townhomes (mews)', 19, ['alley.street_to_street'], { product: 'attached', engine: 'v3' })] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 57, multifamilyProduct: 'townhomes', competition: lots });
    expect(c.neighborhood).toMatchObject({ requested: 'loop', homes: 12, attached: false });
    // the townhome row of the competition drew more than the best but fails: said, not hidden
    expect(c.sentence).toBe('The townhome rows place more homes here: 57 townhomes in rows against the neighborhood\'s best of 12 house lots (frontage lots, no new street), so they are the default. The townhome row drew 19 homes but fails alley.street_to_street.');
  });

  it('no neighborhood plan: every pattern draws nothing, the competition skipped, or it has not run', () => {
    const none = comp({ best_requested: 'grid', best_lots: 0, candidates: [row('grid', null, 0), row('loop', null, 0)] as never });
    expect(neighborhoodOption(none)).toBeNull();
    expect(chooseLayout({ multifamilyHomes: 15, competition: none }).sentence).toBe('No neighborhood pattern places a home here, so the sheet stays multifamily.');
    const skipped = summarizeCandidates({ status: 'skipped', reason: 'landlocked: no edge touches a mapped street' } as SfV1CandidatesResponse);
    expect(chooseLayout({ multifamilyHomes: 15, competition: skipped }).sentence).toBe('No neighborhood plan: landlocked: no edge touches a mapped street, so the sheet stays multifamily.');
    expect(chooseLayout({ multifamilyHomes: 15, competition: null }).defaultKind).toBe('multifamily');
    // engine g13: the competition's own reason rides along
    const why = comp({ best_requested: 'grid', best_lots: 0, why: 'no lot of 6000 sf fits on the frontage or beside a new street: 0.4 ac buildable | grid: 1 local street', candidates: [row('grid', null, 0)] as never });
    expect(chooseLayout({ multifamilyHomes: 15, competition: why }).sentence).toBe(
      'No neighborhood pattern places a home here (no lot of 6000 sf fits on the frontage or beside a new street: 0.4 ac buildable), so the sheet stays multifamily.');
  });

  it('0 Todd Preis Dr: the competition skipped for the floodplain, the multifamily plan stands in it and the sentence says so', () => {
    const skipped = summarizeCandidates({ status: 'skipped', reason: 'floodplain leaves no buildable piece' } as SfV1CandidatesResponse);
    const c = chooseLayout({ multifamilyHomes: 94, competition: skipped });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.floodHold).toBe(true);
    expect(c.sentence).toBe('No neighborhood plan: floodplain leaves no buildable piece. The multifamily engine does not hold the flood hazard area out yet, so its 94 apartments stand in it: a what-if until it does, not a by-right default.');
    expect(isFloodSkip('floodplain leaves no buildable piece')).toBe(true);
    expect(isFloodSkip('landlocked: no edge touches a mapped street')).toBe(false);
    // a landlocked skip is not a flood hold
    const landlocked = summarizeCandidates({ status: 'skipped', reason: 'landlocked: no edge touches a mapped street' } as SfV1CandidatesResponse);
    expect(chooseLayout({ multifamilyHomes: 15, competition: landlocked }).floodHold).toBe(false);
    // with no multifamily plan either there is nothing to flag
    expect(chooseLayout({ multifamilyHomes: null, competition: skipped }).sentence).toBe('No neighborhood plan: floodplain leaves no buildable piece, so the sheet stays multifamily.');
  });

  it('engine g21: no public street on the parcel marks the multifamily plan; the default and the count do not change', () => {
    // 0 Hicks Rd (RM4), g22: by right "the parcel as one lot" beside 8 apartments, access by a private lane
    const lane = 'no boundary on a public street; a lane is mapped along or across the boundary (62 ft of it within 15 ft) over neighbouring parcels: reached by a private lane, an access easement to confirm';
    const hicks = comp({
      best_requested: 'loop', best_lots: 1, best_buildable: true, verdict: 'buildable as drawn', homes_allowed_by_density: 8,
      access: { type: 'private_lane', message: lane, street_ft: 0 },
      candidates: [row('grid', null, 0, ['access.landlocked']), row('loop', 'the parcel as one lot', 1)] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 8, competition: hicks });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.multifamilyHomes).toBe(8);
    expect(c.accessCaution).toEqual({ type: 'private_lane', message: lane });
    expect(c.sentence).toBe(`Apartments place more homes here: 8 apartments against the neighborhood's best of 1 house lot (the parcel as one lot), so they are the default. No public street fronts this parcel (${lane}): the multifamily plan does not check access.`);

    // 262 Martingale Dr (RM20): the competition is skipped as landlocked and still carries the reading
    const none = 'no boundary on a mapped street, no unparcelled right-of-way beside it and no mapped lane reaching it';
    const martingale = summarizeCandidates({ status: 'skipped', reason: `landlocked: ${none}`, access: { type: 'none', message: none } } as SfV1CandidatesResponse);
    const m = chooseLayout({ multifamilyHomes: 35, competition: martingale });
    expect(m.defaultKind).toBe('multifamily');
    expect(m.accessCaution).toEqual({ type: 'none', message: none });
    expect(m.sentence).toContain('No street access is on record for this parcel');
    expect(m.sentence).toContain('the by-right engine draws nothing here without it');

    // a driveway-wide touch and a street are not marked; nor is a parcel with no multifamily plan to mark
    const touch = comp({ best_requested: 'loop', best_lots: 1, access: { type: 'narrow_touch', message: 'the parcel touches Woodland Hills Dr for 31 ft' }, candidates: [row('loop', 'the parcel as one lot', 1)] as never });
    expect(chooseLayout({ multifamilyHomes: 10, competition: touch }).accessCaution).toBeNull();
    expect(chooseLayout({ multifamilyHomes: 89, competition: HEIMAN }).accessCaution).toBeNull();
    expect(chooseLayout({ multifamilyHomes: null, competition: martingale }).accessCaution).toBeNull();
    expect(chooseLayout({ multifamilyHomes: null, competition: martingale }).sentence).not.toContain('street access');
  });

  it('0 Carothers Rd: the townhome row drew as many homes as the apartments but fails a code test; the sentence says what it drew', () => {
    const carothers = comp({
      best_requested: 'loop', best_lots: 20, best_buildable: true, homes_allowed_by_density: 42, attached_permitted: true,
      candidates: [
        row('grid', 'grid', 22, ['cost.street_ft_per_lot', 'street.grade_max']),
        row('loop', 'single street', 20, []),
        row('townhome', 'townhomes (street)', 42, ['alley.street_to_street'], { product: 'attached', engine: 'v3' }),
      ] as never,
    });
    const c = chooseLayout({ multifamilyHomes: 42, competition: carothers });
    expect(c.defaultKind).toBe('multifamily');
    expect(c.sentence).toBe('Apartments place more homes here: 42 apartments against the neighborhood\'s best of 20 house lots (single street), so they are the default. The townhome row drew 42 homes but fails alley.street_to_street.');
  });

  it('homesPhrase', () => {
    expect(homesPhrase(1, true)).toBe('1 townhome');
    expect(homesPhrase(12, false)).toBe('12 house lots');
  });
});
