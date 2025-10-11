// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { ParcelGeometryService, ParcelGeometry3857, ParcelBuildableEnvelope } from './parcelGeometry';
import { GeoJSON } from '../types/parcel';

// Mock Supabase client
const mockSupabase = {
  rpc: jest.fn()
};

jest.mock('../lib/supabase', () => ({
  supabase: mockSupabase
}));

describe('ParcelGeometryService', () => {
  let service: ParcelGeometryService;

  beforeEach(() => {
    service = new ParcelGeometryService();
    jest.clearAllMocks();
  });

  describe('fetchParcelGeometry3857', () => {
    test('should fetch and parse geometry data correctly', async () => {
      const mockData: ParcelGeometry3857[] = [{
        ogc_fid: 661807,
        address: '2518 W HEIMAN ST',
        sqft: 631204,
        geometry_3857: {
          type: 'Polygon',
          coordinates: [[
            [-9664482.45, 4324434.23],
            [-9664342.47, 4324434.23],
            [-9664342.47, 4324239.17],
            [-9664482.45, 4324239.17],
            [-9664482.45, 4324434.23]
          ]]
        },
        bounds_3857: {
          minX: -9664482.45,
          minY: 4324239.17,
          maxX: -9664342.47,
          maxY: 4324434.23
        },
        centroid_x: -9664412.46,
        centroid_y: 4324336.70,
        perimeter_ft: 486.4
      }];

      mockSupabase.rpc.mockResolvedValue({ data: mockData, error: null });

      const result = await service.fetchParcelGeometry3857(661807);

      expect(result).toBeDefined();
      expect(result?.ogc_fid).toBe(661807);
      expect(result?.address).toBe('2518 W HEIMAN ST');
      expect(result?.sqft).toBe(631204);
      expect(result?.geometry_3857).toBeDefined();
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_parcel_geometry_3857', {
        p_ogc_fid: 661807
      });
    });

    test('should handle errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Test error' } });

      const result = await service.fetchParcelGeometry3857(661807);

      expect(result).toBeNull();
    });

    test('should handle empty data', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: [], error: null });

      const result = await service.fetchParcelGeometry3857(661807);

      expect(result).toBeNull();
    });
  });

  describe('fetchParcelBuildableEnvelope', () => {
    test('should fetch and parse buildable envelope data correctly', async () => {
      const mockData: ParcelBuildableEnvelope[] = [{
        ogc_fid: 661807,
        buildable_geom: {
          type: 'Polygon',
          coordinates: [[
            [-9664462.45, 4324414.23],
            [-9664362.47, 4324414.23],
            [-9664362.47, 4324259.17],
            [-9664462.45, 4324259.17],
            [-9664462.45, 4324414.23]
          ]]
        },
        area_sqft: 517250,
        edge_types: {
          front: true,
          side: true,
          rear: true,
          easement: false
        },
        setbacks_applied: {
          front: 20,
          side: 5,
          rear: 20
        },
        easements_removed: {
          count: 0,
          areas: []
        }
      }];

      mockSupabase.rpc.mockResolvedValue({ data: mockData, error: null });

      const result = await service.fetchParcelBuildableEnvelope(661807);

      expect(result).toBeDefined();
      expect(result?.ogc_fid).toBe(661807);
      expect(result?.area_sqft).toBe(517250);
      expect(result?.buildable_geom).toBeDefined();
      expect(result?.edge_types.front).toBe(true);
      expect(result?.setbacks_applied.front).toBe(20);
      expect(mockSupabase.rpc).toHaveBeenCalledWith('get_parcel_buildable_envelope', {
        p_ogc_fid: 661807
      });
    });

    test('should handle errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: null, error: { message: 'Test error' } });

      const result = await service.fetchParcelBuildableEnvelope(661807);

      expect(result).toBeNull();
    });
  });

  describe('parseGeometryForSitePlanner', () => {
    test('should parse geometry and return valid SitePlannerGeometry', () => {
      const geometryData: ParcelGeometry3857 = {
        ogc_fid: 661807,
        address: '2518 W HEIMAN ST',
        sqft: 631204,
        geometry_3857: {
          type: 'Polygon',
          coordinates: [[
            [-9664482.45, 4324434.23],
            [-9664342.47, 4324434.23],
            [-9664342.47, 4324239.17],
            [-9664482.45, 4324239.17],
            [-9664482.45, 4324434.23]
          ]]
        },
        bounds_3857: {
          minX: -9664482.45,
          minY: 4324239.17,
          maxX: -9664342.47,
          maxY: 4324434.23
        },
        centroid_x: -9664412.46,
        centroid_y: 4324336.70,
        perimeter_ft: 486.4
      };

      const result = service.parseGeometryForSitePlanner(geometryData);

      expect(result).toBeDefined();
      expect(result.coordinates).toBeDefined();
      expect(result.coordinates.length).toBeGreaterThan(0);
      expect(result.bounds).toBeDefined();
      expect(result.bounds.minX).toBeDefined();
      expect(result.bounds.minY).toBeDefined();
      expect(result.bounds.maxX).toBeDefined();
      expect(result.bounds.maxY).toBeDefined();
      expect(result.width).toBeGreaterThan(0);
      expect(result.depth).toBeGreaterThan(0);
      expect(result.area).toBe(631204);
      expect(result.perimeter).toBe(486.4);
      expect(result.centroid).toBeDefined();
      expect(result.normalizedCoordinates).toBeDefined();
    });

    test('should create fallback geometry when no geometry available', () => {
      const geometryData: ParcelGeometry3857 = {
        ogc_fid: 661807,
        address: '2518 W HEIMAN ST',
        sqft: 10000,
        geometry_3857: null as any,
        bounds_3857: {
          minX: 0,
          minY: 0,
          maxX: 0,
          maxY: 0
        },
        centroid_x: 0,
        centroid_y: 0,
        perimeter_ft: 0
      };

      const result = service.parseGeometryForSitePlanner(geometryData);

      expect(result).toBeDefined();
      expect(result.area).toBe(10000);
      expect(result.coordinates).toBeDefined();
      expect(result.coordinates.length).toBeGreaterThan(0);
    });
  });

  describe('parseBuildableEnvelopeForSitePlanner', () => {
    test('should parse buildable envelope and return valid SitePlannerGeometry', () => {
      const envelopeData: ParcelBuildableEnvelope = {
        ogc_fid: 661807,
        buildable_geom: {
          type: 'Polygon',
          coordinates: [[
            [-9664462.45, 4324414.23],
            [-9664362.47, 4324414.23],
            [-9664362.47, 4324259.17],
            [-9664462.45, 4324259.17],
            [-9664462.45, 4324414.23]
          ]]
        },
        area_sqft: 517250,
        edge_types: {
          front: true,
          side: true,
          rear: true,
          easement: false
        },
        setbacks_applied: {
          front: 20,
          side: 5,
          rear: 20
        },
        easements_removed: {
          count: 0,
          areas: []
        }
      };

      const result = service.parseBuildableEnvelopeForSitePlanner(envelopeData);

      expect(result).toBeDefined();
      expect(result.coordinates).toBeDefined();
      expect(result.coordinates.length).toBeGreaterThan(0);
      expect(result.bounds).toBeDefined();
      expect(result.width).toBeGreaterThan(0);
      expect(result.depth).toBeGreaterThan(0);
      expect(result.area).toBe(517250);
      expect(result.perimeter).toBeGreaterThan(0);
      expect(result.centroid).toBeDefined();
      expect(result.normalizedCoordinates).toBeDefined();
    });

    test('should create fallback geometry when no buildable geometry available', () => {
      const envelopeData: ParcelBuildableEnvelope = {
        ogc_fid: 661807,
        buildable_geom: null as any,
        area_sqft: 50000,
        edge_types: {
          front: true,
          side: true,
          rear: true,
          easement: false
        },
        setbacks_applied: {
          front: 20,
          side: 5,
          rear: 20
        },
        easements_removed: {
          count: 0,
          areas: []
        }
      };

      const result = service.parseBuildableEnvelopeForSitePlanner(envelopeData);

      expect(result).toBeDefined();
      expect(result.area).toBe(50000);
      expect(result.coordinates).toBeDefined();
      expect(result.coordinates.length).toBeGreaterThan(0);
    });
  });

  describe('validateGeometry', () => {
    test('should validate correct geometry', () => {
      const geometry = {
        coordinates: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]],
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        width: 100,
        depth: 100,
        area: 10000,
        perimeter: 400,
        centroid: { x: 50, y: 50 },
        normalizedCoordinates: [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
      };

      const result = service.validateGeometry(geometry);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should detect invalid geometry', () => {
      const geometry = {
        coordinates: [[0, 0], [100, 0]], // Not enough points
        bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
        width: 100,
        depth: 100,
        area: 0, // Invalid area
        perimeter: 0, // Invalid perimeter
        centroid: { x: 50, y: 50 },
        normalizedCoordinates: [[0, 0], [100, 0]]
      };

      const result = service.validateGeometry(geometry);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toContain('Invalid coordinates: must have at least 3 points');
      expect(result.errors).toContain('Invalid area: must be greater than 0');
    });
  });
});
