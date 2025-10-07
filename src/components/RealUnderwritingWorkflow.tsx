import React, { useState, useEffect } from 'react';
import { 
  Map, 
  Building2, 
  BarChart3, 
  Calculator, 
  Target,
  Plus,
  CheckCircle,
  ArrowRight,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileText,
  Download,
  X,
  Zap,
  Building,
  Car,
  Lightbulb,
  Users,
  Clock,
  Percent
} from 'lucide-react';
import { useActiveProject } from '../store/project';
import { useUIStore } from '../store/ui';
import { SelectedParcel } from '../types/parcel';
import { useHBUAnalysis } from '../hooks/useHBUAnalysis';
import { useUnderwriting } from '../hooks/useUnderwriting';
import { AIDrivenSitePlanGenerator, EnhancedSitePlanner } from './adapters/SitePlannerAdapters';

interface RealUnderwritingWorkflowProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel?: SelectedParcel | null;
  onParcelSelect?: (parcel: SelectedParcel) => void;
}

type WorkflowStep = 'discover' | 'analyze' | 'underwrite' | 'scenarios' | 'decision';

export function RealUnderwritingWorkflow({ 
  isOpen, 
  onClose, 
  selectedParcel, 
  onParcelSelect 
}: RealUnderwritingWorkflowProps) {
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('discover');
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showUnderwritingPanel, setShowUnderwritingPanel] = useState(false);
  const [showScenarioComparison, setShowScenarioComparison] = useState(false);
  const [showAISitePlanGenerator, setShowAISitePlanGenerator] = useState(false);
  const [showEnhancedSitePlanner, setShowEnhancedSitePlanner] = useState(false);
  const [savedSitePlan, setSavedSitePlan] = useState<any>(null);
  
  const { activeProjectId, activeProjectName, parcelIds: selectedParcelIds, addParcel, set: setActiveProject } = useActiveProject();
  const { setDrawer } = useUIStore();
  
  // Real analysis hooks
  const { 
    analysis, 
    loading: hbuLoading, 
    error: hbuError, 
    analyzeParcel, 
    getFinancialSummary,
    getRiskFactors,
    getOpportunities
  } = useHBUAnalysis();
  
  const {
    underwritingData,
    loading: underwritingLoading,
    error: underwritingError,
    runUnderwriting,
    updateAssumptions,
    calculateMetrics
  } = useUnderwriting();

  // Auto-advance workflow based on user actions
  useEffect(() => {
    if (selectedParcel && currentStep === 'discover') {
      setCurrentStep('analyze');
    }
  }, [selectedParcel, currentStep]);

  const workflowSteps = {
    discover: {
      title: 'Discover Properties',
      description: 'Click parcels on the map to evaluate development potential',
      icon: <Map className="w-6 h-6" />,
      color: 'blue',
      status: 'active'
    },
    analyze: {
      title: 'Analyze Potential',
      description: 'AI-powered highest and best use analysis',
      icon: <BarChart3 className="w-6 h-6" />,
      color: 'green',
      status: selectedParcel ? 'active' : 'pending'
    },
    underwrite: {
      title: 'Financial Underwriting',
      description: 'Detailed financial modeling and risk assessment',
      icon: <Calculator className="w-6 h-6" />,
      color: 'purple',
      status: 'pending'
    },
    scenarios: {
      title: 'Compare Scenarios',
      description: 'Evaluate multiple development strategies',
      icon: <Target className="w-6 h-6" />,
      color: 'orange',
      status: 'pending'
    },
    decision: {
      title: 'Investment Decision',
      description: 'Final recommendation and next steps',
      icon: <CheckCircle className="w-6 h-6" />,
      color: 'indigo',
      status: 'pending'
    }
  };

  const handleAddParcelToProject = async (parcel: SelectedParcel) => {
    if (!activeProjectId) {
      setIsCreatingProject(true);
      const projectName = `Project - ${parcel.address || 'New Development'}`;
      const projectId = `project_${Date.now()}`;
      
      setActiveProject(projectId, projectName);
      await addParcel(String(parcel.ogc_fid || parcel.id), parcel);
      
      setIsCreatingProject(false);
      setSelectedParcels(prev => [...prev, parcel]);
      setCurrentStep('analyze');
    } else {
      try {
        await addParcel(String(parcel.ogc_fid || parcel.id), parcel);
        setSelectedParcels(prev => [...prev, parcel]);
        setCurrentStep('analyze');
      } catch (error) {
        console.error('Failed to add parcel to project:', error);
      }
    }
  };

  const handleRunHBUAnalysis = async () => {
    if (!selectedParcel) return;
    
    try {
      await analyzeParcel(selectedParcel);
      setCurrentStep('underwrite');
    } catch (error) {
      console.error('HBU Analysis failed:', error);
    }
  };

  const handleRunUnderwriting = async () => {
    if (!selectedParcel || !analysis) return;
    
    try {
      await runUnderwriting(selectedParcel, analysis);
      setCurrentStep('scenarios');
    } catch (error) {
      console.error('Underwriting failed:', error);
    }
  };

  const handleOpenAISitePlanGenerator = () => {
    setShowAISitePlanGenerator(true);
  };

  const handleOpenEnhancedSitePlanner = () => {
    setShowEnhancedSitePlanner(true);
  };

  const handleSitePlanSaved = (sitePlan: any) => {
    setSavedSitePlan(sitePlan);
    setCurrentStep('scenarios');
  };

  const handleContinueToUnderwriting = (sitePlan: any) => {
    setSavedSitePlan(sitePlan);
    setCurrentStep('scenarios');
  };

  const handleCreateScenario = () => {
    setShowScenarioComparison(true);
  };

  const handleCompareScenarios = () => {
    setCurrentStep('decision');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-end lg:items-center justify-center p-0 lg:p-4">
      <div className="bg-white w-full lg:max-w-6xl lg:max-h-[90vh] lg:rounded-2xl shadow-2xl flex flex-col h-full lg:h-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-lg bg-blue-100">
              <Calculator className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                Real Estate Underwriting Workflow
              </h2>
              <p className="text-sm text-gray-600">
                {activeProjectId ? `Active: ${activeProjectName}` : 'Professional development underwriting'}
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
            {Object.entries(workflowSteps).map(([step, config], index) => {
              const isActive = currentStep === step;
              const isCompleted = Object.keys(workflowSteps).indexOf(currentStep) > index;
              
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive 
                      ? `bg-${config.color}-100 text-${config.color}-700` 
                      : isCompleted
                        ? 'bg-green-100 text-green-700'
                        : 'text-gray-500'
                  }`}>
                    {isCompleted ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : (
                      config.icon
                    )}
                    <span className="hidden sm:inline">{config.title}</span>
                  </div>
                  {index < Object.keys(workflowSteps).length - 1 && (
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
                  Discover Investment Opportunities
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Click any parcel on the map to begin professional underwriting analysis. 
                  Our AI will evaluate highest and best use, market conditions, and financial potential.
                </p>
                
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto mb-6">
                  <div className="flex items-center space-x-3 mb-3">
                    <Lightbulb className="w-5 h-5 text-blue-600" />
                    <div className="text-left">
                      <h4 className="font-medium text-blue-900">Professional Underwriting</h4>
                      <p className="text-sm text-blue-700">
                        Get institutional-grade analysis including HBU, market analysis, and financial modeling
                      </p>
                    </div>
                  </div>
                </div>
                
                {selectedParcel ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 max-w-md mx-auto">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                      <div className="text-left">
                        <h4 className="font-medium text-green-900">{selectedParcel.address}</h4>
                        <p className="text-sm text-green-700">{selectedParcel.zoning} • {selectedParcel.sqft?.toLocaleString()} sqft</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAddParcelToProject(selectedParcel)}
                      disabled={isCreatingProject}
                      className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center space-x-2"
                    >
                      {isCreatingProject ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Creating Project...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Start Underwriting Analysis</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    Click a parcel on the map to begin underwriting analysis
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
                    
                    {!analysis ? (
                      <div className="space-y-4">
                        <p className="text-sm text-green-700">
                          Ready to run highest and best use analysis? Our AI will evaluate development potential, 
                          market conditions, and financial projections.
                        </p>
                        <button
                          onClick={handleRunHBUAnalysis}
                          disabled={hbuLoading}
                          className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center space-x-2"
                        >
                          {hbuLoading ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Analyzing...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4" />
                              <span>Run HBU Analysis</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{analysis.confidence}%</div>
                            <div className="text-xs text-green-700">Confidence</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{analysis.recommendedUse}</div>
                            <div className="text-xs text-green-700">Recommended Use</div>
                          </div>
                        </div>
                        
                        {analysis.alternatives.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="font-medium text-green-900">Top Alternatives:</h5>
                            {analysis.alternatives.slice(0, 3).map((alt, index) => (
                              <div key={index} className="flex justify-between text-sm">
                                <span>{alt.use}</span>
                                <span className="font-medium">{alt.internalRateOfReturn.toFixed(1)}% IRR</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <button
                          onClick={() => setCurrentStep('underwrite')}
                          className="w-full bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center space-x-2"
                        >
                          <ArrowRight className="w-4 h-4" />
                          <span>Continue to Financial Underwriting</span>
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
                    Choose a parcel from the map to run highest and best use analysis
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === 'underwrite' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Calculator className="w-16 h-16 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Financial Underwriting
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Detailed financial modeling including development costs, revenue projections, 
                  and risk assessment for investment decision making.
                </p>
                
                <div className="space-y-4 max-w-md mx-auto">
                  <button 
                    onClick={handleRunUnderwriting}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <DollarSign className="w-8 h-8 text-purple-600" />
                      <div>
                        <div className="font-medium">Run Full Underwriting</div>
                        <div className="text-sm text-gray-600">Development costs, revenue, IRR, and risk analysis</div>
                      </div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={handleOpenAISitePlanGenerator}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Building2 className="w-8 h-8 text-purple-600" />
                      <div>
                        <div className="font-medium">Generate AI Site Plan</div>
                        <div className="text-sm text-gray-600">AI creates site plan from HBU analysis</div>
                      </div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={handleOpenEnhancedSitePlanner}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Building2 className="w-8 h-8 text-purple-600" />
                      <div>
                        <div className="font-medium">Enhanced Site Planner</div>
                        <div className="text-sm text-gray-600">Pre-populated design with save functionality</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <TrendingUp className="w-8 h-8 text-purple-600" />
                      <div>
                        <div className="font-medium">Market Analysis</div>
                        <div className="text-sm text-gray-600">Comparable sales, rental rates, and market trends</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className="w-8 h-8 text-purple-600" />
                      <div>
                        <div className="font-medium">Risk Assessment</div>
                        <div className="text-sm text-gray-600">Zoning, environmental, and market risk factors</div>
                      </div>
                    </div>
                  </button>
                </div>
                
                <button
                  onClick={() => setCurrentStep('scenarios')}
                  className="mt-6 w-full bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Continue to Scenario Comparison</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 'scenarios' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <Target className="w-16 h-16 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Compare Development Scenarios
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Create and compare multiple development strategies to optimize your investment 
                  returns and minimize risk.
                </p>
                
                {savedSitePlan && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-2xl mx-auto mb-6">
                    <div className="flex items-center space-x-3 mb-4">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                      <div>
                        <h4 className="font-semibold text-green-900">Site Plan Ready</h4>
                        <p className="text-sm text-green-700">{savedSitePlan.name}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-green-600">{savedSitePlan.elements?.length || 0}</div>
                        <div className="text-sm text-green-700">Elements</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{savedSitePlan.financial?.totalUnits || 0}</div>
                        <div className="text-sm text-green-700">Units</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-600">{savedSitePlan.compliance?.score || 0}%</div>
                        <div className="text-sm text-green-700">Compliance</div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div className="space-y-4 max-w-md mx-auto">
                  <button 
                    onClick={handleCreateScenario}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <Plus className="w-8 h-8 text-orange-600" />
                      <div>
                        <div className="font-medium">Create New Scenario</div>
                        <div className="text-sm text-gray-600">Design alternative development strategy</div>
                      </div>
                    </div>
                  </button>
                  
                  <button 
                    onClick={handleCompareScenarios}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="w-8 h-8 text-orange-600" />
                      <div>
                        <div className="font-medium">Compare Scenarios</div>
                        <div className="text-sm text-gray-600">Side-by-side financial comparison</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <Users className="w-8 h-8 text-orange-600" />
                      <div>
                        <div className="font-medium">Team Review</div>
                        <div className="text-sm text-gray-600">Share with team for collaborative review</div>
                      </div>
                    </div>
                  </button>
                </div>
                
                <button
                  onClick={() => setCurrentStep('decision')}
                  className="mt-6 w-full bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700 transition-colors font-medium flex items-center justify-center space-x-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Continue to Investment Decision</span>
                </button>
              </div>
            </div>
          )}

          {currentStep === 'decision' && (
            <div className="p-4 lg:p-6">
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Investment Decision
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Review your analysis and make an informed investment decision with 
                  professional recommendations and next steps.
                </p>
                
                <div className="space-y-4 max-w-md mx-auto">
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <FileText className="w-8 h-8 text-indigo-600" />
                      <div>
                        <div className="font-medium">Generate Investment Memo</div>
                        <div className="text-sm text-gray-600">Professional investment summary and recommendation</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <Download className="w-8 h-8 text-indigo-600" />
                      <div>
                        <div className="font-medium">Export Analysis</div>
                        <div className="text-sm text-gray-600">Download complete underwriting package</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <Clock className="w-8 h-8 text-indigo-600" />
                      <div>
                        <div className="font-medium">Set Follow-up</div>
                        <div className="text-sm text-gray-600">Schedule next steps and monitoring</div>
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
                <FileText className="w-4 h-4" />
                <span>Save Analysis</span>
              </button>
              
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center space-x-2">
                <Download className="w-4 h-4" />
                <span>Export Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Underwriting Panel Modal */}
      {showUnderwritingPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Financial Underwriting</h3>
              <button
                onClick={() => setShowUnderwritingPanel(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <Calculator className="w-16 h-16 text-purple-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Professional Underwriting Tools
                </h3>
                <p className="text-gray-600 mb-6">
                  Advanced financial modeling and risk assessment tools will be integrated here.
                </p>
                <div className="space-y-3 max-w-md mx-auto">
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <DollarSign className="w-5 h-5 text-purple-600" />
                      <div>
                        <div className="font-medium">Development Cost Analysis</div>
                        <div className="text-sm text-gray-600">Detailed cost breakdown and projections</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <TrendingUp className="w-5 h-5 text-purple-600" />
                      <div>
                        <div className="font-medium">Revenue Projections</div>
                        <div className="text-sm text-gray-600">Market-based revenue modeling</div>
                      </div>
                    </div>
                  </button>
                  
                  <button className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3">
                      <Percent className="w-5 h-5 text-purple-600" />
                      <div>
                        <div className="font-medium">IRR & ROI Analysis</div>
                        <div className="text-sm text-gray-600">Investment return calculations</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scenario Comparison Modal */}
      {showScenarioComparison && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Scenario Comparison</h3>
              <button
                onClick={() => setShowScenarioComparison(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="text-center py-12">
                <Target className="w-16 h-16 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Development Scenario Comparison
                </h3>
                <p className="text-gray-600 mb-6">
                  Compare multiple development strategies side-by-side to optimize your investment.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3 mb-2">
                      <Building className="w-5 h-5 text-orange-600" />
                      <div className="font-medium">Residential Development</div>
                    </div>
                    <div className="text-sm text-gray-600">Single-family or multi-family residential</div>
                  </button>
                  
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3 mb-2">
                      <Building2 className="w-5 h-5 text-orange-600" />
                      <div className="font-medium">Commercial Development</div>
                    </div>
                    <div className="text-sm text-gray-600">Office, retail, or mixed-use commercial</div>
                  </button>
                  
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3 mb-2">
                      <Car className="w-5 h-5 text-orange-600" />
                      <div className="font-medium">Industrial Development</div>
                    </div>
                    <div className="text-sm text-gray-600">Warehouse, manufacturing, or logistics</div>
                  </button>
                  
                  <button className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left">
                    <div className="flex items-center space-x-3 mb-2">
                      <Plus className="w-5 h-5 text-orange-600" />
                      <div className="font-medium">Custom Scenario</div>
                    </div>
                    <div className="text-sm text-gray-600">Create your own development strategy</div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI-Driven Site Plan Generator */}
      <AIDrivenSitePlanGenerator
        isOpen={showAISitePlanGenerator}
        onClose={() => setShowAISitePlanGenerator(false)}
        selectedParcel={selectedParcel}
        hbuAnalysis={analysis}
        onAnalysisComplete={(analysis) => {
          console.log('HBU analysis completed:', analysis);
        }}
        onSitePlanGenerated={(sitePlan) => {
          console.log('AI site plan generated:', sitePlan);
          setCurrentStep('scenarios');
        }}
      />

      {/* Enhanced Site Planner */}
      <EnhancedSitePlanner
        isOpen={showEnhancedSitePlanner}
        onClose={() => setShowEnhancedSitePlanner(false)}
        selectedParcel={selectedParcel}
        hbuAnalysis={analysis}
        onSitePlanSaved={handleSitePlanSaved}
        onContinueToUnderwriting={handleContinueToUnderwriting}
      />
    </div>
  );
}
