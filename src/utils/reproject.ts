// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

/**
 * Coordinate reprojection utilities
 * Converts between EPSG:3857 (Web Mercator) and EPSG:4326 (WGS84)
 */

/**
 * Convert Web Mercator (EPSG:3857) coordinates to WGS84 (EPSG:4326) lng/lat
 */
export function mercator3857ToLngLat4326([x, y]: [number, number]): [number, number] {
  const R = 6378137; // Earth radius in meters
  const lng = (x / R) * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI;
  return [lng, lat];
}

/**
 * Convert WGS84 (EPSG:4326) lng/lat to Web Mercator (EPSG:3857)
 */
export function lngLat4326ToMercator3857([lng, lat]: [number, number]): [number, number] {
  const R = 6378137; // Earth radius in meters
  const x = R * (lng * Math.PI / 180);
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2));
  return [x, y];
}

/**
 * Convert a GeoJSON geometry from EPSG:3857 to EPSG:4326
 */
export function feature3857To4326<T extends GeoJSON.Geometry>(geom: T): T {
  function convCoords(coords: any): any {
    if (typeof coords[0] === 'number') {
      return mercator3857ToLngLat4326(coords as [number, number]);
    }
    return coords.map(convCoords);
  }
  return { ...geom, coordinates: convCoords((geom as any).coordinates) };
}

/**
 * Convert a GeoJSON geometry from EPSG:4326 to EPSG:3857
 */
export function feature4326To3857<T extends GeoJSON.Geometry>(geom: T): T {
  function convCoords(coords: any): any {
    if (typeof coords[0] === 'number') {
      return lngLat4326ToMercator3857(coords as [number, number]);
    }
    return coords.map(convCoords);
  }
  return { ...geom, coordinates: convCoords((geom as any).coordinates) };
}

