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
 * The site_plans table is live with strictly per-user RLS (migration
 * 20260720000001): reads are owner-scoped (anonymous sessions see an empty
 * list — a 200, not a 404) and writes require an authenticated user; the DB
 * stamps created_by from the JWT. The missing-table latch below stays as a
 * defensive gate for environments that haven't applied the migration —
 * detect once, stop re-querying (no 404 spam), fail with a real message.
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

/** RLS refused the write — in practice: no authenticated user behind the JWT. */
function isRlsDeniedError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return err?.code === '42501' || /row-level security/i.test(err?.message ?? '');
}

const NOT_PROVISIONED_MSG =
  'Saved plans are not available in this environment (site_plans table missing).';
const SIGN_IN_REQUIRED_MSG =
  'Saving plans requires signing in — saved plans are private to your account.';

/**
 * Save a site plan to the database.
 * Returns the newly created plan.
 */
export async function saveSitePlan(input: SaveSitePlanInput): Promise<SavedSitePlan> {
  if (!supabase) throw new Error('Supabase client not initialised');
  if (tableKnownMissing) throw new Error(NOT_PROVISIONED_MSG);

  // Fail BEFORE the network call when no one is signed in: the insert policy
  // would refuse anyway, and this keeps the console free of 401/42501 noise.
  const userId = (await supabase.auth.getUser()).data?.user?.id ?? null;
  if (!userId) throw new Error(SIGN_IN_REQUIRED_MSG);

  // created_by is deliberately NOT sent — the DB stamps auth.uid() itself,
  // so a client can never save a plan as someone else.
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
    })
    .select()
    .single();

  if (error) {
    if (isMissingTableError(error)) {
      tableKnownMissing = true;
      throw new Error(NOT_PROVISIONED_MSG);
    }
    // Token expired between the pre-check and the insert (rare race).
    if (isRlsDeniedError(error)) throw new Error(SIGN_IN_REQUIRED_MSG);
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
 * List all saved plans for a parcel, newest first. RLS scopes the result to
 * the signed-in owner; an anonymous session legitimately gets [] (a 200 —
 * "no saved plans", not an error). Missing table → empty list too: the UI
 * shows "no saved plans" instead of a red console and a broken panel.
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
