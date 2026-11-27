import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import catalog from './siteAssets.json';

describe('shared photographed finishes', () => {
  it.each(Object.entries({ ...catalog.textures, review_concrete: catalog.review_textures.concrete }))(
    'locks the on-disk maps for %s', (_slot, entry) => {
      const checksum = (file: string) => createHash('sha256')
        .update(readFileSync(resolve('public/textures/site', file))).digest('hex');
      expect(entry.tile_m).toHaveLength(2);
      expect(entry.tile_m.every(value => Number.isFinite(value) && value > 0)).toBe(true);
      expect(checksum(entry.color)).toBe(entry.color_sha256);
      expect(checksum(entry.normal)).toBe(entry.normal_sha256);
      if ('roughness_map' in entry) expect(checksum(entry.roughness_map)).toBe(entry.roughness_map_sha256);
    },
  );

  it('keeps the different review materials and a 6-inch siding course', () => {
    expect(catalog.review_textures.concrete.color).not.toBe(catalog.textures.concrete.color);
    expect(catalog.textures.siding.tile_m[1]! / 8).toBeCloseTo(0.1524, 4);
  });
});
