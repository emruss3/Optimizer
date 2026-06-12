// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../lib/supabase';
import { CoordinateTransform } from '../utils/coordinateTransform';
import { GeoJSONGeometry } from '../types/parcel';

// Types for parcel geometry data - canonical format
export interface ParcelGeometry3857 {
  ogc_fid: number;
  address: string;
  sqft: number;
  geometry_3857: GeoJSONGeometry;
  bounds_3857: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  centroid_x: number;
  centroid_y: number;
  perimeter_ft: number;
}

export interface ParcelBuildableEnvelope {
  ogc_fid: number;
  buildable_geom: GeoJSONGeometry;
  area_sqft: number;
  edge_types: {
    front: boolean;
    side: boolean;
    rear: boolean;
    easement: boolean;
  };
  setbacks_applied: {
    front: number;
    side: number;
    rear: number;
  };
  easements_removed: number; // Changed from object to number to match SQL signature
}

export interface SitePlannerGeometry {
  coordinates: number[][];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  width: number;
  depth: number;
  area: number;
  perimeter: number;
  centroid: {
    x: number;
    y: number;
  };
  normalizedCoordinates: number[][];
  // Envelope metadata for intelligent features
  setbacks_applied?: {
    front: number;
    side: number;
    rear: number;
  };
  edge_types?: {
    front: boolean;
    side: boolean;
    rear: boolean;
    easement: boolean;
  };
}

/**
 * Enhanced parcel geometry service
 * Consolidates all geometry fetching and processing logic
 */
export class ParcelGeometryService {
  /**
   * Fetch parcel geometry in EPSG:3857 (Web Mercator)
   */
  async fetchParcelGeometry3857(ogcFid: number): Promise<ParcelGeometry3857 | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    try {
      console.log('🔍 Fetching parcel geometry in EPSG:3857 for OGC_FID:', ogcFid);
      
      const { data, error } = await supabase.rpc('get_parcel_geometry_3857', {
        p_ogc_fid: ogcFid
      });

      if (error) {
        console.error('❌ Error fetching parcel geometry:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        return null;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ No geometry data found for OGC_FID:', ogcFid);
        console.warn('⚠️ This might mean the function is not deployed or the parcel does not exist');
        return null;
      }

      const geometryData = data[0] as ParcelGeometry3857;
      console.log('✅ Parcel geometry fetched successfully:', geometryData);
      console.log('✅ Geometry data structure:', {
        hasGeometry: !!geometryData.geometry_3857,
        hasArea: !!geometryData.sqft,
        hasDimensions: !!geometryData.parcel_width_ft && !!geometryData.parcel_depth_ft
      });
      return geometryData;
    } catch (error) {
      console.error('❌ Exception fetching parcel geometry:', error);
      return null;
    }
  }

  // Cache to prevent duplicate calls (React 18 StrictMode guard)
  private envelopeCache = new Map<number, { data: ParcelBuildableEnvelope | null; timestamp: number }>();
  private envelopeFetching = new Set<number>(); // Track in-flight requests

  /**
   * Fetch buildable envelope for a parcel
   * Includes deduplication to prevent React 18 StrictMode double-calls
   */
  async fetchParcelBuildableEnvelope(ogcFid: number): Promise<ParcelBuildableEnvelope | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    // Check cache first (5 minute TTL)
    const cached = this.envelopeCache.get(ogcFid);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log('📦 [ParcelGeometry] Using cached envelope for OGC_FID:', ogcFid);
      return cached.data;
    }

    // Prevent duplicate concurrent requests
    if (this.envelopeFetching.has(ogcFid)) {
      console.log('⏳ [ParcelGeometry] Envelope fetch already in progress for OGC_FID:', ogcFid);
      // Wait for existing request
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const cached = this.envelopeCache.get(ogcFid);
          if (cached) {
            clearInterval(checkInterval);
            resolve(cached.data);
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(null);
        }, 10000); // 10s timeout
      });
    }

    this.envelopeFetching.add(ogcFid);

    try {
      console.log('🏗️ [ParcelGeometry] Fetching buildable envelope for OGC_FID:', ogcFid);
      
      const { data, error } = await supabase.rpc('get_parcel_buildable_envelope', {
        p_ogc_fid: ogcFid
      });

      if (error) {
        console.error('❌ [ParcelGeometry] Error fetching buildable envelope:', error);
        this.envelopeCache.set(ogcFid, { data: null, timestamp: Date.now() });
        return null;
      }

      if (!data || data.length === 0) {
        console.warn('⚠️ [ParcelGeometry] No buildable envelope data found for OGC_FID:', ogcFid);
        this.envelopeCache.set(ogcFid, { data: null, timestamp: Date.now() });
        return null;
      }

      const envelopeData = data[0] as ParcelBuildableEnvelope;
      console.log('✅ [ParcelGeometry] Buildable envelope fetched successfully:', {
        ogc_fid: envelopeData.ogc_fid,
        hasGeom: !!envelopeData.buildable_geom,
        area: envelopeData.area_sqft,
        setbacks: envelopeData.setbacks_applied
      });
      
      this.envelopeCache.set(ogcFid, { data: envelopeData, timestamp: Date.now() });
      return envelopeData;
    } catch (error) {
      console.error('❌ [ParcelGeometry] Exception fetching buildable envelope:', error);
      this.envelopeCache.set(ogcFid, { data: null, timestamp: Date.now() });
      return null;
    } finally {
      this.envelopeFetching.delete(ogcFid);
    }
  }

  /**
   * Parse geometry for site planner use
   * Converts from Web Mercator to feet and normalizes coordinates
   */
  parseGeometryForSitePlanner(geometryData: ParcelGeometry3857): SitePlannerGeometry {
    console.log('🔧 Parsing geometry for site planner...');
    
    const geometry = geometryData.geometry_3857;
    
    if (!geometry) {
      console.warn('⚠️ No geometry available, creating fallback');
      return this.createFallbackGeometry(geometryData.sqft);
    }

    try {
      // Extract coordinates from GeoJSON
      let coordinates: number[][];
      
      if (geometry.type === 'Polygon') {
        coordinates = geometry.coordinates[0] as number[][];
      } else if (geometry.type === 'MultiPolygon') {
        coordinates = (geometry.coordinates as number[][][])[0][0];
      } else {
        console.warn('⚠️ Unsupported geometry type:', geometry.type);
        return this.createFallbackGeometry(geometryData.sqft);
      }

      console.log('📐 Original coordinates (first 3):', coordinates.slice(0, 3));

      // Convert from Web Mercator meters to feet using centralized transform
      const coordinatesInFeet = CoordinateTransform.webMercatorToFeet(coordinates);

      // Calculate bounds using centralized function
      const bounds = CoordinateTransform.calculateBounds(coordinatesInFeet);

      // Normalize coordinates to start at (0,0)
      const { coords: normalizedCoordinates } = CoordinateTransform.normalizeCoordinates(coordinatesInFeet, bounds);

      // Calculate dimensions from bounds
      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxY - bounds.minY;
      const area = geometryData.sqft;
      const perimeter = geometryData.perimeter_ft;

      // Calculate normalized centroid
      const centroid = {
        x: CoordinateTransform.metersToFeet(geometryData.centroid_x) - bounds.minX,
        y: CoordinateTransform.metersToFeet(geometryData.centroid_y) - bounds.minY
      };

      const result: SitePlannerGeometry = {
        coordinates: coordinatesInFeet,
        bounds,
        width,
        depth,
        area,
        perimeter,
        centroid,
        normalizedCoordinates
      };

      console.log('✅ Geometry parsed successfully:', {
        width: result.width.toFixed(2),
        depth: result.depth.toFixed(2),
        area: result.area.toLocaleString(),
        perimeter: result.perimeter.toFixed(2)
      });

      return result;
    } catch (error) {
      console.error('❌ Error parsing geometry:', error);
      return this.createFallbackGeometry(geometryData.sqft);
    }
  }

  /**
   * Parse buildable envelope for site planner use
   */
  parseBuildableEnvelopeForSitePlanner(envelopeData: ParcelBuildableEnvelope): SitePlannerGeometry {
    console.log('🔧 Parsing buildable envelope for site planner...');
    
    const geometry = envelopeData.buildable_geom;
    
    if (!geometry) {
      console.warn('⚠️ No buildable geometry available');
      return this.createFallbackGeometry(envelopeData.area_sqft);
    }

    try {
      // Extract coordinates from GeoJSON
      let coordinates: number[][];
      
      if (geometry.type === 'Polygon') {
        coordinates = geometry.coordinates[0] as number[][];
      } else if (geometry.type === 'MultiPolygon') {
        coordinates = (geometry.coordinates as number[][][])[0][0];
      } else {
        console.warn('⚠️ Unsupported buildable geometry type:', geometry.type);
        return this.createFallbackGeometry(envelopeData.area_sqft);
      }

      console.log('📐 Buildable coordinates (first 3):', coordinates.slice(0, 3));

      // Convert from Web Mercator meters to feet
      const coordinatesInFeet = CoordinateTransform.webMercatorToFeet(coordinates);

      // Calculate bounds
      const bounds = CoordinateTransform.calculateBounds(coordinatesInFeet);

      // Normalize coordinates
      const { coords: normalizedCoordinates } = CoordinateTransform.normalizeCoordinates(coordinatesInFeet, bounds);

      const width = bounds.maxX - bounds.minX;
      const depth = bounds.maxY - bounds.minY;
      const area = envelopeData.area_sqft;
      const perimeter = CoordinateTransform.calculatePolygonPerimeter(coordinatesInFeet, 'feet');

      // Calculate normalized centroid
      const centroid = {
        x: width / 2,
        y: depth / 2
      };

      const result: SitePlannerGeometry = {
        coordinates: coordinatesInFeet,
        bounds,
        width,
        depth,
        area,
        perimeter,
        centroid,
        normalizedCoordinates,
        setbacks_applied: envelopeData.setbacks_applied,
        edge_types: envelopeData.edge_types
      };

      console.log('✅ Buildable envelope parsed successfully:', {
        width: result.width.toFixed(2),
        depth: result.depth.toFixed(2),
        area: result.area.toLocaleString(),
        perimeter: result.perimeter.toFixed(2),
        setbacks: envelopeData.setbacks_applied,
        easements: envelopeData.easements_removed
      });

      return result;
    } catch (error) {
      console.error('❌ Error parsing buildable envelope:', error);
      return this.createFallbackGeometry(envelopeData.area_sqft);
    }
  }

  /**
   * Create fallback geometry for parcels without valid geometry
   */
  private createFallbackGeometry(areaSqft: number): SitePlannerGeometry {
    console.log('🔧 Creating fallback geometry for area:', areaSqft);
    
    // Create a square parcel based on area
    const sideLength = Math.sqrt(areaSqft);
    const halfSide = sideLength / 2;
    
    const coordinates = [
      [-halfSide, -halfSide],
      [halfSide, -halfSide],
      [halfSide, halfSide],
      [-halfSide, halfSide],
      [-halfSide, -halfSide]
    ];

    const bounds = {
      minX: -halfSide,
      minY: -halfSide,
      maxX: halfSide,
      maxY: halfSide
    };

    const normalizedCoordinates = [
      [0, 0],
      [sideLength, 0],
      [sideLength, sideLength],
      [0, sideLength],
      [0, 0]
    ];

    return {
      coordinates,
      bounds,
      width: sideLength,
      depth: sideLength,
      area: areaSqft,
      perimeter: sideLength * 4,
      centroid: { x: 0, y: 0 },
      normalizedCoordinates
    };
  }

  /**
   * Validate geometry data
   */
  validateGeometry(geometry: SitePlannerGeometry): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!geometry.coordinates || geometry.coordinates.length < 3) {
      errors.push('Invalid coordinates: must have at least 3 points');
    }

    if (geometry.area <= 0) {
      errors.push('Invalid area: must be greater than 0');
    }

    if (geometry.width <= 0 || geometry.depth <= 0) {
      errors.push('Invalid dimensions: width and depth must be greater than 0');
    }

    if (geometry.perimeter <= 0) {
      errors.push('Invalid perimeter: must be greater than 0');
    }

    // Check for self-intersecting polygon
    if (geometry.coordinates.length >= 4) {
      const coords = geometry.coordinates;
      const isClosed =
        coords[0][0] === coords[coords.length - 1][0] &&
        coords[0][1] === coords[coords.length - 1][1];
      for (let i = 0; i < coords.length - 1; i++) {
        for (let j = i + 2; j < coords.length - 1; j++) {
          // In a closed ring the last segment is adjacent to the first —
          // they share a vertex, which is not a self-intersection
          if (isClosed && i === 0 && j === coords.length - 2) continue;
          if (this.linesIntersect(coords[i], coords[i + 1], coords[j], coords[j + 1])) {
            errors.push('Self-intersecting polygon detected');
            break;
          }
        }
        if (errors.length > 0) break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if two line segments intersect
   */
  private linesIntersect(p1: number[], p2: number[], p3: number[], p4: number[]): boolean {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    const [x3, y3] = p3;
    const [x4, y4] = p4;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return false; // Lines are parallel

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  /**
   * Get geometry statistics
   */
  getGeometryStats(geometry: SitePlannerGeometry): {
    area: number;
    perimeter: number;
    width: number;
    depth: number;
    aspectRatio: number;
    compactness: number;
  } {
    const aspectRatio = geometry.width / geometry.depth;
    const compactness = (4 * Math.PI * geometry.area) / (geometry.perimeter * geometry.perimeter);

    return {
      area: geometry.area,
      perimeter: geometry.perimeter,
      width: geometry.width,
      depth: geometry.depth,
      aspectRatio,
      compactness
    };
  }
}

// Export singleton instance
export const parcelGeometryService = new ParcelGeometryService();

// Export convenience functions
export const fetchParcelGeometry3857 = (ogcFid: number) => 
  parcelGeometryService.fetchParcelGeometry3857(ogcFid);

export const fetchParcelBuildableEnvelope = (ogcFid: number) => 
  parcelGeometryService.fetchParcelBuildableEnvelope(ogcFid);

export const parseGeometryForSitePlanner = (geometryData: ParcelGeometry3857) => 
  parcelGeometryService.parseGeometryForSitePlanner(geometryData);

export const parseBuildableEnvelopeForSitePlanner = (envelopeData: ParcelBuildableEnvelope) => 
  parcelGeometryService.parseBuildableEnvelopeForSitePlanner(envelopeData);