import React from 'react';
import { X, Building2, Calculator, ArrowLeftRight, Combine } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { useProject } from '../hooks/useProject';
import { useUnderwriting } from '../hooks/useUnderwriting';
import ProjectPanel from './ProjectPanel';
import UnderwritingPanel from './UnderwritingPanel';
import ScenarioCompare from './ScenarioCompare';
import AssemblagePanel from './AssemblagePanel';

export default function RightDrawer() {
  const { openDrawer, setDrawer, closeDrawer, isMobile } = useUIStore();
  const { project, calculateMassing } = useProject();
  
  // Mobile overlay behavior
  const isMobileOverlay = window.innerWidth < 1024;
  
  // Focus trap for accessibility
  const drawerRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (openDrawer && drawerRef.current) {
      const focusableElements = drawerRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      
      const handleTabTrap = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              e.preventDefault();
              lastElement?.focus();
            }
          } else {
            if (document.activeElement === lastElement) {
              e.preventDefault();
              firstElement?.focus();
            }
          }
        }
      };
      
      document.addEventListener('keydown', handleTabTrap);
      firstElement?.focus();
      
      return () => document.removeEventListener('keydown', handleTabTrap);
    }
  }, [openDrawer]);

  if (!openDrawer) return null;

  return (
    <>
      {/* Backdrop for mobile overlay */}
      {isMobileOverlay && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={closeDrawer}
          style={{ pointerEvents: 'auto' }}
        />
      )}
      
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className={`
          bg-white border-l border-gray-200 
          ${isMobileOverlay 
            ? 'fixed right-0 top-0 h-full w-full max-w-md z-30 transform transition-transform duration-300 ease-in-out' 
            : 'relative w-96 h-full'
          }
        `}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        data-testid="right-drawer"
      >
        {/* Header with tabs */}
        <div className="border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between p-4">
            <h2 id="drawer-title" className="text-lg font-bold text-gray-900">
              Project Analysis
            </h2>
            <button
              onClick={closeDrawer}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
              aria-label="Close drawer"
              data-testid="drawer-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Tab Bar */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setDrawer('PROJECT')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors focus-ring ${
                openDrawer === 'PROJECT'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-current={openDrawer === 'PROJECT' ? 'page' : undefined}
              data-testid="project-tab"
            >
              <Building2 className="w-4 h-4" />
              <span>Parcels</span>
            </button>
            <button
              onClick={() => setDrawer('UNDERWRITING')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors focus-ring ${
                openDrawer === 'UNDERWRITING'
                  ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-current={openDrawer === 'UNDERWRITING' ? 'page' : undefined}
              data-testid="underwriting-tab"
            >
              <Calculator className="w-4 h-4" />
              <span>Underwriting</span>
            </button>
            <button
              onClick={() => setDrawer('SCENARIO_COMPARE')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors focus-ring ${
                openDrawer === 'SCENARIO_COMPARE'
                  ? 'border-b-2 border-purple-600 text-purple-600 bg-purple-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-current={openDrawer === 'SCENARIO_COMPARE' ? 'page' : undefined}
              data-testid="scenario-compare-tab"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span className="hidden sm:inline">Compare</span>
            </button>
            <button
              onClick={() => setDrawer('ASSEMBLAGE')}
              className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 text-sm font-medium transition-colors focus-ring ${
                openDrawer === 'ASSEMBLAGE'
                  ? 'border-b-2 border-orange-600 text-orange-600 bg-orange-50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
              aria-current={openDrawer === 'ASSEMBLAGE' ? 'page' : undefined}
              data-testid="assemblage-tab"
            >
              <Combine className="w-4 h-4" />
              <span className="hidden sm:inline">Assemblage</span>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {openDrawer === 'PROJECT' && (
            <ProjectPanel />
          )}
          {openDrawer === 'UNDERWRITING' && (
            <UnderwritingPanel />
          )}
          {openDrawer === 'SCENARIO_COMPARE' && (
            <ScenarioCompare
              forSaleResults={null} // TODO: Connect to actual results
              rentalResults={null}  // TODO: Connect to actual results
              project={project}
              massing={calculateMassing}
            />
          )}
          {openDrawer === 'ASSEMBLAGE' && (
            <AssemblagePanel />
          )}
        </div>
      </div>
    </>
  );
}