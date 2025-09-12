import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { ParcelSet, toArray, setKey } from '../lib/parcelSet';

interface ActiveProjectState {
  // Core state
  id: string | null;
  name: string | null;
  selectedParcels: ParcelSet; // selected parcel_ids as Set
  
  // Actions
  set: (id: string | null, name?: string | null) => void;
  addParcel: (parcelId: string, parcelData?: any) => Promise<void>;
  removeParcel: (parcelId: string) => Promise<void>;
  clear: () => void;
  
  // UI state
  isLoading: boolean;
  error: string | null;
}

export const useActiveProject = create<ActiveProjectState>((set, get) => ({
  // Initial state
  id: null, // Start as null, not empty string
  name: null,
  selectedParcels: new Set<string>() as ParcelSet,
  isLoading: false,
  error: null,

  // Set active project
  set: (id, name = null) => {
    const prevId = get().id;
    
    set({ 
      id, 
      name, 
      selectedParcels: new Set<string>() as ParcelSet, // Always clear parcels when switching projects
      error: null 
    });
    
    // Load existing parcels for this project
    if (id && supabase && id !== prevId) {
      get().loadProjectParcels(id);
    }
  },

  // Add parcel to active project
  addParcel: async (parcelId: string, parcelData?: any) => {
    const state = get();
    if (!state.id) {
      console.warn('No active project - cannot add parcel');
      return;
    }

    // Ensure parcelId is always a string
    const pid = String(parcelId);

    // Check if parcel already exists
    if (state.selectedParcels.has(pid)) {
      // Flash toast for duplicate
      set({ error: 'Parcel already in project' });
      setTimeout(() => set({ error: null }), 3000);
      return;
    }

    // Optimistic UI update
    const wasEmpty = state.selectedParcels.size === 0;
    const newParcels = new Set([...state.selectedParcels, pid]) as ParcelSet;
    set({ 
      selectedParcels: newParcels,
      isLoading: true,
      error: null 
    });

    try {
      // Await Supabase upsert for proper error handling
      if (supabase) {
        const { error } = await supabase
          .from('project_parcels')
          .upsert({
            project_id: state.id,
            parcel_id: pid,
            added_at: new Date().toISOString(),
            parcel_data: parcelData || null
          });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }
      }

      set({ isLoading: false });
      
      // Success toast
      set({ error: 'Parcel added to project ✓' });
      setTimeout(() => set({ error: null }), 2500);

      // Auto-open drawer if this was the first parcel
      if (wasEmpty && typeof window !== 'undefined') {
        // Access UI store to open PROJECT drawer
        const { useUIStore } = await import('../store/ui');
        useUIStore.getState().setDrawer('PROJECT');
      }

    } catch (error) {
      console.error('Failed to add parcel:', error);
      
      // Rollback optimistic update
      set({ 
        selectedParcels: state.selectedParcels,
        isLoading: false,
        error: `Failed to add parcel: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => set({ error: null }), 3000);
    }
  },

  // Remove parcel from active project
  removeParcel: async (parcelId: string) => {
    const state = get();
    if (!state.id) return;

    const pid = String(parcelId);
    const originalParcels = state.selectedParcels;
    
    // Optimistic UI update
    const newParcels = new Set([...state.selectedParcels].filter(p => p !== pid)) as ParcelSet;
    set({ 
      selectedParcels: newParcels,
      isLoading: true,
      error: null 
    });

    try {
      // Await Supabase delete
      if (supabase) {
        const { error } = await supabase
          .from('project_parcels')
          .delete()
          .match({ project_id: state.id, parcel_id: pid });

        if (error) throw error;
      }

      set({ isLoading: false });
      
      // Success feedback
      set({ error: 'Parcel removed ✓' });
      setTimeout(() => set({ error: null }), 2000);

    } catch (error) {
      console.error('Failed to remove parcel:', error);
      
      // Rollback optimistic update
      set({ 
        selectedParcels: originalParcels,
        isLoading: false,
        error: `Failed to remove parcel: ${error.message || 'Unknown error'}`
      });
      setTimeout(() => set({ error: null }), 4000);
    }
  },

  // Clear active project
  clear: () => {
    set({ 
      id: null, 
      name: null, 
      selectedParcels: new Set<string>() as ParcelSet, 
      isLoading: false, 
      error: null 
    });
  },

  // Load existing parcels for a project (internal helper)
  loadProjectParcels: async (projectId: string) => {
    if (!supabase) return;

    try {
      set({ isLoading: true });
      
      const { data, error } = await supabase
        .from('project_parcels')
        .select('parcel_id')
        .eq('project_id', projectId);

      if (error) throw error;

      const parcelIds = data?.map(row => row.parcel_id) || [];
      set({ selectedParcels: new Set(parcelIds) as ParcelSet, isLoading: false });

    } catch (error) {
      set({ 
        isLoading: false,
        error: 'Failed to load project parcels'
      });
      setTimeout(() => set({ error: null }), 3000);
    }
  },
}));