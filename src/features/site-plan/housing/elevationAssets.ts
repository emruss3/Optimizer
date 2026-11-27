import type { Face } from './originalDesigns';
import { WEST_HEIMAN_IDS } from './westHeimanDesigns';
import { MIDDLE_TENNESSEE_IDS } from './middleTennesseeDesigns';

/**
 * Home Studio photoreal elevation WebPs exist only for these concept ids
 * (`public/home-designs/{id}-elevation-{face}-{version}.webp`). Stock / ABHP rows
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
  ...MIDDLE_TENNESSEE_IDS,
  ...WEST_HEIMAN_IDS,
] as const;

const PHOTOREAL_ELEVATION_ID_SET: ReadonlySet<string> = new Set(PHOTOREAL_ELEVATION_IDS);
const scenes = new Map<string, readonly [string, string]>([
  ['tn-motor-court-v1', ['Great room', 'Upper loft']],
  [MIDDLE_TENNESSEE_IDS[0], ['Living and dining', 'Kitchen']],
  [MIDDLE_TENNESSEE_IDS[1], ['Upper living room', 'Upper kitchen']],
  [MIDDLE_TENNESSEE_IDS[2], ['Kitchen and dining', 'Primary bedroom']],
  [WEST_HEIMAN_IDS[0], ['Level 2 · living and kitchen', 'Level 3 · primary bedroom and covered balcony']],
  [WEST_HEIMAN_IDS[1], ['Level 2 · living and kitchen', 'Level 3 · primary bedroom']],
  [WEST_HEIMAN_IDS[2], ['Level 2 · living and kitchen', 'Level 3 · front study']],
]);

export function hasPhotorealElevation(id: string): boolean {
  return PHOTOREAL_ELEVATION_ID_SET.has(id);
}

export function photorealElevationSrc(id: string, side: Face): string {
  const version = id === 'tn-motor-court-v1' ? 'v3' : 'v2';
  return '/home-designs/' + id + '-elevation-' + side + '-' + version + '.webp';
}

export function exteriorRendering(id: string): string {
  return scenes.has(id) ? photorealElevationSrc(id, 'front') : '/home-designs/' + id + '.webp';
}

export function interiorRenderings(id: string): { name: string; src: string }[] {
  return (scenes.get(id) ?? []).map((name, i) => ({ name, src: '/home-designs/' + id + '-interior-' + (i + 1) + '.webp' }));
}
