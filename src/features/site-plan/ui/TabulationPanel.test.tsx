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
