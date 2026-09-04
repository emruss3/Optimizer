import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanPatternPanel } from './PlanPatternPanel';
import { patternLabel, type PlanPattern } from '../api/planPattern';

const MDHA: PlanPattern = {
  version: 'plan_pattern_v1',
  parcel_ogc_fid: 550510,
  pattern: 'subdivision_row_spine',
  alternates: ['townhome_rows_on_spine'],
  principles: [
    'public right-of-way spine along the long axis (55-ft ROW) — the street network comes first',
    'double-loaded lots with rear alleys: garages off the alley, fronts on the street',
  ],
  exemplars: [
    { name: 'MDHA concept 08/21 — 102 lots', source: 'MDHA_Property_Concept_08212026.pdf', pattern: 'subdivision_row_spine' },
    { name: 'MDHA concept 08/30 — 69 lots + amenity', source: 'MDHA_Property_Concept_08302026.pdf', pattern: 'subdivision_row_spine' },
  ],
  generator_alignment: {
    generator: 'fn_generate_sf_site_plan', aligned: false,
    note: 'the lot generator slices strips across the parcel with no street network; subdivision generator pending',
  },
};

describe('PlanPatternPanel (plan-organization layer)', () => {
  it('is one line by default — the pattern and the chip — and opens the detail on request', () => {
    render(<PlanPatternPanel plan={MDHA} />);
    expect(screen.getByTestId('plan-pattern-name').textContent).toBe('Subdivision on a public ROW spine with rear alleys');
    expect(screen.getByTestId('plan-pattern-alignment').textContent).toBe('generator: not yet');
    // collapsed: no principles, no precedents on the page
    expect(screen.queryByTestId('plan-pattern-details')).toBeNull();
    const collapsed = screen.getByTestId('plan-pattern-panel').textContent ?? '';
    expect(collapsed).not.toContain('MDHA concept 08/21');
    expect(collapsed).not.toContain('garages off the alley');
    fireEvent.click(screen.getByTestId('plan-pattern-toggle'));
    const text = screen.getByTestId('plan-pattern-details').textContent ?? '';
    expect(text).toContain('rear alleys');
    expect(text).toContain('MDHA concept 08/21 — 102 lots');
    expect(text).toContain('subdivision generator pending');
    expect(screen.getByTestId('plan-pattern-toggle').textContent).toBe('hide');
  });

  it('reads the parcel against its population: the sweep calibration line (in the detail)', () => {
    render(
      <PlanPatternPanel
        defaultOpen
        plan={{
          ...MDHA,
          generator_alignment: { generator: 'fn_generate_subdivision', aligned: true, note: 'draws it' },
          calibration: {
            n: 38, band: { zoning: 'R6', acres_lo: 6.6, acres_hi: 26.3 }, refused_pct: 5.3,
            median_du_ac: 3.1, p25_du_ac: 2.2, p75_du_ac: 4.0, median_pct_row: 21.5, median_pct_lots: 48.2, median_pct_hazard: 4.0,
            basis: '38 sweep parcels zoned R6 between 6.6 and 26.3 ac',
          },
        }}
      />
    );
    const cal = screen.getByTestId('plan-pattern-calibration').textContent ?? '';
    expect(cal).toContain('38 parcels zoned R6, 6.6–26.3 ac');
    expect(cal).toContain('median 3.1 lots/ac (2.2–4)');
    expect(cal).toContain('ROW 21.5%');
    expect(cal).toContain('held out 4%');
    expect(cal).toContain('5.3% refused');
    expect(screen.getByTestId('plan-pattern-alignment').textContent).toBe('generator follows this');
  });

  it('shows the green chip when the generator follows the pattern', () => {
    render(
      <PlanPatternPanel
        plan={{ parcel_ogc_fid: 553450, pattern: 'bar_on_frontage_rear_field', principles: ['street-facing bar'], generator_alignment: { generator: 'seed_v2', aligned: true, note: 'default composition' } }}
      />
    );
    expect(screen.getByTestId('plan-pattern-alignment').textContent).toBe('generator follows this');
    expect(patternLabel('retail_stacked_two_tenant')).toContain('stacked two-tenant');
    expect(patternLabel(undefined)).toBe('No pattern');
  });
});
