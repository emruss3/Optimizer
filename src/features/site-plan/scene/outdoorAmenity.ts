/**
 * Outdoor amenity pads (pool decks, open decks) are not enclosed buildings.
 * Live audit 2026-11-24 (535 Main St): mapping a "Pool deck" as a one-story
 * amenity produced windows and roof faces. Treat named outdoor pads as open
 * use so massing draws a surface, not a pavilion.
 */

const ENCLOSED =
  /\b(clubhouse|club\s*house|pavilion|leasing|office|fitness|gym|community\s*room|amenity\s*building)\b/i;

/** True when the plan names an open outdoor pad rather than an enclosed amenity. */
export function isOutdoorAmenityName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (ENCLOSED.test(name)) return false;
  return /\bpool\b/i.test(name) || /\boutdoor\s+deck\b/i.test(name) || /\bopen\s+deck\b/i.test(name);
}

/** Deck height assumption (feet): a paved outdoor surface, not a story. */
export const OUTDOOR_DECK_HEIGHT_FT = 0.5;
