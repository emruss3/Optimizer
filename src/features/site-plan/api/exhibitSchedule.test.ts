import { describe, it, expect } from 'vitest';
import { exhibitSchedule } from './exhibitSchedule';
import { captureBasis } from './maxBuildout';

describe('the figures a sheet must carry', () => {
  it('W Heiman: drawn, reported and required stalls, and the street break', () => {
    const rows = exhibitSchedule({ units: 70, stallsDrawn: 127, stallsReported: 20, stallsRequired: 122, routeUnresolved: true });
    expect(rows.find(r => r.label === 'Parking')?.value).toBe('127 drawn · 20 reported · 122 required · reported count 102 short of required');
    expect(rows.find(r => r.label === 'Street access')?.value).toMatch(/no drive reaches the street/);
  });

  it('Main St: supplied against required, the structured ceiling, and the 2 + 3 stack', () => {
    const capture = captureBasis(232425, { max_gsf: 199950, structured_parking_ceiling: { gsf: 423765 } } as never, 'wrap_garage');
    const rows = exhibitSchedule({ units: 131, stallsReported: 238, stallsRequired: 226, builtGsf: 232425, capture, garageLevels: 2, residentialLevels: 3, contextUnverified: true });
    expect(rows.find(r => r.label === 'Parking')?.value).toBe('238 supplied · 226 required · 1.82 per home');
    expect(rows.find(r => r.label === 'Floor area')?.value).toBe('232,425 of 423,765 GSF structured-parking ceiling (54.8%)');
    expect(rows.find(r => r.label === 'Program')?.value).toBe('2 parking levels + 3 residential');
    expect(rows.find(r => r.label === 'Context')?.value).toBe('Not verified');
  });

  it('says a shortfall in words', () => {
    expect(exhibitSchedule({ units: 10, stallsReported: 12, stallsRequired: 20 })[0]?.value).toBe('12 supplied · 20 required · 1.20 per home · 8 short of required');
  });

  it('prints one count when the drawing and the summary agree, and nothing it was not given', () => {
    expect(exhibitSchedule({ stallsDrawn: 126, stallsReported: 126, stallsRequired: 126 })).toEqual([{ label: 'Parking', value: '126 drawn · 126 required' }]);
    expect(exhibitSchedule({})).toEqual([]);
  });

  // Live Design handoff 2026-11-23: zero / unknown / shortfall must still emit a Parking row
  it('drawn 0 / reported 0 / required 8: zero carries a value and the shortfall in words', () => {
    const row = exhibitSchedule({ stallsDrawn: 0, stallsReported: 0, stallsRequired: 8 }).find(r => r.label === 'Parking');
    expect(row?.value).toBe('0 drawn · 8 required · 8 short of required');
  });

  it('drawn 0 / reported 12 / required 8: both counts print and the drawn shortfall is said', () => {
    const row = exhibitSchedule({ stallsDrawn: 0, stallsReported: 12, stallsRequired: 8 }).find(r => r.label === 'Parking');
    expect(row?.value).toBe('0 drawn · 12 reported · 8 required · 8 short of required');
  });

  it('unknown supply / required 8: absent carries a reason', () => {
    const row = exhibitSchedule({ stallsRequired: 8 }).find(r => r.label === 'Parking');
    expect(row?.value).toBe('Unknown · supply not measured · 8 required');
  });

  it('Mt View guest parking: 0 of 8 reaches the sheet with the shortfall in words', () => {
    const row = exhibitSchedule({ guestStalls: 0, guestTarget: 8, guestGraded: false }).find(r => r.label === 'Parking');
    expect(row?.value).toBe('Guest parking 0 of 8 stalls · 8 short · a target of the engine, not one of its tests');
    expect(row?.value).toMatch(/short/);
  });
});
