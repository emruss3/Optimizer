import { describe, it, expect } from 'vitest';
import { TopoGrid, profileAlong, stationLabel, contoursToCanvas, topoView, type ParcelTopo } from './parcelTopo';

// A 3 × 3 grid at 20 ft over 2400 W Heiman's corner (EPSG:2274 feet), sloping
// 1 ft per cell to the east and 2 ft per cell to the south.
const X = 1726000, Y = 672500;
const samples: Array<[number, number, number]> = [];
for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) samples.push([c, r, 430 + c + 2 * r]);
const TOPO: ParcelTopo = {
  parcel_ogc_fid: 550510, source: 'USGS 3DEP 1 m DEM', datum: 'NAVD88', units: 'ft', spacing_ft: 20,
  grid: { origin_x: X, origin_y: Y, cols: 3, rows: 3, spacing_ft: 20 },
  z_min_ft: 430, z_max_ft: 436, mean_slope_pct: 7.9, max_slope_pct: 11.2,
  contours: [
    { elevation_ft: 431, index: false, geom_2274: { type: 'LineString', coordinates: [[X + 20, Y], [X + 20, Y - 40]] } },
    { elevation_ft: 435, index: true, geom_2274: { type: 'MultiLineString', coordinates: [[[X, Y - 40], [X + 10, Y - 40]], [[X + 30, Y - 40], [X + 40, Y - 40]]] } },
    { elevation_ft: 433, index: false, geom_2274: { type: 'Point', coordinates: [X, Y] } },
  ],
  samples,
};

describe('TopoGrid — the DEM sample grid as a lookup', () => {
  it('reads cells and interpolates bilinearly between them', () => {
    const g = new TopoGrid(TOPO);
    expect(g.size).toBe(9);
    expect(g.at(0, 0)).toBe(430);
    expect(g.at(2, 2)).toBe(436);
    // cell centres read exactly
    expect(g.elevationAt(X, Y)).toBe(430);
    expect(g.elevationAt(X + 40, Y - 40)).toBe(436);
    // halfway east between (0,0)=430 and (1,0)=431 → 430.5; halfway south too → +1
    expect(g.elevationAt(X + 10, Y)).toBe(430.5);
    expect(g.elevationAt(X + 10, Y - 10)).toBe(431.5);
  });

  it('falls back to the nearest sampled corner at the edge and to null beyond the margin', () => {
    const g = new TopoGrid(TOPO);
    // just past the last column: the (2, r) corner is the nearest sampled one
    expect(g.elevationAt(X + 45, Y)).toBe(432);
    expect(g.elevationAt(X + 500, Y - 500)).toBeNull();
  });
});

describe('profileAlong — existing grade along a centreline', () => {
  it('samples every step and at the end, in feet of station', () => {
    const g = new TopoGrid(TOPO);
    const pts = profileAlong(g, [[X, Y], [X + 40, Y]], 10);
    expect(pts.map(p => p.stationFt)).toEqual([0, 10, 20, 30, 40]);
    expect(pts.map(p => p.zFt)).toEqual([430, 430.5, 431, 431.5, 432]);
  });

  it('is empty for a degenerate line', () => {
    expect(profileAlong(new TopoGrid(TOPO), [[X, Y]])).toEqual([]);
  });
});

describe('contours → canvas frame', () => {
  it('converts LineString and MultiLineString pieces and skips the rest', () => {
    const view = topoView(TOPO);
    expect(view.contours).toHaveLength(2);
    expect(view.contours[0]).toMatchObject({ elevationFt: 431, index: false });
    expect(view.contours[0].lines).toHaveLength(1);
    expect(view.contours[1].lines).toHaveLength(2);
    // Nashville in web-mercator metres
    const [x, y] = view.contours[0].lines[0][0];
    expect(x).toBeLessThan(-9_600_000);
    expect(y).toBeGreaterThan(4_300_000);
    expect(view.zMinFt).toBe(430);
    expect(view.maxSlopePct).toBe(11.2);
    expect(contoursToCanvas({ ...TOPO, contours: [] })).toEqual([]);
  });
});

describe('stationLabel', () => {
  it('writes civil stations', () => {
    expect(stationLabel(0)).toBe('0+00');
    expect(stationLabel(100)).toBe('1+00');
    expect(stationLabel(1250)).toBe('12+50');
    expect(stationLabel(199.7)).toBe('2+00');
  });
});
