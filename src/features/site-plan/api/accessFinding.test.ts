import { describe, it, expect } from 'vitest';
import { accessFinding } from './accessFinding';
import type { ParcelFrontage } from './parcelFrontage';

const frontage = (over: Partial<ParcelFrontage> = {}): ParcelFrontage => ({
  parcel_ogc_fid: 488278,
  landlocked: false,
  n_segments: 1,
  total_frontage_ft: 401.3,
  primary: {
    length_ft: 401.3,
    bearing_deg: 151.9,
    midpoint_2274: [1731153.12, 669193.73],
    geom_2274: { type: 'LineString', coordinates: [[1731058.6, 669370.7], [1731247.6, 669016.7]] },
  },
  ...over,
});

describe('accessFinding', () => {
  it('reports frontage the parcel map finds, and says it is not a survey', () => {
    const f = accessFinding({ frontage: frontage(), engineAccess: null, flags: [], drives: null });
    expect(f?.state).toBe('verified');
    expect(f?.why).toMatch(/401 ft/);
    expect(f?.why).toMatch(/not a survey/);
    expect(f?.clears).toEqual([]);
    // the engine's line, moved into the plan frame: Nashville is west of Greenwich and north of the equator
    expect(f?.frontageLine).toHaveLength(2);
    expect(f?.frontageLine?.[0]?.[0]).toBeLessThan(-9_600_000);
    expect(f?.frontageLine?.[0]?.[1]).toBeGreaterThan(4_300_000);
    expect(f?.frontageLabel).toBe('Street frontage · 401 ft');
  });

  it('turns a placeholder road edge into a next step with the frontage to look at', () => {
    const f = accessFinding({ frontage: frontage(), engineAccess: null, flags: ['frontage_geometry_is_placeholder_until_road_edge_upgrade'], drives: null });
    expect(f?.state).toBe('needs_verification');
    expect(f?.headline).toBe('Street access needs verification');
    expect(f?.clears.join(' ')).toMatch(/survey or recorded plat/);
    expect(f?.clears.join(' ')).toMatch(/curb cut/);
    expect(f?.frontageLine).not.toBeNull();
  });

  it('asks for an easement when no street is on record, and highlights nothing', () => {
    const f = accessFinding({ frontage: frontage({ landlocked: true, total_frontage_ft: 0, primary: null }), engineAccess: null, flags: [], drives: null });
    expect(f?.headline).toBe('No street access on record');
    expect(f?.clears[0]).toMatch(/access easement/);
    expect(f?.frontageLine).toBeNull();
  });

  it('believes the engine over the frontage layer', () => {
    const f = accessFinding({ frontage: frontage(), engineAccess: { type: 'none', message: 'the only open edge is a railroad' }, flags: [], drives: null });
    expect(f?.headline).toBe('No street access on record');
    expect(f?.why).toBe('the only open edge is a railroad');
  });

  it('says when the drawn drive stops short of the street', () => {
    const f = accessFinding({ frontage: frontage(), engineAccess: null, flags: [], drives: { curb: false, bays: 4, served: 4, drives: 2 } });
    expect(f?.headline).toBe('The drive does not reach the street');
    expect(f?.clears[0]).toMatch(/highlighted frontage/);
  });

  it('has nothing to say before any access data arrives', () => {
    expect(accessFinding({ frontage: null, engineAccess: null, flags: [], drives: null })).toBeNull();
  });
});
