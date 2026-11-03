/**
 * Well-known text → GeoJSON geometry (2026-10-27).
 *
 * The by-right subdivision generator (fn_sf_v1_plan) hands its layers over as
 * WKT in EPSG:2274 feet — `lots_wkt`, `pave_wkt`, `pond_wkt`, … — rather than
 * GeoJSON. This is the small parser that turns them into the GeoJSON the
 * existing 2274 → 4326 → 3857 pipeline already understands. Z / M ordinates
 * are dropped; an `SRID=…;` prefix is tolerated; EMPTY geometries come back
 * with no coordinates. Anything unparseable returns null — one bad layer
 * never sinks the plan.
 */
import type { Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon, Point, Polygon, Position } from 'geojson';

type Tree = Position | Tree[];

/** Parse the balanced parenthesised coordinate block starting at s[i] ('('). */
function parseBlock(s: string, i: number): { node: Tree[]; next: number } {
  if (s[i] !== '(') throw new Error(`expected '(' at ${i}`);
  i += 1;
  const node: Tree[] = [];
  for (;;) {
    while (i < s.length && /\s/.test(s[i] as string)) i += 1;
    if (i >= s.length) throw new Error('unterminated block');
    if (s[i] === '(') {
      const child = parseBlock(s, i);
      node.push(child.node);
      i = child.next;
    } else {
      // a coordinate tuple: numbers separated by whitespace, up to ',' or ')'
      let j = i;
      while (j < s.length && s[j] !== ',' && s[j] !== ')') j += 1;
      const nums = s.slice(i, j).trim().split(/\s+/).map(Number);
      if (nums.length < 2 || nums.slice(0, 2).some(n => !Number.isFinite(n))) throw new Error(`bad coordinate at ${i}`);
      node.push([nums[0] as number, nums[1] as number]);
      i = j;
    }
    while (i < s.length && /\s/.test(s[i] as string)) i += 1;
    if (s[i] === ',') { i += 1; continue; }
    if (s[i] === ')') return { node, next: i + 1 };
    throw new Error(`expected ',' or ')' at ${i}`);
  }
}

const isPos = (t: Tree): t is Position => typeof t[0] === 'number';

/** Split the inside of a GEOMETRYCOLLECTION at its top-level commas. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out.map(p => p.trim()).filter(Boolean);
}

const EMPTY: Record<string, Geometry> = {
  POINT: { type: 'Point', coordinates: [] as unknown as Position },
  LINESTRING: { type: 'LineString', coordinates: [] },
  POLYGON: { type: 'Polygon', coordinates: [] },
  MULTIPOINT: { type: 'MultiPoint', coordinates: [] },
  MULTILINESTRING: { type: 'MultiLineString', coordinates: [] },
  MULTIPOLYGON: { type: 'MultiPolygon', coordinates: [] },
  GEOMETRYCOLLECTION: { type: 'GeometryCollection', geometries: [] },
};

export function parseWkt(wkt: string | null | undefined): Geometry | null {
  if (typeof wkt !== 'string') return null;
  try {
    let s = wkt.trim();
    if (/^SRID=/i.test(s)) s = s.slice(s.indexOf(';') + 1).trim();
    const head = /^([A-Z]+)\s*(?:ZM|Z|M)?\s*/i.exec(s);
    if (!head) return null;
    const type = (head[1] as string).toUpperCase();
    const rest = s.slice(head[0].length);
    if (/^EMPTY$/i.test(rest.trim())) return EMPTY[type] ?? null;
    if (type === 'GEOMETRYCOLLECTION') {
      const inner = rest.trim();
      if (!inner.startsWith('(') || !inner.endsWith(')')) return null;
      const geometries = splitTopLevel(inner.slice(1, -1)).map(parseWkt).filter((g): g is Geometry => g != null);
      return { type: 'GeometryCollection', geometries };
    }
    const { node } = parseBlock(rest.trim(), 0);
    switch (type) {
      case 'POINT': {
        const p = node[0];
        return p && isPos(p) ? ({ type: 'Point', coordinates: p } as Point) : null;
      }
      case 'LINESTRING':
        return { type: 'LineString', coordinates: node.filter(isPos) } as LineString;
      case 'POLYGON':
        return { type: 'Polygon', coordinates: node.map(r => (Array.isArray(r) && !isPos(r) ? (r as Tree[]).filter(isPos) : [])) } as Polygon;
      case 'MULTIPOINT':
        // (1 2, 3 4) and ((1 2), (3 4)) are both legal
        return { type: 'MultiPoint', coordinates: node.map(p => (isPos(p) ? p : ((p as Tree[])[0] as Position))).filter(Boolean) } as MultiPoint;
      case 'MULTILINESTRING':
        return { type: 'MultiLineString', coordinates: node.map(l => (isPos(l) ? [l] : (l as Tree[]).filter(isPos))) } as MultiLineString;
      case 'MULTIPOLYGON':
        return {
          type: 'MultiPolygon',
          coordinates: node.map(poly => (isPos(poly) ? [] : (poly as Tree[]).map(r => (Array.isArray(r) && !isPos(r) ? (r as Tree[]).filter(isPos) : [])))),
        } as MultiPolygon;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Every polygon in a WKT (MULTI)POLYGON / GEOMETRYCOLLECTION, in order; [] for anything else. */
export function wktPolygons(wkt: string | null | undefined): Polygon[] {
  const g = parseWkt(wkt);
  const out: Polygon[] = [];
  const walk = (geom: Geometry | null) => {
    if (!geom) return;
    if (geom.type === 'Polygon' && geom.coordinates.length > 0) out.push(geom);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(c => { if (c.length > 0) out.push({ type: 'Polygon', coordinates: c }); });
    else if (geom.type === 'GeometryCollection') geom.geometries.forEach(walk);
  };
  walk(g);
  return out.filter(p => Array.isArray(p.coordinates[0]) && (p.coordinates[0] as Position[]).length >= 4);
}

/** Every line in a WKT (MULTI)LINESTRING / GEOMETRYCOLLECTION, in order. */
export function wktLines(wkt: string | null | undefined): LineString[] {
  const g = parseWkt(wkt);
  const out: LineString[] = [];
  const walk = (geom: Geometry | null) => {
    if (!geom) return;
    if (geom.type === 'LineString' && geom.coordinates.length >= 2) out.push(geom);
    else if (geom.type === 'MultiLineString') geom.coordinates.forEach(c => { if (c.length >= 2) out.push({ type: 'LineString', coordinates: c }); });
    else if (geom.type === 'GeometryCollection') geom.geometries.forEach(walk);
  };
  walk(g);
  return out;
}

/** The first point of a WKT POINT / MULTIPOINT, or null. */
export function wktPoint(wkt: string | null | undefined): Point | null {
  const g = parseWkt(wkt);
  if (!g) return null;
  if (g.type === 'Point' && g.coordinates.length >= 2) return g;
  if (g.type === 'MultiPoint' && g.coordinates.length > 0) return { type: 'Point', coordinates: g.coordinates[0] as Position };
  return null;
}
