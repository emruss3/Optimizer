import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOME_DESIGNS } from './originalDesigns';
import { WEST_HEIMAN_IDS } from './westHeimanDesigns';
import { MIDDLE_TENNESSEE_IDS } from './middleTennesseeDesigns';
import {
  PHOTOREAL_ELEVATION_IDS,
  hasPhotorealElevation,
  interiorRenderings,
  photorealElevationSrc,
} from './elevationAssets';

const faces = ['front', 'right', 'back', 'left'] as const;
const publicDir = resolve(process.cwd(), 'public/home-designs');

describe('photoreal elevation assets', () => {
  it('lists the concept ids that ship elevation WebPs', () => {
    expect(PHOTOREAL_ELEVATION_IDS).toEqual(HOME_DESIGNS.map(h => h.id));
    for (const id of PHOTOREAL_ELEVATION_IDS) {
      expect(hasPhotorealElevation(id)).toBe(true);
      for (const side of faces) {
        const version = id === 'tn-motor-court-v1' ? 'v3' : 'v2';
        const src = photorealElevationSrc(id, side);
        expect(src).toBe(`/home-designs/${id}-elevation-${side}-${version}.webp`);
        expect(existsSync(resolve(publicDir, src.split('/').pop()!))).toBe(true);
      }
    }
  });

  it.each(['tn-motor-court-v1', ...MIDDLE_TENNESSEE_IDS, ...WEST_HEIMAN_IDS])('ships both interior views for %s', id => {
    const views = interiorRenderings(id);
    expect(views).toHaveLength(2);
    for (const { src } of views) expect(existsSync(resolve(publicDir, src.split('/').pop()!))).toBe(true);
  });

  it('treats stock / unknown ids as missing photoreal assets (Diagram fallback)', () => {
    expect(hasPhotorealElevation('abhp:1754-00010')).toBe(false);
    expect(hasPhotorealElevation('1754-00010')).toBe(false);
    expect(hasPhotorealElevation('tn-unknown-v1')).toBe(false);
    expect(hasPhotorealElevation('')).toBe(false);
  });
});
