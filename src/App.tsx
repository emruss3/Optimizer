// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { useState } from 'react';
import { Parcel } from './lib/supabase';  
import Header from './components/Header';
import MapPanel from './components/MapPanel';
import ParcelDrawer from './components/ParcelDrawer';
import LandingPage from './components/LandingPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserOnboarding } from './components/UserOnboarding';
import { LoadingCard, AnalysisLoading, Toast } from './components/LoadingStates';
import { UnifiedWorkspace } from './components/UnifiedWorkspace';
import { SmartNavigation } from './components/SmartNavigation';
import { ProjectWorkflow } from './components/ProjectWorkflow';
import { SimpleProjectManager } from './components/SimpleProjectManager';
import { ConnectedProjectWorkflow } from './components/ConnectedProjectWorkflow';
import { UnifiedProjectWorkflow } from './components/UnifiedProjectWorkflow';
import { RealUnderwritingWorkflow } from './components/RealUnderwritingWorkflow';
import { MapInteractionEnhancer } from './components/MapInteractionEnhancer';
import { WorkflowAudit } from './components/WorkflowAudit';
import { WorkflowConnectionTest } from './components/WorkflowConnectionTest';
import { ParcelAnalysisDemo } from './components/ParcelAnalysisDemo';
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
  const [showParcelAnalysisDemo, setShowParcelAnalysisDemo] = useState(false);
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

  const handleOpenParcelAnalysisDemo = () => {
    setShowParcelAnalysisDemo(true);
  };

  const handleCloseParcelAnalysisDemo = () => {
    setShowParcelAnalysisDemo(false);
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
  if (showLandingPage && !activeProjectId) {
    return (
      <LandingPage 
        onGetStarted={handleGetStarted}
        onViewDemo={handleViewDemo}
      />
    );
  }

  return (
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
          onOpenParcelAnalysisDemo={handleOpenParcelAnalysisDemo}
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

      {/* Parcel Analysis Demo */}
      {showParcelAnalysisDemo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Parcel Analysis Demo</h2>
              <button
                onClick={handleCloseParcelAnalysisDemo}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <ParcelAnalysisDemo />
          </div>
        </div>
      )}

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
  );
}


export default App;