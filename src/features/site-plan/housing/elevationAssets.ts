import type { Face } from './originalDesigns';

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
] as const;

const PHOTOREAL_ELEVATION_ID_SET: ReadonlySet<string> = new Set(PHOTOREAL_ELEVATION_IDS);

export function hasPhotorealElevation(id: string): boolean {
  return PHOTOREAL_ELEVATION_ID_SET.has(id);
}

export function photorealElevationSrc(id: string, side: Face): string {
  return '/home-designs/' + id + '-elevation-' + side + '-v2.webp';
}
