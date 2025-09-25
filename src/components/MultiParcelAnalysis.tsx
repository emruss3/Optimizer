import React, { useState, useEffect } from 'react';
import { Plus, X, Building, Map, Users, DollarSign, Target, Car } from 'lucide-react';
import { useUIStore } from '../store/ui';
import { GeoJSONGeometry } from '../types/parcel';

interface SelectedParcel {
  id: string;
  address: string;
  parcelnumb: string;
  deeded_acres: number;
  sqft: number;
  zoning: string;
  parval: number;
  geometry: GeoJSONGeometry;
}

interface MultiParcelAnalysisProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MultiParcelAnalysis({ isOpen, onClose }: MultiParcelAnalysisProps) {
  const [selectedParcels, setSelectedParcels] = useState<SelectedParcel[]>([]);
  const [activeTab, setActiveTab] = useState<'selection' | 'analysis' | 'comparison'>('selection');
  const { selectedParcel } = useUIStore();

  // Add current parcel to selection if available
  useEffect(() => {
    if (selectedParcel && !selectedParcels.find(p => p.id === selectedParcel.ogc_fid?.toString())) {
      setSelectedParcels(prev => [...prev, {
        id: selectedParcel.ogc_fid?.toString() || '',
        address: selectedParcel.address || '',
        parcelnumb: selectedParcel.parcelnumb || '',
        deeded_acres: selectedParcel.deeded_acres || 0,
        sqft: selectedParcel.sqft || 0,
        zoning: selectedParcel.zoning || '',
        parval: selectedParcel.parval || 0,
        geometry: selectedParcel.geometry
      }]);
    }
  }, [selectedParcel, selectedParcels]);

  const removeParcel = (id: string) => {
    setSelectedParcels(prev => prev.filter(p => p.id !== id));
  };

  const getCombinedStats = () => {
    if (selectedParcels.length === 0) return null;

    const totalAcres = selectedParcels.reduce((sum, p) => sum + p.deeded_acres, 0);
    const totalSqft = selectedParcels.reduce((sum, p) => sum + p.sqft, 0);
    const totalValue = selectedParcels.reduce((sum, p) => sum + p.parval, 0);
    const avgValuePerAcre = totalAcres > 0 ? totalValue / totalAcres : 0;

    return {
      totalAcres,
      totalSqft,
      totalValue,
      avgValuePerAcre,
      parcelCount: selectedParcels.length
    };
  };

  const combinedStats = getCombinedStats();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Building className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Multi-Parcel Analysis</h1>
            </div>
            <div className="text-sm text-gray-600">
              {selectedParcels.length} parcel{selectedParcels.length !== 1 ? 's' : ''} selected
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('selection')}
            className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'selection'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Selection</span>
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'analysis'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
            disabled={selectedParcels.length === 0}
          >
            <Target className="w-4 h-4" />
            <span>Combined Analysis</span>
          </button>
          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'comparison'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
            disabled={selectedParcels.length < 2}
          >
            <Map className="w-4 h-4" />
            <span>Comparison</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto p-6">
            {activeTab === 'selection' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-900 mb-2">How to Add Parcels</h3>
                  <p className="text-blue-800 text-sm">
                    Click on parcels in the map to add them to your analysis. You can analyze individual parcels 
                    or combine multiple parcels for comprehensive development analysis.
                  </p>
                </div>

                {selectedParcels.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Selected Parcels</h3>
                    <div className="grid gap-4">
                      {selectedParcels.map((parcel) => (
                        <div key={parcel.id} className="bg-white border border-gray-200 rounded-lg p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-4">
                                <div>
                                  <h4 className="font-medium text-gray-900">{parcel.address}</h4>
                                  <p className="text-sm text-gray-600">
                                    Parcel #{parcel.parcelnumb} • {parcel.deeded_acres.toFixed(2)} acres • {parcel.zoning}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm font-medium text-gray-900">
                                    ${parcel.parval.toLocaleString()}
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    ${(parcel.parval / parcel.deeded_acres).toLocaleString()}/acre
                                  </div>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => removeParcel(parcel.id)}
                              className="ml-4 p-2 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedParcels.length === 0 && (
                  <div className="text-center py-12">
                    <Building className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Parcels Selected</h3>
                    <p className="text-gray-600">
                      Click on parcels in the map to start your multi-parcel analysis.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'analysis' && combinedStats && (
              <div className="space-y-6">
                {/* Combined Statistics */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Combined Statistics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">
                        {combinedStats.parcelCount}
                      </div>
                      <div className="text-sm text-gray-600">Parcels</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">
                        {combinedStats.totalAcres.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-600">Total Acres</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-purple-600">
                        {combinedStats.totalSqft.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Total Sq Ft</div>
                    </div>
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600">
                        ${combinedStats.totalValue.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Total Value</div>
                    </div>
                  </div>
                </div>

                {/* Development Potential */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Development Potential</h2>
                  <div className="text-gray-600">
                    <p>Combined analysis tools will be integrated here, including:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Combined zoning analysis</li>
                      <li>Master site planning</li>
                      <li>Infrastructure requirements</li>
                      <li>Phased development options</li>
                      <li>Combined financial modeling</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'comparison' && selectedParcels.length >= 2 && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Parcel Comparison</h2>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Address
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Size
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Zoning
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            $/Acre
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedParcels.map((parcel) => (
                          <tr key={parcel.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {parcel.address}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {parcel.deeded_acres.toFixed(2)} acres
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {parcel.zoning}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              ${parcel.parval.toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              ${(parcel.parval / parcel.deeded_acres).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}




