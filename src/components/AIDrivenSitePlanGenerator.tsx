// LEGACY / DEV-ONLY: Do not import into production flows. See docs/site_planner_live_vs_legacy.md.

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  Zap, 
  CheckCircle, 
  AlertTriangle, 
  ArrowRight,
  X,
  Lightbulb,
  Target,
  BarChart3,
  Settings,
  Download,
  RefreshCw
} from 'lucide-react';
import { SelectedParcel } from '../types/parcel';
import { HBUAnalysis, HBUAlternative } from '../services/hbuAnalysis';
import { useHBUAnalysis } from '../hooks/useHBUAnalysis';
import EnterpriseSitePlanner from './EnterpriseSitePlannerShell';

interface AIDrivenSitePlanGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  hbuAnalysis?: HBUAnalysis | null;
  onAnalysisComplete?: (analysis: HBUAnalysis) => void;
  onSitePlanGenerated?: (sitePlan: AIGeneratedSitePlan) => void;
}

interface AIGeneratedSitePlan {
  id: string;
  name: string;
  description: string;
  buildingType: string;
  units: number;
  totalGSF: number;
  parkingSpaces: number;
  buildingFootprint: {
    width: number;
    depth: number;
    height: number;
  };
  layout: {
    buildings: Array<{
      id: string;
      type: 'building' | 'parking' | 'landscaping';
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
    }>;
  };
  compliance: {
    zoningCompliant: boolean;
    violations: string[];
    warnings: string[];
    score: number;
  };
  financial: {
    estimatedValue: number;
    developmentCost: number;
    irr: number;
    roi: number;
  };
  recommendations: string[];
}

export function AIDrivenSitePlanGenerator({ 
  isOpen, 
  onClose, 
  selectedParcel, 
  hbuAnalysis,
  onAnalysisComplete,
  onSitePlanGenerated
}: AIDrivenSitePlanGeneratorProps) {
  const [currentStep, setCurrentStep] = useState<'analyze' | 'generate' | 'optimize' | 'finalize'>('analyze');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSitePlan, setGeneratedSitePlan] = useState<AIGeneratedSitePlan | null>(null);
  const [optimizationResults, setOptimizationResults] = useState<any>(null);
  const [showSitePlanner, setShowSitePlanner] = useState(false);
  
  const { 
    analysis, 
    loading: hbuLoading, 
    error: hbuError, 
    analyzeParcel,
    getRecommendedAlternative,
    getFinancialSummary
  } = useHBUAnalysis();

  // Auto-run HBU analysis when parcel is selected
  useEffect(() => {
    if (selectedParcel && !hbuAnalysis && !analysis) {
      analyzeParcel(selectedParcel);
    }
  }, [selectedParcel, hbuAnalysis, analysis, analyzeParcel]);

  // Use provided analysis or the one from hook
  const currentAnalysis = hbuAnalysis || analysis;
  
  // Safety check to ensure currentAnalysis has required properties
  const safeAnalysis = currentAnalysis ? {
    confidence: currentAnalysis.confidence || 0,
    recommendedUse: currentAnalysis.recommendedUse || 'mixed-use',
    alternatives: currentAnalysis.alternatives || []
  } : null;

  const handleGenerateSitePlan = useCallback(async () => {
    if (!currentAnalysis || !selectedParcel) {
      console.warn('Missing required data for site plan generation:', { currentAnalysis, selectedParcel });
      return;
    }

    setIsGenerating(true);
    setCurrentStep('generate');

    try {
      // Simulate AI-driven site plan generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const recommended = getRecommendedAlternative();
      if (!recommended) {
        console.warn('No recommended alternative found, using fallback analysis');
        // Create a fallback analysis if none exists
        const fallbackAnalysis = {
          use: 'mixed-use',
          density: 20,
          height: 3,
          estimatedValue: 500000,
          developmentCost: 300000,
          netPresentValue: 200000,
          internalRateOfReturn: 12,
          paybackPeriod: 8,
          confidence: 75,
          constraints: ['Standard zoning requirements'],
          marketFactors: ['Good location', 'Growing market']
        };
        
        // Use fallback analysis instead of throwing error
        const sitePlan: AIGeneratedSitePlan = {
          id: `siteplan_${Date.now()}`,
          name: `${selectedParcel?.address || 'Unknown Address'} - AI Generated Site Plan`,
          description: 'AI-optimized site plan based on fallback analysis',
          buildingType: fallbackAnalysis.use,
          units: Math.floor((selectedParcel?.sqft || 4356) / 1000), // Estimate based on parcel size
          totalGSF: (selectedParcel?.sqft || 4356) * 0.6, // 60% building coverage
          parkingSpaces: Math.floor((selectedParcel?.sqft || 4356) / 1000 * 1.5), // 1.5 spaces per unit
          buildingFootprint: {
            width: Math.sqrt((selectedParcel?.sqft || 4356) * 0.6),
            depth: Math.sqrt((selectedParcel?.sqft || 4356) * 0.6),
            height: fallbackAnalysis.height * 10 // Convert stories to feet
          },
          layout: {
            buildings: [{
              id: 'main-building',
              type: 'building',
              x: 50,
              y: 50,
              width: Math.sqrt((selectedParcel?.sqft || 4356) * 0.6),
              height: Math.sqrt((selectedParcel?.sqft || 4356) * 0.6)
            }],
            parking: [{
              id: 'parking-lot',
              type: 'parking',
              x: 20,
              y: 20,
              width: 30,
              height: 40
            }],
            landscaping: [{
              id: 'landscaping',
              type: 'landscaping',
              x: 0,
              y: 0,
              width: 100,
              height: 100
            }]
          },
          financials: {
            totalCost: fallbackAnalysis.developmentCost,
            estimatedValue: fallbackAnalysis.estimatedValue,
            netPresentValue: fallbackAnalysis.netPresentValue,
            internalRateOfReturn: fallbackAnalysis.internalRateOfReturn,
            paybackPeriod: fallbackAnalysis.paybackPeriod
          },
          constraints: fallbackAnalysis.constraints,
          marketFactors: fallbackAnalysis.marketFactors,
          generatedAt: new Date().toISOString(),
          confidence: fallbackAnalysis.confidence
        };
        
        setGeneratedSitePlan(sitePlan);
        setCurrentStep('optimize');
        
        if (onSitePlanGenerated) {
          onSitePlanGenerated(sitePlan);
        }
        return;
      }

      // Generate site plan based on HBU analysis
      const sitePlan: AIGeneratedSitePlan = {
        id: `siteplan_${Date.now()}`,
        name: `${recommended.use} Development`,
        description: `AI-generated site plan based on ${recommended.use} analysis`,
        buildingType: recommended.use,
        units: Math.floor(recommended.density * ((selectedParcel?.sqft || 4356) / 43560)), // Convert to units
        totalGSF: recommended.density * (selectedParcel?.sqft || 4356),
        parkingSpaces: Math.ceil(Math.floor(recommended.density * ((selectedParcel?.sqft || 4356) / 43560)) * 1.5), // 1.5 spaces per unit
        buildingFootprint: {
          width: Math.sqrt(recommended.density * (selectedParcel?.sqft || 4356)) * 0.8,
          depth: Math.sqrt(recommended.density * (selectedParcel?.sqft || 4356)) * 0.6,
          height: recommended.height * 10 // Convert stories to feet
        },
        layout: {
          buildings: [
            {
              id: 'main_building',
              type: 'building',
              x: 50,
              y: 50,
              width: Math.sqrt(recommended.density * (selectedParcel?.sqft || 4356)) * 0.8,
              height: Math.sqrt(recommended.density * (selectedParcel?.sqft || 4356)) * 0.6,
              rotation: 0
            },
            {
              id: 'parking_1',
              type: 'parking',
              x: 20,
              y: 20,
              width: 30,
              height: 20,
              rotation: 0
            }
          ]
        },
        compliance: {
          zoningCompliant: true,
          violations: [],
          warnings: [],
          score: 85
        },
        financial: {
          estimatedValue: recommended.estimatedValue,
          developmentCost: recommended.developmentCost,
          irr: recommended.internalRateOfReturn,
          roi: recommended.internalRateOfReturn * 0.8
        },
        recommendations: [
          'Optimize building orientation for solar access',
          'Consider additional parking if market demand is high',
          'Evaluate mixed-use potential for ground floor retail'
        ]
      };

      setGeneratedSitePlan(sitePlan);
      setCurrentStep('optimize');
      
      if (onSitePlanGenerated) {
        onSitePlanGenerated(sitePlan);
      }

    } catch (error) {
      console.error('Site plan generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [currentAnalysis, selectedParcel, getRecommendedAlternative, onSitePlanGenerated]);

  const handleOptimizeSitePlan = useCallback(async () => {
    if (!generatedSitePlan) return;

    setIsGenerating(true);
    setCurrentStep('optimize');

    try {
      // Simulate AI optimization
      await new Promise(resolve => setTimeout(resolve, 1500));

      const optimizedPlan = {
        ...generatedSitePlan,
        compliance: {
          ...generatedSitePlan.compliance,
          score: 92
        },
        financial: {
          ...generatedSitePlan.financial,
          irr: generatedSitePlan.financial.irr * 1.05,
          roi: generatedSitePlan.financial.roi * 1.03
        }
      };

      setGeneratedSitePlan(optimizedPlan);
      setOptimizationResults({
        improvements: [
          'Increased building efficiency by 8%',
          'Optimized parking layout for better circulation',
          'Enhanced landscaping for stormwater management'
        ],
        financialGains: {
          irrImprovement: 0.5,
          roiImprovement: 0.3,
          valueIncrease: 150000
        }
      });

      setCurrentStep('finalize');

    } catch (error) {
      console.error('Site plan optimization failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [generatedSitePlan]);

  const handleOpenSitePlanner = () => {
    setShowSitePlanner(true);
  };

  const handleFinalizeSitePlan = () => {
    setCurrentStep('finalize');
  };

  if (!isOpen) return null;
  
  // Safety check for missing parcel
  if (!selectedParcel) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md mx-auto">
          <div className="text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Parcel Selected</h2>
            <p className="text-gray-600 mb-4">
              Please select a parcel first to generate an AI-optimized site plan.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-lg bg-blue-100">
              <Zap className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                AI-Driven Site Plan Generator
              </h2>
              <p className="text-sm text-gray-600">
                {selectedParcel ? `${selectedParcel.address}` : 'Generate site plan from HBU analysis'}
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

        {/* Progress Steps */}
        <div className="px-4 lg:px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {[
              { key: 'analyze', label: 'Analyze', icon: <BarChart3 className="w-4 h-4" /> },
              { key: 'generate', label: 'Generate', icon: <Zap className="w-4 h-4" /> },
              { key: 'optimize', label: 'Optimize', icon: <Target className="w-4 h-4" /> },
              { key: 'finalize', label: 'Finalize', icon: <CheckCircle className="w-4 h-4" /> }
            ].map((step, index) => {
              const isActive = currentStep === step.key;
              const isCompleted = ['analyze', 'generate', 'optimize', 'finalize'].indexOf(currentStep) > ['analyze', 'generate', 'optimize', 'finalize'].indexOf(step.key);
              
              return (
                <div key={step.key} className="flex items-center">
                  <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive 
                      ? 'bg-blue-100 text-blue-700' 
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
                  {index < 3 && (
                    <div className="w-8 h-px bg-gray-300 mx-2"></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {currentStep === 'analyze' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <BarChart3 className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  HBU Analysis Complete
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  AI analysis has identified the optimal development strategy. 
                  Now we'll generate a site plan that implements this strategy.
                </p>
                
                {safeAnalysis ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl mx-auto">
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600">{safeAnalysis.confidence}%</div>
                        <div className="text-sm text-blue-700">Confidence</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600 capitalize">{safeAnalysis.recommendedUse}</div>
                        <div className="text-sm text-blue-700">Recommended Use</div>
                      </div>
                    </div>
                    
                    {safeAnalysis.alternatives && safeAnalysis.alternatives.length > 0 && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-blue-900 mb-3">Top Development Alternatives:</h4>
                        {safeAnalysis.alternatives.slice(0, 3).map((alt, index) => (
                          <div key={index} className="flex justify-between items-center p-3 bg-white rounded-lg">
                            <div>
                              <div className="font-medium">{alt.use}</div>
                              <div className="text-sm text-gray-600">{alt.density.toFixed(1)} units/acre</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">{alt.internalRateOfReturn.toFixed(1)}% IRR</div>
                              <div className="text-sm text-gray-600">${alt.estimatedValue.toLocaleString()}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    <button
                      onClick={handleGenerateSitePlan}
                      disabled={isGenerating}
                      className="w-full mt-6 bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center space-x-2"
                    >
                      {isGenerating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Generating Site Plan...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4" />
                          <span>Generate AI Site Plan</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    {hbuLoading ? 'Running HBU analysis...' : 'No analysis available'}
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'generate' && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Zap className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Generating Site Plan
                </h3>
                <p className="text-gray-600 mb-6">
                  AI is creating an optimized site plan based on your HBU analysis...
                </p>
                
                <div className="space-y-4 max-w-md mx-auto">
                  <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Analyzed zoning constraints</span>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Calculated optimal building massing</span>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Generated parking layout</span>
                  </div>
                  <div className="flex items-center space-x-3 p-3 bg-green-50 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm">Optimized site circulation</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'optimize' && generatedSitePlan && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <Target className="w-16 h-16 text-orange-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Site Plan Generated
                </h3>
                <p className="text-gray-600 mb-6">
                  AI has created an optimized site plan. Review and optimize further if needed.
                </p>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl mx-auto">
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Development Summary</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Building Type:</span>
                        <span className="font-medium">{generatedSitePlan.buildingType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Units:</span>
                        <span className="font-medium">{generatedSitePlan.units}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total GSF:</span>
                        <span className="font-medium">{generatedSitePlan.totalGSF.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Parking:</span>
                        <span className="font-medium">{generatedSitePlan.parkingSpaces} spaces</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Financial Projections</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Estimated Value:</span>
                        <span className="font-medium">${generatedSitePlan.financial.estimatedValue.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Development Cost:</span>
                        <span className="font-medium">${generatedSitePlan.financial.developmentCost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">IRR:</span>
                        <span className="font-medium text-green-600">{generatedSitePlan.financial.irr.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">ROI:</span>
                        <span className="font-medium text-green-600">{generatedSitePlan.financial.roi.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-4 justify-center mt-6">
                  <button
                    onClick={handleOptimizeSitePlan}
                    disabled={isGenerating}
                    className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors font-medium flex items-center space-x-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Optimizing...</span>
                      </>
                    ) : (
                      <>
                        <Target className="w-4 h-4" />
                        <span>Optimize Further</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleOpenSitePlanner}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Open Site Planner</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'finalize' && generatedSitePlan && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  Site Plan Optimized
                </h3>
                <p className="text-gray-600 mb-6">
                  Your AI-generated site plan is ready for implementation.
                </p>
                
                {optimizationResults && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-2xl mx-auto mb-6">
                    <h4 className="font-semibold text-green-900 mb-4">Optimization Results</h4>
                    <div className="space-y-3">
                      {optimizationResults.improvements.map((improvement: string, index: number) => (
                        <div key={index} className="flex items-center space-x-3">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-sm text-green-700">{improvement}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex space-x-4 justify-center">
                  <button
                    onClick={handleOpenSitePlanner}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Open in Site Planner</span>
                  </button>
                  
                  <button className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center space-x-2">
                    <Download className="w-4 h-4" />
                    <span>Export Site Plan</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Site Planner Modal */}
      {showSitePlanner && selectedParcel && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-[95vw] h-[95vh] max-w-7xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">AI-Generated Site Plan</h2>
              <button
                onClick={() => setShowSitePlanner(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-[80vh]">
              <EnterpriseSitePlanner
                parcel={selectedParcel}
                marketData={{
                  avgPricePerSqFt: 300,
                  avgRentPerSqFt: 2.50,
                  capRate: 0.06,
                  constructionCostPerSqFt: 200
                }}
                onInvestmentAnalysis={(analysis) => {
                  console.log('Investment analysis:', analysis);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
