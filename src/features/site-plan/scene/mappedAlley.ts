import type { Element } from '../../../engine/types';

/** A drawn vehicle way identified as an alley, not a lot name or a street centreline. */
export function isMappedAlley(el: Pick<Element, 'type' | 'name' | 'properties'>): boolean {
  if (el.type !== 'road' && el.type !== 'circulation' && el.type !== 'parking-aisle') return false;
  if (el.type === 'circulation' && /\b(?:walk|sidewalk|driveway)\b/i.test(el.name)) return false;
  return el.properties?.kind === 'alley' || /\balley\b/i.test(el.name);
}
