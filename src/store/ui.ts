// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { create } from 'zustand';
import CommandPalette from '../components/CommandPalette';
import { SelectedParcel } from '../types/parcel';

type Drawer = 'PROJECT' | 'UNDERWRITING' | 'SCENARIO_COMPARE' | 'PARCEL' | null;
type FilterMode = 'all' | 'large' | 'huge';
type ColorMode = 'size' | 'zoning';
type SelectionMode = 'single' | 'multi';

interface ZoningFilters {
  activeZones: string[];
}

interface UIState {
  // Drawer management
  openDrawer: Drawer;
  setDrawer: (drawer: Drawer) => void;
  closeDrawer: () => void;
  
  // Parcel drawer state
  selectedParcel: SelectedParcel | null;
  setSelectedParcel: (parcel: SelectedParcel | null) => void;
  
  // Filter modal
  filterModalOpen: boolean;
  setFilterModal: (open: boolean) => void;
  
  // Map controls state
  filterMode: FilterMode;
  colorMode: ColorMode;
  zoningFilters: ZoningFilters;
  selectionMode: SelectionMode;
  selectedParcelIds: string[];
  setFilterMode: (mode: FilterMode) => void;
  setColorMode: (mode: ColorMode) => void;
  setZoningFilters: (filters: ZoningFilters) => void;
  setSelectionMode: (mode: SelectionMode) => void;
  addSelectedParcel: (id: string) => void;
  removeSelectedParcel: (id: string) => void;
  clearSelectedParcels: () => void;
  
  // Mobile state
  leftNavOpen: boolean;
  setLeftNavOpen: (open: boolean) => void;
  
  // Responsive breakpoint
  isMobile: boolean;
  setIsMobile: (mobile: boolean) => void;
  
  // Command palette
  commandPaletteOpen: boolean;
  setCommandPalette: (open: boolean) => void;
  
  // Comments
  commentsOpen: boolean;
  setCommentsOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  // Drawer management - only one can be open at a time
  openDrawer: null,
  setDrawer: (drawer) => set({ openDrawer: drawer }),
  closeDrawer: () => set({ openDrawer: null }),
  
  // Parcel drawer
  selectedParcel: null,
  setSelectedParcel: (selectedParcel) => set({ selectedParcel }),
  
  // Filter modal
  filterModalOpen: false,
  setFilterModal: (open) => set({ filterModalOpen: open }),
  
  // Map controls
  filterMode: 'all',
  colorMode: 'zoning',
  zoningFilters: { activeZones: [] },
  selectionMode: 'single',
  selectedParcelIds: [],
  setFilterMode: (mode) => set({ filterMode: mode }),
  setColorMode: (mode) => set({ colorMode: mode }),
  setZoningFilters: (filters) => set({ zoningFilters: filters }),
  setSelectionMode: (mode) => set({ selectionMode: mode }),
  addSelectedParcel: (id) => set((state) => ({
    selectedParcelIds: [...state.selectedParcelIds.filter(existingId => existingId !== id), id]
  })),
  removeSelectedParcel: (id) => set((state) => ({
    selectedParcelIds: state.selectedParcelIds.filter(existingId => existingId !== id)
  })),
  clearSelectedParcels: () => set({ selectedParcelIds: [] }),
  
  // Mobile navigation
  leftNavOpen: false,
  setLeftNavOpen: (open) => set({ leftNavOpen: open }),
  
  // Responsive
  isMobile: false,
  setIsMobile: (mobile) => set({ isMobile: mobile }),
  
  // Command palette
  commandPaletteOpen: false,
  setCommandPalette: (open) => set({ commandPaletteOpen: open }),
  
  // Comments
  commentsOpen: false,
  setCommentsOpen: (open) => set({ commentsOpen: open }),
}));

// Keyboard shortcuts
export const useKeyboardShortcuts = () => {
  const { openDrawer, setDrawer, closeDrawer, setFilterModal, setCommandPalette, commandPaletteOpen } = useUIStore();
  
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // /c opens comments
      // Esc closes current drawer or modal
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          setCommandPalette(false);
        } else if (useUIStore.getState().filterModalOpen) {
          setFilterModal(false);
        } else {
          closeDrawer();
        }
        return;
      }
      
      // Cmd/Ctrl+K opens command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPalette(true);
        return;
      }
      
      // /c opens comments
      if (e.key === '/' && e.shiftKey && e.code === 'KeyC') {
        e.preventDefault();
        useUIStore.getState().setCommentsOpen(true);
        return;
      }
      
      // Ctrl+Shift+[ / ] cycles between tabs
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === '[') {
          e.preventDefault();
          if (openDrawer === 'PROJECT') {
            setDrawer('UNDERWRITING');
          } else {
            setDrawer('PROJECT');
          }
        } else if (e.key === ']') {
          e.preventDefault();
          if (openDrawer === 'UNDERWRITING') {
            setDrawer('PROJECT');
          } else {
            setDrawer('UNDERWRITING');
          }
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openDrawer, setDrawer, closeDrawer, setFilterModal, setCommandPalette, commandPaletteOpen]);
};