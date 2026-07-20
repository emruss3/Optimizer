/**
 * Max-buildout envelope (fn_max_buildout): the developer's headline — how
 * many GSF the lot can carry, at what stories/unit size, and which constraint
 * binds first. The same block is composed into the planner context and remains
 * available through this read-only RPC for the headline.
 */
import { supabase } from '../../../lib/supabase';

export interface StoriesRung {
  stories: number;
  units: number;
  max_gsf: number;
  unit_gsf: number;
  footprint_sqft?: number;
  binding: string;
}

export interface ProgramFrontierOption {
  stories: number;
  units: number;
  unit_gsf: number;
  /** GSF-max option uses max_gsf; units-max option historically used gsf. */
  max_gsf?: number;
  gsf?: number;
  footprint_sqft?: number;
  binding?: string;
}

export interface ProgramFrontier {
  gsf_max_option: ProgramFrontierOption;
  units_max_option?: ProgramFrontierOption;
  note?: string;
}

export interface EntitlementCapacity {
  lot_sqft?: number;
  lot_acres?: number;
  max_units?: number | null;
  max_gfa_sqft?: number | null;
  max_units_source?: string;
  far_uncapped_for_mf?: boolean;
  max_impervious_sqft?: number | null;
  basis?: string;
}

/** Normalized client contract. Compatibility aliases are always populated. */
export interface MaxBuildout {
  contract_version?: string;
  parcel_ogc_fid: number;
  typology: string;
  max_gsf: number;
  at_stories: number;
  at_unit_gsf: number;
  units_at_max: number;
  binding_constraint: string;
  footprint_at_max?: number;
  program_frontier?: ProgramFrontier;
  stories_ladder: StoriesRung[];
  entitlement_capacity?: EntitlementCapacity;
  assumptions?: Record<string, unknown>;
  note?: string;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function normalizeFrontierOption(value: unknown): ProgramFrontierOption | null {
  const option = asObject(value);
  if (!option) return null;

  const stories = asFiniteNumber(option.stories);
  const units = asFiniteNumber(option.units);
  const unitGsf = asFiniteNumber(option.unit_gsf);
  if (stories == null || units == null || unitGsf == null) return null;

  const maxGsf = asFiniteNumber(option.max_gsf);
  const gsf = asFiniteNumber(option.gsf);
  const footprint = asFiniteNumber(option.footprint_sqft);
  const binding = asText(option.binding);

  return {
    stories,
    units,
    unit_gsf: unitGsf,
    ...(maxGsf != null ? { max_gsf: maxGsf } : {}),
    ...(gsf != null ? { gsf } : {}),
    ...(footprint != null ? { footprint_sqft: footprint } : {}),
    ...(binding != null ? { binding } : {}),
  };
}

function normalizeLadder(value: unknown): StoriesRung[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): StoriesRung[] => {
    const rung = asObject(item);
    if (!rung) return [];

    const stories = asFiniteNumber(rung.stories);
    const units = asFiniteNumber(rung.units);
    const maxGsf = asFiniteNumber(rung.max_gsf);
    const unitGsf = asFiniteNumber(rung.unit_gsf);
    const binding = asText(rung.binding);
    if (
      stories == null ||
      units == null ||
      maxGsf == null ||
      unitGsf == null ||
      binding == null
    ) {
      return [];
    }

    const footprint = asFiniteNumber(rung.footprint_sqft);
    return [{
      stories,
      units,
      max_gsf: maxGsf,
      unit_gsf: unitGsf,
      binding,
      ...(footprint != null ? { footprint_sqft: footprint } : {}),
    }];
  });
}

/**
 * Accept both contracts seen in production:
 *
 * - compatibility aliases at_stories / at_unit_gsf / units_at_max;
 * - program_frontier.gsf_max_option, introduced by the richer frontier API.
 *
 * Missing aliases must never turn into a silent one-story plan or a hidden
 * headline. The normalizer derives them from the frontier or best ladder rung.
 */
export function normalizeMaxBuildout(value: unknown): MaxBuildout | null {
  const raw = asObject(value);
  if (!raw) return null;

  const frontierRaw = asObject(raw.program_frontier);
  const gsfMaxOption = normalizeFrontierOption(frontierRaw?.gsf_max_option);
  const unitsMaxOption = normalizeFrontierOption(frontierRaw?.units_max_option);
  const ladder = normalizeLadder(raw.stories_ladder);
  const bestRung = [...ladder].sort(
    (a, b) => b.max_gsf - a.max_gsf || b.stories - a.stories
  )[0];

  const maxGsf =
    asFiniteNumber(raw.max_gsf) ??
    gsfMaxOption?.max_gsf ??
    gsfMaxOption?.gsf ??
    bestRung?.max_gsf ??
    null;
  const atStories =
    asFiniteNumber(raw.at_stories) ??
    gsfMaxOption?.stories ??
    bestRung?.stories ??
    null;
  const atUnitGsf =
    asFiniteNumber(raw.at_unit_gsf) ??
    gsfMaxOption?.unit_gsf ??
    bestRung?.unit_gsf ??
    null;
  const unitsAtMax =
    asFiniteNumber(raw.units_at_max) ??
    gsfMaxOption?.units ??
    bestRung?.units ??
    null;
  const binding =
    asText(raw.binding_constraint) ??
    gsfMaxOption?.binding ??
    bestRung?.binding ??
    null;
  const parcelOgcFid = asFiniteNumber(raw.parcel_ogc_fid);
  const typology = asText(raw.typology);

  if (
    maxGsf == null || maxGsf <= 0 ||
    atStories == null || atStories <= 0 ||
    atUnitGsf == null || atUnitGsf <= 0 ||
    unitsAtMax == null || unitsAtMax <= 0 ||
    binding == null ||
    parcelOgcFid == null ||
    typology == null ||
    ladder.length === 0
  ) {
    return null;
  }

  const contractVersion = asText(raw.contract_version);
  const footprint =
    asFiniteNumber(raw.footprint_at_max) ??
    gsfMaxOption?.footprint_sqft ??
    bestRung?.footprint_sqft ??
    null;
  const frontierNote = asText(frontierRaw?.note);
  const programFrontier: ProgramFrontier | null = gsfMaxOption
    ? {
        gsf_max_option: gsfMaxOption,
        ...(unitsMaxOption ? { units_max_option: unitsMaxOption } : {}),
        ...(frontierNote ? { note: frontierNote } : {}),
      }
    : null;
  const entitlement = asObject(raw.entitlement_capacity);
  const assumptions = asObject(raw.assumptions);
  const note = asText(raw.note);

  return {
    parcel_ogc_fid: parcelOgcFid,
    typology,
    max_gsf: maxGsf,
    at_stories: atStories,
    at_unit_gsf: atUnitGsf,
    units_at_max: unitsAtMax,
    binding_constraint: binding,
    stories_ladder: ladder,
    ...(contractVersion ? { contract_version: contractVersion } : {}),
    ...(footprint != null ? { footprint_at_max: footprint } : {}),
    ...(programFrontier ? { program_frontier: programFrontier } : {}),
    ...(entitlement ? { entitlement_capacity: entitlement as EntitlementCapacity } : {}),
    ...(assumptions ? { assumptions } : {}),
    ...(note ? { note } : {}),
  };
}

/** Strict guard for an already normalized MaxBuildout value. */
export function isMaxBuildout(value: unknown): value is MaxBuildout {
  const object = asObject(value);
  return !!object &&
    typeof object.max_gsf === 'number' &&
    typeof object.at_stories === 'number' &&
    typeof object.at_unit_gsf === 'number' &&
    typeof object.units_at_max === 'number' &&
    Array.isArray(object.stories_ladder);
}

/** "impervious_coverage" → "impervious coverage" for display. */
export function bindingLabel(constraint: string | undefined | null): string {
  if (!constraint) return 'unknown';
  return constraint.replace(/_/g, ' ');
}

const cache = new Map<string, Promise<MaxBuildout | null>>();

export function fetchMaxBuildout(
  ogcFid: number,
  typology: string = 'multifamily'
): Promise<MaxBuildout | null> {
  const key = `${ogcFid}|${typology}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const promise = (async (): Promise<MaxBuildout | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.rpc('fn_max_buildout', {
        p_ogc_fid: ogcFid,
        p_typology: typology,
      });
      if (error) {
        console.warn('[maxBuildout] RPC failed:', error.message ?? error);
        return null;
      }
      return normalizeMaxBuildout(data);
    } catch (error) {
      console.warn('[maxBuildout] RPC threw:', error);
      return null;
    }
  })();

  cache.set(key, promise);
  promise.then(result => {
    if (result == null) cache.delete(key); // failures must not poison the cache
  });
  return promise;
}

export function __clearMaxBuildoutCache(): void {
  cache.clear();
}
