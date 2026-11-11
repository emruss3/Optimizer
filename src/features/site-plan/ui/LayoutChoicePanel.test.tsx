import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayoutChoicePanel } from './LayoutChoicePanel';
import { chooseLayout } from '../api/layoutChoice';
import { summarizeCandidates, type SfV1CandidatesResponse } from '../api/sfV1Plan';
import { thV3ToElements } from '../api/thV3Plan';

const COMP = summarizeCandidates({
  status: 'done', best_requested: 'townhome', best_lots: 32, best_buildable: true, verdict: 'buildable as drawn', best_code_fails: [],
  homes_allowed_by_density: 129, attached_permitted: true, structured_lots: 10, lots_forgone_for_structure: 22,
  candidates: [
    { requested: 'grid', pattern: 'grid', status: 'done', lots: 10, fails: ['cost.street_ft_per_lot'] },
    { requested: 'neighborhood', pattern: 'neighborhood', status: 'done', lots: 10, fails: ['cost.street_ft_per_lot'] },
    { requested: 'loop', pattern: 'frontage lots, no new street', status: 'done', lots: 6, fails: [] },
    { requested: 'townhome', pattern: 'townhomes (mews)', status: 'done', lots: 32, fails: [], product: 'attached', engine: 'v3' },
  ],
  best: { status: 'done', lots: 32, product: 'attached', engine: 'v3', full_plan_call: "fn_generate_th_site_plan_v3(ogc_fid, 'aor')" },
} as unknown as SfV1CandidatesResponse)!;
const DONE = { state: 'done' as const, data: COMP, error: null };

describe('LayoutChoicePanel (multifamily by default where it places more homes; the neighborhood one tap away)', () => {
  it('2622 W Heiman: Multifamily 89 homes is the default and on the sheet; Neighborhood 32 townhomes switches', () => {
    const onChoose = vi.fn();
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 89, competition: COMP })} competition={DONE}
        shown="multifamily" shownRequested={null} auto={false} onChoose={onChoose} onViewCandidate={() => undefined} />,
    );
    const panel = screen.getByTestId('layout-choice');
    expect(panel.getAttribute('data-default')).toBe('multifamily');
    expect(panel.getAttribute('data-shown')).toBe('multifamily');
    const mf = screen.getByTestId('layout-option-multifamily');
    expect(mf.getAttribute('aria-checked')).toBe('true');
    expect(mf.textContent).toContain('89 homes');
    expect(mf.textContent).toContain('default');
    const nb = screen.getByTestId('layout-option-neighborhood');
    expect(nb.textContent).toContain('32 homes');
    expect(nb.textContent).toContain('townhomes (mews)');
    expect(screen.getByTestId('layout-sentence').textContent).toContain('89 apartments against the neighborhood\'s best of 32 townhomes');
    expect(screen.getByTestId('layout-density').textContent).toContain('allows 129 homes');
    // the rows wait behind a link while the multifamily plan is on the sheet
    expect(screen.queryByTestId('sfv1-competition')).toBeNull();
    fireEvent.click(screen.getByTestId('layout-show-all'));
    expect(screen.getByTestId('sfv1-competition')).toBeTruthy();
    fireEvent.click(nb);
    expect(onChoose).toHaveBeenLastCalledWith('neighborhood');
  });

  it('the neighborhood on the sheet by itself: the note, the way back, the townhome facts and every plan drawable', () => {
    const onChoose = vi.fn();
    const onView = vi.fn();
    const { summary } = thV3ToElements({
      generator_version: 'th_v3', pattern: 'mews', rules: { max_homes_by_density: 32 },
      buildings: [], metrics: { homes: 27, alleys: 1, street_ft: 0, usable_open_pct: 41, homes_per_acre: 12.7, unit_w_ft: 20, unit_d_ft: 40 },
      parking: { guest_stalls: 2, guest_target: 7 }, stormwater: { sf: 2100, needed_sf: 1900 },
      tests: [{ id: 'eff.homes_per_acre', ok: false, kind: 'context' }], fails: [],
    });
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 24, competition: COMP })} competition={DONE}
        shown="neighborhood" shownRequested="townhome" auto onChoose={onChoose} onViewCandidate={onView} thV3={summary} />,
    );
    expect(screen.getByTestId('layout-choice').getAttribute('data-default')).toBe('neighborhood');
    expect(screen.getByTestId('layout-auto').textContent).toContain('places more homes');
    const facts = screen.getByTestId('layout-thv3');
    expect(facts.textContent).toContain('27 townhomes on a mews');
    expect(facts.textContent).toContain('2 of 7 stalls');
    expect(facts.textContent).toContain('Every required test passes');
    expect(facts.textContent).toContain('eff.homes_per_acre');
    expect(screen.getByTestId('sfv1-cand-onsheet-townhome')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sfv1-cand-view-loop'));
    expect(onView).toHaveBeenLastCalledWith('loop');
    fireEvent.click(screen.getByTestId('layout-auto-back'));
    expect(onChoose).toHaveBeenLastCalledWith('multifamily');
    expect(screen.queryByTestId('layout-thv3-trimmed')).toBeNull();
  });

  it('0 Swiss Ave: when the apartment plan did not draw, the auto note says so — not "more homes"', () => {
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: null, multifamilyFailed: true, competition: COMP })} competition={DONE}
        shown="neighborhood" shownRequested="townhome" auto onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    expect(screen.getByTestId('layout-auto').textContent).toContain('because the multifamily plan did not draw');
  });

  it('engine g13: a townhome drawing trimmed to the density cap says so', () => {
    const note = '62 homes drawn; trimmed to the district density cap of 42 (the 20 furthest from the street removed)';
    const { summary } = thV3ToElements({
      generator_version: 'th_v3', pattern: 'mews', rules: { max_homes_by_density: 42 },
      buildings: [], metrics: { homes: 42, homes_before_density_cap: 62, alleys: 2, street_ft: 600 }, tests: [], fails: [], notes: [note],
    });
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 24, competition: COMP })} competition={DONE}
        shown="neighborhood" shownRequested="townhome" auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} thV3={summary} />,
    );
    expect(screen.getByTestId('layout-thv3-trimmed').textContent).toBe(note);
    expect(screen.queryByTestId('layout-thv3-density')).toBeNull();
  });

  it('a neighborhood the sheet cannot draw, or one that fails a code test, is marked — and the first cannot be picked', () => {
    const v2 = summarizeCandidates({
      status: 'done', best_requested: 'townhome', best_lots: 40, best_buildable: false, best_code_fails: ['alley.street_to_street'],
      candidates: [{ requested: 'townhome', pattern: 'townhomes (alleys)', status: 'done', lots: 40, fails: ['alley.street_to_street'], product: 'attached', engine: 'v2' }],
    } as unknown as SfV1CandidatesResponse)!;
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 30, competition: v2 })} competition={{ state: 'done', data: v2, error: null }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    const nb = screen.getByTestId('layout-option-neighborhood') as HTMLButtonElement;
    expect(nb.disabled).toBe(true);
    expect(nb.textContent).toContain('fails a code test');
  });

  it('0 Todd Preis Dr: the floodplain leaves no buildable piece; the multifamily option is badged as standing in it', () => {
    const skipped = summarizeCandidates({ status: 'skipped', reason: 'floodplain leaves no buildable piece' } as unknown as SfV1CandidatesResponse);
    render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 94, competition: skipped })} competition={{ state: 'done', data: skipped, error: null }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    expect(screen.getByTestId('layout-choice').getAttribute('data-flood-hold')).toBe('true');
    const mf = screen.getByTestId('layout-option-multifamily');
    expect(mf.textContent).toContain('94 homes');
    expect(mf.textContent).toContain('in the flood hazard area');
    expect(screen.getByTestId('layout-sentence').textContent).toContain('does not hold the flood hazard area out yet');
    expect(screen.getByTestId('layout-option-neighborhood').textContent).toContain('no pattern places a home');
  });

  it('marks the multifamily plan where the engine finds no public street (engine g21)', () => {
    const none = 'no boundary on a mapped street, no unparcelled right-of-way beside it and no mapped lane reaching it';
    const skipped = summarizeCandidates({ status: 'skipped', reason: `landlocked: ${none}`, access: { type: 'none', message: none } } as never)!;
    const { rerender } = render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 35, competition: skipped })} competition={{ state: 'done', data: skipped, error: null }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    expect(screen.getByTestId('layout-choice').getAttribute('data-access-caution')).toBe('none');
    expect(screen.getByTestId('layout-option-multifamily').textContent).toContain('no street access on record');
    expect(screen.getByTestId('layout-sentence').textContent).toContain('No street access is on record for this parcel');

    const lane = summarizeCandidates({ status: 'done', best_requested: 'loop', best_lots: 1, access: { type: 'private_lane', message: 'reached by a private lane, an access easement to confirm' },
      candidates: [{ requested: 'loop', pattern: 'the parcel as one lot', status: 'done', lots: 1, fails: [] }] } as never)!;
    rerender(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 8, competition: lane })} competition={{ state: 'done', data: lane, error: null }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    expect(screen.getByTestId('layout-choice').getAttribute('data-access-caution')).toBe('private_lane');
    expect(screen.getByTestId('layout-option-multifamily').textContent).toContain('private lane · easement to confirm');
    expect(screen.getByTestId('layout-option-multifamily').textContent).not.toContain('no street access on record');
  });

  it('while the plans are drawn, and when they fail, it says so; the multifamily plan stands', () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 89, competition: null })} competition={{ state: 'loading', data: null, error: null }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} />,
    );
    expect(screen.getByTestId('layout-loading')).toBeTruthy();
    expect(screen.getByTestId('layout-option-neighborhood').textContent).toContain('comparing the patterns');
    rerender(
      <LayoutChoicePanel choice={chooseLayout({ multifamilyHomes: 89, competition: null })} competition={{ state: 'error', data: null, error: 'the three plans did not finish inside the 20 s' }}
        shown="multifamily" shownRequested={null} auto={false} onChoose={() => undefined} onViewCandidate={() => undefined} onRetry={onRetry} />,
    );
    expect(screen.getByTestId('layout-error').textContent).toContain('The multifamily plan stands');
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
