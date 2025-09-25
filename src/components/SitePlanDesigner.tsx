import React, { useState, useEffect } from 'react';
import { 
  Building, 
  Car, 
  TreePine, 
  Settings, 
  Play, 
  RotateCcw,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Target,
  BarChart3,
  DollarSign,
  Users,
  Home,
  Building2,
  Eye
} from 'lucide-react';
import { useSitePlanDesigner } from '../hooks/useSitePlanDesigner';
import { RegridZoningData } from '../types/zoning';
import { SelectedParcel, isValidParcel, InvestmentAnalysis } from '../types/parcel';
import { SitePlannerErrorBoundary } from './ErrorBoundary';
import EnterpriseSitePlanner from './EnterpriseSitePlanner';

interface SitePlanDesignerProps {
  parcel: SelectedParcel;
  onUnderwritingUpdate?: (financialData: InvestmentAnalysis) => void;
}

const SitePlanDesigner = React.memo(function SitePlanDesigner({ 
  parcel,
  onUnderwritingUpdate 
}: SitePlanDesignerProps) {
  const {
    configuration,
    sitePlanResult,
    loading,
    error,
    generateSitePlan,
    updateConfiguration,
    updateUnitMix,
    autoGenerate,
    getConstraintSummary,
    getFeasibilityStatus,
    getOptimizationScore,
    getFinancialSummary,
    getParkingSummary,
    validateConfiguration,
    getRecommendedConfigurations,
    isEngineAvailable,
    hasSitePlan,
    isFeasible
  } = useSitePlanDesigner(parcel.zoning_data, parcel.sqft);

  const [activeTab, setActiveTab] = useState<'design' | 'visual' | 'analysis' | 'recommendations'>('design');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Auto-generate when configuration changes
  useEffect(() => {
    if (isEngineAvailable) {
      autoGenerate();
    }
  }, [configuration, isEngineAvailable, autoGenerate]);

  // Update underwriting when site plan changes
  useEffect(() => {
    if (sitePlanResult && onUnderwritingUpdate) {
      const financialSummary = getFinancialSummary();
      if (financialSummary) {
        onUnderwritingUpdate({
          sitePlanCost: financialSummary.totalCost,
          sitePlanRevenue: financialSummary.totalRevenue,
          netImpact: financialSummary.netImpact,
          costPerUnit: financialSummary.costPerUnit,
          revenuePerUnit: financialSummary.revenuePerUnit
        });
      }
    }
  }, [sitePlanResult, onUnderwritingUpdate, getFinancialSummary]);

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

  const getFeasibilityColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-100';
      case 'good': return 'text-blue-600 bg-blue-100';
      case 'acceptable': return 'text-yellow-600 bg-yellow-100';
      case 'infeasible': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const constraintSummary = getConstraintSummary();
  const feasibilityStatus = getFeasibilityStatus();
  const optimizationScore = getOptimizationScore();
  const financialSummary = getFinancialSummary();
  const parkingSummary = getParkingSummary();
  const validation = validateConfiguration();
  const recommendations = getRecommendedConfigurations();

  if (!isEngineAvailable) {
    return (
      <div className="p-6 text-center text-gray-500">
        <Building className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>Site plan engine not available</p>
        <p className="text-sm">Zoning data and lot size required</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 max-h-[700px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Building className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Site Plan Designer</h2>
        </div>
        <div className="flex items-center space-x-1">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFeasibilityColor(feasibilityStatus)}`}>
            {feasibilityStatus.toUpperCase()}
          </span>
          {optimizationScore > 0 && (
            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
              {optimizationScore.toFixed(0)}%
            </span>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab('design')}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'design' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Design
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'visual' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <div className="flex items-center justify-center space-x-1">
            <Eye className="w-3 h-3" />
            <span>Visual</span>
          </div>
        </button>
        <button
          onClick={() => setActiveTab('analysis')}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'analysis' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Analysis
        </button>
        <button
          onClick={() => setActiveTab('recommendations')}
          className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
            activeTab === 'recommendations' 
              ? 'bg-white text-blue-600 shadow-sm' 
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <span className="truncate">Recs</span>
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <h3 className="text-red-800 font-medium">Error</h3>
          </div>
          <p className="text-red-700 mt-2">{error}</p>
        </div>
      )}

      {/* Validation Errors */}
      {validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-2" />
            <h3 className="text-red-800 font-medium">Configuration Errors</h3>
          </div>
          <ul className="text-red-700 mt-2 space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Design Tab */}
      {activeTab === 'design' && (
        <div className="space-y-6">
          {/* Basic Configuration */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Basic Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Target Units */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Units
                </label>
                <input
                  type="number"
                  value={configuration.targetUnits}
                  onChange={(e) => updateConfiguration({ targetUnits: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              {/* Building Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Building Type
                </label>
                <select
                  value={configuration.buildingType}
                  onChange={(e) => updateConfiguration({ buildingType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="mixed-use">Mixed-Use</option>
                </select>
              </div>

              {/* Parking Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Parking Type
                </label>
                <select
                  value={configuration.parkingType}
                  onChange={(e) => updateConfiguration({ parkingType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="surface">Surface</option>
                  <option value="garage">Garage</option>
                  <option value="underground">Underground</option>
                </select>
              </div>

              {/* Amenity Space */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amenity Space (sq ft)
                </label>
                <input
                  type="number"
                  value={configuration.amenitySpace}
                  onChange={(e) => updateConfiguration({ amenitySpace: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="0"
                />
              </div>
            </div>
          </div>

          {/* Unit Mix */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Unit Mix</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(configuration.unitMix).map(([unitType, percentage]) => (
                <div key={unitType}>
                  <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">
                    {unitType.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={percentage}
                      onChange={(e) => updateUnitMix(unitType as keyof typeof configuration.unitMix, parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-900 w-12">
                      {formatPercent(percentage)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              Total: {formatPercent(Object.values(configuration.unitMix).reduce((sum, val) => sum + val, 0))}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center space-x-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Settings className="w-4 h-4" />
              <span>Advanced Settings</span>
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Open Space Ratio
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="range"
                      min="0"
                      max="0.5"
                      step="0.05"
                      value={configuration.openSpaceRatio}
                      onChange={(e) => updateConfiguration({ openSpaceRatio: parseFloat(e.target.value) })}
                      className="flex-1"
                    />
                    <span className="text-sm font-medium text-gray-900 w-12">
                      {formatPercent(configuration.openSpaceRatio)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Tab */}
      {activeTab === 'visual' && (
        <div className="space-y-6">
          <SitePlannerErrorBoundary>
            <EnterpriseSitePlanner
              parcel={parcel}
              marketData={{
                avgPricePerSqFt: 300,
                avgRentPerSqFt: 2.50,
                capRate: 0.06,
                constructionCostPerSqFt: 200
              }}
              onInvestmentAnalysis={(analysis) => {
                console.log('Investment analysis:', analysis);
                if (onUnderwritingUpdate) {
                  onUnderwritingUpdate(analysis);
                }
              }}
            />
          </SitePlannerErrorBoundary>
        </div>
      )}

      {/* Analysis Tab */}
      {activeTab === 'analysis' && sitePlanResult && (
        <div className="space-y-3">
          {/* Building Massing */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-3">
              <Building2 className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Building Massing</h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {sitePlanResult.buildingMassing.stories}
                </div>
                <div className="text-xs text-gray-600">Stories</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {sitePlanResult.buildingMassing.totalGSF.toLocaleString()}
                </div>
                <div className="text-xs text-gray-600">Total GSF</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {sitePlanResult.buildingMassing.far.toFixed(2)}
                </div>
                <div className="text-xs text-gray-600">FAR</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">
                  {formatPercent(sitePlanResult.buildingMassing.coverage / 100)}
                </div>
                <div className="text-xs text-gray-600">Coverage</div>
              </div>
            </div>
          </div>

          {/* Financial Analysis */}
          {financialSummary && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-3">
                <DollarSign className="w-4 h-4 text-green-600" />
                <h3 className="text-sm font-semibold text-gray-900">Financial Analysis</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600">
                    {formatCurrency(financialSummary.totalCost)}
                  </div>
                  <div className="text-xs text-gray-600">Total Cost</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600">
                    {formatCurrency(financialSummary.totalRevenue)}
                  </div>
                  <div className="text-xs text-gray-600">Total Revenue</div>
                </div>
                <div className="text-center">
                  <div className={`text-sm font-bold ${financialSummary.netImpact >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(financialSummary.netImpact)}
                  </div>
                  <div className="text-xs text-gray-600">Net Impact</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-blue-600">
                    {formatCurrency(financialSummary.costPerUnit)}
                  </div>
                  <div className="text-xs text-gray-600">Cost/Unit</div>
                </div>
              </div>
            </div>
          )}

          {/* Parking Analysis */}
          {parkingSummary && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center space-x-2 mb-3">
                <Car className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-semibold text-gray-900">Parking Analysis</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-sm font-bold text-purple-600">
                    {parkingSummary.requiredSpaces}
                  </div>
                  <div className="text-xs text-gray-600">Required Spaces</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-purple-600">
                    {formatCurrency(parkingSummary.costPerSpace)}
                  </div>
                  <div className="text-xs text-gray-600">Cost/Space</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-purple-600">
                    {formatCurrency(parkingSummary.totalCost)}
                  </div>
                  <div className="text-xs text-gray-600">Total Cost</div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-bold text-purple-600">
                    {parkingSummary.efficiency.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-600">Spaces/1000 SF</div>
                </div>
              </div>
            </div>
          )}

          {/* Constraint Analysis */}
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="flex items-center space-x-2 mb-3">
              <Target className="w-4 h-4 text-orange-600" />
              <h3 className="text-sm font-semibold text-gray-900">Constraint Analysis</h3>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">FAR Utilization</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-blue-600 h-1.5 rounded-full" 
                      style={{ width: `${Math.min(sitePlanResult.buildingMassing.constraintAnalysis.farUtilization, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-gray-900">
                    {sitePlanResult.buildingMassing.constraintAnalysis.farUtilization.toFixed(1)}%
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Height Utilization</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-green-600 h-1.5 rounded-full" 
                      style={{ width: `${Math.min(sitePlanResult.buildingMassing.constraintAnalysis.heightUtilization, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-gray-900">
                    {sitePlanResult.buildingMassing.constraintAnalysis.heightUtilization.toFixed(1)}%
                  </span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">Coverage Utilization</span>
                <div className="flex items-center space-x-2">
                  <div className="w-24 bg-gray-200 rounded-full h-1.5">
                    <div 
                      className="bg-purple-600 h-1.5 rounded-full" 
                      style={{ width: `${Math.min(sitePlanResult.buildingMassing.constraintAnalysis.coverageUtilization, 100)}%` }}
                    ></div>
                  </div>
                  <span className="text-xs font-medium text-gray-900">
                    {sitePlanResult.buildingMassing.constraintAnalysis.coverageUtilization.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Violations and Warnings */}
          {(sitePlanResult.violations.length > 0 || sitePlanResult.warnings.length > 0) && (
            <div className="space-y-4">
              {sitePlanResult.violations.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <h3 className="font-semibold text-red-900">Violations</h3>
                  </div>
                  <ul className="space-y-1">
                    {sitePlanResult.violations.map((violation, index) => (
                      <li key={index} className="text-sm text-red-700">• {violation}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              {sitePlanResult.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <h3 className="font-semibold text-yellow-900">Warnings</h3>
                  </div>
                  <ul className="space-y-1">
                    {sitePlanResult.warnings.map((warning, index) => (
                      <li key={index} className="text-sm text-yellow-700">• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recommendations Tab */}
      {activeTab === 'recommendations' && (
        <div className="space-y-6">
          {/* Recommended Configurations */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Recommended Configurations</h3>
            
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{rec.name}</h4>
                    <button
                      onClick={() => updateConfiguration(rec.configuration)}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Apply
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{rec.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Units:</span>
                      <span className="ml-2 font-medium">{rec.configuration.targetUnits}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Type:</span>
                      <span className="ml-2 font-medium capitalize">{rec.configuration.buildingType}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Parking:</span>
                      <span className="ml-2 font-medium capitalize">{rec.configuration.parkingType}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Amenities:</span>
                      <span className="ml-2 font-medium">{rec.configuration.amenitySpace.toLocaleString()} sf</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Optimization Recommendations */}
          {sitePlanResult && sitePlanResult.recommendations.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Optimization Recommendations</h3>
              
              <div className="space-y-3">
                {sitePlanResult.recommendations.map((recommendation, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-gray-700">{recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Generating site plan...</span>
        </div>
      )}
    </div>
  );
});

export default SitePlanDesigner;
