/**
 * Consolidated Site Planner Component
 * 
 * This component combines all site planner functionality into a single,
 * powerful component while maintaining backward compatibility.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Building, Car, TreePine, Settings, Play, RotateCcw, RotateCw, TrendingUp,
  AlertTriangle, CheckCircle, Target, BarChart3, DollarSign, Users,
  Home, Building2, Eye, Ruler, Move, Square, Circle, Trash2,
  Copy, AlignLeft, AlignCenter, AlignRight, AlignStartVertical,
  AlignCenterVertical, AlignEndVertical, ZoomIn, ZoomOut, Grid,
  MousePointer, Edit3, Maximize, MoreHorizontal, X, Save, Zap,
  Lightbulb, Target as TargetIcon, BarChart3 as BarChartIcon
} from 'lucide-react';
import { SelectedParcel } from '../types/parcel';
import { HBUAnalysis } from '../services/hbuAnalysis';
import { useEnhancedSitePlanner } from '../hooks/useEnhancedSitePlanner';
import { CoordinateTransform } from '../utils/coordinateTransform';
import { fetchParcelGeometry3857, fetchParcelBuildableEnvelope, SitePlannerGeometry } from '../services/parcelGeometry';

// Component modes
export type SitePlannerMode = 'design' | 'ai-generation' | 'enhanced' | 'optimization';

interface ConsolidatedSitePlannerProps {
  // Core props
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  
  // Mode configuration
  mode?: SitePlannerMode;
  
  // AI props
  hbuAnalysis?: HBUAnalysis | null;
  onAnalysisComplete?: (analysis: HBUAnalysis) => void;
  
  // Site plan props
  onSitePlanGenerated?: (sitePlan: any) => void;
  onSitePlanSaved?: (sitePlan: any) => void;
  onContinueToUnderwriting?: (sitePlan: any) => void;
  
  // UI props
  showAIGenerator?: boolean;
  showOptimizer?: boolean;
  showValidator?: boolean;
}

export function ConsolidatedSitePlanner({
  isOpen,
  onClose,
  selectedParcel,
  mode = 'design',
  hbuAnalysis,
  onAnalysisComplete,
  onSitePlanGenerated,
  onSitePlanSaved,
  onContinueToUnderwriting,
  showAIGenerator = false,
  showOptimizer = false,
  showValidator = false
}: ConsolidatedSitePlannerProps) {
  // Enhanced site planner hook
  const {
    activeSitePlan,
    isGenerating,
    isOptimizing,
    validation,
    metrics,
    generateAISitePlan,
    createSitePlan,
    updateSitePlan,
    saveSitePlan,
    optimizeSitePlan,
    validateSitePlan,
    calculateMetrics,
    toggleAIGenerator,
    toggleOptimizer,
    toggleValidator,
    addElement,
    updateElement,
    removeElement,
    hbuAnalysis: currentAnalysis,
    hbuLoading
  } = useEnhancedSitePlanner();

  // Local state
  const [currentStep, setCurrentStep] = useState<'analyze' | 'generate' | 'optimize' | 'finalize'>('analyze');
  const [showSitePlanner, setShowSitePlanner] = useState(false);
  const [isGeneratingSitePlan, setIsGeneratingSitePlan] = useState(false);
  const [generatedSitePlan, setGeneratedSitePlan] = useState<any>(null);

  // Auto-generate AI site plan when mode is 'ai-generation'
  useEffect(() => {
    if (mode === 'ai-generation' && selectedParcel && hbuAnalysis && !generatedSitePlan) {
      handleGenerateAISitePlan();
    }
  }, [mode, selectedParcel, hbuAnalysis, generatedSitePlan]);

  // Handle AI site plan generation
  const handleGenerateAISitePlan = useCallback(async () => {
    if (!selectedParcel || !hbuAnalysis) return;

    setIsGeneratingSitePlan(true);
    setCurrentStep('generate');

    try {
      const aiSitePlan = await generateAISitePlan(selectedParcel, hbuAnalysis);
      setGeneratedSitePlan(aiSitePlan);
      setCurrentStep('optimize');
      
      if (onSitePlanGenerated) {
        onSitePlanGenerated(aiSitePlan);
      }
    } catch (error) {
      console.error('AI site plan generation failed:', error);
    } finally {
      setIsGeneratingSitePlan(false);
    }
  }, [selectedParcel, hbuAnalysis, generateAISitePlan, onSitePlanGenerated]);

  // Handle site plan optimization
  const handleOptimizeSitePlan = useCallback(async () => {
    if (!activeSitePlan) return;

    setCurrentStep('optimize');
    try {
      const optimized = await optimizeSitePlan();
      setCurrentStep('finalize');
      
      if (onSitePlanSaved) {
        onSitePlanSaved(optimized);
      }
    } catch (error) {
      console.error('Site plan optimization failed:', error);
    }
  }, [activeSitePlan, optimizeSitePlan, onSitePlanSaved]);

  // Handle site plan finalization
  const handleFinalizeSitePlan = useCallback(() => {
    setCurrentStep('finalize');
    
    if (onContinueToUnderwriting && activeSitePlan) {
      onContinueToUnderwriting(activeSitePlan);
    }
  }, [onContinueToUnderwriting, activeSitePlan]);

  // Render based on mode
  const renderContent = () => {
    switch (mode) {
      case 'ai-generation':
        return renderAIGenerationMode();
      case 'enhanced':
        return renderEnhancedMode();
      case 'optimization':
        return renderOptimizationMode();
      default:
        return renderDesignMode();
    }
  };

  // AI Generation Mode
  const renderAIGenerationMode = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <Zap className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          AI-Driven Site Plan Generator
        </h2>
        <p className="text-gray-600">
          {selectedParcel ? `${selectedParcel.address}` : 'Generate site plan from HBU analysis'}
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex justify-center mb-8">
        <div className="flex items-center space-x-4">
          {[
            { key: 'analyze', label: 'Analyze', icon: Target },
            { key: 'generate', label: 'Generate', icon: Zap },
            { key: 'optimize', label: 'Optimize', icon: Settings },
            { key: 'finalize', label: 'Finalize', icon: CheckCircle }
          ].map((step, index) => {
            const StepIcon = step.icon;
            const isActive = currentStep === step.key;
            const isCompleted = ['analyze', 'generate', 'optimize', 'finalize'].indexOf(currentStep) > index;
            
            return (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  isActive ? 'bg-blue-600 border-blue-600 text-white' :
                  isCompleted ? 'bg-green-600 border-green-600 text-white' :
                  'bg-gray-100 border-gray-300 text-gray-500'
                }`}>
                  <StepIcon className="w-5 h-5" />
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
                {index < 3 && (
                  <div className={`w-8 h-0.5 mx-4 ${
                    isCompleted ? 'bg-green-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'analyze' && (
        <div className="text-center">
          <Lightbulb className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Analyzing Property
          </h3>
          <p className="text-gray-600 mb-6">
            AI is analyzing zoning constraints, market factors, and development potential...
          </p>
          
          {hbuAnalysis && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl mx-auto">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{hbuAnalysis.confidence || 0}%</div>
                  <div className="text-sm text-blue-700">Confidence</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 capitalize">{hbuAnalysis.recommendedUse || 'Mixed-Use'}</div>
                  <div className="text-sm text-blue-700">Recommended Use</div>
                </div>
              </div>
              
              <button
                onClick={handleGenerateAISitePlan}
                disabled={isGeneratingSitePlan}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isGeneratingSitePlan ? (
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
          )}
        </div>
      )}

      {currentStep === 'generate' && (
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Generating Site Plan
          </h3>
          <p className="text-gray-600 mb-6">
            AI is creating an optimized site plan based on your HBU analysis...
          </p>
          
          <div className="space-y-3 max-w-md mx-auto">
            {[
              'Analyzed zoning constraints',
              'Calculated optimal building massing',
              'Generated parking layout',
              'Optimized site circulation'
            ].map((step, index) => (
              <div key={index} className="flex items-center space-x-3 text-left">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-700">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentStep === 'optimize' && (
        <div className="text-center">
          <Settings className="w-16 h-16 text-purple-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Optimizing Design
          </h3>
          <p className="text-gray-600 mb-6">
            Fine-tuning the site plan for maximum efficiency and compliance...
          </p>
          
          <button
            onClick={handleOptimizeSitePlan}
            disabled={isOptimizing}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mx-auto"
          >
            {isOptimizing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Optimizing...</span>
              </>
            ) : (
              <>
                <Settings className="w-4 h-4" />
                <span>Optimize Site Plan</span>
              </>
            )}
          </button>
        </div>
      )}

      {currentStep === 'finalize' && (
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Site Plan Complete
          </h3>
          <p className="text-gray-600 mb-6">
            Your AI-optimized site plan is ready for review and implementation.
          </p>
          
          <div className="space-x-4">
            <button
              onClick={handleFinalizeSitePlan}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center space-x-2"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Continue to Underwriting</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // Enhanced Mode
  const renderEnhancedMode = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <Building2 className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Enhanced Site Planner
        </h2>
        <p className="text-gray-600">
          Advanced site planning with AI assistance and optimization tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <Zap className="w-8 h-8 text-blue-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Generation</h3>
          <p className="text-sm text-gray-600 mb-4">
            Generate site plans using AI analysis and HBU recommendations.
          </p>
          <button
            onClick={toggleAIGenerator}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showAIGenerator ? 'Hide' : 'Show'} AI Generator
          </button>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
          <Settings className="w-8 h-8 text-purple-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Optimization</h3>
          <p className="text-sm text-gray-600 mb-4">
            Optimize your site plan for maximum efficiency and compliance.
          </p>
          <button
            onClick={toggleOptimizer}
            className="w-full px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
          >
            {showOptimizer ? 'Hide' : 'Show'} Optimizer
          </button>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <CheckCircle className="w-8 h-8 text-green-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Validation</h3>
          <p className="text-sm text-gray-600 mb-4">
            Validate your site plan for compliance and best practices.
          </p>
          <button
            onClick={toggleValidator}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            {showValidator ? 'Hide' : 'Show'} Validator
          </button>
        </div>
      </div>

      {/* Metrics Display */}
      {metrics && (
        <div className="mt-8 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Site Plan Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{metrics.buildingCoverage.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Building Coverage</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{metrics.parkingRatio.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Parking Ratio</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{metrics.unitDensity.toFixed(1)}</div>
              <div className="text-sm text-gray-600">Units/Acre</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{metrics.efficiency.toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Efficiency</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Optimization Mode
  const renderOptimizationMode = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <Settings className="w-16 h-16 text-purple-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Site Plan Optimization
        </h2>
        <p className="text-gray-600">
          Optimize your site plan for maximum efficiency and compliance.
        </p>
      </div>

      {validation && (
        <div className="mb-6 bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Validation Results</h3>
          <div className="flex items-center space-x-4 mb-4">
            <div className={`w-3 h-3 rounded-full ${validation.isValid ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className={`font-medium ${validation.isValid ? 'text-green-700' : 'text-red-700'}`}>
              {validation.isValid ? 'Valid' : 'Invalid'} (Score: {validation.score}/100)
            </span>
          </div>
          
          {validation.errors.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-red-700 mb-2">Errors:</h4>
              <ul className="list-disc list-inside text-sm text-red-600">
                {validation.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          
          {validation.warnings.length > 0 && (
            <div>
              <h4 className="font-medium text-yellow-700 mb-2">Warnings:</h4>
              <ul className="list-disc list-inside text-sm text-yellow-600">
                {validation.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="text-center">
        <button
          onClick={handleOptimizeSitePlan}
          disabled={isOptimizing}
          className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 mx-auto"
        >
          {isOptimizing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>Optimizing...</span>
            </>
          ) : (
            <>
              <Settings className="w-4 h-4" />
              <span>Optimize Site Plan</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  // Design Mode (default)
  const renderDesignMode = () => (
    <div className="p-6">
      <div className="text-center mb-6">
        <Building className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Site Plan Designer
        </h2>
        <p className="text-gray-600">
          Design and customize your site plan with professional tools.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <Building className="w-8 h-8 text-blue-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Buildings</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add and configure building elements for your site plan.
          </p>
          <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            Add Building
          </button>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <Car className="w-8 h-8 text-green-600 mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Parking</h3>
          <p className="text-sm text-gray-600 mb-4">
            Design parking layouts and calculate requirements.
          </p>
          <button className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
            Add Parking
          </button>
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Building2 className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">
              Consolidated Site Planner
            </h1>
            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
              {mode}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default ConsolidatedSitePlanner;
