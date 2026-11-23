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
});
