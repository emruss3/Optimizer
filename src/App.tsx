// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { useState } from 'react';
import { Parcel } from './lib/supabase';  
import Header from './components/Header';
import LandingPage from './components/LandingPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserOnboarding } from './components/UserOnboarding';
import { LoadingCard, AnalysisLoading, Toast } from './components/LoadingStates';
import { SmartNavigation } from './components/SmartNavigation';
import { MapInteractionEnhancer } from './components/MapInteractionEnhancer';
import { useProject } from './hooks/useProject';
import { useActiveProject } from './store/project';
import LeftNavigation from './components/LeftNavigation';
import RightDrawer from './components/RightDrawer';
import FilterModal from './components/FilterModal'; 
import { useUIStore, useKeyboardShortcuts } from './store/ui';
import CommandPalette from './components/CommandPalette';
import AppGrid from './layout/AppGrid';
import DrawerOverlay from './components/DrawerOverlay';
import RealtimeComments from './components/RealtimeComments';

// Shell-first performance (order-5 item 1): the landing page and header
// paint from the light shell; mapbox+deck (~650 KB gz) and every workflow
// island load on demand. The map chunk preloads on idle so entering the
// app stays instant.
const MapPanel = React.lazy(() => import('./components/MapPanel'));
const ParcelDrawer = React.lazy(() => import('./components/ParcelDrawer'));
const UnifiedWorkspace = React.lazy(() => import('./components/UnifiedWorkspace').then(m => ({ default: m.UnifiedWorkspace })));
const ProjectWorkflow = React.lazy(() => import('./components/ProjectWorkflow').then(m => ({ default: m.ProjectWorkflow })));
const SimpleProjectManager = React.lazy(() => import('./components/SimpleProjectManager').then(m => ({ default: m.SimpleProjectManager })));
const ConnectedProjectWorkflow = React.lazy(() => import('./components/ConnectedProjectWorkflow').then(m => ({ default: m.ConnectedProjectWorkflow })));
const UnifiedProjectWorkflow = React.lazy(() => import('./components/UnifiedProjectWorkflow').then(m => ({ default: m.UnifiedProjectWorkflow })));
const RealUnderwritingWorkflow = React.lazy(() => import('./components/RealUnderwritingWorkflow').then(m => ({ default: m.RealUnderwritingWorkflow })));
const WorkflowAudit = React.lazy(() => import('./components/WorkflowAudit').then(m => ({ default: m.WorkflowAudit })));
const WorkflowConnectionTest = React.lazy(() => import('./components/WorkflowConnectionTest').then(m => ({ default: m.WorkflowConnectionTest })));

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

function preloadMapOnIdle() {
  const kick = () => { void import('./components/MapPanel'); };
  if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(kick);
  else setTimeout(kick, 1200);
}

function App() {
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showUnifiedWorkspace, setShowUnifiedWorkspace] = useState(false);
  const [showProjectWorkflow, setShowProjectWorkflow] = useState(false);
  const [showSimpleProjectManager, setShowSimpleProjectManager] = useState(false);
  const [showConnectedProjectWorkflow, setShowConnectedProjectWorkflow] = useState(false);
  const [showUnifiedProjectWorkflow, setShowUnifiedProjectWorkflow] = useState(false);
  const [showRealUnderwritingWorkflow, setShowRealUnderwritingWorkflow] = useState(false);
  const [showWorkflowAudit, setShowWorkflowAudit] = useState(false);
  const [showWorkflowConnectionTest, setShowWorkflowConnectionTest] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toasts, setToasts] = useState<Array<{id: string, type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string}>>([]);
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
    // Validate parcel data before setting
    if (!parcel || !parcel.ogc_fid || !parcel.geometry) {
      console.warn('Invalid parcel data received:', parcel);
      return; // Bail out - do not set invalid parcel
    }
    
    // Ensure ogc_fid is a valid string
    const validId = String(parcel.ogc_fid);
    if (validId === 'unknown' || validId.trim() === '') {
      console.warn('Invalid parcel ID:', parcel.ogc_fid);
      return; // Bail out - do not set 'unknown' parcel
    }
    
    // Show parcel details (active projects are handled in Map component)
    setSelectedParcel(parcel);
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setSelectedParcel(null);
  };

  const handleAddToProject = async (parcel: Parcel) => {
    const { addParcel: addParcelToActiveProject } = useActiveProject.getState();
    await addParcelToActiveProject(String(parcel.ogc_fid || parcel.id), parcel);
    
    // Open the unified project workflow to continue with site planning
    setShowUnifiedProjectWorkflow(true);
    setSelectedParcel(parcel);
  };

  const handleCreateProjectFromParcel = async (parcel: Parcel) => {
    // Create a new project with the parcel's address as the name
    const projectName = `Project - ${parcel.address || 'New Development'}`;
    const newProject = createProject(projectName);
    
    // Set the new project as active first
    const { set: setActiveProject, addParcel: addParcelToActiveProject } = useActiveProject.getState();
    setActiveProject(newProject.id, newProject.name);
    
    // Add the parcel to the active project
    await addParcelToActiveProject(String(parcel.ogc_fid || parcel.id), parcel);
    
    // Close the parcel drawer and open the unified project workflow
    setIsDrawerOpen(false);
    setSelectedParcel(parcel);
    setShowUnifiedProjectWorkflow(true);
  };

  const handleViewDemo = () => {
    // For now, just hide landing page - in real app would show demo
    setShowLandingPage(false);
  };

  const showToast = (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleGetStarted = () => {
    setShowLandingPage(false);
    setShowOnboarding(true);
  };

  const handleOpenUnifiedWorkspace = () => {
    setShowUnifiedWorkspace(true);
  };

  const handleCloseUnifiedWorkspace = () => {
    setShowUnifiedWorkspace(false);
  };

  const handleOpenProjectWorkflow = () => {
    setShowProjectWorkflow(true);
  };

  const handleCloseProjectWorkflow = () => {
    setShowProjectWorkflow(false);
  };

  const handleOpenSimpleProjectManager = () => {
    setShowSimpleProjectManager(true);
  };

  const handleCloseSimpleProjectManager = () => {
    setShowSimpleProjectManager(false);
  };

  const handleOpenConnectedProjectWorkflow = () => {
    setShowConnectedProjectWorkflow(true);
  };

  const handleCloseConnectedProjectWorkflow = () => {
    setShowConnectedProjectWorkflow(false);
  };

  const handleOpenWorkflowAudit = () => {
    setShowWorkflowAudit(true);
  };

  const handleCloseWorkflowAudit = () => {
    setShowWorkflowAudit(false);
  };

  const handleOpenWorkflowConnectionTest = () => {
    setShowWorkflowConnectionTest(true);
  };

  const handleCloseWorkflowConnectionTest = () => {
    setShowWorkflowConnectionTest(false);
  };


  const handleOpenUnifiedProjectWorkflow = () => {
    setShowUnifiedProjectWorkflow(true);
  };

  const handleCloseUnifiedProjectWorkflow = () => {
    setShowUnifiedProjectWorkflow(false);
  };

  const handleOpenRealUnderwritingWorkflow = () => {
    setShowRealUnderwritingWorkflow(true);
  };

  const handleCloseRealUnderwritingWorkflow = () => {
    setShowRealUnderwritingWorkflow(false);
  };


  // Show landing page if no active project and landing page is enabled
  React.useEffect(() => { preloadMapOnIdle(); }, []);

  if (showLandingPage && !activeProjectId) {
    return (
      <LandingPage 
        onGetStarted={handleGetStarted}
        onViewDemo={handleViewDemo}
      />
    );
  }

  return (
    <React.Suspense fallback={<div className="h-screen flex items-center justify-center text-sm text-gray-500">Loading workspace…</div>}>
    <ErrorBoundary>
      <div className="min-h-screen h-screen flex flex-col overflow-hidden bg-gray-50">
        <SkipToContent />

        {/* Header is fixed height content */}
        <header className="flex-none">
        <Header
          onOpenUnifiedWorkspace={handleOpenUnifiedWorkspace}
          onOpenProjectWorkflow={handleOpenProjectWorkflow}
          onOpenSimpleProjectManager={handleOpenSimpleProjectManager}
          onOpenConnectedProjectWorkflow={handleOpenConnectedProjectWorkflow}
          onOpenUnifiedProjectWorkflow={handleOpenUnifiedProjectWorkflow}
          onOpenRealUnderwritingWorkflow={handleOpenRealUnderwritingWorkflow}
          onOpenWorkflowAudit={handleOpenWorkflowAudit}
          onOpenWorkflowConnectionTest={handleOpenWorkflowConnectionTest}
        />
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
      
      {/* Parcel Drawer */}
      <ParcelDrawer 
        parcel={selectedParcel}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onAddToProject={handleAddToProject}
        hasActiveProject={!!project}
        onCreateProjectFromParcel={handleCreateProjectFromParcel}
      />

      {/* User Onboarding */}
      <UserOnboarding
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={() => setShowOnboarding(false)}
      />

      {/* Unified Workspace */}
      <UnifiedWorkspace
        isOpen={showUnifiedWorkspace}
        onClose={handleCloseUnifiedWorkspace}
        selectedParcel={selectedParcel}
        onParcelSelect={setSelectedParcel}
      />

      {/* Project Workflow */}
      <ProjectWorkflow
        isOpen={showProjectWorkflow}
        onClose={handleCloseProjectWorkflow}
        selectedParcel={selectedParcel}
        onParcelSelect={setSelectedParcel}
      />

      {/* Simple Project Manager */}
      <SimpleProjectManager
        isOpen={showSimpleProjectManager}
        onClose={handleCloseSimpleProjectManager}
        selectedParcel={selectedParcel}
        onParcelSelect={setSelectedParcel}
      />

      {/* Connected Project Workflow */}
      <ConnectedProjectWorkflow
        isOpen={showConnectedProjectWorkflow}
        onClose={handleCloseConnectedProjectWorkflow}
        selectedParcel={selectedParcel}
        onParcelSelect={setSelectedParcel}
      />

        {/* Unified Project Workflow */}
        <UnifiedProjectWorkflow
          isOpen={showUnifiedProjectWorkflow}
          onClose={handleCloseUnifiedProjectWorkflow}
          selectedParcel={selectedParcel}
          onParcelSelect={setSelectedParcel}
        />

        {/* Real Underwriting Workflow */}
        <RealUnderwritingWorkflow
          isOpen={showRealUnderwritingWorkflow}
          onClose={handleCloseRealUnderwritingWorkflow}
          selectedParcel={selectedParcel}
          onParcelSelect={setSelectedParcel}
        />

      {/* Map Interaction Enhancer */}
      <MapInteractionEnhancer
        isProjectWorkflowOpen={showConnectedProjectWorkflow}
        selectedParcel={selectedParcel}
        onParcelSelect={setSelectedParcel}
      />

      {/* Workflow Audit */}
      <WorkflowAudit
        isOpen={showWorkflowAudit}
        onClose={handleCloseWorkflowAudit}
      />

      {/* Workflow Connection Test */}
      <WorkflowConnectionTest
        isOpen={showWorkflowConnectionTest}
        onClose={handleCloseWorkflowConnectionTest}
      />

      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            type={toast.type}
            title={toast.title}
            message={toast.message}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      </div>
    </ErrorBoundary>
    </React.Suspense>
  );
}


export default App;