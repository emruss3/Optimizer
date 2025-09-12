import React from 'react';
import { useState } from 'react';
import { Parcel } from './lib/supabase';  
import Header from './components/Header';
import MapPanel from './components/MapPanel';
import ParcelDrawer from './components/ParcelDrawer';
import { useProject } from './hooks/useProject';
import LeftNavigation from './components/LeftNavigation';
import RightDrawer from './components/RightDrawer';
import FilterModal from './components/FilterModal'; 
import { useUIStore, useKeyboardShortcuts } from './store/ui';
import { useActiveProject, toArray } from './store/project';
import CommandPalette from './components/CommandPalette';
import AppGrid from './layout/AppGrid';
import DrawerOverlay from './components/DrawerOverlay';
import RealtimeComments from './components/RealtimeComments';
import MinimalParcelDrawer from './components/MinimalParcelDrawer';

// Skip to content for screen readers
function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="skip-link"
    >
      Skip to main content
    </a>
  );
}

function App() {
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { isMobile, setIsMobile, commandPaletteOpen, setCommandPalette } = useUIStore();
  const { commentsOpen, setCommentsOpen } = useUIStore();
  const { id: activeProjectId } = useActiveProject();
  
  // Initialize keyboard shortcuts
  useKeyboardShortcuts();
  
  const { 
    project, 
    createProject, 
    addParcel, 
    removeParcel, 
    updateSiteplanConfig, 
    calculateMassing,
    clearProject 
  } = useProject();

  // Responsive breakpoint detection
  React.useEffect(() => {
    const checkBreakpoint = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkBreakpoint();
    window.addEventListener('resize', checkBreakpoint);
    return () => window.removeEventListener('resize', checkBreakpoint);
  }, [setIsMobile]);

  // Listen for parcel drawer open events from tests
  React.useEffect(() => {
    const handleOpenParcelDrawer = (event: CustomEvent) => {
      setSelectedParcel(event.detail);
      setIsDrawerOpen(true);
    };
    
    document.addEventListener('openParcelDrawer', handleOpenParcelDrawer as EventListener);
    return () => document.removeEventListener('openParcelDrawer', handleOpenParcelDrawer as EventListener);
  }, []);

  const handleParcelClick = (parcel: Parcel) => {
    // Show parcel details (active projects are handled in Map component)
    setSelectedParcel(parcel);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedParcel(null);
  };

  const handleAddToProject = (parcel: Parcel) => {
    if (project) {
      addParcel(parcel);
    }
  };


  return (
    <div className="min-h-screen h-screen flex flex-col overflow-hidden bg-gray-50">
      <SkipToContent />

      {/* Header is fixed height content */}
      <header className="flex-none">
        <Header />
      </header>

      {/* Main fills the rest */}
      <div className="flex-1 min-h-0">
        <AppGrid>
          <LeftNavigation />

          <main 
            id="main-content"
            className="relative min-w-0 bg-white flex-1 min-h-0"
            role="main" 
            aria-label="Interactive parcel map"
          >
            <MapPanel 
              onParcelClick={handleParcelClick} 
              activeProjectName={useActiveProject.getState().name}
            />
          </main>

          {/* RightDrawer stays as-is */}
          {window.innerWidth >= 1024 ? (
            <RightDrawer />
          ) : (
            <DrawerOverlay>
              <RightDrawer />
            </DrawerOverlay>
          )}
        </AppGrid>
      </div>
        
      {/* Filter Modal */}
      <FilterModal />
      
      {/* Command Palette */}
      <CommandPalette 
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPalette(false)}
      />
      
      {/* Realtime Comments Drawer */}
      {activeProjectId && commentsOpen && (
        <div className="fixed right-4 bottom-4 z-50">
          <RealtimeComments
            projectId={activeProjectId}
            onClose={() => setCommentsOpen(false)}
          />
        </div>
      )}
      
      {/* Minimal Parcel Drawer */}
      <MinimalParcelDrawer />
      
      {/* Parcel Drawer */}
      <ParcelDrawer 
        parcel={selectedParcel}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onAddToProject={handleAddToProject}
        hasActiveProject={!!project}
      />
    </div>
  );
}


export default App;