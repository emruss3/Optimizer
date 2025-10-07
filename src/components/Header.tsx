// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { Map, Search, Filter, Settings, Building2, Calculator, ArrowLeftRight, Share, Command } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { useParcelSelection } from '../hooks/useParcelSelection';
import { useActiveProject } from '../store/project';
import Guard from './Guard';
import ShareInviteDialog from './ShareInviteDialog';
import { MessageCircle } from 'lucide-react';

interface HeaderProps {
  onOpenUnifiedWorkspace?: () => void;
  onOpenProjectWorkflow?: () => void;
  onOpenSimpleProjectManager?: () => void;
  onOpenConnectedProjectWorkflow?: () => void;
  onOpenUnifiedProjectWorkflow?: () => void;
  onOpenRealUnderwritingWorkflow?: () => void;
  onOpenWorkflowAudit?: () => void;
  onOpenWorkflowConnectionTest?: () => void;
}

export default function Header({ onOpenUnifiedWorkspace, onOpenProjectWorkflow, onOpenSimpleProjectManager, onOpenConnectedProjectWorkflow, onOpenUnifiedProjectWorkflow, onOpenRealUnderwritingWorkflow, onOpenWorkflowAudit, onOpenWorkflowConnectionTest }: HeaderProps) {
  const { setDrawer, setFilterModal, openDrawer, setCommandPalette } = useUIStore();
  const { activeProjectId, activeProjectName } = useParcelSelection();
  const { set: setActiveProject, clear: clearActiveProject } = useActiveProject();
  const [showShareDialog, setShowShareDialog] = React.useState(false);
  const [unreadComments, setUnreadComments] = React.useState(0);
  const [showLandingPage, setShowLandingPage] = React.useState(false);
  
  // Mock unread comments - in real app would come from realtime subscription
  React.useEffect(() => {
    if (activeProjectId) {
      // Simulate unread comments
      setUnreadComments(Math.floor(Math.random() * 5));
    } else {
      setUnreadComments(0);
    }
  }, [activeProjectId]);
  
  // Mock projects - in real app, this would come from Supabase
  const [showProjectMenu, setShowProjectMenu] = React.useState(false);
  const mockProjects = [
    { id: 'demo-1', name: 'Demo Project' },
    { id: 'nashville-dev', name: 'Nashville Development' },
    { id: 'mixed-use-23', name: 'Mixed Use 2023' },
  ];

  const handleProjectSelect = (project: { id: string; name: string }) => {
    if (activeProjectId === project.id) {
      // Deactivate current project
      clearActiveProject();
    } else {
      // Activate new project
      setActiveProject(project.id, project.name);
    }
    setShowProjectMenu(false);
  };

  return (
    <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex-shrink-0">
      <div className="flex items-center justify-between">
        {/* Logo and Title */}
        <div className="flex items-center space-x-3 min-w-0 flex-shrink-0">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Map className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Parcel Intelligence</h1>
            <p className="text-sm text-gray-600 hidden sm:block">Real Estate Investment Platform</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-md mx-4 md:mx-8 hidden lg:block" data-testid="desktop-search">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by address, parcel ID, or coordinates..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus-ring"
              aria-label="Search parcels"
              data-testid="search-input"
              onClick={() => setCommandPalette(true)}
              readOnly
            />
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <kbd className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">⌘K</kbd>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 md:space-x-3 flex-shrink-0 kpi-bar" data-testid="header-actions">
          {/* KPI Bar with flex-wrap for responsive behavior */}
          <div className="hidden md:flex items-center space-x-2 text-sm text-gray-600 flex-wrap">
            <span data-testid="location-indicator">{activeProjectId ? `Active: ${activeProjectName}` : 'Nashville Metro'}</span>
            <span>•</span>
            <span>Real-time Data</span>
          </div>
          
          {/* Navigation Divider */}
          <div className="hidden md:block w-px h-6 bg-gray-300 mx-2"></div>
          
          {/* Project dropdown */}
          <div className="relative">
            <button 
              onClick={() => setShowProjectMenu(!showProjectMenu)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                activeProjectId 
                  ? 'bg-green-100 text-green-700 border border-green-200' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              data-testid="project-dropdown"
            >
              <Building2 className="w-4 h-4" />
              <span className="text-sm hidden md:inline" data-testid="active-project-name">
                {activeProjectId ? activeProjectName : 'Project'}
              </span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* Project dropdown menu */}
            {showProjectMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50" data-testid="project-menu">
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-500 px-3 py-2 uppercase tracking-wider">
                    Select Project
                  </div>
                  {mockProjects.map((project) => (
                    <button
                      key={project.id}
                      onClick={() => handleProjectSelect(project)}
                      className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                        activeProjectId === project.id
                          ? 'bg-green-100 text-green-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      data-testid={`project-${project.id}`}
                    >
                      {project.name}
                    </button>
                  ))}
                  <hr className="my-2" />
                  <button
                    onClick={() => {
                      clearActiveProject();
                      setShowProjectMenu(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm rounded-md text-gray-500 hover:bg-gray-100"
                    data-testid="no-active-project"
                  >
                    No Active Project
                  </button>
                </div>
              </div>
            )}
          </div>
          
        {/* Unified Project Workflow button */}
        <button
          onClick={onOpenUnifiedProjectWorkflow}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium bg-green-600 text-white hover:bg-green-700"
          data-testid="unified-project-workflow-button"
          title="Open unified project workflow"
          aria-label="Open unified project workflow"
        >
          <Building2 className="w-4 h-4" />
          <span className="text-sm hidden md:inline">New Project</span>
        </button>

        {/* Real Underwriting Workflow button */}
        <button
          onClick={onOpenRealUnderwritingWorkflow}
          className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium bg-purple-600 text-white hover:bg-purple-700"
          data-testid="real-underwriting-workflow-button"
          title="Open real underwriting workflow"
          aria-label="Open real underwriting workflow"
        >
          <Calculator className="w-4 h-4" />
          <span className="text-sm hidden md:inline">Underwriting</span>
        </button>

          {/* Debug: Workflow Connection Test button */}
          <button 
            onClick={onOpenWorkflowConnectionTest}
            className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium bg-gray-600 text-white hover:bg-gray-700"
            data-testid="workflow-connection-test-button"
            title="Test workflow connections"
            aria-label="Test workflow connections"
          >
            <Command className="w-4 h-4" />
            <span className="text-sm hidden md:inline">Test</span>
          </button>
          
          {/* Underwriting button */}
          <button 
            onClick={() => setDrawer(openDrawer === 'UNDERWRITING' ? null : 'UNDERWRITING')}
            className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
              openDrawer === 'UNDERWRITING' 
                ? 'bg-blue-100 text-blue-700' 
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
            data-testid="analysis-button"
            title="Financial analysis and underwriting"
            aria-label="Open financial analysis"
          >
            <Calculator className="w-4 h-4" />
            <span className="text-sm hidden md:inline">Analysis</span>
          </button>
          
          {/* Scenario Compare button - Show when project has multiple parcels */}
          {activeProjectId && (
            <button 
              onClick={() => setDrawer(openDrawer === 'SCENARIO_COMPARE' ? null : 'SCENARIO_COMPARE')}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                openDrawer === 'SCENARIO_COMPARE' 
                  ? 'bg-purple-100 text-purple-700' 
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              data-testid="scenario-compare-button"
              title="Compare development scenarios"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="text-sm hidden md:inline">Compare</span>
            </button>
          )}
          
          
          {/* Share button */}
          {activeProjectId && (
            <Guard roles={['manager']}>
              <button 
                onClick={() => setShowShareDialog(true)}
                className="flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                data-testid="share-button"
              >
                <Share className="w-4 h-4" />
                <span className="text-sm hidden md:inline">Share</span>
              </button>
            </Guard>
          )}
          
          <button
            onClick={() => setFilterModal(true)}
            className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            data-testid="filters-button"
          >
            <Filter className="w-4 h-4" />
            <span className="text-sm font-medium hidden md:inline">Filters</span>
          </button>
          
          <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring" aria-label="Settings" data-testid="header-settings">
            <Settings className="w-4 h-4" />
          </button>
          
          {/* Command Palette button */}
          <button 
            onClick={() => setCommandPalette(true)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring" 
            aria-label="Command palette"
            data-testid="command-palette-button"
          >
            <Command className="w-4 h-4" />
          </button>
          
          {/* Comments notification button */}
          {activeProjectId && (
            <button 
              className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
              aria-label="Comments"
              data-testid="comments-button"
            >
              <MessageCircle className="w-4 h-4" />
              {unreadComments > 0 && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {unreadComments > 9 ? '9+' : unreadComments}
                </div>
              )}
            </button>
          )}
          
          {/* Mobile search toggle */}
          <button className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors lg:hidden focus-ring" aria-label="Toggle search" data-testid="mobile-search-toggle">
            <Search className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Mobile search bar (hidden by default) */}
      <div className="mt-4 lg:hidden hidden" id="mobile-search" data-testid="mobile-search">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by address, parcel ID, or coordinates..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            data-testid="mobile-search-input"
            onClick={() => setCommandPalette(true)}
            readOnly
          />
        </div>
      </div>
      
      {/* Share/Invite Dialog */}
      {activeProjectId && (
        <ShareInviteDialog
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          projectId={activeProjectId}
          projectName={activeProjectName || 'Untitled Project'}
        />
      )}
    </header>
  );
}