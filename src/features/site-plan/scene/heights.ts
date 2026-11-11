// The one place a story count becomes a height.
//
// No plan the engines return today carries a building height: they carry a
// story count. Every view that needs a height reads it here, and every such
// height is an estimate. It is labelled "Estimated height" wherever it is
// shown and it is never compared with a height limit as if it were measured.
// When a plan does carry a height (`properties.heightFt`), that value is used
// and labelled "Height".

export type BuildingUse = 'apartments' | 'townhome' | 'house' | 'amenity' | 'existing' | 'other';

export interface StoryAssumption {
  /** Floor-to-floor height of the ground story, in feet. */
  groundFt: number;
  /** Floor-to-floor height of each story above it, in feet. */
  upperFt: number;
  /** Where the figures come from, in words a reader can check. */
  basis: string;
}

/**
 * Story heights by use. These are drawing assumptions, not ordinance values
 * and not engine outputs. Roofs and parapets are not modelled.
 */
export const STORY_ASSUMPTIONS: Record<BuildingUse, StoryAssumption> = {
  apartments: { groundFt: 14, upperFt: 10, basis: '14 ft ground floor, 10 ft upper floors' },
  amenity: { groundFt: 14, upperFt: 10, basis: '14 ft ground floor, 10 ft upper floors' },
  townhome: { groundFt: 10, upperFt: 10, basis: '10 ft per floor, roof not modelled' },
  house: { groundFt: 10, upperFt: 10, basis: '10 ft per floor, roof not modelled' },
  existing: { groundFt: 14, upperFt: 10, basis: '14 ft ground floor, 10 ft upper floors' },
  other: { groundFt: 14, upperFt: 10, basis: '14 ft ground floor, 10 ft upper floors' },
};

export interface SceneHeight {
  /** Height above grade at the building, in feet. Not an elevation. */
  aboveGradeFt: number;
  basis: 'reported' | 'estimated';
  /** The words to put beside the number. */
  label: 'Height' | 'Estimated height';
  /** Top of each story above grade, in feet; the last is the roof line. */
  levelsFt: number[];
  /** Set when the height is estimated. */
  assumption: (StoryAssumption & { use: BuildingUse; floors: number }) | null;
  /** One sentence for an inspector or a sheet note. */
  note: string;
}

export function cleanFloors(floors: unknown): number {
  const f = typeof floors === 'number' && Number.isFinite(floors) ? Math.floor(floors) : 1;
  return Math.max(1, f);
}

/** Height of a building from its story count, or from a reported height. */
export function buildingHeight(use: BuildingUse, floors: unknown, reportedFt?: unknown): SceneHeight {
  const f = cleanFloors(floors);
  const a = STORY_ASSUMPTIONS[use] ?? STORY_ASSUMPTIONS.other;
  if (typeof reportedFt === 'number' && Number.isFinite(reportedFt) && reportedFt > 0) {
    // floor lines are spread evenly under a reported height: the plan gives no floor heights
    const levelsFt = Array.from({ length: f }, (_, i) => (reportedFt * (i + 1)) / f);
    return { aboveGradeFt: reportedFt, basis: 'reported', label: 'Height', levelsFt, assumption: null, note: 'Height above grade as reported with the plan.' };
  }
  const levelsFt = Array.from({ length: f }, (_, i) => a.groundFt + a.upperFt * i);
  return {
    aboveGradeFt: a.groundFt + a.upperFt * (f - 1),
    basis: 'estimated',
    label: 'Estimated height',
    levelsFt,
    assumption: { ...a, use, floors: f },
    note: `Estimated from ${f} ${f === 1 ? 'story' : 'stories'}: ${a.basis}. The plan carries a story count, not a height. Not a measured or controlling height.`,
  };
}
