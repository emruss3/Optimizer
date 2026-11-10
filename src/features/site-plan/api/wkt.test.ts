import { describe, it, expect } from 'vitest';
import { parseWkt, wktPolygons, wktLines, wktPoint, wktMemberPolygons } from './wkt';

describe('parseWkt (the by-right generator speaks WKT in EPSG:2274 feet)', () => {
  it('parses POINT, LINESTRING and POLYGON with holes, dropping Z', () => {
    expect(parseWkt('POINT(1727000.5 670000.25)')).toEqual({ type: 'Point', coordinates: [1727000.5, 670000.25] });
    expect(parseWkt('POINT Z (1 2 3)')).toEqual({ type: 'Point', coordinates: [1, 2] });
    expect(parseWkt('LINESTRING(0 0, 10 0, 10 10)')).toEqual({ type: 'LineString', coordinates: [[0, 0], [10, 0], [10, 10]] });
    expect(parseWkt('POLYGON((0 0,10 0,10 10,0 10,0 0),(2 2,3 2,3 3,2 3,2 2))')).toEqual({
      type: 'Polygon',
      coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]],
    });
  });

  it('parses the MULTI types and a GEOMETRYCOLLECTION, with an SRID prefix', () => {
    expect(parseWkt('SRID=2274;MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)),((5 5,6 5,6 6,5 6,5 5)))')).toEqual({
      type: 'MultiPolygon',
      coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]],
    });
    expect(parseWkt('MULTILINESTRING((0 0,1 1),(2 2,3 3,4 4))')).toEqual({
      type: 'MultiLineString',
      coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3], [4, 4]]],
    });
    expect(parseWkt('MULTIPOINT((1 2),(3 4))')).toEqual({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] });
    expect(parseWkt('MULTIPOINT(1 2, 3 4)')).toEqual({ type: 'MultiPoint', coordinates: [[1, 2], [3, 4]] });
    expect(parseWkt('GEOMETRYCOLLECTION(POINT(1 1),LINESTRING(0 0,1 1))')).toEqual({
      type: 'GeometryCollection',
      geometries: [{ type: 'Point', coordinates: [1, 1] }, { type: 'LineString', coordinates: [[0, 0], [1, 1]] }],
    });
  });

  it('EMPTY, garbage and null never throw', () => {
    expect(parseWkt('POLYGON EMPTY')).toEqual({ type: 'Polygon', coordinates: [] });
    expect(parseWkt('MULTIPOLYGON EMPTY')).toEqual({ type: 'MultiPolygon', coordinates: [] });
    expect(parseWkt('POLYGON((0 0,1 0')).toBeNull();
    expect(parseWkt('nonsense')).toBeNull();
    expect(parseWkt(null)).toBeNull();
    expect(parseWkt(undefined)).toBeNull();
  });

  it('the layer helpers flatten to polygons / lines / a point and skip degenerate rings', () => {
    expect(wktPolygons('MULTIPOLYGON(((0 0,1 0,1 1,0 1,0 0)),((5 5,6 5,6 6,5 6,5 5)))')).toHaveLength(2);
    expect(wktPolygons('POLYGON((0 0,1 0,0 0))')).toHaveLength(0); // 3 vertices is no ring
    expect(wktPolygons('POLYGON EMPTY')).toHaveLength(0);
    expect(wktPolygons('LINESTRING(0 0,1 1)')).toHaveLength(0);
    expect(wktLines('MULTILINESTRING((0 0,1 1),(2 2,3 3))')).toHaveLength(2);
    expect(wktLines('LINESTRING(0 0,1 1)')).toHaveLength(1);
    expect(wktPoint('POINT(3 4)')).toEqual({ type: 'Point', coordinates: [3, 4] });
    expect(wktPoint('POINT EMPTY')).toBeNull();
  });
});

describe('wktMemberPolygons (lots aligned with their members, 2026-11-10)', () => {
  it('keeps a GEOMETRYCOLLECTION member together and gives a bare MULTIPOLYGON one member per polygon', () => {
    const sq = (x: number) => `((${x} 0,${x + 1} 0,${x + 1} 1,${x} 1,${x} 0))`;
    const gc = wktMemberPolygons(`GEOMETRYCOLLECTION(POLYGON${sq(0)},MULTIPOLYGON(${sq(2)},${sq(4)}),POLYGON EMPTY)`);
    expect(gc.map(m => m.length)).toEqual([1, 2]);
    expect(wktMemberPolygons(`MULTIPOLYGON(${sq(0)},${sq(2)},${sq(4)})`).map(m => m.length)).toEqual([1, 1, 1]);
    expect(wktMemberPolygons(null)).toEqual([]);
    expect(wktMemberPolygons('LINESTRING(0 0,1 1)')).toEqual([]);
  });
});
