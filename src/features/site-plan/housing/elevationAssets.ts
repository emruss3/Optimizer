import type { Face } from './originalDesigns';
import { WEST_HEIMAN_IDS } from './westHeimanDesigns';

/**
 * Home Studio photoreal elevation WebPs exist only for these concept ids
 * (`public/home-designs/{id}-elevation-{face}-v2.webp`). Stock / ABHP rows
 * and any future catalogue id without a pack must stay on Diagram.
 */
export const PHOTOREAL_ELEVATION_IDS = [
  'tn-court-cottage-v1',
  'tn-lantern-narrow-v1',
  'tn-meadow-ranch-v1',
  'tn-crossfield-v1',
  'tn-alley-row-v1',
  'tn-corner-porch-v1',
  'tn-garden-infill-v1',
  'tn-motor-court-v1',
  ...WEST_HEIMAN_IDS,
] as const;

const PHOTOREAL_ELEVATION_ID_SET: ReadonlySet<string> = new Set(PHOTOREAL_ELEVATION_IDS);
const WEST_HEIMAN_ID_SET: ReadonlySet<string> = new Set(WEST_HEIMAN_IDS);

export function hasPhotorealElevation(id: string): boolean {
  return PHOTOREAL_ELEVATION_ID_SET.has(id);
}

export function photorealElevationSrc(id: string, side: Face): string {
  return '/home-designs/' + id + '-elevation-' + side + '-v2.webp';
}

export function exteriorRendering(id: string): string {
  return WEST_HEIMAN_ID_SET.has(id) ? photorealElevationSrc(id, 'front') : '/home-designs/' + id + '.webp';
}

export function interiorRenderings(id: string): { name: string; src: string }[] {
  if (!WEST_HEIMAN_ID_SET.has(id)) return [];
  return ['Level 2 · living and kitchen',
    id === WEST_HEIMAN_IDS[2] ? 'Level 3 · front study'
      : id === WEST_HEIMAN_IDS[0] ? 'Level 3 · primary bedroom and covered balcony' : 'Level 3 · primary bedroom',
  ].map((name, i) => ({ name, src: '/home-designs/' + id + '-interior-' + (i + 1) + '.webp' }));
}
