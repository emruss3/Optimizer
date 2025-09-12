import React, { useState } from 'react';
import { TrendingUp, TrendingDown, ArrowLeftRight, DollarSign, Calculator, BarChart3, Target } from 'lucide-react';
import { UnderwritingResults, InvestmentStrategy } from '../types/underwriting';
import { ProjectState, BuildingMassing } from '../types/project';

interface ScenarioCompareProps {
  forSaleResults: UnderwritingResults | null;
  rentalResults: UnderwritingResults | null;
  project: ProjectState | null;
  massing: BuildingMassing | null;
}

export default function ScenarioCompare({ forSaleResults, rentalResults, project, massing }: ScenarioCompareProps) {
  const [compareMode, setCompareMode] = useState<'side-by-side' | 'overlay'>('side-by-side');

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

  const calculateDelta = (forSaleValue: number, rentalValue: number) => {
    if (rentalValue === 0) return { delta: 0, percentage: 0 };
    const delta = forSaleValue - rentalValue;
    const percentage = (delta / rentalValue) * 100;
    return { delta, percentage };
  };

  const DeltaPill = ({ delta, percentage }: { delta: number; percentage: number }) => {
    const isPositive = delta > 0;
    const isNeutral = Math.abs(percentage) < 1;
    
    return (
      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        isNeutral ? 'bg-gray-100 text-gray-600' :
        isPositive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}>
        {isPositive ? '+' : ''}{formatPercentage(percentage, 0)}
        {!isNeutral && (isPositive ? <TrendingUp className="w-3 h-3 ml-1" /> : <TrendingDown className="w-3 h-3 ml-1" />)}
      </div>
    );
  };

  const ComparisonRow = ({ 
    label, 
    forSaleValue, 
    rentalValue, 
    formatter = formatCurrency,
    icon 
  }: {
    label: string;
    forSaleValue: number;
    rentalValue: number;
    formatter?: (val: number) => string;
    icon?: React.ReactNode;
  }) => {
    const { delta, percentage } = calculateDelta(forSaleValue, rentalValue);
    
    return (
      <div className="grid grid-cols-4 gap-3 py-3 border-b border-gray-100 items-center">
        <div className="flex items-center space-x-2 text-sm font-medium text-gray-700">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-sm text-right font-medium text-green-700">
          {formatter(forSaleValue)}
        </div>
        <div className="text-sm text-right font-medium text-blue-700">
          {formatter(rentalValue)}
        </div>
        <div className="text-right">
          <DeltaPill delta={delta} percentage={percentage} />
        </div>
      </div>
    );
  };

  if (!forSaleResults || !rentalResults || !project || !massing) {
    return (
      <div className="p-6 text-center">
        <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Scenario Comparison</h3>
        <p className="text-sm text-gray-600">
          Add parcels and run both for-sale and rental analysis to compare scenarios
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <ArrowLeftRight className="w-5 h-5" />
            <span>Scenario Comparison</span>
          </h2>
          <button
            onClick={() => setCompareMode(compareMode === 'side-by-side' ? 'overlay' : 'side-by-side')}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
          >
            {compareMode === 'side-by-side' ? 'Overlay View' : 'Side by Side'}
          </button>
        </div>
        <p className="text-sm text-gray-600">{project.name} • {massing.units || 0} units</p>
      </div>

      {/* Comparison Table */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <div className="p-4">
          {/* Header Row */}
          <div className="grid grid-cols-4 gap-3 py-2 border-b-2 border-gray-200 mb-4">
            <div className="text-sm font-semibold text-gray-900">Metric</div>
            <div className="text-sm font-semibold text-green-700 text-right">For-Sale</div>
            <div className="text-sm font-semibold text-blue-700 text-right">Rental</div>
            <div className="text-sm font-semibold text-gray-900 text-right">Difference</div>
          </div>

          {/* Investment Returns */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <Target className="w-4 h-4" />
              <span>Investment Returns</span>
            </h3>
            
            <ComparisonRow
              label="IRR"
              forSaleValue={forSaleResults.forSale.irr}
              rentalValue={rentalResults.rental.irr}
              formatter={formatPercentage}
              icon={<TrendingUp className="w-4 h-4 text-green-600" />}
            />
            
            <ComparisonRow
              label="Cash-on-Cash"
              forSaleValue={forSaleResults.forSale.cashOnCash}
              rentalValue={rentalResults.rental.cashOnCash}
              formatter={formatPercentage}
              icon={<DollarSign className="w-4 h-4 text-blue-600" />}
            />
            
            <ComparisonRow
              label="Total Return"
              forSaleValue={forSaleResults.forSale.profitBeforeFinancing}
              rentalValue={rentalResults.rental.totalReturn}
              icon={<Calculator className="w-4 h-4 text-purple-600" />}
            />
          </div>

          {/* Development Costs */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Development Costs</h3>
            
            <ComparisonRow
              label="Total Dev Cost"
              forSaleValue={forSaleResults.totalDevelopmentCost}
              rentalValue={rentalResults.totalDevelopmentCost}
            />
            
            <ComparisonRow
              label="Equity Required"
              forSaleValue={forSaleResults.equityRequired}
              rentalValue={rentalResults.equityRequired}
            />
            
            <ComparisonRow
              label="Loan Amount"
              forSaleValue={forSaleResults.loanAmount}
              rentalValue={rentalResults.loanAmount}
            />
          </div>

          {/* Revenue Analysis */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Revenue Analysis</h3>
            
            <ComparisonRow
              label="Gross Revenue"
              forSaleValue={forSaleResults.forSale.grossRevenue}
              rentalValue={rentalResults.rental.yearOneNOI * 20} // Approximation
            />
            
            <ComparisonRow
              label="Net Revenue"
              forSaleValue={forSaleResults.forSale.netRevenue}
              rentalValue={rentalResults.rental.stabilizedNOI * 15} // Approximation
            />
          </div>

          {/* Risk Analysis */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Risk & Sensitivity</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-medium text-green-700 mb-2">For-Sale Strategy</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Market timing risk</li>
                  <li>• Construction delays</li>
                  <li>• Sales velocity risk</li>
                  <li>• Interest rate exposure</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-blue-700 mb-2">Rental Strategy</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>• Vacancy risk</li>
                  <li>• Operating cost inflation</li>
                  <li>• Cap rate expansion</li>
                  <li>• Long-term hold risk</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-white">
        <div className="grid grid-cols-2 gap-2">
          <button className="bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors text-sm">
            Choose For-Sale
          </button>
          <button className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm">
            Choose Rental
          </button>
        </div>
        <button className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm">
          Export Comparison Report
        </button>
      </div>
    </div>
  );
}