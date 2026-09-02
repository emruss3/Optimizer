import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MaxBuildoutHeadline from './MaxBuildoutHeadline';
import { normalizeMaxBuildout, type MaxBuildout } from '../api/maxBuildout';

// Live-shaped payload: 55 Music Sq E (ORI, FAR 3, 65 ft) — the surface-parking
// frontier stops at 34,100 GSF while the podium ceiling is the FAR line.
const ORI_RAW = {
  contract_version: 'max_buildout_v4_integer_consistent',
  parcel_ogc_fid: 407431,
  typology: 'multifamily',
  max_gsf: 34100,
  at_stories: 5,
  at_unit_gsf: 1550,
  units_at_max: 22,
  unit_gsf_min: 750,
  unit_gsf_max: 1550,
  binding_constraint: 'land_after_parking',
  frontier_basis: 'surface_parking',
  structured_parking_ceiling: { gsf: 89733, stories: 5, binding: 'far', basis: 'advisory: no parking land consumed' },
  stories_ladder: [
    { stories: 1, units: 8, max_gsf: 12400, unit_gsf: 1550, binding: 'land_after_parking' },
    { stories: 5, units: 22, max_gsf: 34100, unit_gsf: 1550, binding: 'land_after_parking' },
  ],
  assumptions: { stall_land_sf: 420, height_source: 'ordinance' },
};

describe('MaxBuildoutHeadline — frontier honesty chips (order-8 audit)', () => {
  it('normalizes the advisory structured ceiling and frontier basis', () => {
    const b = normalizeMaxBuildout(ORI_RAW)!;
    expect(b.frontier_basis).toBe('surface_parking');
    expect(b.structured_parking_ceiling?.gsf).toBe(89733);
    expect(b.structured_parking_ceiling?.binding).toBe('far');
  });

  it('shows the podium-ceiling chip when it materially exceeds the surface bound', () => {
    const b = normalizeMaxBuildout(ORI_RAW) as MaxBuildout;
    render(<MaxBuildoutHeadline buildout={b} achievedGsf={34100} />);
    const chip = screen.getByTestId('structured-ceiling-chip');
    expect(chip.textContent).toContain('89,733 GSF');
    expect(chip.textContent).toContain('far');
    expect(screen.queryByTestId('height-missing-chip')).toBeNull();
  });

  it('stays quiet when the ceiling is within 15% of the surface bound (density-bound suburban lots)', () => {
    const b = normalizeMaxBuildout({
      ...ORI_RAW, max_gsf: 125550, structured_parking_ceiling: { gsf: 125569, binding: 'density(units)' },
    }) as MaxBuildout;
    render(<MaxBuildoutHeadline buildout={b} />);
    expect(screen.queryByTestId('structured-ceiling-chip')).toBeNull();
  });

  it('flags a district with no height cap on file (3-story default applied)', () => {
    const b = normalizeMaxBuildout({
      ...ORI_RAW, assumptions: { height_source: 'default_3_stories_height_missing' },
    }) as MaxBuildout;
    render(<MaxBuildoutHeadline buildout={b} />);
    expect(screen.getByTestId('height-missing-chip').textContent).toContain('3-story default');
  });
});
