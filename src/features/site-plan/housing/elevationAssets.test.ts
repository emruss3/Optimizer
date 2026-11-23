import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PHOTOREAL_ELEVATION_IDS,
  hasPhotorealElevation,
  photorealElevationSrc,
} from './elevationAssets';

const faces = ['front', 'right', 'back', 'left'] as const;
const publicDir = resolve(process.cwd(), 'public/home-designs');

describe('photoreal elevation assets', () => {
  it('lists the eight tn-* concept ids that ship elevation WebPs', () => {
    expect(PHOTOREAL_ELEVATION_IDS).toHaveLength(8);
    for (const id of PHOTOREAL_ELEVATION_IDS) {
      expect(hasPhotorealElevation(id)).toBe(true);
      for (const side of faces) {
        const src = photorealElevationSrc(id, side);
        expect(src).toBe(`/home-designs/${id}-elevation-${side}-v2.webp`);
        expect(existsSync(resolve(publicDir, `${id}-elevation-${side}-v2.webp`))).toBe(true);
      }
    }
  });

  it('treats stock / unknown ids as missing photoreal assets (Diagram fallback)', () => {
    expect(hasPhotorealElevation('abhp:1754-00010')).toBe(false);
    expect(hasPhotorealElevation('1754-00010')).toBe(false);
    expect(hasPhotorealElevation('tn-unknown-v1')).toBe(false);
    expect(hasPhotorealElevation('')).toBe(false);
  });
});
