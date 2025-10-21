import { describe, it, expect } from 'vitest';
import {
  ogcFidToParcelId,
  parcelIdToOgcFid,
  extractOgcFidFromFeature,
  extractParcelIdFromFeature,
  createParcelSelection,
  getRpcId,
  createRpcParams,
  isValidOgcFid,
  isValidParcelId
} from './parcelId';

describe('Parcel ID Standardization', () => {
  describe('ID Conversion', () => {
    it('converts ogc_fid to parcel_id correctly', () => {
      expect(ogcFidToParcelId(12345)).toBe('12345');
      expect(ogcFidToParcelId(0)).toBe('0');
      expect(ogcFidToParcelId(999999)).toBe('999999');
    });

    it('converts parcel_id to ogc_fid correctly', () => {
      expect(parcelIdToOgcFid('12345')).toBe(12345);
      expect(parcelIdToOgcFid('0')).toBe(0);
      expect(parcelIdToOgcFid('999999')).toBe(999999);
    });

    it('throws error for invalid parcel_id', () => {
      expect(() => parcelIdToOgcFid('invalid')).toThrow();
      expect(() => parcelIdToOgcFid('')).toThrow();
      expect(() => parcelIdToOgcFid('abc123')).toThrow();
    });
  });

  describe('Feature Extraction', () => {
    it('extracts ogc_fid from feature properties', () => {
      const feature = { properties: { ogc_fid: 12345 } };
      expect(extractOgcFidFromFeature(feature)).toBe(12345);
    });

    it('extracts ogc_fid from string property', () => {
      const feature = { properties: { ogc_fid: '12345' } };
      expect(extractOgcFidFromFeature(feature)).toBe(12345);
    });

    it('returns null for invalid feature', () => {
      expect(extractOgcFidFromFeature(null)).toBeNull();
      expect(extractOgcFidFromFeature({})).toBeNull();
      expect(extractOgcFidFromFeature({ properties: {} })).toBeNull();
      expect(extractOgcFidFromFeature({ properties: { ogc_fid: 'invalid' } })).toBeNull();
    });

    it('extracts parcel_id from feature', () => {
      const feature = { properties: { ogc_fid: 12345 } };
      expect(extractParcelIdFromFeature(feature)).toBe('12345');
    });

    it('returns null for invalid feature when extracting parcel_id', () => {
      expect(extractParcelIdFromFeature(null)).toBeNull();
      expect(extractParcelIdFromFeature({})).toBeNull();
    });
  });

  describe('Parcel Selection', () => {
    it('creates parcel selection from valid feature', () => {
      const feature = { properties: { ogc_fid: 12345 } };
      const selection = createParcelSelection(feature);
      
      expect(selection).toEqual({
        ogcFid: 12345,
        parcelId: '12345',
        feature
      });
    });

    it('returns null for invalid feature', () => {
      expect(createParcelSelection(null)).toBeNull();
      expect(createParcelSelection({})).toBeNull();
      expect(createParcelSelection({ properties: {} })).toBeNull();
    });
  });

  describe('RPC ID Handling', () => {
    it('returns correct ID for geometry RPCs', () => {
      expect(getRpcId(12345, 'geometry')).toBe(12345);
    });

    it('returns correct ID for planner RPCs', () => {
      expect(getRpcId(12345, 'planner')).toBe('12345');
    });

    it('throws error for unknown RPC type', () => {
      expect(() => getRpcId(12345, 'unknown' as any)).toThrow();
    });
  });

  describe('RPC Parameters', () => {
    it('creates geometry RPC parameters', () => {
      const params = createRpcParams(12345, 'geometry');
      expect(params).toEqual({ p_ogc_fid: 12345 });
    });

    it('creates planner RPC parameters', () => {
      const params = createRpcParams(12345, 'planner');
      expect(params).toEqual({ p_parcel_id: '12345' });
    });
  });

  describe('ID Validation', () => {
    it('validates ogc_fid correctly', () => {
      expect(isValidOgcFid(12345)).toBe(true);
      expect(isValidOgcFid(0)).toBe(false);
      expect(isValidOgcFid(-1)).toBe(false);
      expect(isValidOgcFid('12345')).toBe(false);
      expect(isValidOgcFid(null)).toBe(false);
      expect(isValidOgcFid(undefined)).toBe(false);
    });

    it('validates parcel_id correctly', () => {
      expect(isValidParcelId('12345')).toBe(true);
      expect(isValidParcelId('0')).toBe(false);
      expect(isValidParcelId('')).toBe(false);
      expect(isValidParcelId('invalid')).toBe(false);
      expect(isValidParcelId(12345)).toBe(false);
      expect(isValidParcelId(null)).toBe(false);
      expect(isValidParcelId(undefined)).toBe(false);
    });
  });
});
