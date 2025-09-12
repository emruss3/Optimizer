import React from 'react';
import { 
  Calculator, DollarSign, TrendingUp, TrendingDown, Target, 
  Settings, BarChart3, PieChart, RotateCcw, AlertCircle, 
  CheckCircle, Home, Building, Shuffle
} from 'lucide-react';
import { useProject } from '../hooks/useProject';
import { useUnderwriting } from '../hooks/useUnderwriting';

export default function UnderwritingPanel() {
  const { project, calculateMassing } = useProject();
  const massing = calculateMassing;

  const {
    strategy,
    setStrategy,
    assumptions,
    updateAssumption,
    resetToDefaults,
    results,
    customOverrides
  } = useUnderwriting(project, massing);

  const [activeSection, setActiveSection] = React.useState<'assumptions' | 'results' | 'sensitivity'>('assumptions');
  const [showAdvanced, setShowAdvanced] = React.useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (num: number, decimals = 1) => {
    return `${num.toFixed(decimals)}%`;
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const getIRRColor = (irr: number) => {
    if (irr >= 20) return 'text-green-600';
    if (irr >= 15) return 'text-blue-600';
    if (irr >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getIRRStatus = (irr: number) => {
    if (irr >= 20) return 'Excellent';
    if (irr >= 15) return 'Good';
    if (irr >= 10) return 'Marginal';
    return 'Poor';
  };

  if (!project || !massing) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Underwriting Model</h3>
          <p className="text-sm text-gray-600" data-testid="underwriting-empty-state">
            Create a project and add parcels to start financial analysis.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Calculator className="w-5 h-5" />
            <span>Underwriting</span>
          </h2>
          <button
            onClick={resetToDefaults}
            className="p-1 text-gray-400 hover:text-blue-600 rounded"
            title="Reset to defaults"
            data-testid="reset-defaults"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Strategy Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-3">
          <button
            onClick={() => setStrategy('for-sale')}
            className={`flex-1 flex items-center justify-center space-x-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              strategy === 'for-sale' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
            data-testid="strategy-for-sale"
          >
            <Home className="w-4 h-4" />
            <span>For-Sale</span>
          </button>
          <button
            onClick={() => setStrategy('rental')}
            className={`flex-1 flex items-center justify-center space-x-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              strategy === 'rental' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
            data-testid="strategy-rental"
          >
            <Building className="w-4 h-4" />
            <span>Rental</span>
          </button>
        </div>

        {/* Section Navigation */}
        <div className="flex bg-gray-50 rounded-lg p-1">
          <button
            onClick={() => setActiveSection('assumptions')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              activeSection === 'assumptions' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Inputs
          </button>
          <button
            onClick={() => setActiveSection('results')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              activeSection === 'results' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Results
          </button>
          <button
            onClick={() => setActiveSection('sensitivity')}
            className={`flex-1 px-2 py-1 text-xs font-medium rounded transition-colors ${
              activeSection === 'sensitivity' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Analysis
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {/* Quick IRR Summary */}
        {results && (
          <div className="p-4 bg-blue-50 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-900">Current IRR:</span>
              <div className="text-right">
                <span className={`text-lg font-bold ${getIRRColor(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}`}>
                  {formatPercentage(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}
                </span>
                <p className="text-xs text-gray-600">
                  {getIRRStatus(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="p-4">
          <div className="space-y-4">
            {/* Basic inputs for simplified view */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hard Cost per SF
              </label>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">$</span>
                <input
                  type="number"
                  value={assumptions.hardCostPerSF}
                  onChange={(e) => updateAssumption('hardCostPerSF', parseFloat(e.target.value))}
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                  data-testid="hard-cost-input"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Interest Rate %
              </label>
              <input
                type="number"
                step="0.1"
                value={assumptions.interestRate}
                onChange={(e) => updateAssumption('interestRate', parseFloat(e.target.value))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1"
                data-testid="interest-rate-input"
              />
            </div>

            {strategy === 'for-sale' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Price per Unit
                </label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    value={assumptions.salePricePerUnit}
                    onChange={(e) => updateAssumption('salePricePerUnit', parseFloat(e.target.value))}
                    className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                    data-testid="sale-price-input"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rent per Unit/Month
                </label>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-500">$</span>
                  <input
                    type="number"
                    value={assumptions.rentPerUnitPerMonth}
                    onChange={(e) => updateAssumption('rentPerUnitPerMonth', parseFloat(e.target.value))}
                    className="flex-1 text-sm border border-gray-300 rounded px-2 py-1"
                    data-testid="rent-per-unit-input"
                  />
                </div>
              </div>
            )}

            {/* Results Summary */}
            {results && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-3">Key Results</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Development Cost:</span>
                    <span className="font-semibold">{formatCurrency(results.totalDevelopmentCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Equity Required:</span>
                    <span className="font-semibold">{formatCurrency(results.equityRequired)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">IRR:</span>
                    <span className={`font-semibold ${getIRRColor(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}`}>
                      {formatPercentage(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Cash-on-Cash:</span>
                    <span className="font-semibold">
                      {formatPercentage(strategy === 'for-sale' ? results.forSale.cashOnCash : results.rental.cashOnCash)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-white">
        <div className="grid grid-cols-2 gap-2">
          <button 
            onClick={() => setStrategy(strategy === 'for-sale' ? 'rental' : 'for-sale')}
            className="flex items-center justify-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            data-testid="compare-strategies"
          >
            <Shuffle className="w-4 h-4" />
            <span>Compare</span>
          </button>
          <button className="flex items-center justify-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" data-testid="generate-report">
            <TrendingUp className="w-4 h-4" />
            <span>Report</span>
          </button>
        </div>
        {results && (
          <div className="text-center">
            <div className={`text-lg font-bold ${getIRRColor(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)}`}>
              {formatPercentage(strategy === 'for-sale' ? results.forSale.irr : results.rental.irr)} IRR
            </div>
            <div className="text-xs text-gray-600">
              {formatCurrency(results.equityRequired)} equity required
            </div>
          </div>
        )}
      </div>
    </div>
  );
}