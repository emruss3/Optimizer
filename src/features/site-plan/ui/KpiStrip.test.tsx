import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import KpiStrip from './KpiStrip';
import type { SiteMetrics } from '../../../engine/types';

const base = {
  totalBuiltSF: 100000,
  siteCoveragePct: 25,
  achievedFAR: 1.0,
  parkingRatio: 1.5,
  openSpacePct: 40,
  totalUnits: 80,
  stallsProvided: 120,
  stallsRequired: 120,
  violations: [],
  zoningCompliant: true,
} as unknown as SiteMetrics;

describe('KpiStrip — parking regime chip', () => {
  it('shows the tuck-under chip only for tuck_under solves', () => {
    const { rerender } = render(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'tuck_under' } as SiteMetrics}
        investment={null}
        utilizationPct={100}
      />
    );
    expect(screen.getByText('Tuck-under parking')).toBeTruthy();

    rerender(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'surface' } as SiteMetrics}
        investment={null}
        utilizationPct={100}
      />
    );
    expect(screen.queryByText('Tuck-under parking')).toBeNull();
  });

  it('keeps compliance and envelope verdicts separate from the regime chip', () => {
    render(
      <KpiStrip
        metrics={{ ...base, parkingRegime: 'tuck_under' } as SiteMetrics}
        investment={null}
        utilizationPct={62}
      />
    );
    expect(screen.getByText('Checks passed')).toBeTruthy();
    expect(screen.getByText(/62% of theoretical envelope/)).toBeTruthy();
    expect(screen.getByText('Tuck-under parking')).toBeTruthy();
  });
});

describe('KpiStrip — a by-right subdivision on the sheet', () => {
  it('reads lots, du/ac and the plan\'s own tests, not stalls and "0 issues"', () => {
    const sub = { ...base, totalUnits: 25, openSpacePct: 9, zoningCompliant: false } as SiteMetrics;
    const { rerender } = render(
      <KpiStrip metrics={sub} investment={null} subdivision={{ lots: 25, densityDuAc: 2.33, fails: ['street.grade_max'], status: 'done' }} />
    );
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('Lots25');
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('du / ac2.33');
    expect(screen.queryByText('Stalls')).toBeNull();
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('1 test fail');
    rerender(<KpiStrip metrics={sub} investment={null} subdivision={{ lots: 35, densityDuAc: 3.26, fails: [], status: 'done' }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('All tests pass');
    rerender(<KpiStrip metrics={sub} investment={null} subdivision={{ lots: 0, densityDuAc: null, fails: [], status: 'done' }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('No new lots by right');
  });

  it('the townhome engine\'s plan counts townhomes and homes per acre (multifamily land, 2026-11-04)', () => {
    const th = { ...base, totalUnits: 27, openSpacePct: 41, zoningCompliant: true } as SiteMetrics;
    render(<KpiStrip metrics={th} investment={null} subdivision={{ lots: 27, densityDuAc: 12.7, fails: [], status: 'done', label: 'Townhomes', densityLabel: 'homes / ac' }} />);
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('Townhomes27');
    expect(screen.getByTestId('kpi-subdivision').textContent).toContain('homes / ac12.7');
  });
});

describe('KpiStrip — a parking shortfall leads the badge (0 Whites Creek Pike, 2026-11-09)', () => {
  it('says the shortfall instead of "Code compliant · constrained … +1"', () => {
    render(
      <KpiStrip
        metrics={{ ...base, stallsProvided: 85, stallsRequired: 92 } as SiteMetrics}
        investment={null}
        utilizationPct={98}
        planFlags={['coverage_cap_reached']}
      />
    );
    expect(screen.getByText('Parking shortfall · 85 of 92 stalls · coverage-capped')).toBeTruthy();
    expect(screen.queryByText(/^Checks passed/)).toBeNull();
  });
});

describe('KpiStrip — the empty strip says why (1360 Brick Church Pike, 2026-11-09)', () => {
  it('a failed solve is not "Generating plan…"', () => {
    const { rerender } = render(<KpiStrip metrics={null} investment={null} empty={{ state: 'failed', reason: 'The massing service did not respond (transport failure).' }} />);
    expect(screen.getByTestId('kpi-empty').textContent).toBe('No plan: the solve failed — The massing service did not respond (transport failure).');
    expect(screen.getByTestId('kpi-empty').getAttribute('data-state')).toBe('failed');
    rerender(<KpiStrip metrics={null} investment={null} empty={{ state: 'blocked', reason: 'the selected use is not permitted as-of-right' }} />);
    expect(screen.getByTestId('kpi-empty').textContent).toContain('generation is blocked');
    rerender(<KpiStrip metrics={null} investment={null} empty={{ state: 'generating' }} />);
    expect(screen.getByTestId('kpi-empty').textContent).toBe('Generating plan…');
    rerender(<KpiStrip metrics={null} investment={null} />);
    expect(screen.getByTestId('kpi-empty').textContent).toBe('Generating plan…');
  });
});

describe('KpiStrip — the verdict names its scope (the scope\'s P0.2, 2026-11-09)', () => {
  it('"All N checks pass" counts the checks and the title lists them and what was not evaluated (4727 Post Rd)', () => {
    const sub = { ...base, totalUnits: 11, openSpacePct: 12, zoningCompliant: true } as SiteMetrics;
    render(
      <KpiStrip
        metrics={sub}
        investment={null}
        subdivision={{ lots: 11, densityDuAc: 1.1, fails: [], status: 'done', tests: ['street.dead_end_max', 'access.second_connection', 'flood.freeboard'] }}
      />
    );
    const verdict = screen.getByTestId('kpi-subdivision-verdict');
    expect(verdict.textContent).toBe('All 3 checks pass');
    expect(verdict.getAttribute('title')).toContain('Checks covered: street.dead_end_max, access.second_connection, flood.freeboard');
    expect(verdict.getAttribute('title')).toContain('Not evaluated: survey and legal access');
  });

  it('a failing check reads "1 of 3 checks fail"', () => {
    const sub = { ...base, zoningCompliant: false } as SiteMetrics;
    render(
      <KpiStrip
        metrics={sub}
        investment={null}
        subdivision={{ lots: 11, densityDuAc: 1.1, fails: ['access.second_connection'], status: 'done', tests: ['street.dead_end_max', 'access.second_connection', 'flood.freeboard'] }}
      />
    );
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('1 of 3 checks fail');
  });

  it('a legacy generator\'s plan is provisional, never "all pass"', () => {
    render(<KpiStrip metrics={base} investment={null} subdivision={{ lots: 6, densityDuAc: 2, fails: [], status: 'done', legacy: true }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('Legacy generator · provisional');
  });

  it('a conditional sketch reads Conditional with its precondition, not "Code compliant" (1289 Currey Rd)', () => {
    const house = { ...base, conditional: 'assumes an access easement across a neighbour (no mapped street contact)' } as SiteMetrics;
    render(<KpiStrip metrics={house} investment={null} />);
    expect(screen.getByTestId('kpi-conditional').textContent).toContain('Conditional · assumes an access easement across a neighbour');
    expect(screen.queryByText(/Checks passed/)).toBeNull();
  });
});

describe('KpiStrip — parking the evidence cannot settle (the cohort retest, 2026-11-09)', () => {
  it('two counts that disagree read "Parking needs verification", never Code compliant (0 Whites Creek Pike)', () => {
    render(
      <KpiStrip
        metrics={{ ...base, stallsProvided: 292, stallsRequired: 92, stallsDrawn: 292, stallsReported: 85, parkingStatus: 'needs_verification', parkingStatusReason: 'the drawn bays hold 292 stalls; the engine\'s summary says 85' } as SiteMetrics}
        investment={null}
      />
    );
    expect(screen.getByTestId('kpi-parking-verify').textContent).toBe('Parking needs verification · 292 drawn / 85 reported · 92 required');
    expect(screen.queryByText(/Checks passed/)).toBeNull();
    expect(screen.getByText('292 drawn · 85 reported / 92')).toBeTruthy();
  });

  it('a requirement that was not evaluated reads as unknown, and the badge scopes its claim (1289 Currey Rd)', () => {
    render(<KpiStrip metrics={{ ...base, totalUnits: 1, stallsProvided: 0, stallsRequired: undefined, parkingStatus: 'not_evaluated' } as SiteMetrics} investment={null} />);
    expect(screen.getByText('0 / not evaluated')).toBeTruthy();
    expect(screen.getByText('Checks passed · parking not evaluated')).toBeTruthy();
    expect(screen.queryByText('0 / 0')).toBeNull();
  });

  it('a conditional sketch stays Conditional even when parking is unverified', () => {
    render(<KpiStrip metrics={{ ...base, conditional: 'assumes an access easement', parkingStatus: 'needs_verification', stallsDrawn: 4, stallsReported: 2 } as SiteMetrics} investment={null} />);
    expect(screen.getByTestId('kpi-conditional')).toBeTruthy();
    expect(screen.queryByTestId('kpi-parking-verify')).toBeNull();
  });
});

describe('KpiStrip — a generator error is not "no new lots" (8192 Charlotte Pike, 2026-11-10)', () => {
  it('reads "Generator error · no plan"', () => {
    render(<KpiStrip metrics={{ ...base, totalUnits: 0 } as SiteMetrics} investment={null} subdivision={{ lots: 0, densityDuAc: null, fails: [], status: 'error' }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('Generator error · no plan');
  });
});

describe('KpiStrip — lots on land that is not the parcel (1716 Red Jacket Dr, 2026-11-10)', () => {
  it('does not say every check passes over a plan that cannot be built as drawn', () => {
    render(<KpiStrip metrics={{ ...base, totalUnits: 9 } as SiteMetrics} investment={null}
      subdivision={{ lots: 9, densityDuAc: 0.21, fails: [], status: 'done', tests: ['block.length', 'street.grade_max'], offParcelLots: 7 }} />);
    const chip = screen.getByTestId('kpi-subdivision-verdict');
    expect(chip.textContent).toBe('Cannot be built as drawn · 7 lots off the parcel');
    expect(chip.getAttribute('title')).toContain('7 of 9 lots lie partly on land inside the outline that is not this parcel');
  });

  it('a plan with no lot off the parcel keeps its verdict', () => {
    render(<KpiStrip metrics={{ ...base, totalUnits: 9 } as SiteMetrics} investment={null}
      subdivision={{ lots: 9, densityDuAc: 0.21, fails: [], status: 'done', tests: ['block.length', 'street.grade_max'], offParcelLots: 0 }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('All 2 checks pass');
  });
});

describe('KpiStrip — every check passes and most of the land is not planned (0 Brittany Park Dr, engine g18)', () => {
  it('says both', () => {
    render(<KpiStrip metrics={{ ...base, totalUnits: 13 } as SiteMetrics} investment={null}
      subdivision={{ lots: 13, densityDuAc: 0.45, fails: [], status: 'done', tests: ['block.length', 'lot.min_area'], unplannedAcres: 11.7 }} />);
    const chip = screen.getByTestId('kpi-subdivision-verdict');
    expect(chip.textContent).toBe('All 2 checks pass · 11.7 ac not planned');
    expect(chip.className).toContain('text-amber-700');
  });

  it('under an acre the verdict is unchanged, and a failing plan leads with its fails', () => {
    const { rerender } = render(<KpiStrip metrics={{ ...base, totalUnits: 5 } as SiteMetrics} investment={null}
      subdivision={{ lots: 5, densityDuAc: 2.5, fails: [], status: 'done', tests: ['block.length'], unplannedAcres: 0.4 }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('All 1 checks pass');
    rerender(<KpiStrip metrics={{ ...base, totalUnits: 5 } as SiteMetrics} investment={null}
      subdivision={{ lots: 5, densityDuAc: 2.5, fails: ['street.grade_max'], status: 'done', tests: ['block.length', 'street.grade_max'], unplannedAcres: 8 }} />);
    expect(screen.getByTestId('kpi-subdivision-verdict').textContent).toBe('1 of 2 checks fail');
  });
});


describe('KpiStrip: a plan whose basis is not established (1710 Meharry Blvd, 2026-11-12)', () => {
  it('reads Needs verification, not Checks passed, while the context is not verified', () => {
    const { rerender } = render(<KpiStrip metrics={base} investment={null} unverified="context not verified" />);
    expect(screen.getByTestId('kpi-needs-verification').textContent).toContain('Needs verification · context not verified');
    expect(screen.queryByText('Checks passed')).toBeNull();
    // with the basis established the same plan reads compliant
    rerender(<KpiStrip metrics={base} investment={null} unverified={null} />);
    expect(screen.getByText('Checks passed')).toBeTruthy();
    expect(screen.queryByTestId('kpi-needs-verification')).toBeNull();
  });

  it('does not soften a failing plan or a parking shortfall into Needs verification', () => {
    const { rerender } = render(<KpiStrip metrics={{ ...base, zoningCompliant: false, violations: ['height'] } as SiteMetrics} investment={null} unverified="context not verified" />);
    expect(screen.getByText('1 issue')).toBeTruthy();
    rerender(<KpiStrip metrics={{ ...base, stallsProvided: 85, stallsRequired: 92 } as SiteMetrics} investment={null} unverified="context not verified" />);
    expect(screen.getByText(/Parking shortfall · 85 of 92 stalls/)).toBeTruthy();
    expect(screen.queryByTestId('kpi-needs-verification')).toBeNull();
  });

  it('shows no FAR or coverage figure the engine did not report', () => {
    render(<KpiStrip metrics={{ ...base, achievedFAR: 0, siteCoveragePct: 0 } as SiteMetrics} investment={null} />);
    expect(screen.queryByText('FAR')).toBeNull();
    expect(screen.queryByText('Coverage')).toBeNull();
  });
});
