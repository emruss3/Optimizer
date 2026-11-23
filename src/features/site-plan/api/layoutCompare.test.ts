import { describe, it, expect } from 'vitest';
import { compareLayouts, parseLandPrice, retainLayoutFacts, type LayoutOption } from './layoutCompare';

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

  // Live Design handoff: 30/24 and 70/25 retain their own values after switching twice
  it('retains each rendered option’s facts after switching twice (30/24 Mt View)', () => {
    let kept = retainLayoutFacts({}, 'neighborhood', { parking: 'Guest parking 0 of 8', floorArea: 'Unknown · upper bound 49,600 GSF' }, 'rev-town');
    kept = retainLayoutFacts(kept, 'multifamily', { parking: '42 drawn · 42 required', floorArea: '43,203 GSF' }, 'rev-mf');
    kept = retainLayoutFacts(kept, 'neighborhood', { parking: 'Guest parking 0 of 8', floorArea: 'Unknown · upper bound 49,600 GSF' }, 'rev-town');
    const c = compareLayouts(
      { ...town, parking: kept.neighborhood?.parking, floorArea: kept.neighborhood?.floorArea },
      { ...apts, parking: kept.multifamily?.parking, floorArea: kept.multifamily?.floorArea },
      null,
    );
    expect(c.rows.find(r => r.label === 'Parking')).toMatchObject({ a: 'Guest parking 0 of 8', b: '42 drawn · 42 required' });
    expect(c.rows.find(r => r.label === 'Floor area')).toMatchObject({ a: 'Unknown · upper bound 49,600 GSF', b: '43,203 GSF' });
    expect(c.missing).toEqual([]);
  });

  it('retains each rendered option’s facts after switching twice (70/25 W Heiman)', () => {
    let kept = retainLayoutFacts({}, 'multifamily', { parking: '127 drawn · 20 reported · 122 required', floorArea: '106,776 GSF' }, 'rev-a');
    kept = retainLayoutFacts(kept, 'neighborhood', { parking: 'Guest parking 2 of 7', floorArea: null }, 'rev-b');
    kept = retainLayoutFacts(kept, 'multifamily', { parking: '127 drawn · 20 reported · 122 required', floorArea: '106,776 GSF' }, 'rev-a');
    expect(kept.multifamily?.parking).toMatch(/127 drawn/);
    expect(kept.neighborhood?.parking).toMatch(/Guest parking 2 of 7/);
  });

  it('replaces a kind on revision change instead of keeping an omitted field from the earlier run', () => {
    let kept = retainLayoutFacts({}, 'multifamily', { parking: '42 drawn · 42 required', floorArea: '43,203 GSF' }, 'rev-1');
    kept = retainLayoutFacts(kept, 'multifamily', { parking: '40 drawn · 40 required', floorArea: null }, 'rev-2');
    expect(kept.multifamily).toEqual({ parking: '40 drawn · 40 required', floorArea: null, revision: 'rev-2' });
  });
});

describe('a land price as typed', () => {
  it('reads commas, a dollar sign and K or M', () => {
    expect(parseLandPrice('$1,200,000').value).toBe(1_200_000);
    expect(parseLandPrice('1.2M').value).toBe(1_200_000);
    expect(parseLandPrice('1.2m').value).toBe(1_200_000);
    expect(parseLandPrice('850k').value).toBe(850_000);
  });
  it('does not guess at anything else', () => {
    expect(parseLandPrice('about a million')).toEqual({ value: null, hint: 'Enter a price such as 1,200,000 or 1.2M.' });
    expect(parseLandPrice('')).toEqual({ value: null, hint: null });
    expect(parseLandPrice('0').value).toBeNull();
  });
});
