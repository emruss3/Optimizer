import React, { useState, useEffect } from 'react';
import { 
  Map, 
  Building2, 
  BarChart3, 
  Calculator, 
  Target,
  ArrowRight,
  Plus,
  Eye,
  Edit3,
  Save,
  Share,
  Download,
  X,
  ChevronRight,
  Play,
  Zap,
  TrendingUp,
  DollarSign,
  Building,
  Car,
  TreePine
} from 'lucide-react';
import { useActiveProject } from '../store/project';
import { useUIStore } from '../store/ui';
import { SelectedParcel } from '../types/parcel';

interface UnifiedWorkspaceProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel?: SelectedParcel | null;
  onParcelSelect?: (parcel: SelectedParcel) => void;
}

type WorkspaceMode = 'explore' | 'analyze' | 'design' | 'financial' | 'compare';

export function UnifiedWorkspace({ 
  isOpen, 
  onClose, 
  selectedParcel, 
  onParcelSelect 
}: UnifiedWorkspaceProps) {
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('explore');
  const [activeStep, setActiveStep] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  
  const { activeProjectId, activeProjectName, parcelIds: selectedParcelIds } = useActiveProject();
  const { setDrawer } = useUIStore();

  // Auto-advance workflow based on user actions
  useEffect(() => {
    if (selectedParcel && activeMode === 'explore') {
      setActiveMode('analyze');
      setActiveStep(1);
    }
  }, [selectedParcel, activeMode]);

  const workflowSteps = {
    explore: {
      title: 'Explore Properties',
      description: 'Click parcels on the map to discover development opportunities',
      icon: <Map className="w-6 h-6" />,
      color: 'blue',
      actions: [
        { label: 'Click any parcel', icon: <Target className="w-4 h-4" /> },
        { label: 'View property details', icon: <Eye className="w-4 h-4" /> }
      ]
    },
    analyze: {
      title: 'AI Analysis',
      description: 'Get instant insights on development potential and market trends',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'green',
      actions: [
        { label: 'Run HBU Analysis', icon: <TrendingUp className="w-4 h-4" /> },
        { label: 'Market Insights', icon: <Zap className="w-4 h-4" /> }
      ]
    },
    design: {
      title: 'Site Planning',
      description: 'Design your development with CAD-like precision',
      icon: <Building2 className="w-6 h-6" />,
      color: 'purple',
      actions: [
        { label: 'Add Buildings', icon: <Building className="w-4 h-4" /> },
        { label: 'Design Layout', icon: <Edit3 className="w-4 h-4" /> }
      ]
    },
    financial: {
      title: 'Financial Modeling',
      description: 'Calculate ROI, IRR, and cash flow projections',
      icon: <Calculator className="w-6 h-6" />,
      color: 'orange',
      actions: [
        { label: 'Run Underwriting', icon: <DollarSign className="w-4 h-4" /> },
        { label: 'View Projections', icon: <BarChart3 className="w-4 h-4" /> }
      ]
    },
    compare: {
      title: 'Compare Scenarios',
      description: 'Evaluate multiple development options side-by-side',
      icon: <Target className="w-6 h-6" />,
      color: 'indigo',
      actions: [
        { label: 'Create Scenarios', icon: <Plus className="w-4 h-4" /> },
        { label: 'Compare Results', icon: <BarChart3 className="w-4 h-4" /> }
      ]
    }
  };

  const handleModeChange = (mode: WorkspaceMode) => {
    setActiveMode(mode);
    setActiveStep(0);
  };

  const handleNextStep = () => {
    const modes = ['explore', 'analyze', 'design', 'financial', 'compare'];
    const currentIndex = modes.indexOf(activeMode);
    if (currentIndex < modes.length - 1) {
      setActiveMode(modes[currentIndex + 1] as WorkspaceMode);
      setActiveStep(0);
    }
  };

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    // Simulate analysis
    setTimeout(() => {
      setAnalysisResults({
        hbu: 'Mixed-Use Residential',
        confidence: 85,
        roi: 18.5,
        units: 24,
        gsf: 45000
      });
      setIsAnalyzing(false);
      setActiveMode('design');
    }, 2000);
  };

  if (!isOpen) return null;

  const currentStep = workflowSteps[activeMode];
  const isProjectActive = !!activeProjectId;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4">
      <div className="bg-white w-full lg:max-w-6xl lg:max-h-[90vh] lg:rounded-2xl shadow-2xl flex flex-col h-full lg:h-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className={`p-2 rounded-lg bg-${currentStep.color}-100`}>
              {currentStep.icon}
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                {currentStep.title}
              </h2>
              <p className="text-sm text-gray-600">{currentStep.description}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Navigation */}
        <div className="px-4 lg:px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex space-x-1">
              {Object.entries(workflowSteps).map(([mode, step], index) => {
                const isActive = activeMode === mode;
                const isCompleted = Object.keys(workflowSteps).indexOf(activeMode) > index;
                
                return (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode as WorkspaceMode)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive 
                        ? `bg-${step.color}-100 text-${step.color}-700` 
                        : isCompleted
                          ? 'bg-green-100 text-green-700'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {step.icon}
                    <span className="hidden sm:inline">{step.title}</span>
                  </button>
                );
              })}
            </div>
            
            {activeMode !== 'compare' && (
              <button
                onClick={handleNextStep}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {activeMode === 'explore' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-12">
                <Map className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Explore Nashville Properties
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Click any parcel on the map to view property details, zoning information, 
                  and development potential. Our AI will analyze each property for you.
                </p>
                
                {selectedParcel ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      <div className="text-left">
                        <p className="font-medium text-blue-900">{selectedParcel.address}</p>
                        <p className="text-sm text-blue-700">{selectedParcel.zoning} • {selectedParcel.sqft?.toLocaleString()} sqft</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Click a parcel to get started
                  </div>
                )}
              </div>
            </div>
          )}

          {activeMode === 'analyze' && (
            <div className="p-4 lg:p-6">
              {selectedParcel ? (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                      <div>
                        <h4 className="font-medium text-green-900">{selectedParcel.address}</h4>
                        <p className="text-sm text-green-700">{selectedParcel.zoning} • {selectedParcel.sqft?.toLocaleString()} sqft</p>
                      </div>
                    </div>
                    
                    {!analysisResults ? (
                      <div className="space-y-4">
                        <p className="text-sm text-green-700">
                          Ready to analyze this property? Our AI will evaluate development potential, 
                          market trends, and financial projections.
                        </p>
                        <button
                          onClick={handleRunAnalysis}
                          disabled={isAnalyzing}
                          className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center space-x-2"
                        >
                          {isAnalyzing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Analyzing...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              <span>Run AI Analysis</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{analysisResults.roi}%</div>
                            <div className="text-xs text-green-700">Projected ROI</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{analysisResults.units}</div>
                            <div className="text-xs text-green-700">Units</div>
                          </div>
                        </div>
                        <div className="text-sm text-green-700">
                          <strong>Recommended Use:</strong> {analysisResults.hbu}
                        </div>
                        <div className="text-sm text-green-700">
                          <strong>Confidence:</strong> {analysisResults.confidence}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <BarChart3 className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Select a Property to Analyze
                  </h3>
                  <p className="text-gray-600">
                    Choose a parcel from the map to run our AI-powered analysis
                  </p>
                </div>
              )}
            </div>
          )}

          {activeMode === 'design' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Design Your Development
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Use our CAD-like site planner to design buildings, parking, and amenities. 
                  Optimize your layout for maximum value.
                </p>
                
                <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <Building className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                    <div className="text-sm font-medium">Add Buildings</div>
                  </button>
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    <Car className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                    <div className="text-sm font-medium">Add Parking</div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMode === 'financial' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-12">
                <Calculator className="w-16 h-16 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Financial Analysis
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Calculate detailed financial projections including ROI, IRR, 
                  cash flow, and development costs.
                </p>
                
                <div className="space-y-3 max-w-md mx-auto">
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <DollarSign className="w-5 h-5 text-orange-600" />
                      <div>
                        <div className="font-medium">Run Underwriting</div>
                        <div className="text-sm text-gray-600">Calculate detailed financial projections</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="w-5 h-5 text-orange-600" />
                      <div>
                        <div className="font-medium">Market Analysis</div>
                        <div className="text-sm text-gray-600">Compare with similar properties</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMode === 'compare' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-12">
                <Target className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Compare Scenarios
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Create multiple development scenarios and compare their financial performance, 
                  design efficiency, and market potential.
                </p>
                
                <div className="space-y-3 max-w-md mx-auto">
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <Plus className="w-5 h-5 text-indigo-600" />
                      <div>
                        <div className="font-medium">Create New Scenario</div>
                        <div className="text-sm text-gray-600">Design an alternative development plan</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="w-5 h-5 text-indigo-600" />
                      <div>
                        <div className="font-medium">Compare Results</div>
                        <div className="text-sm text-gray-600">Side-by-side financial comparison</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 lg:p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {isProjectActive ? (
                <span>Project: <strong>{activeProjectName}</strong> ({selectedParcelIds.length} parcels)</span>
              ) : (
                <span>No active project</span>
              )}
            </div>
            
            <div className="flex space-x-3">
              {!isProjectActive && (
                <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
                  Create Project
                </button>
              )}
              
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center space-x-2">
                <Save className="w-4 h-4" />
                <span>Save Work</span>
              </button>
              
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center space-x-2">
                <Play className="w-4 h-4" />
                <span>Generate Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
