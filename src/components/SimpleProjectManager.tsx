import React, { useState, useEffect } from 'react';
import { 
  Plus,
  Building2,
  Map,
  BarChart3,
  Calculator,
  Target,
  CheckCircle,
  ArrowRight,
  Eye,
  Edit3,
  Save,
  Share,
  X,
  Zap,
  TrendingUp,
  DollarSign,
  Building,
  Car,
  AlertCircle,
  Lightbulb
} from 'lucide-react';
import { useActiveProject } from '../store/project';
import { SelectedParcel } from '../types/parcel';

interface SimpleProjectManagerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel?: SelectedParcel | null;
  onParcelSelect?: (parcel: SelectedParcel) => void;
}

export function SimpleProjectManager({ 
  isOpen, 
  onClose, 
  selectedParcel, 
  onParcelSelect 
}: SimpleProjectManagerProps) {
  const [currentStep, setCurrentStep] = useState<'discover' | 'analyze' | 'plan' | 'model' | 'compare'>('discover');
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const { activeProjectId, activeProjectName, parcelIds: selectedParcelIds, addParcel } = useActiveProject();

  // Auto-advance workflow based on user actions
  useEffect(() => {
    if (selectedParcel && currentStep === 'discover') {
      setCurrentStep('analyze');
    }
  }, [selectedParcel, currentStep]);

  const handleAddParcelToProject = async (parcel: SelectedParcel) => {
    if (!activeProjectId) {
      // Create new project first
      setIsCreatingProject(true);
      // Simulate project creation
      setTimeout(() => {
        setIsCreatingProject(false);
        setSelectedParcels(prev => [...prev, parcel]);
        setCurrentStep('analyze');
      }, 1000);
    } else {
      // Add to existing project
      try {
        await addParcel(parcel.ogc_fid || parcel.id);
        setSelectedParcels(prev => [...prev, parcel]);
        setCurrentStep('analyze');
      } catch (error) {
        console.error('Failed to add parcel to project:', error);
      }
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
        gsf: 45000,
        estimatedValue: 12500000,
        developmentCost: 8500000
      });
      setIsAnalyzing(false);
      setCurrentStep('plan');
    }, 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4">
      <div className="bg-white w-full lg:max-w-4xl lg:max-h-[90vh] lg:rounded-2xl shadow-2xl flex flex-col h-full lg:h-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-lg bg-green-100">
              <Building2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                Project Workflow
              </h2>
              <p className="text-sm text-gray-600">
                {activeProjectId ? `Active: ${activeProjectName}` : 'Create a new development project'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workflow Progress */}
        <div className="px-4 lg:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {[
              { id: 'discover', label: 'Discover', icon: <Map className="w-4 h-4" />, color: 'blue' },
              { id: 'analyze', label: 'Analyze', icon: <BarChart3 className="w-4 h-4" />, color: 'green' },
              { id: 'plan', label: 'Plan', icon: <Building2 className="w-4 h-4" />, color: 'purple' },
              { id: 'model', label: 'Model', icon: <Calculator className="w-4 h-4" />, color: 'orange' },
              { id: 'compare', label: 'Compare', icon: <Target className="w-4 h-4" />, color: 'indigo' }
            ].map((step, index) => {
              const isActive = currentStep === step.id;
              const isCompleted = ['discover', 'analyze', 'plan', 'model', 'compare'].indexOf(currentStep) > index;
              
              return (
                <div key={step.id} className="flex items-center">
                  <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive 
                      ? `bg-${step.color}-100 text-${step.color}-700` 
                      : isCompleted
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-500'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      step.icon
                    )}
                    <span className="hidden sm:inline">{step.label}</span>
                  </div>
                  {index < 4 && (
                    <div className="w-8 h-px bg-gray-300 mx-2"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {currentStep === 'discover' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Map className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Discover Development Opportunities
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Click any parcel on the map to explore its development potential. 
                  Our AI will analyze zoning, market trends, and financial projections.
                </p>
                
                {selectedParcel ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      <div className="text-left">
                        <h4 className="font-medium text-blue-900">{selectedParcel.address}</h4>
                        <p className="text-sm text-blue-700">{selectedParcel.zoning} • {selectedParcel.sqft?.toLocaleString()} sqft</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddParcelToProject(selectedParcel)}
                      disabled={isCreatingProject}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center space-x-2"
                    >
                      {isCreatingProject ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Creating Project...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Add to Project</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Click a parcel on the map to get started
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'analyze' && (
            <div className="p-4 lg:p-6">
              {selectedParcel ? (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-4">
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
                          className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center space-x-2"
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
                        <button
                          onClick={() => setCurrentStep('plan')}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center space-x-2"
                        >
                          <ArrowRight className="w-4 h-4" />
                          <span>Continue to Planning</span>
                        </button>
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

          {currentStep === 'plan' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Building2 className="w-16 h-16 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Plan Your Development
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Design your site layout with our CAD-like tools. Add buildings, 
                  parking, and amenities to optimize your development.
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
                
                <button
                  onClick={() => setCurrentStep('model')}
                  className="mt-6 w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Continue to Financial Modeling</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 'model' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Calculator className="w-16 h-16 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Financial Modeling
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
                
                <button
                  onClick={() => setCurrentStep('compare')}
                  className="mt-6 w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Continue to Comparison</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 'compare' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Target className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Compare Scenarios
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Create multiple development scenarios and compare their financial 
                  performance, design efficiency, and market potential.
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
              {activeProjectId ? (
                <span>Project: <strong>{activeProjectName}</strong> ({selectedParcelIds.length} parcels)</span>
              ) : (
                <span>No active project</span>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center space-x-2">
                <Save className="w-4 h-4" />
                <span>Save Work</span>
              </button>
              
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center space-x-2">
                <Share className="w-4 h-4" />
                <span>Generate Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
