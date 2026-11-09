import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TabulationPanel from './TabulationPanel';
import type { Element, SiteMetrics } from '../../../engine/types';

const sq = (x: number): Element['geometry'] => ({ type: 'Polygon', coordinates: [[[x, 0], [x + 15, 0], [x + 15, 12], [x, 12], [x, 0]]] });
const meta = { createdAt: '', updatedAt: '', source: 'ai-generated' as const };

describe('TabulationPanel', () => {
  it('a lone single-family house is tabulated as one, not as a "Townhome" (0 Riverfront Dr, 2026-11-04)', () => {
    const house = {
      id: 'sfseed-bldg-1', type: 'building', name: 'House · 2,331 sf', geometry: sq(0), metadata: meta,
      properties: { use: 'residential', singleFamilyHouse: true, floors: 1, unitMix: [{ type: 'townhome', count: 1, avgSqft: 2331, rentPerMonth: 0, parkingRatio: 2 }] },
    } as unknown as Element;
    render(<TabulationPanel elements={[house]} metrics={{ totalUnits: 1 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByText('Single-family house')).toBeTruthy();
    expect(screen.queryByText('Townhome')).toBeNull();
  });

  it('townhome rows keep their name', () => {
    const row = {
      id: 'th-1', type: 'building', name: 'Townhomes 1 · 6u', geometry: sq(0), metadata: meta,
      properties: { use: 'residential', floors: 3, unitMix: [{ type: 'townhome', count: 6, avgSqft: 1500, rentPerMonth: 0, parkingRatio: 2 }] },
    } as unknown as Element;
    render(<TabulationPanel elements={[row]} metrics={{ totalUnits: 6 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByText('Townhome')).toBeTruthy();
  });
});

describe('TabulationPanel reads the same plan as the header (0 Whites Creek Pike, 2026-11-09)', () => {
  const bar = (id: string, mix: Array<[string, number]>) => ({
    id, type: 'building', name: id, geometry: sq(0), metadata: meta,
    properties: { use: 'residential', floors: 3, unitMix: mix.map(([type, count]) => ({ type, count, avgSqft: 900, rentPerMonth: 0, parkingRatio: 1.5 })) },
  } as unknown as Element);

  it('the rows sum to the engine\'s unit count and the parking column splits the engine\'s requirement', () => {
    const bars = [
      bar('mfgen-bldg-1', [['studio', 4], ['1br', 16], ['2br', 14], ['3br', 5]]),
      bar('mfgen-bldg-2', [['studio', 1], ['1br', 6], ['2br', 5], ['3br', 2]]),
    ];
    render(<TabulationPanel elements={bars} metrics={{ totalUnits: 53, stallsProvided: 292, stallsRequired: 92, stallsDrawn: 292, stallsReported: 85 } as SiteMetrics} plannerCtx={null} />);
    const rows = screen.getAllByRole('row').map(r => r.textContent ?? '');
    const total = rows.find(r => r.startsWith('Total'))!;
    expect(total).toContain('53');
    // the per-type requirement adds up to the engine's 92, not to the typology defaults' 80
    expect(total.endsWith('92')).toBe(true);
    expect(rows.find(r => r.startsWith('1 Bed'))).toContain('22');
    expect(screen.getByText(/Parking required: 92 from the engine/)).toBeTruthy();
    expect(screen.getByTestId('tab-stalls-reported').textContent).toContain('engine summary 85');
  });

  it('without an engine requirement the typology defaults stand, and say so', () => {
    render(<TabulationPanel elements={[bar('mfgen-bldg-1', [['1br', 10]])]} metrics={{ totalUnits: 10 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByText(/Parking ratios: typology defaults/)).toBeTruthy();
    expect(screen.queryByTestId('tab-stalls-reported')).toBeNull();
  });
});
