import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Element } from '../../../engine/types';
import { TopoGrid, type ParcelTopo } from '../api/parcelTopo';
import { StreetProfilePanel, buildStreetProfiles } from './StreetProfile';

const X = 1726000, Y = 672500;
const samples: Array<[number, number, number]> = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 40; c++) samples.push([c, r, 440 - c * 0.2 + (c === 10 ? 3 : 0)]);
const TOPO: ParcelTopo = {
  parcel_ogc_fid: 1, spacing_ft: 20, grid: { origin_x: X, origin_y: Y + 20, cols: 40, rows: 3, spacing_ft: 20 },
  contours: [], samples, z_min_ft: 432, z_max_ft: 443, mean_slope_pct: 1.1, max_slope_pct: 15, source: 'USGS 3DEP 1 m DEM',
};
const meta = { createdAt: 't', updatedAt: 't', source: 'ai-generated' as const };
const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [30, 0], [30, 10], [0, 10], [0, 0]]] };
const street: Element = {
  id: 'subdiv-street-1', type: 'circulation', name: 'Street A', geometry: square, metadata: meta,
  properties: { kind: 'through', widthFt: 55, hazardCrossingFt: 102, centerline2274: [[X, Y], [X + 400, Y]] },
} as Element;

describe('buildStreetProfiles', () => {
  it('profiles every through-street: length, end grades, overall and steepest grade', () => {
    const [d] = buildStreetProfiles([street], new TopoGrid(TOPO), 25);
    expect(d.name).toBe('Street A');
    expect(d.lengthFt).toBe(400);
    expect(d.points).toHaveLength(17);
    expect(d.startZ).toBe(440);
    expect(d.endZ).toBe(436);
    expect(d.overallGradePct).toBe(-1);
    expect(d.lowZ).toBe(436);
    expect(d.highZ).toBe(441);
    // the 3-ft bump at column 10 (station 2+00) makes the steepest 25-ft grade well over 1%
    expect(d.maxGradePct).toBeGreaterThan(5);
    expect(d.hazardCrossingFt).toBe(102);
  });

  it('is empty without topography', () => {
    expect(buildStreetProfiles([street], null)).toEqual([]);
  });
});

describe('<StreetProfilePanel>', () => {
  it('draws a profile per street with stations and the exaggeration stated', () => {
    const profiles = buildStreetProfiles([street], new TopoGrid(TOPO));
    render(<StreetProfilePanel profiles={profiles} topo={TOPO} />);
    const panel = screen.getByTestId('street-profile');
    expect(panel.textContent).toContain('Street A · existing grade');
    expect(panel.textContent).toContain('EG 440.0 → 436.0');
    expect(panel.textContent).toContain('crosses 102 ft of held-out land');
    expect(panel.querySelector('svg')).not.toBeNull();
    expect(panel.textContent).toContain('4+00');
    expect(panel.textContent).toContain('vertical exaggeration');
  });

  it('says so when there is no topography', () => {
    render(<StreetProfilePanel profiles={[]} topo={null} />);
    expect(screen.getByTestId('street-profile-empty').textContent).toContain('not available');
  });
});
