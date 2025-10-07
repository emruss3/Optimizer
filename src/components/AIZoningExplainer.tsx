import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  AlertTriangle, 
  CheckCircle, 
  Lightbulb, 
  TrendingUp,
  Target,
  Info,
  ExternalLink
} from 'lucide-react';
import { AIZoningExplainer, ZoningExplanation, ZoningViolation } from '../services/aiZoningExplainer';
import { RegridZoningData } from '../types/zoning';

interface AIZoningExplainerProps {
  zoningData: RegridZoningData;
  currentPlan?: any;
  onViolationsChange?: (violations: ZoningViolation[]) => void;
}

export default function AIZoningExplainerComponent({ 
  zoningData, 
  currentPlan,
  onViolationsChange 
}: AIZoningExplainerProps) {
  const [explanation, setExplanation] = useState<ZoningExplanation | null>(null);
  const [violations, setViolations] = useState<ZoningViolation[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'explanation' | 'violations' | 'suggestions'>('explanation');

  const explainer = new AIZoningExplainer();

  useEffect(() => {
    loadExplanation();
  }, [zoningData]);

  useEffect(() => {
    if (currentPlan) {
      analyzeViolations();
      generateSuggestions();
    }
  }, [currentPlan, zoningData]);

  const loadExplanation = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await explainer.explainZoning(zoningData);
      setExplanation(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load explanation');
    } finally {
      setLoading(false);
    }
  };

  const analyzeViolations = () => {
    if (!currentPlan) return;
    
    const detectedViolations = explainer.analyzeViolations(zoningData, currentPlan);
    setViolations(detectedViolations);
    onViolationsChange?.(detectedViolations);
  };

  const generateSuggestions = () => {
    if (!currentPlan) return;
    
    const optimizationSuggestions = explainer.generateOptimizationSuggestions(zoningData, currentPlan);
    setSuggestions(optimizationSuggestions);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'major': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'minor': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'warning': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-4 h-4" />;
      case 'major': return <AlertTriangle className="w-4 h-4" />;
      case 'minor': return <Info className="w-4 h-4" />;
      case 'warning': return <Info className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Brain className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Zoning Analysis</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-6">
        <div className="flex items-center space-x-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-600" />
          <h3 className="text-lg font-semibold text-red-900">Analysis Error</h3>
        </div>
        <p className="text-red-700 mb-4">{error}</p>
        <button
          onClick={loadExplanation}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <Brain className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Zoning Analysis</h3>
          {explanation && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
              {Math.round(explanation.confidence * 100)}% confidence
            </span>
          )}
        </div>
        <button
          onClick={loadExplanation}
          className="text-blue-600 hover:text-blue-800 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('explanation')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'explanation'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Explanation
        </button>
        <button
          onClick={() => setActiveTab('violations')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'violations'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Violations ({violations.length})
        </button>
        <button
          onClick={() => setActiveTab('suggestions')}
          className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'suggestions'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Suggestions ({suggestions.length})
        </button>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'explanation' && explanation && (
          <div className="space-y-6">
            {/* Summary */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-2">Summary</h4>
              <p className="text-gray-700">{explanation.summary}</p>
            </div>

            {/* Plain Language */}
            <div>
              <h4 className="text-md font-semibold text-gray-900 mb-2">In Plain English</h4>
              <p className="text-gray-700 bg-blue-50 p-4 rounded-lg">{explanation.plainLanguage}</p>
            </div>

            {/* Key Points */}
            {explanation.keyPoints.length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Key Points</h4>
                <ul className="space-y-2">
                  {explanation.keyPoints.map((point, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Opportunities */}
            {explanation.opportunities.length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Opportunities</h4>
                <ul className="space-y-2">
                  {explanation.opportunities.map((opportunity, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{opportunity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {explanation.recommendations.length > 0 && (
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">Recommendations</h4>
                <ul className="space-y-2">
                  {explanation.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <Target className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {activeTab === 'violations' && (
          <div className="space-y-4">
            {violations.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Violations Found</h4>
                <p className="text-gray-600">Your current plan complies with all zoning requirements.</p>
              </div>
            ) : (
              violations.map((violation, index) => (
                <div key={index} className={`border rounded-lg p-4 ${getSeverityColor(violation.severity)}`}>
                  <div className="flex items-start space-x-3">
                    {getSeverityIcon(violation.severity)}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h5 className="font-semibold capitalize">{violation.type} Violation</h5>
                        <span className="px-2 py-1 text-xs rounded-full bg-white/50 capitalize">
                          {violation.severity}
                        </span>
                      </div>
                      <p className="mb-2">{violation.description}</p>
                      <div className="text-sm mb-2">
                        <span className="font-medium">Current:</span> {violation.currentValue} | 
                        <span className="font-medium ml-2">Allowed:</span> {violation.allowedValue}
                      </div>
                      <div className="bg-white/50 p-3 rounded">
                        <p className="font-medium text-sm mb-1">How to fix:</p>
                        <p className="text-sm">{violation.fix}</p>
                        <p className="text-sm mt-1 text-gray-600">{violation.impact}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'suggestions' && (
          <div className="space-y-4">
            {suggestions.length === 0 ? (
              <div className="text-center py-8">
                <Lightbulb className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">No Suggestions Available</h4>
                <p className="text-gray-600">Add a site plan to get optimization suggestions.</p>
              </div>
            ) : (
              suggestions.map((suggestion, index) => (
                <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Lightbulb className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <p className="text-gray-700">{suggestion}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}