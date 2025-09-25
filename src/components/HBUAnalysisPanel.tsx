import React from 'react';
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Building, 
  DollarSign, 
  Target,
  BarChart3,
  Shield,
  Clock,
  Percent
} from 'lucide-react';
import { useHBUAnalysis } from '../hooks/useHBUAnalysis';
import { SelectedParcel } from '../types/parcel';

interface HBUAnalysisPanelProps {
  parcel: SelectedParcel;
  onClose?: () => void;
}

const HBUAnalysisPanel = React.memo(function HBUAnalysisPanel({ parcel, onClose }: HBUAnalysisPanelProps) {
  const {
    analysis,
    loading,
    error,
    analyzeParcel,
    getTopAlternatives,
    getRecommendedAlternative,
    getConfidenceLevel,
    getRiskFactors,
    getOpportunities,
    getFinancialSummary,
    getConstraintSummary,
    getMarketSummary,
    isAnalysisComplete,
    hasHighConfidence
  } = useHBUAnalysis();

  const [isAnalyzing, setIsAnalyzing] = React.useState(false);

  React.useEffect(() => {
    if (parcel) {
      console.log('Starting HBU analysis for parcel:', parcel);
      setIsAnalyzing(true);
      analyzeParcel(parcel)
        .then((result) => {
          console.log('HBU analysis completed:', result);
        })
        .catch((err) => {
          console.error('HBU analysis failed:', err);
        })
        .finally(() => setIsAnalyzing(false));
    }
  }, [parcel, analyzeParcel]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-green-600 bg-green-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading || isAnalyzing) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing highest and best use...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <h3 className="text-red-800 font-medium">Analysis Error</h3>
          </div>
          <p className="text-red-700 mt-2">{error}</p>
          <button
            onClick={() => analyzeParcel(parcel)}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p>No analysis available</p>
        </div>
      </div>
    );
  }

  const recommended = getRecommendedAlternative();
  const financialSummary = getFinancialSummary();
  const constraintSummary = getConstraintSummary();
  const marketSummary = getMarketSummary();
  const riskFactors = getRiskFactors();
  const opportunities = getOpportunities();
  const confidenceLevel = getConfidenceLevel();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Target className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Highest & Best Use Analysis</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {/* Recommendation Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-blue-900">Recommended Use</h3>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConfidenceColor(confidenceLevel)}`}>
            {confidenceLevel.toUpperCase()} CONFIDENCE
          </span>
        </div>
        <div className="text-2xl font-bold text-blue-800 capitalize">
          {analysis.recommendedUse.replace('-', ' ')}
        </div>
        {recommended && (
          <div className="mt-2 text-sm text-blue-700">
            {recommended.use} • {formatCurrency(recommended.estimatedValue)} estimated value
          </div>
        )}
      </div>

      {/* Financial Summary */}
      {financialSummary && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center space-x-2 mb-3">
            <DollarSign className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Financial Projections</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-green-700">Estimated Value</div>
              <div className="text-lg font-semibold text-green-800">
                {formatCurrency(financialSummary.estimatedValue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">Development Cost</div>
              <div className="text-lg font-semibold text-green-800">
                {formatCurrency(financialSummary.developmentCost)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">Net Present Value</div>
              <div className="text-lg font-semibold text-green-800">
                {formatCurrency(financialSummary.netPresentValue)}
              </div>
            </div>
            <div>
              <div className="text-sm text-green-700">IRR</div>
              <div className="text-lg font-semibold text-green-800">
                {formatPercent(financialSummary.internalRateOfReturn)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Alternatives */}
      <div>
        <div className="flex items-center space-x-2 mb-3">
          <BarChart3 className="w-5 h-5 text-purple-600" />
          <h3 className="font-semibold text-gray-900">Alternative Uses</h3>
        </div>
        <div className="space-y-3">
          {getTopAlternatives(3).map((alternative, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{alternative.use}</div>
                  <div className="text-sm text-gray-600">
                    {alternative.density > 0 ? `${alternative.density} DU/acre` : `${alternative.height} ft height`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">
                    {formatCurrency(alternative.netPresentValue)}
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatPercent(alternative.internalRateOfReturn)} IRR
                  </div>
                </div>
              </div>
              {alternative.constraints.length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-gray-500">Constraints:</div>
                  <div className="text-xs text-gray-600">
                    {alternative.constraints.join(', ')}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Constraints & Market Factors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Constraints */}
        {constraintSummary && constraintSummary.total > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Shield className="w-5 h-5 text-orange-600" />
              <h3 className="font-semibold text-orange-900">Zoning Constraints</h3>
            </div>
            <div className="space-y-2">
              {constraintSummary.constraints.map((constraint, index) => (
                <div key={index} className="text-sm">
                  <div className="font-medium text-orange-800">{constraint.description}</div>
                  <div className="text-orange-700">
                    Impact: {constraint.impact}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Market Factors */}
        {marketSummary && marketSummary.total > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <h3 className="font-semibold text-indigo-900">Market Factors</h3>
            </div>
            <div className="space-y-2">
              {marketSummary.factors.map((factor, index) => (
                <div key={index} className="text-sm">
                  <div className="font-medium text-indigo-800">{factor.factor}</div>
                  <div className="text-indigo-700">
                    {factor.impact} • Weight: {factor.weight}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Risk Factors & Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk Factors */}
        {riskFactors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-semibold text-red-900">Risk Factors</h3>
            </div>
            <ul className="space-y-1">
              {riskFactors.map((risk, index) => (
                <li key={index} className="text-sm text-red-700">• {risk}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-green-900">Opportunities</h3>
            </div>
            <ul className="space-y-1">
              {opportunities.map((opportunity, index) => (
                <li key={index} className="text-sm text-green-700">• {opportunity}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Analysis Metadata */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center space-x-2 mb-2">
          <Clock className="w-4 h-4 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Analysis Details</h3>
        </div>
        <div className="text-sm text-gray-600 space-y-1">
          <div>Analysis Date: {analysis.analysisDate.toLocaleDateString()}</div>
          <div>Analyst: {analysis.analyst}</div>
          <div>Confidence Score: {analysis.confidence}%</div>
          <div>Alternatives Analyzed: {analysis.alternatives.length}</div>
        </div>
      </div>
    </div>
  );
});

export default HBUAnalysisPanel;
