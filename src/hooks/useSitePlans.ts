import { useCallback, useEffect, useState } from 'react';
import {
  listSitePlans,
  saveSitePlan,
  deleteSitePlan,
  toggleFavorite,
  renameSitePlan,
  type SavedSitePlan,
  type SaveSitePlanInput,
} from '../lib/sitePlanStorage';

export interface UseSitePlansReturn {
  /** All saved plans for the current parcel (newest first). */
  plans: SavedSitePlan[];
  /** True while the initial list is being fetched. */
  isLoading: boolean;
  /** Most recent error, if any. */
  error: string | null;

  /** Save a new plan and add it to the list. */
  save: (input: SaveSitePlanInput) => Promise<SavedSitePlan | null>;
  /** Delete a plan and remove it from the list. */
  remove: (id: string) => Promise<void>;
  /** Toggle a plan's favourite flag in-place. */
  setFavorite: (id: string, isFavorite: boolean) => Promise<void>;
  /** Rename a plan in-place. */
  rename: (id: string, name: string) => Promise<void>;
  /** Force-refresh the list from the server. */
  refresh: () => Promise<void>;
}

/**
 * React hook wrapping the sitePlanStorage CRUD with loading/error states.
 * Fetches the list once on mount (when parcelId is truthy) and updates
 * optimistically after mutations.
 */
export function useSitePlans(parcelId: string | null | undefined): UseSitePlansReturn {
  const [plans, setPlans] = useState<SavedSitePlan[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── fetch list ────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!parcelId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await listSitePlans(parcelId);
      setPlans(data);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setIsLoading(false);
    }
  }, [parcelId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── save ──────────────────────────────────────────────────────────────────
  const save = useCallback(
    async (input: SaveSitePlanInput): Promise<SavedSitePlan | null> => {
      setError(null);
      try {
        const created = await saveSitePlan(input);
        setPlans(prev => [created, ...prev]); // prepend
        return created;
      } catch (err: any) {
        setError(err?.message ?? String(err));
        return null;
      }
    },
    []
  );

  // ── delete ────────────────────────────────────────────────────────────────
  const remove = useCallback(async (id: string) => {
    setError(null);
    try {
      await deleteSitePlan(id);
      setPlans(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }, []);

  // ── favourite toggle ──────────────────────────────────────────────────────
  const setFavorite = useCallback(async (id: string, isFavorite: boolean) => {
    setError(null);
    // Optimistic update
    setPlans(prev => prev.map(p => (p.id === id ? { ...p, is_favorite: isFavorite } : p)));
    try {
      await toggleFavorite(id, isFavorite);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      // Revert
      setPlans(prev => prev.map(p => (p.id === id ? { ...p, is_favorite: !isFavorite } : p)));
    }
  }, []);

  // ── rename ────────────────────────────────────────────────────────────────
  const rename = useCallback(async (id: string, name: string) => {
    setError(null);
    const prevName = plans.find(p => p.id === id)?.name;
    setPlans(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
    try {
      await renameSitePlan(id, name);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      if (prevName !== undefined) {
        setPlans(prev => prev.map(p => (p.id === id ? { ...p, name: prevName } : p)));
      }
    }
  }, [plans]);

  return { plans, isLoading, error, save, remove, setFavorite, rename, refresh };
}
