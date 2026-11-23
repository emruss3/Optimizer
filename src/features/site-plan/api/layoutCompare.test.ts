import { describe, it, expect } from 'vitest';
import { compareLayouts, type LayoutOption } from './layoutCompare';

describe('two layouts of one parcel, side by side', () => {
  // 5525 Mt View Rd: 30 lane townhomes on the sheet against 24 surface apartments
  const town: LayoutOption = { key: 'neighborhood', label: '30 townhomes (lane)', homes: 30, shown: true, parking: 'Guest parking 0 of 8', floorArea: 'Unknown · upper bound 49,600 GSF' };
  const apts: LayoutOption = { key: 'multifamily', label: '24 apartments', homes: 24, shown: false };

  it('Mt View at a $1.2M land price: $40,000 against $50,000 a home, six more homes', () => {
    const c = compareLayouts(town, apts, 1_200_000);
    expect(c.rows.find(r => r.label === 'Homes')).toMatchObject({ a: '30', b: '24' });
    expect(c.rows.find(r => r.label === 'Land per home')).toMatchObject({ a: '$40,000', b: '$50,000' });
    expect(c.tradeOff).toBe('30 townhomes (lane) places 6 more homes than 24 apartments. At the entered land price that is $10,000 less land per home.');
  });

  it('never borrows figures from the other layout: what is not drawn is unknown, and named', () => {
    const c = compareLayouts(town, apts, null);
    expect(c.rows.find(r => r.label === 'Parking')).toMatchObject({ a: 'Guest parking 0 of 8', b: 'Unknown' });
    expect(c.rows.find(r => r.label === 'Floor area')?.b).toBe('Unknown');
    expect(c.missing).toEqual(['Parking of 24 apartments: open that layout to draw it', 'Floor area of 24 apartments: open that layout to draw it']);
    expect(c.rows.some(r => r.label === 'Land per home')).toBe(false);
  });

  it('an unknown home count stays unknown: no land per home, no trade-off', () => {
    const c = compareLayouts(town, { ...apts, homes: null, label: 'apartments' }, 1_200_000);
    expect(c.rows.find(r => r.label === 'Land per home')?.b).toBe('Unknown');
    expect(c.tradeOff).toBeNull();
    expect(c.missing).toContain('Home count of apartments');
  });
});
