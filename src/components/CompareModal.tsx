import React, { useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, BarChart3, TrendingUp, DollarSign, Building, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { computeUnderwriting, getDefaultCosts, UnderwritingInputs } from '../lib/finance';

interface CompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  parcelIds: string[];
}

interface ParcelComparison {
  ogc_fid: string;
  parcelnumb: string;
  address: string;
  sqft: number;
  zoning: string;
  landval: number;
  irr: number;
  yield_on_cost: number;
  hbu: string; // Highest and Best Use
}

export default function CompareModal({ isOpen, onClose, parcelIds }: CompareModalProps) {
  const [comparisons, setComparisons] = useState<ParcelComparison[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && parcelIds.length > 0) {
      loadComparisons();
    }
  }, [isOpen, parcelIds]);

  const loadComparisons = async () => {
    if (!supabase || parcelIds.length === 0) return;

    setLoading(true);
    try {
      // Load basic parcel data
      const { data: parcels, error } = await supabase
        .from('parcels')
        .select('ogc_fid, parcelnumb, address, sqft, zoning, landval')
        .in('ogc_fid', parcelIds.map(id => parseInt(id)).filter(id => !isNaN(id)))
        .limit(5);

      if (error) throw error;

      // Calculate IRR for each parcel
      const comparisonsData: ParcelComparison[] = [];
      
      for (const parcel of parcels || []) {
        // Get default costs for this zoning
        const costs = getDefaultCosts(parcel.zoning);
        const acres = (parcel.sqft || 0) / 43560;
        
        // Calculate IRR using client-side calculation
        const underwritingInputs: UnderwritingInputs = {
          land_cost: acres * costs.land_cost_per_acre,
          hard_cost: (parcel.sqft || 0) * costs.hard_cost_per_sf * 2.0,
          soft_cost: 0,
          contingency: 0,
          loan_amount: ((parcel.sqft || 0) * costs.hard_cost_per_sf * 2.0 + acres * costs.land_cost_per_acre) * 0.75,
          revenue: Math.floor(acres * 25) * costs.sale_price_per_unit,
          development_months: 18
        };

        const metrics = computeUnderwriting(underwritingInputs);

        // Determine Highest and Best Use
        const hbu = determineHBU(parcel.zoning, acres, metrics.irr_annual_pct);

        comparisonsData.push({
          ogc_fid: parcel.ogc_fid.toString(),
          parcelnumb: parcel.parcelnumb,
          address: parcel.address,
          sqft: parcel.sqft || 0,
          zoning: parcel.zoning,
          landval: parcel.landval || 0,
          irr: metrics.irr_annual_pct,
          yield_on_cost: metrics.yield_on_cost_pct,
          hbu
        });
      }

      setComparisons(comparisonsData);

    } catch (error) {
      console.error('Error loading comparisons:', error);
    } finally {
      setLoading(false);
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

  const getHBUColor = (hbu: string) => {
    if (hbu.includes('Multi-Family')) return 'bg-blue-100 text-blue-700';
    if (hbu.includes('Mixed')) return 'bg-purple-100 text-purple-700';
    if (hbu.includes('Commercial')) return 'bg-orange-100 text-orange-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-6xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title
                  as="h3"
                  className="text-lg font-medium leading-6 text-gray-900 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5" />
                    <span>Compare Parcels ({comparisons.length})</span>
                  </div>
                  <button
                    onClick={onClose}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </Dialog.Title>

                <div className="mt-6">
                  {loading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-600">Calculating financial metrics...</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Parcel
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Size
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Zoning
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Land Value
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              IRR
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Yield on Cost
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              HBU
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {comparisons.map((comparison) => (
                            <tr key={comparison.ogc_fid} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {comparison.address}
                                  </div>
                                  <div className="text-sm text-gray-500">
                                    #{comparison.parcelnumb}
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {comparison.sqft.toLocaleString()} sf
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                  {comparison.zoning}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatCurrency(comparison.landval)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`text-sm font-semibold ${getIRRColor(comparison.irr)}`}>
                                  {formatPercentage(comparison.irr)}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {formatPercentage(comparison.yield_on_cost)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getHBUColor(comparison.hbu)}`}>
                                  {comparison.hbu}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!loading && comparisons.length === 0 && (
                    <div className="text-center py-8">
                      <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No parcels to compare</p>
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    disabled={comparisons.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                  >
                    Export Comparison
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

// Helper function to determine Highest and Best Use
function determineHBU(zoning: string, acres: number, irr: number): string {
  if (irr < 10) return 'Hold/Sell As-Is';
  
  if (zoning.startsWith('RM')) {
    if (acres > 2) return 'Mixed-Use Development';
    return 'Multi-Family Residential';
  }
  
  if (zoning.startsWith('R')) {
    if (acres > 5) return 'Large Multi-Family';
    return 'Multi-Family Residential';
  }
  
  if (zoning.startsWith('C')) {
    return 'Commercial Development';
  }
  
  if (zoning.startsWith('MU')) {
    return 'Mixed-Use Development';
  }
  
  return 'Redevelopment Opportunity';
}