import { describe, it, expect } from 'vitest';
import { tn2274ToLngLat } from './tnStatePlane';

// Ground truth from PostGIS: ST_Transform(ST_SetSRID(ST_MakePoint(x, y), 2274), 4326)
const TRUTH: Array<{ ft: [number, number]; lnglat: [number, number] }> = [
  { ft: [1727071.240002877, 669684.972879615], lnglat: [-86.817955975, 36.170314686] },
  { ft: [1700000, 650000], lnglat: [-86.909048346, 36.115585998] },
  { ft: [1750000, 700000], lnglat: [-86.74105458, 36.254087582] },
];

describe('tn2274ToLngLat (EPSG:2274 inverse LCC)', () => {
  for (const { ft, lnglat } of TRUTH) {
    it(`matches PostGIS for ${ft[0]}, ${ft[1]}`, () => {
      const [lng, lat] = tn2274ToLngLat(ft);
      // <1e-7 deg ≈ <1 cm — far below plan-drawing tolerance
      expect(Math.abs(lng - lnglat[0])).toBeLessThan(1e-7);
      expect(Math.abs(lat - lnglat[1])).toBeLessThan(1e-7);
    });
  }
});
