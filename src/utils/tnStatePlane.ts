/**
 * EPSG:2274 (NAD83 / Tennessee, US survey feet) → WGS84 inverse projection.
 *
 * The seed/skeleton engine emits true-feet geometry in the state plane; the
 * canvas frame is EPSG:3857. This is the exact inverse Lambert Conformal
 * Conic (2SP, ellipsoidal — Snyder 1987 §15), no proj4 dependency. Verified
 * against PostGIS ST_Transform to <1e-8 degrees in the unit test.
 */
import type { Polygon, LineString, Point, Position } from 'geojson';

// GRS80 ellipsoid + EPSG:2274 parameters
const A = 6378137;
const E2 = 0.00669438002290;
const E = Math.sqrt(E2);
const LAT1 = (36 + 25 / 60) * Math.PI / 180; // standard parallel 1
const LAT2 = (35 + 15 / 60) * Math.PI / 180; // standard parallel 2
const LAT0 = (34 + 20 / 60) * Math.PI / 180; // latitude of origin
const LON0 = -86 * Math.PI / 180;            // central meridian
const X0_M = 600000;                          // false easting (metres)
const Y0_M = 0;
const FT_US = 1200 / 3937;                    // US survey foot in metres

const tFn = (phi: number): number =>
  Math.tan(Math.PI / 4 - phi / 2) /
  Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2);
const mFn = (phi: number): number =>
  Math.cos(phi) / Math.sqrt(1 - E2 * Math.sin(phi) * Math.sin(phi));

const m1 = mFn(LAT1);
const m2 = mFn(LAT2);
const t1 = tFn(LAT1);
const t2 = tFn(LAT2);
const t0 = tFn(LAT0);
const N = (Math.log(m1) - Math.log(m2)) / (Math.log(t1) - Math.log(t2));
const F = m1 / (N * Math.pow(t1, N));
const RHO0 = A * F * Math.pow(t0, N);

/** One EPSG:2274 coordinate (US survey feet) → [lng, lat] WGS84 degrees. */
export function tn2274ToLngLat([xFt, yFt]: Position): Position {
  const x = xFt * FT_US - X0_M;
  const y = yFt * FT_US - Y0_M;
  const rho = Math.sign(N) * Math.hypot(x, RHO0 - y);
  const theta = Math.atan2(x, RHO0 - y);
  const lambda = theta / N + LON0;
  const tPrime = Math.pow(rho / (A * F), 1 / N);
  // Iterate the ellipsoidal latitude (converges in ~5 rounds)
  let phi = Math.PI / 2 - 2 * Math.atan(tPrime);
  for (let i = 0; i < 8; i++) {
    const es = E * Math.sin(phi);
    phi = Math.PI / 2 - 2 * Math.atan(tPrime * Math.pow((1 - es) / (1 + es), E / 2));
  }
  return [lambda * 180 / Math.PI, phi * 180 / Math.PI];
}

type Geom2274 = { type: string; coordinates: unknown };

/** Any GeoJSON geometry with EPSG:2274 coordinates → the same geometry in
 *  WGS84 (ready for the existing 4326→3857 canvas pipeline). */
export function geom2274To4326<T extends Geom2274>(geom: T): T {
  const conv = (c: unknown): unknown => {
    if (Array.isArray(c) && typeof c[0] === 'number') return tn2274ToLngLat(c as Position);
    if (Array.isArray(c)) return c.map(conv);
    return c;
  };
  return { ...geom, coordinates: conv(geom.coordinates) } as T;
}

export type { Polygon, LineString, Point };
