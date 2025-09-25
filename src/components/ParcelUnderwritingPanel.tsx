import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calculator, DollarSign, TrendingUp, RefreshCw, 
  Download, Settings, AlertTriangle, CheckCircle,
  Target, BarChart3, PieChart
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { computeUnderwriting, getDefaultCosts, UnderwritingInputs, UnderwritingOutputs } from '../lib/finance';
import CostEditor from './CostEditor';
import { useDetailedCosts } from '../hooks/useDetailedCosts';
import { SelectedParcel } from '../types/parcel';
import { Program } from '../lib/costSchema';

interface DefaultCosts {
  use_type: string;
  land_cost_per_acre: number;
  hard_cost_per_sf: number;
  soft_cost_percentage: number;
  contingency_percentage: number;
  loan_to_cost: number;
  interest_rate: number;
  rent_per_sf_per_month: number;
  sale_price_per_sf: number;
  rent_per_unit_per_month: number;
  sale_price_per_unit: number;
  vacancy_rate: number;
  operating_expense_ratio: number;
  cap_rate: number;
  development_months: number;
  lease_up_months: number;
}


interface ParcelUnderwritingPanelProps {
  parcel: SelectedParcel;
  onClose?: () => void;
}

// Helper function to map zoning to use type using enhanced zoning data
function getUseTypeFromZoning(parcel: SelectedParcel): string {
  // First try to use the enhanced zoning data
  if (parcel.zoning_type) {
    switch (parcel.zoning_type.toLowerCase()) {
      case 'residential':
        if (parcel.zoning_subtype?.toLowerCase().includes('single')) return 'Single-Family';
        if (parcel.zoning_subtype?.toLowerCase().includes('multi')) return 'Multi-Family';
        if (parcel.zoning_subtype?.toLowerCase().includes('townhouse')) return 'Townhouse';
        return 'Multi-Family';
      case 'commercial':
        return 'Commercial';
      case 'industrial':
        return 'Industrial';
      case 'mixed-use':
        return 'Mixed-Use';
      case 'agricultural':
        return 'Agricultural';
      default:
        return 'General';
    }
  }
  
  // Fallback to legacy zoning code parsing
  const zoning = parcel.zoning || '';
  if (zoning.startsWith('RS')) return 'Single-Family';
  if (zoning.startsWith('R')) return 'Multi-Family';
  if (zoning.startsWith('RM')) return 'Mixed-Use';
  if (zoning.startsWith('C')) return 'Commercial';
  if (zoning.startsWith('MU')) return 'Mixed-Use';
  return 'General';
}

const ParcelUnderwritingPanel = React.memo(function ParcelUnderwritingPanel({ parcel, onClose }: ParcelUnderwritingPanelProps) {
  const [defaultCosts, setDefaultCosts] = useState<DefaultCosts | null>(null);
  const [editableCosts, setEditableCosts] = useState<Partial<DefaultCosts>>({});
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<'for-sale' | 'rental'>('for-sale');
  const [exportingPDF, setExportingPDF] = useState(false);
  const [showDetailedCosts, setShowDetailedCosts] = useState(false);
  const [totalCostFromEditor, setTotalCostFromEditor] = useState<number | null>(null);

  // Calculate program for detailed cost editor
  const program = useMemo((): Program => {
    const acres = parcel.deeded_acres || parcel.deededacreage || parcel.gisacre || 0;
    const sqft = parcel.sqft || (acres * 43560);
    const buildableSf = sqft * 2.0; // Assume 2.0 FAR for demo
    const units = Math.floor(acres * 25); // 25 units per acre estimate
    
    return {
      lotSqft: sqft,
      buildableSf,
      units
    };
  }, [parcel]);

  // Detailed cost breakdown
  const {
    lineItems,
    breakdown,
    loading: costsLoading,
    updateLineItems
  } = useDetailedCosts(null, String(parcel.ogc_fid), program); // No project context for individual parcel

  // Load default costs when parcel changes
  useEffect(() => {
    if (parcel?.zoning) {
      loadDefaultCosts(parcel);
    }
  }, [parcel?.zoning]);

  // Instant metrics calculation using useMemo
  const metrics = useMemo((): UnderwritingOutputs | null => {
    if (!defaultCosts || !parcel || loading) return null;

    try {
      // Merge default costs with editable overrides
      const finalCosts = { ...defaultCosts, ...editableCosts };
      
      // Calculate project parameters
      const acres = parcel.deeded_acres || parcel.deededacreage || parcel.gisacre || 0;
      const sqft = parcel.sqft || (acres * 43560);
      
      // Use detailed cost breakdown if available, otherwise use simple calculation
      const landCost = acres * finalCosts.land_cost_per_acre;
      // Calculate costs
      const hardCost = sqft * finalCosts.hard_cost_per_sf * 2.0; // Assume 2.0 FAR
      const softCost = hardCost * (finalCosts.soft_cost_percentage / 100);
      const contingency = (hardCost + softCost) * (finalCosts.contingency_percentage / 100);
      
      const totalCost = totalCostFromEditor || (landCost + hardCost + softCost + contingency);
      
      const loanAmount = totalCost * (finalCosts.loan_to_cost / 100);
      
      // Calculate revenue based on strategy
      let revenue = 0;
      if (strategy === 'for-sale') {
        const estimatedUnits = Math.floor(acres * 25); // 25 units per acre estimate
        revenue = estimatedUnits * finalCosts.sale_price_per_unit;
      } else {
        const grossRent = sqft * finalCosts.rent_per_sf_per_month * 12 * 2.0; // Assume 2.0 FAR
        const effectiveRent = grossRent * (1 - finalCosts.vacancy_rate / 100);
        const noi = effectiveRent * (1 - finalCosts.operating_expense_ratio / 100);
        revenue = noi / (finalCosts.cap_rate / 100); // Property value
      }

      // Use client-side calculation
      const underwritingInputs: UnderwritingInputs = {
        land_cost: landCost,
        hard_cost: hardCost,
        soft_cost: softCost,
        contingency: contingency,
        loan_amount: loanAmount,
        revenue,
        development_months: finalCosts.development_months
      };

      return computeUnderwriting(underwritingInputs);

    } catch (error) {
      console.error('Error calculating metrics:', error);
      return null;
    }
  }, [defaultCosts, editableCosts, strategy, parcel, loading, totalCostFromEditor]);

  const loadDefaultCosts = async (parcel: SelectedParcel) => {
    setLoading(true);
    try {
      // Use client-side default costs
      const rpcData = getDefaultCosts(parcel.zoning);
      
      const costs: DefaultCosts = {
        use_type: getUseTypeFromZoning(parcel),
        land_cost_per_acre: rpcData.land_cost_per_acre || 500000,
        hard_cost_per_sf: rpcData.hard_cost_per_sf || 180,
        soft_cost_percentage: 20,
        contingency_percentage: 10,
        loan_to_cost: 75,
        interest_rate: 7.5,
        rent_per_sf_per_month: 1.80,
        sale_price_per_sf: 320,
        rent_per_unit_per_month: rpcData.rent_per_unit_per_month || 1800,
        sale_price_per_unit: rpcData.sale_price_per_unit || 350000,
        vacancy_rate: 5.0,
        operating_expense_ratio: 35.0,
        cap_rate: 5.5,
        development_months: 18,
        lease_up_months: 6
      };
      setDefaultCosts(costs);
      setEditableCosts({}); // Reset overrides

    } catch (error) {
      console.error('Error loading default costs:', error);
      // Fallback to hardcoded defaults
      setDefaultCosts({
        use_type: 'General',
        land_cost_per_acre: 500000,
        hard_cost_per_sf: 180,
        soft_cost_percentage: 20,
        contingency_percentage: 10,
        loan_to_cost: 75,
        interest_rate: 7.5,
        rent_per_sf_per_month: 1.80,
        sale_price_per_sf: 320,
        rent_per_unit_per_month: 1800,
        sale_price_per_unit: 350000,
        vacancy_rate: 5.0,
        operating_expense_ratio: 35.0,
        cap_rate: 5.5,
        development_months: 18,
        lease_up_months: 6
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCostChange = (key: keyof DefaultCosts, value: number) => {
    setEditableCosts(prev => ({ ...prev, [key]: value }));
  };

  const handleExportPDF = async () => {
    if (!parcel) return;

    setExportingPDF(true);
    try {
      const { data, error } = await supabase.functions.invoke('pdf-export', {
        body: {
          projectData: {
            name: `Parcel ${parcel.parcelnumb}`,
            parcel: parcel,
            metrics: metrics,
            costs: { ...defaultCosts, ...editableCosts }
          },
          reportType: 'underwriting'
        }
      });

      if (error) throw error;

      // Trigger download
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      link.download = `parcel-${parcel.parcelnumb}-underwriting.pdf`;
      link.click();

    } catch (error) {
      console.error('PDF export error:', error);
    } finally {
      setExportingPDF(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const getIRRColor = (irr: number) => {
    if (irr >= 20) return 'text-green-600';
    if (irr >= 15) return 'text-blue-600';
    if (irr >= 10) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (!parcel) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
            <Calculator className="w-5 h-5" />
            <span>Underwriting Analysis</span>
          </h3>
          <div className="flex items-center space-x-2">
            <button
              className="p-1 text-gray-400 hover:text-blue-600 rounded"
              title="Recalculate"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="mt-2">
          <p className="text-sm text-gray-600">
            {parcel.address} • {parcel.parcelnumb} • {parcel.zoning}
            {parcel.zoning_type && (
              <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                {parcel.zoning_type}
                {parcel.zoning_subtype && ` - ${parcel.zoning_subtype}`}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {(parcel.deeded_acres || parcel.deededacreage || parcel.gisacre || 0).toFixed(2)} acres • 
            {(parcel.sqft || 0).toLocaleString()} sq ft
          </p>
        </div>
      </div>

      {/* Strategy Toggle */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setStrategy('for-sale')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              strategy === 'for-sale' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            For-Sale
          </button>
          <button
            onClick={() => setStrategy('rental')}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              strategy === 'rental' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Rental
          </button>
        </div>
      </div>

      {/* Enhanced Zoning Information */}
      {(parcel.zoning_type || parcel.max_far || parcel.max_density_du_per_acre) && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2 mb-3">
            <Target className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-gray-900">Zoning Constraints</h4>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {parcel.max_far && (
              <div>
                <span className="text-gray-600">Max FAR:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.max_far}</span>
              </div>
            )}
            {parcel.max_density_du_per_acre && (
              <div>
                <span className="text-gray-600">Max Density:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.max_density_du_per_acre} DU/acre</span>
              </div>
            )}
            {parcel.max_building_height_ft && (
              <div>
                <span className="text-gray-600">Max Height:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.max_building_height_ft} ft</span>
              </div>
            )}
            {parcel.max_coverage_pct && (
              <div>
                <span className="text-gray-600">Max Coverage:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.max_coverage_pct}%</span>
              </div>
            )}
            {parcel.min_lot_area_sq_ft && (
              <div>
                <span className="text-gray-600">Min Lot Area:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.min_lot_area_sq_ft.toLocaleString()} sq ft</span>
              </div>
            )}
            {parcel.min_front_setback_ft && (
              <div>
                <span className="text-gray-600">Front Setback:</span>
                <span className="ml-2 font-medium text-gray-900">{parcel.min_front_setback_ft} ft</span>
              </div>
            )}
          </div>
          {parcel.permitted_land_uses && (
            <div className="mt-3">
              <div className="text-gray-600 text-sm font-medium mb-2">Permitted Uses:</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(parcel.permitted_land_uses).slice(0, 3).map(([category, uses]) => (
                  <span key={category} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                    {category}: {Array.isArray(uses) ? uses.slice(0, 2).join(', ') : uses}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Key Metrics Grid */}
      {metrics && (
        <div className="p-4 border-b border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-3">Financial Results</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg text-center">
              <div className={`text-2xl font-bold ${getIRRColor(metrics.irr_annual_pct)}`} data-e2e="irr-cell">
                {formatPercentage(metrics.irr_annual_pct)}
              </div>
              <div className="text-xs text-gray-600">IRR</div>
            </div>
            <div className="bg-green-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">
                {formatPercentage(metrics.yield_on_cost_pct)}
              </div>
              <div className="text-xs text-gray-600">Yield on Cost</div>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">
                {metrics.equity_multiple.toFixed(2)}x
              </div>
              <div className="text-xs text-gray-600">Equity Multiple</div>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-orange-600">
                {formatPercentage(metrics.cash_on_cash_pct)}
              </div>
              <div className="text-xs text-gray-600">Cash-on-Cash</div>
            </div>
          </div>
        </div>
      )}

      {/* Cost Inputs */}
      {defaultCosts && (
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900">Cost Assumptions</h4>
            <div className="text-xs text-blue-600">
              Default: {defaultCosts.use_type}
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Hard Cost ($/SF)
                </label>
                <input
                  type="number"
                  value={editableCosts.hard_cost_per_sf ?? defaultCosts.hard_cost_per_sf}
                  onChange={(e) => handleCostChange('hard_cost_per_sf', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                  step="10"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Interest Rate (%)
                </label>
                <input
                  type="number"
                  value={editableCosts.interest_rate ?? defaultCosts.interest_rate}
                  onChange={(e) => handleCostChange('interest_rate', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                  step="0.1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {strategy === 'for-sale' ? 'Sale Price/Unit' : 'Rent/Unit/Month'}
                </label>
                <input
                  type="number"
                  value={
                    strategy === 'for-sale'
                      ? editableCosts.sale_price_per_unit ?? defaultCosts.sale_price_per_unit
                      : editableCosts.rent_per_unit_per_month ?? defaultCosts.rent_per_unit_per_month
                  }
                  onChange={(e) => 
                    handleCostChange(
                      strategy === 'for-sale' ? 'sale_price_per_unit' : 'rent_per_unit_per_month',
                      parseFloat(e.target.value)
                    )
                  }
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                  step={strategy === 'for-sale' ? '10000' : '50'}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Loan-to-Cost (%)
                </label>
                <input
                  type="number"
                  value={editableCosts.loan_to_cost ?? defaultCosts.loan_to_cost}
                  onChange={(e) => handleCostChange('loan_to_cost', parseFloat(e.target.value))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                  step="5"
                  min="0"
                  max="95"
                />
              </div>
            </div>

            {strategy === 'rental' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Vacancy Rate (%)
                  </label>
                  <input
                    type="number"
                    value={editableCosts.vacancy_rate ?? defaultCosts.vacancy_rate}
                    onChange={(e) => handleCostChange('vacancy_rate', parseFloat(e.target.value))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                    step="0.5"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Cap Rate (%)
                  </label>
                  <input
                    type="number"
                    value={editableCosts.cap_rate ?? defaultCosts.cap_rate}
                    onChange={(e) => handleCostChange('cap_rate', parseFloat(e.target.value))}
                    className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus-ring"
                    step="0.25"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      {metrics && (
        <div className="p-4 border-b border-gray-200">
          <h4 className="font-semibold text-gray-900 mb-3">Cost Breakdown</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Development Cost:</span>
              <span className="font-medium">{formatCurrency(metrics.total_cost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Equity Required:</span>
              <span className="font-medium">{formatCurrency(metrics.equity_required)}</span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-gray-600">Estimated Profit:</span>
              <span className={`font-semibold ${metrics.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(metrics.profit)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-2">
        <button
          onClick={handleExportPDF}
          disabled={exportingPDF || !metrics}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors flex items-center justify-center space-x-2"
        >
          {exportingPDF ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            <Download className="w-4 h-4" />
          )}
          <span>{exportingPDF ? 'Generating PDF...' : 'Export PDF Report'}</span>
        </button>
        
      {/* Detailed Cost Breakdown Tab */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setShowDetailedCosts(!showDetailedCosts)}
            className="flex items-center space-x-2 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <Calculator className="w-4 h-4" />
            <span>{showDetailedCosts ? 'Hide' : 'Show'} Detailed Cost Breakdown</span>
          </button>
          {breakdown && (
            <div className="text-sm font-medium text-gray-900">
              TDC: {formatCurrency(breakdown.tdc)}
            </div>
          )}
        </div>
        
        {showDetailedCosts && (
          <CostEditor
            program={program}
            onChange={updateLineItems}
            onTotalCostChange={setTotalCostFromEditor}
          />
        )}
      </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => window.location.reload()}
            className="bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-1"
          >
            <Calculator className="w-3 h-3" />
            <span className="text-sm">Recalculate</span>
          </button>
          
          <button className="border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm">
            Save to Project
          </button>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading cost data...</p>
          </div>
        </div>
      )}
    </div>
  );
});

export default ParcelUnderwritingPanel;