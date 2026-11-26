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
    expect(screen.getByTestId('tab-stalls-line').textContent).toContain('85 in the engine summary');
  });

  it('without an engine requirement the typology defaults stand, and say so', () => {
    render(<TabulationPanel elements={[bar('mfgen-bldg-1', [['1br', 10]])]} metrics={{ totalUnits: 10 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByText(/Parking ratios: typology defaults/)).toBeTruthy();
    expect(screen.queryByTestId('tab-stalls-reported')).toBeNull();
  });
});

describe('TabulationPanel — the requirement column is honest about what it knows (the cohort retest, 2026-11-09)', () => {
  const house = {
    id: 'sfseed-bldg-1', type: 'building', name: 'House · 437 sf', geometry: sq(0), metadata: meta,
    properties: { use: 'residential', singleFamilyHouse: true, floors: 1, unitMix: [{ type: 'townhome', count: 1, avgSqft: 437, rentPerMonth: 0, parkingRatio: 2 }] },
  } as unknown as Element;

  it('the house sketch shows "—" for a requirement that was not evaluated, not the typology default of 2 (1289 Currey Rd)', () => {
    render(<TabulationPanel elements={[house]} metrics={{ totalUnits: 1, stallsProvided: 0, parkingStatus: 'not_evaluated' } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByTestId('tab-pkg-total').textContent).toBe('—');
    expect(screen.getByText(/Parking requirement: not evaluated for this sketch/)).toBeTruthy();
    expect(screen.getByText(/Stalls/).textContent).toContain('0 / not evaluated');
  });

  it('a disagreement between bays and summary is labelled needs verification beside the engine summary', () => {
    const bar = {
      id: 'mfgen-bldg-1', type: 'building', name: 'b', geometry: sq(0), metadata: meta,
      properties: { use: 'residential', floors: 3, unitMix: [{ type: '1br', count: 53, avgSqft: 900, rentPerMonth: 0, parkingRatio: 1.5 }] },
    } as unknown as Element;
    render(<TabulationPanel elements={[bar]} metrics={{ totalUnits: 53, stallsProvided: 292, stallsRequired: 92, stallsDrawn: 292, stallsReported: 85, parkingStatus: 'needs_verification' } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByTestId('tab-stalls-reported').textContent).toBe('(needs verification)');
    expect(screen.getByTestId('tab-stalls-line').textContent).toMatch(/drawn · 85 in the engine summary/);
    expect(screen.getByText(/provided count needs verification/)).toBeTruthy();
  });
});

describe('TabulationPanel: a missing figure is not a zero (1710 Meharry Blvd, 2026-11-12)', () => {
  const bar = {
    id: 'b1', type: 'building', name: 'Building A', geometry: sq(0), metadata: meta,
    properties: { use: 'residential', floors: 4, unitMix: [{ type: '1br', count: 30, avgSqft: 750, rentPerMonth: 0, parkingRatio: 1 }] },
  } as unknown as Element;

  it('says not reported where the engine gave no FAR or coverage', () => {
    render(<TabulationPanel elements={[bar]} metrics={{ totalUnits: 30, totalBuiltSF: 54244, achievedFAR: 0, siteCoveragePct: 0 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByTestId('tab-far').textContent).toBe('FAR not reported');
    expect(screen.getByTestId('tab-coverage').textContent).toBe('Coverage not reported');
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('shows the figures when the engine reports them', () => {
    render(<TabulationPanel elements={[bar]} metrics={{ totalUnits: 30, totalBuiltSF: 54244, achievedFAR: 0.7, siteCoveragePct: 18 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByTestId('tab-far').textContent).toBe('FAR 0.70');
    expect(screen.getByTestId('tab-coverage').textContent).toBe('Coverage 18%');
  });
});

describe('TabulationPanel: the plan count against the unit mix (535 Main St, 2026-11-26)', () => {
  const main = {
    id: 'b1', type: 'building', name: 'Building A', geometry: sq(0), metadata: meta,
    properties: { use: 'residential', floors: 5, unitMix: [
      { type: 'studio', count: 13, avgSqft: 550, rentPerMonth: 0, parkingRatio: 1 },
      { type: '1br', count: 52, avgSqft: 700, rentPerMonth: 0, parkingRatio: 1 },
      { type: '2br', count: 45, avgSqft: 1100, rentPerMonth: 0, parkingRatio: 1 },
      { type: '3br', count: 19, avgSqft: 1600, rentPerMonth: 0, parkingRatio: 1 },
    ] },
  } as unknown as Element;

  it('keeps the mix as carried and puts the 2 untyped homes on their own row; the total is the plan count', () => {
    render(<TabulationPanel elements={[main]} metrics={{ totalUnits: 131, totalBuiltSF: 150000 } as SiteMetrics} plannerCtx={null} />);
    const untyped = screen.getByTestId('tab-untyped');
    expect(untyped.textContent).toMatch(/No type in the unit mix\s*2/);
    expect(screen.getByText('52')).toBeTruthy(); // one-beds not padded to 54
    expect(screen.queryByText('54')).toBeNull();
    expect(screen.getByText('131')).toBeTruthy();
  });

  it('says so when the mix lists more homes than the plan counts', () => {
    render(<TabulationPanel elements={[main]} metrics={{ totalUnits: 127, totalBuiltSF: 150000 } as SiteMetrics} plannerCtx={null} />);
    expect(screen.getByTestId('tab-mix-over').textContent).toBe('The unit mix lists 129 homes, 2 more than the 127 the plan counts.');
    expect(screen.queryByTestId('tab-untyped')).toBeNull();
  });
});
