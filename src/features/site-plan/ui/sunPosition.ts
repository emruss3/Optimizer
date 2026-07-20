/**
 * Solar position (NOAA simplified algorithm) for the sun-study light.
 * Pure math — no dependency on geospatial views, so it drives a
 * DirectionalLight inside the map-free OrbitView massing scene. Latitude
 * and longitude come from the scene geometry itself (derived from the
 * plan's Mercator frame), never from a hardcoded city.
 */

export interface SunPosition {
  /** Degrees above the horizon; negative = below (night). */
  altitudeDeg: number;
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
  /** Unit vector FROM the sun TOWARD the scene, in the local frame
   *  (X = east, Y = north, Z = up) — the deck.gl light `direction`. */
  direction: [number, number, number];
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/**
 * @param dayOfYear 1..365 (Jan 1 = 1)
 * @param solarHour local *solar* time in hours (12 = solar noon). Using
 *   solar rather than civil time keeps presets meaningful anywhere without
 *   a timezone database: "noon" always means the sun's highest point.
 */
export function sunPosition(dayOfYear: number, solarHour: number, latDeg: number): SunPosition {
  // Solar declination (Cooper's equation)
  const decl = rad(23.45) * Math.sin(rad((360 / 365) * (dayOfYear - 81)));
  const hourAngle = rad(15 * (solarHour - 12));
  const lat = rad(latDeg);

  const sinAlt =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));

  // Azimuth measured clockwise from north
  const cosAz =
    (Math.sin(decl) - Math.sin(altitude) * Math.sin(lat)) /
    Math.max(1e-9, Math.cos(altitude) * Math.cos(lat));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth; // afternoon: sun west of north-south line

  const altD = deg(altitude);
  const azD = deg(azimuth);

  // Sun→scene vector in X-east / Y-north / Z-up local metres
  const cosAlt = Math.cos(altitude);
  const sunX = Math.sin(azimuth) * cosAlt; // toward the sun, east component
  const sunY = Math.cos(azimuth) * cosAlt; // toward the sun, north component
  const sunZ = Math.sin(altitude);
  return {
    altitudeDeg: altD,
    azimuthDeg: azD,
    direction: [-sunX, -sunY, -sunZ],
  };
}

/** Preset study dates: solstices bound the shadow envelope, equinox is the mean. */
export const SUN_DATES: Array<{ key: string; label: string; dayOfYear: number }> = [
  { key: 'jun21', label: 'Jun 21 (summer solstice)', dayOfYear: 172 },
  { key: 'mar21', label: 'Mar 21 (equinox)', dayOfYear: 80 },
  { key: 'dec21', label: 'Dec 21 (winter solstice)', dayOfYear: 355 },
];
