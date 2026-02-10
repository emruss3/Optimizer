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
 * Save a site plan to the database.
 * Returns the newly created plan.
 */
export async function saveSitePlan(input: SaveSitePlanInput): Promise<SavedSitePlan> {
  if (!supabase) throw new Error('Supabase client not initialised');

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

  if (error) throw error;
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
 */
export async function listSitePlans(parcelId: string): Promise<SavedSitePlan[]> {
  if (!supabase) throw new Error('Supabase client not initialised');

  const { data, error } = await supabase
    .from('site_plans')
    .select('*')
    .eq('parcel_id', parcelId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as SavedSitePlan[];
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
