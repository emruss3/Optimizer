import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import type { Element, SiteMetrics } from '../../../engine/types';
import { BuiltHeadline, builtSummary, compositionWords, parkingWords } from './BuiltHeadline';

const meta = { createdAt: 't', updatedAt: 't', source: 'ai-generated' as const };
const square = { type: 'Polygon' as const, coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };

// 2600 W Heiman (RM40): the seed's connected S-form bar, the server's mix, a rear field
const building: Element = {
  id: 'mfgen-bldg-1', type: 'building', name: 'Apartments · 5 stories · 76 units', geometry: square,
  properties: {
    floors: 5, stories: 5, areaSqFt: 26719, use: 'residential', compositionNote: 'bars_connected_S_form',
    unitMix: [
      { type: 'studio', count: 8, avgSqft: 550 }, { type: '1br', count: 30, avgSqft: 700 },
      { type: '2br', count: 26, avgSqft: 1100 }, { type: '3br', count: 12, avgSqft: 1600 },
    ],
  },
  metadata: meta,
} as Element;
const parking: Element = {
  id: 'mfgen-park-1', type: 'parking', name: 'Parking · ~25 stalls', geometry: square,
  properties: { stalls: 25, parkingSpaces: 25 }, metadata: meta,
} as Element;
const metrics = {
  totalBuiltSF: 133595, siteCoveragePct: 0, achievedFAR: 0, parkingRatio: 1.55, openSpacePct: 0,
  stallsProvided: 118, stallsRequired: 132, totalUnits: 76, zoningCompliant: true, violations: [], warnings: [],
  parkingStrategy: 'rear_field_perp',
} as SiteMetrics;

describe('builtSummary — what is being built, in one sentence', () => {
  it('reads the plan: units, building, stories, GSF, stalls per unit, composition, parking, mix', () => {
    const s = builtSummary(metrics, [building, parking]);
    expect(s).not.toBeNull();
    expect(s!.headline).toBe('76 apartments in one 5-story building · 133,595 GSF · 118 stalls (1.6 per unit)');
    expect(s!.detail).toBe('One connected S-form bar with a parking field behind it · 8 studios, 30 one-beds, 26 two-beds, 12 three-beds');
    expect(s!.stories).toBe(5);
    expect(s!.mix.map(m => m.count)).toEqual([8, 30, 26, 12]);
  });

  it('falls back to the mix for the unit count and leaves out what the engine did not report', () => {
    const s = builtSummary({ ...metrics, totalUnits: undefined, totalBuiltSF: 0, stallsProvided: undefined, parkingStrategy: undefined } as SiteMetrics, [building]);
    expect(s!.units).toBe(76);
    expect(s!.headline).toBe('76 apartments in one 5-story building');
    expect(s!.detail).toBe('One connected S-form bar · 8 studios, 30 one-beds, 26 two-beds, 12 three-beds');
  });

  it('calls townhome rows townhomes and several buildings by their count', () => {
    const th = (id: string) => ({
      ...building, id, properties: { ...building.properties, floors: 3, stories: 3, compositionNote: undefined, unitMix: [{ type: 'townhome', count: 6, avgSqft: 1500 }] },
    }) as Element;
    const s = builtSummary({ ...metrics, totalUnits: 12, parkingStrategy: undefined, parkingRegime: 'tuck_under' } as SiteMetrics, [th('a'), th('b')]);
    expect(s!.headline).toBe('12 townhomes in two 3-story buildings · 133,595 GSF · 118 stalls (9.8 per unit)');
    expect(s!.detail).toBe('Two buildings with parking tucked under it · 12 townhomes');
  });

  it('is null with nothing built, and for the single-family house seed', () => {
    expect(builtSummary(metrics, [parking])).toBeNull();
    const house = { ...building, id: 'sf-house', name: 'House · 1,236 sf', properties: { ...building.properties, floors: 1, stories: 1, unitMix: [{ type: 'townhome', count: 1, avgSqft: 1236 }] } } as Element;
    expect(builtSummary(metrics, [house])).toBeNull();
  });

  it('puts the generator notes into words', () => {
    expect(compositionWords('bars_connected_C_form', 1)).toBe('one connected C-form bar');
    expect(compositionWords('single_connected_structure', 1)).toBe('one connected building');
    expect(compositionWords(null, 3)).toBe('three buildings');
    expect(parkingWords({ parkingStrategy: 'side_rows' } as SiteMetrics, 40)).toBe('parking rows beside it');
    expect(parkingWords(null, 40)).toBe('surface parking');
    expect(parkingWords(null, 0)).toBe('');
  });
});

describe('<BuiltHeadline>', () => {
  it('renders the sentence above the plan', () => {
    render(<BuiltHeadline metrics={metrics} elements={[building, parking]} />);
    expect(screen.getByTestId('built-headline-title').textContent).toContain('76 apartments in one 5-story building');
    expect(screen.getByTestId('built-headline-detail').textContent).toContain('8 studios');
  });

  it('renders nothing without a building', () => {
    const { container } = render(<BuiltHeadline metrics={metrics} elements={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
