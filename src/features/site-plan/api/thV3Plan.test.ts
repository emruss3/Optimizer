import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('../../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpcMock(...a) } }));

import { thV3ToElements, thV3Status, fetchThV3Plan, clearThV3Cache, canvasPolygons, type ThV3Response } from './thV3Plan';
import { validatePlanElements } from '../../../engine/validatePlan';

// EPSG:4326 boxes near Nashville: 20 x 40-ft homes ~ 0.0000678 deg of lon x 0.00011 deg of lat
const box = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const X = -86.8;
const Y = 36.15;

const PLAN: ThV3Response = {
  generator_version: 'th_v3', parcel_ogc_fid: 660125, mode: 'aor', typology: 'alley_loaded_townhome', pattern: 'mews',
  site_acres: 2.12, held_acres: 0.02, zoning: 'RM15', rules: { max_homes_by_density: 32, attached_permitted: true },
  buildings: [
    { geom: box(X, Y, X + 0.0000678, Y + 0.00011), kind: 'courtyard', w_ft: 20, d_ft: 40 },
    { geom: box(X + 0.0000678, Y, X + 0.0001356, Y + 0.00011), kind: 'public street', w_ft: 20, d_ft: 40 },
  ],
  streets: [],
  right_of_way: box(X - 0.0002, Y - 0.0002, X + 0.0003, Y - 0.00012),
  alleys: [{ geom: box(X, Y - 0.0001, X + 0.0001356, Y - 0.00002), kind: 'alley' }],
  greens: [{ geom: box(X, Y + 0.00015, X + 0.0001356, Y + 0.0003), kind: 'courtyard' }],
  amenity: null,
  stormwater: { geom: box(X - 0.0001, Y - 0.0001, X - 0.00003, Y), sf: 2884, needed_sf: 2445 },
  // the pocket laps the alley's east end by ~2 m: the client clips it
  parking: { guest_pockets: [box(X + 0.0001156, Y - 0.00008, X + 0.0002, Y - 0.00004)], guest_stalls: 2, guest_target: 7 },
  held_out: { type: 'MultiPolygon', coordinates: [box(X + 0.001, Y, X + 0.0011, Y + 0.0001).coordinates, box(X + 0.002, Y, X + 0.0021, Y + 0.0001).coordinates] },
  metrics: { homes: 2, alleys: 1, street_ft: 0, usable_open_pct: 41.3, homes_per_acre: 9.9, unit_w_ft: 20, unit_d_ft: 40, site_acres: 2.12 },
  tests: [
    { id: 'access.second_connection', ok: true, kind: 'required', value: 2, threshold: '2' },
    { id: 'home.green_front_fire_reach', ok: false, kind: 'context', value: 14, threshold: '0' },
    { id: 'eff.homes_per_acre', ok: false, kind: 'context', value: 9.9, threshold: '13.4' },
  ],
  fails: [],
  notes: [],
};

describe('thV3ToElements (the townhome engine on the sheet, 2026-11-04)', () => {
  it('draws homes, the alley, the green, the stormwater, the guest pocket, the held-out land and the right-of-way', () => {
    const { elements, summary } = thV3ToElements(PLAN);
    const ids = elements.map(e => e.id);
    expect(ids.filter(i => i.startsWith('thv3-home-'))).toEqual(['thv3-home-1', 'thv3-home-2']);
    expect(ids).toContain('thv3-alley-1');
    expect(ids).toContain('thv3-green-1');
    expect(ids).toContain('thv3-pond-1');
    expect(ids).toContain('thv3-guest-1');
    expect(ids.filter(i => i.startsWith('thv3-held-'))).toHaveLength(2);
    expect(ids).toContain('thv3-row-1');
    const home = elements.find(e => e.id === 'thv3-home-1')!;
    expect(home.type).toBe('building');
    expect(home.properties).toMatchObject({ townhome: true, townhomeEngine: 'th_v3', fronts: 'courtyard', widthFt: 20, depthFt: 40, footprintSqFt: 800, storiesAssumed: true, th: { units: 1, unitWFt: 20, unitDFt: 40 } });
    // no floor area on the sheet: the engine does not plan one
    expect(home.properties?.areaSqFt).toBeUndefined();
    // footprints, not floor area: no unit mix, so the tabulation stays off the sheet
    expect(home.properties?.unitMix).toBeUndefined();
    expect(elements.find(e => e.id === 'thv3-guest-1')!.name).toBe('Guest parking · 2 stalls');
    expect(summary).toMatchObject({
      status: 'done', homes: 2, pattern: 'mews', zoning: 'RM15', homesPerAcre: 9.9, alleys: 1, greens: 1,
      usableOpenPct: 41.3, guestStalls: 2, guestTarget: 7, stormwaterSf: 2884, stormwaterNeededSf: 2445,
      densityCap: 32, overDensityBy: null, requiredFails: [], contextFlags: ['home.green_front_fire_reach', 'eff.homes_per_acre'],
    });
    // the two held-out squares, measured as drawn (~0.0001 deg each side near Nashville)
    expect(summary.heldOutAcres).toBeGreaterThan(0.02);
    expect(summary.heldOutAcres).toBeLessThan(0.06);
    expect(summary.basisLine).toContain('2 townhomes (mews) by right');
    expect(summary.basisLine).toContain('three stories assumed');
  });

  it('passes the overlap gate: attached homes share walls, the pocket is clipped off the alley', () => {
    const { elements } = thV3ToElements(PLAN);
    const v = validatePlanElements(elements);
    expect(v.ok).toBe(true);
  });

  it('required tests that fail are the fails; homes over the density cap are counted', () => {
    const { summary } = thV3ToElements({
      ...PLAN,
      fails: ['alley.street_to_street'],
      rules: { max_homes_by_density: 1 },
    });
    expect(summary.requiredFails).toEqual(['alley.street_to_street']);
    expect(summary.overDensityBy).toBe(1);
    expect(summary.basisLine).toContain('fails alley.street_to_street');
    expect(summary.homesBeforeDensityCap).toBeNull();
    expect(summary.trimNote).toBeNull();
  });

  it('engine g13: a drawing trimmed to the density cap says how many were drawn first', () => {
    // 0 Smith Springs Rd (670533, RM6): 62 drawn, 42 kept
    const note = '62 homes drawn; trimmed to the district density cap of 42 (the 20 furthest from the street removed)';
    const { summary } = thV3ToElements({ ...PLAN, rules: { max_homes_by_density: 2 }, metrics: { ...PLAN.metrics, homes_before_density_cap: 62 }, notes: [note] });
    expect(summary.overDensityBy).toBeNull();
    expect(summary.homesBeforeDensityCap).toBe(62);
    expect(summary.trimNote).toBe(note);
  });

  it('a search still running, a skip and an error draw nothing and say so', () => {
    const running = thV3ToElements({ generator_version: 'th_v3', status: 'running', note: 'call again to continue the search' });
    expect(running.summary.status).toBe('searching');
    expect(running.elements).toHaveLength(0);
    expect(running.summary.homes).toBe(0);
    expect(thV3Status({ status: 'skipped', reason: 'attached homes not permitted as of right' })).toBe('skipped');
    expect(thV3Status({ error: 'boom' })).toBe('error');
    expect(thV3Status(null)).toBe('error');
  });

  it('canvasPolygons reads Polygon, MultiPolygon, JSON text and collections', () => {
    expect(canvasPolygons(box(X, Y, X + 0.001, Y + 0.001))).toHaveLength(1);
    expect(canvasPolygons(JSON.stringify(box(X, Y, X + 0.001, Y + 0.001)))).toHaveLength(1);
    expect(canvasPolygons(PLAN.held_out)).toHaveLength(2);
    expect(canvasPolygons({ type: 'GeometryCollection', geometries: [box(X, Y, X + 0.001, Y + 0.001), PLAN.held_out] })).toHaveLength(3);
    expect(canvasPolygons(null)).toHaveLength(0);
    expect(canvasPolygons('not json')).toHaveLength(0);
  });
});

describe('fetchThV3Plan (the drawing of the competition\'s townhome candidate)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    clearThV3Cache();
  });

  it('calls the app wrapper, as of right, and asks again while the search runs', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { status: 'running', note: 'call again to continue the search', generator_version: 'th_v3' }, error: null })
      .mockResolvedValueOnce({ data: PLAN, error: null });
    const r = await fetchThV3Plan(660125);
    expect(r.error).toBeNull();
    expect(r.data?.pattern).toBe('mews');
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenCalledWith('fn_generate_th_site_plan_v3_app', { p_ogc_fid: 660125, p_budget_ms: 12000 });
    // a finished plan is kept for the session
    await fetchThV3Plan(660125);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it('an error is reported and not kept', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'canceling statement due to statement timeout' } });
    const r = await fetchThV3Plan(660125);
    expect(r.error).toContain('statement timeout');
    rpcMock.mockResolvedValueOnce({ data: PLAN, error: null });
    await new Promise(res => setTimeout(res, 0));
    const again = await fetchThV3Plan(660125);
    expect(again.data?.pattern).toBe('mews');
  });
});
