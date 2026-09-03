import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  it('names the pattern, lists principles and precedent plans, and is honest about the generator', () => {
    render(<PlanPatternPanel plan={MDHA} />);
    expect(screen.getByTestId('plan-pattern-name').textContent).toBe('Subdivision on a public ROW spine with rear alleys');
    expect(screen.getByTestId('plan-pattern-alignment').textContent).toBe('generator: not yet');
    const text = screen.getByTestId('plan-pattern-panel').textContent ?? '';
    expect(text).toContain('rear alleys');
    expect(text).toContain('MDHA concept 08/21 — 102 lots');
    expect(text).toContain('subdivision generator pending');
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
