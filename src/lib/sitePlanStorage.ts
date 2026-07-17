import { supabase } from './supabase';
import type { Element, PlannerConfig, SiteMetrics, FeasibilityViolation } from '../engine/types';
import type { InvestmentAnalysis } from '../types/parcel';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedSitePlan {
  id: string;
  parcel_id: string;
  name: string;
  is_favorite: boolean;
  config: PlannerConfig;
  elements: Element[];
  metrics: SiteMetrics | null;
  violations: FeasibilityViolation[];
  investment: InvestmentAnalysis | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export type SaveSitePlanInput = {
  parcel_id: string;
  name: string;
  config: PlannerConfig;
  elements: Element[];
  metrics: SiteMetrics | null;
  violations: FeasibilityViolation[];
  investment: InvestmentAnalysis | null;
};

// ─── Storage functions ────────────────────────────────────────────────────────

/**
 * The saved-plans table is not provisioned yet — plan persistence arrives
 * with siteplanner_session/siteplanner_candidate (Beat-TestFit plan, M2).
 * Until then: detect "table missing" once, stop re-querying (no 404 spam),
 * and fail with a message that says what's actually going on.
 */
let tableKnownMissing = false;

function isMissingTableError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  const msg = err?.message ?? '';
  return (
    err?.code === 'PGRST205' ||
    /relation .* does not exist|could not find the table|schema cache/i.test(msg)
  );
}

const NOT_PROVISIONED_MSG =
  'Saved plans are not available yet — plan persistence ships with candidate sessions (M2).';

/**
 * Save a site plan to the database.
 * Returns the newly created plan.
 */
export async function saveSitePlan(input: SaveSitePlanInput): Promise<SavedSitePlan> {
  if (!supabase) throw new Error('Supabase client not initialised');
  if (tableKnownMissing) throw new Error(NOT_PROVISIONED_MSG);

  const userId = (await supabase.auth.getUser()).data?.user?.id ?? null;

  const { data, error } = await supabase
    .from('site_plans')
    .insert({
      parcel_id: input.parcel_id,
      name: input.name,
      config: input.config,
      elements: input.elements,
      metrics: input.metrics,
      violations: input.violations,
      investment: input.investment,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      tableKnownMissing = true;
      throw new Error(NOT_PROVISIONED_MSG);
    }
    throw error;
  }
  return data as SavedSitePlan;
}

/**
 * Load a single site plan by id.
 */
export async function loadSitePlan(id: string): Promise<SavedSitePlan> {
  if (!supabase) throw new Error('Supabase client not initialised');

  const { data, error } = await supabase
    .from('site_plans')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as SavedSitePlan;
}

/**
 * List all saved plans for a parcel, newest first.
 * Missing table → empty list (not an error): the UI shows "no saved plans"
 * instead of a red console and a broken panel.
 */
/** Concurrent list calls share ONE probe so at most one 404 ever fires —
 *  parcel-change + mount races were each paying their own failing request. */
let probeInFlight: Promise<void> | null = null;

export async function listSitePlans(parcelId: string): Promise<SavedSitePlan[]> {
  if (!supabase) throw new Error('Supabase client not initialised');
  if (tableKnownMissing) return [];
  if (probeInFlight) {
    await probeInFlight.catch(() => undefined);
    if (tableKnownMissing) return [];
  }

  let release: () => void = () => undefined;
  if (!probeInFlight) {
    probeInFlight = new Promise<void>(res => { release = res; });
  }
  try {
    const { data, error } = await supabase
      .from('site_plans')
      .select('*')
      .eq('parcel_id', parcelId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        tableKnownMissing = true;
        console.info('[sitePlanStorage] saved-plans table not provisioned yet; hiding saved plans.');
        return [];
      }
      throw error;
    }
    return (data ?? []) as SavedSitePlan[];
  } finally {
    release();
    probeInFlight = null;
  }
}

/**
 * Delete a site plan by id.
 */
export async function deleteSitePlan(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client not initialised');

  const { error } = await supabase
    .from('site_plans')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Toggle favourite status of a saved plan.
 */
export async function toggleFavorite(id: string, isFavorite: boolean): Promise<void> {
  if (!supabase) throw new Error('Supabase client not initialised');

  const { error } = await supabase
    .from('site_plans')
    .update({ is_favorite: isFavorite })
    .eq('id', id);

  if (error) throw error;
}

/**
 * Rename a saved plan.
 */
export async function renameSitePlan(id: string, name: string): Promise<void> {
  if (!supabase) throw new Error('Supabase client not initialised');

  const { error } = await supabase
    .from('site_plans')
    .update({ name })
    .eq('id', id);

  if (error) throw error;
}
