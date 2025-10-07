// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import * as turf from '@turf/turf';
import proj4 from 'proj4';

// Define coordinate systems
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs('EPSG:3857', '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext +no_defs');

// Constants
const FEET_PER_METER = 3.28084;

/**
 * Project GeoJSON geometry from WGS84 (EPSG:4326) to Web Mercator (EPSG:3857)
 * @param geom - GeoJSON geometry or feature
 * @returns GeoJSON geometry in Web Mercator projection
 */
export function projectTo3857(geom: any): any {
  if (!geom || !geom.type) {
    throw new Error('Invalid GeoJSON geometry provided');
  }

  // Handle different geometry types
  if (geom.type === 'Feature') {
    return turf.feature(projectTo3857(geom.geometry), geom.properties);
  }

  if (geom.type === 'FeatureCollection') {
    return turf.featureCollection(
      (geom as any).features.map((feature: any) => 
        projectTo3857(feature)
      )
    );
  }

  // Project coordinates based on geometry type
  const projectCoords = (coords: any): any => {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        // Single coordinate pair [lng, lat]
        const [lng, lat] = coords;
        const [x, y] = proj4('EPSG:4326', 'EPSG:3857', [lng, lat]);
        return [x, y];
      } else {
        // Array of coordinates
        return coords.map(projectCoords);
      }
    }
    return coords;
  };

  const projectedGeom = {
    ...geom,
    coordinates: projectCoords((geom as any).coordinates)
  };

  return projectedGeom;
}

/**
 * Convert meters to feet
 * @param meters - Distance in meters
 * @returns Distance in feet
 */
export function toFeetFromMeters(meters: number): number {
  return meters * FEET_PER_METER;
}

/**
 * Calculate area in square feet from a projected geometry (EPSG:3857)
 * @param geom3857 - GeoJSON geometry in Web Mercator projection
 * @returns Area in square feet
 */
export function areaSqFt(geom3857: any): number {
  if (!geom3857) {
    throw new Error('Geometry is required');
  }

  // Use turf to calculate area in square meters
  const areaMeters = turf.area(geom3857);
  
  // Convert to square feet
  return toFeetFromMeters(Math.sqrt(areaMeters)) ** 2;
}

/**
 * Calculate length in feet from a projected geometry (EPSG:3857)
 * @param geom3857 - GeoJSON geometry in Web Mercator projection
 * @returns Length in feet
 */
export function lengthFt(geom3857: any): number {
  if (!geom3857) {
    throw new Error('Geometry is required');
  }

  // Use turf to calculate length in meters
  const lengthMeters = turf.length(geom3857, { units: 'meters' });
  
  // Convert to feet
  return toFeetFromMeters(lengthMeters);
}

/**
 * Convert projected geometry to SVG space with viewBox transformation
 * @param geom3857 - GeoJSON geometry in Web Mercator projection
 * @param viewBox - ViewBox configuration with origin and scale
 * @returns Object with SVG paths and bounds
 */
export function toSvgSpace(
  geom3857: any,
  viewBox: { origin: [number, number]; scale: number }
): { paths: string[]; bounds: [number, number, number, number] } {
  if (!geom3857) {
    throw new Error('Geometry is required');
  }

  const { origin, scale } = viewBox;
  const [originX, originY] = origin;

  // Get bounds of the geometry
  const bbox = turf.bbox(geom3857);
  const [minX, minY, maxX, maxY] = bbox;

  // Transform coordinates to SVG space
  const transformCoords = (coords: any): any => {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        // Single coordinate pair [x, y]
        const [x, y] = coords;
        const svgX = (x - originX) * scale;
        const svgY = (originY - y) * scale; // Flip Y axis for SVG
        return [svgX, svgY];
      } else {
        // Array of coordinates
        return coords.map(transformCoords);
      }
    }
    return coords;
  };

  // Generate SVG paths for different geometry types
  const paths: string[] = [];
  
  const processGeometry = (geom: any): void => {
    if (geom.type === 'Point') {
      const [x, y] = transformCoords(geom.coordinates);
      paths.push(`M ${x} ${y}`);
    } else if (geom.type === 'LineString') {
      const coords = transformCoords(geom.coordinates);
      const pathData = coords.map(([x, y], i) => 
        i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
      ).join(' ');
      paths.push(pathData);
    } else if (geom.type === 'Polygon') {
      geom.coordinates.forEach((ring: any) => {
        const coords = transformCoords(ring);
        const pathData = coords.map(([x, y], i) => 
          i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
        ).join(' ') + ' Z';
        paths.push(pathData);
      });
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates.forEach((polygon: any) => {
        polygon.forEach((ring: any) => {
          const coords = transformCoords(ring);
          const pathData = coords.map(([x, y], i) => 
            i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`
          ).join(' ') + ' Z';
          paths.push(pathData);
        });
      });
    }
  };

  // Handle different input types
  if (geom3857.type === 'Feature') {
    processGeometry(geom3857.geometry);
  } else if (geom3857.type === 'FeatureCollection') {
    (geom3857 as any).features.forEach((feature: any) => {
      processGeometry(feature.geometry);
    });
  } else {
    processGeometry(geom3857);
  }

  return {
    paths,
    bounds: [minX, minY, maxX, maxY]
  };
}

/**
 * Convert SVG coordinates back to Web Mercator
 * @param svgX - X coordinate in SVG space
 * @param svgY - Y coordinate in SVG space
 * @param viewBox - ViewBox configuration
 * @returns [x, y] coordinates in Web Mercator
 */
export function fromSvgSpace(
  svgX: number,
  svgY: number,
  viewBox: { origin: [number, number]; scale: number }
): [number, number] {
  const { origin, scale } = viewBox;
  const [originX, originY] = origin;

  const x = svgX / scale + originX;
  const y = originY - svgY / scale; // Flip Y axis back

  return [x, y];
}

/**
 * Calculate bounds for a geometry
 * @param geom - GeoJSON geometry
 * @returns Bounding box [minX, minY, maxX, maxY]
 */
export function calculateBounds(geom: any): [number, number, number, number] {
  const bbox = turf.bbox(geom);
  return [bbox[0], bbox[1], bbox[2], bbox[3]];
}

/**
 * Validate GeoJSON geometry
 * @param geom - GeoJSON geometry to validate
 * @returns True if geometry is valid
 */
export function validateGeometry(geom: any): boolean {
  try {
    return turf.booleanValid(geom);
  } catch {
    return false;
  }
}

/**
 * Get geometry type
 * @param geom - GeoJSON geometry
 * @returns Geometry type string
 */
export function getGeometryType(geom: any): string {
  if (geom.type === 'Feature') {
    return (geom as any).geometry.type;
  } else if (geom.type === 'FeatureCollection') {
    const features = (geom as any).features;
    if (features.length === 0) return 'Empty';
    return features[0].geometry.type;
  }
  return (geom as any).type;
}

/**
 * Create a point geometry
 * @param lng - Longitude
 * @param lat - Latitude
 * @returns Point feature
 */
export function createPoint(lng: number, lat: number): any {
  return turf.point([lng, lat]);
}

/**
 * Create a polygon geometry
 * @param coordinates - Array of coordinate rings
 * @returns Polygon feature
 */
export function createPolygon(coordinates: number[][][]): any {
  return turf.polygon(coordinates);
}

/**
 * Buffer a geometry by a distance in feet
 * @param geom - GeoJSON geometry
 * @param distanceFeet - Buffer distance in feet
 * @returns Buffered geometry
 */
export function bufferGeometry(geom: any, distanceFeet: number): any {
  const distanceMeters = distanceFeet / FEET_PER_METER;
  return turf.buffer(geom, distanceMeters, { units: 'meters' });
}