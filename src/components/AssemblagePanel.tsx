import React, { useState, useEffect } from 'react';
import { 
  Combine, Plus, Trash2, Target, Zap, BarChart3, 
  Map as MapIcon, Building, Calculator, TrendingUp, 
  AlertTriangle, CheckCircle, Settings, RefreshCw
} from 'lucide-react';
import { useParcelSelection } from '../hooks/useParcelSelection';
import { useProject } from '../hooks/useProject';
import { SelectedParcel } from '../types/project';
import Guard from './Guard';
import SitePlanVisualizer from './SitePlanVisualizer';
import { useCost } from '../hooks/useCost';

export default function AssemblagePanel() {
  const { activeProjectId, parcelIds: selectedParcelIds, count: selectedCount } = useParcelSelection();
  const { project } = useProject();
  const { 
    getAssemblageGeometry,
    calculateUnifiedConstraints,
    optimizeYieldScenarios,
    calculateLiveMassing,
    isOptimizing,
    optimizationResults 
  } = useYieldEngine();
  
  // Hard-cost lookup for construction estimates
  const { unitCost: concreteCost } = useCost('03300');
  const { unitCost: steelCost } = useCost('05100');
  
  const [selectedAssemblage, setSelectedAssemblage] = useState<AssemblageData | null>(null);
  const [newAssemblageName, setNewAssemblageName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [parcelDetails, setParcelDetails] = useState<any[]>([]);

  // Load assemblages when project changes
  useEffect(() => {
    if (activeProjectId) {
      fetchAssemblageGeom(activeProjectId, selectedParcelIds);
      loadParcelDetails();
    }
  }, [activeProjectId, selectedParcelIds.join('|')]);

  const loadParcelDetails = async () => {
    if (!supabase || selectedParcelIds.length === 0) {
      setParcelDetails([]);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('parcels')
        .select('ogc_fid, parcelnumb, address, deededacreage, gisacre, sqft, zoning, landval')
        .in('ogc_fid', selectedParcelIds.map(id => parseInt(id)).filter(id => !isNaN(id)));

      if (error) throw error;
      
      const details = data?.map(p => ({
        id: p.ogc_fid.toString(),
        parcelnumb: p.parcelnumb,
        address: p.address,
        deededacreage: p.deededacreage || p.gisacre || 0,
        sqft: p.sqft || 0,
        zoning: p.zoning,
        landval: p.landval
      })) || [];
      
      setParcelDetails(details);
    } catch (error) {
      console.error('Error loading parcel details:', error);
      setParcelDetails([]);
    }
  };

  const handleCreateAssemblage = async () => {
    if (!activeProjectId || !newAssemblageName.trim() || parcelDetails.length < 2) return;

    const selectedParcels: SelectedParcel[] = parcelDetails.map(detail => ({
      id: detail.id,
      parcelnumb: detail.parcelnumb,
      address: detail.address,
      deededacreage: detail.deededacreage,
      sqft: detail.sqft,
      zoning: detail.zoning,
      geometry: { type: 'Polygon', coordinates: [] }, // Will be calculated by ST_Union
      landval: detail.landval,
      parval: detail.landval * 1.2
    }));

    // Create explicit assemblage for multi-parcel combinations
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('project_assemblages')
        .insert({
          project_id: activeProjectId,
          name: newAssemblageName.trim(),
          parcel_ids: selectedParcels.map(p => p.id),
          is_implicit: false,
          total_acres: selectedParcels.reduce((sum, p) => sum + p.deededacreage, 0),
          zoning_mix: selectedParcels.reduce((mix, p) => {
            mix[p.zoning] = (mix[p.zoning] || 0) + p.deededacreage;
            return mix;
          }, {} as Record<string, number>)
        })
        .select()
        .single();

      if (error) throw error;
      
      setSelectedAssemblage(data);
      setNewAssemblageName('');
      setShowCreateForm(false);
    } catch (error) {
      console.error('Error creating assemblage:', error);
    }
  };

  const handleOptimizeMassing = async () => {
    const selectedParcels: SelectedParcel[] = parcelDetails.map(detail => ({
      id: detail.id,
      parcelnumb: detail.parcelnumb,
      address: detail.address,
      deededacreage: detail.deededacreage,
      sqft: detail.sqft,
      zoning: detail.zoning,
      geometry: { type: 'Polygon', coordinates: [] },
      landval: detail.landval,
      parval: detail.landval * 1.2
    }));
    
    const results = await optimizeYieldScenarios(selectedParcels);
    console.log('Optimization results:', results);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatAcres = (acres: number) => {
    return `${acres.toFixed(2)} ac`;
  };

  if (!activeProjectId) {
    return (
      <div className="p-6 text-center">
        <Combine className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Assemblage Analysis</h3>
        <p className="text-sm text-gray-600">
          Select a project to create parcel assemblages and optimize yield
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
            <Combine className="w-5 h-5" />
            <span>Assemblage Engine</span>
          </h2>
          <Guard roles={['analyst']}>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              disabled={selectedParcelIds.length === 0}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-colors ${
                selectedParcelIds.length === 0
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : selectedParcelIds.length === 1
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Plus className="w-4 h-4" />
              <span>{selectedParcelIds.length === 1 ? 'Analyze Site' : 'Combine Parcels'}</span>
            </button>
          </Guard>
        </div>
        
        {/* KPI Bar - Site Acres & Buildable SF (works for 1+ parcels) */}
        {selectedParcelIds.length > 0 && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Site Acres:</span>
                <div className="font-semibold text-blue-700">
                  {formatAcres(parcelDetails.reduce((sum, p) => sum + p.deededacreage, 0))}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Buildable SF:</span>
                <div className="font-semibold text-blue-700">
                  {parcelDetails.reduce((sum, p) => sum + p.sqft, 0).toLocaleString()} sf
                </div>
              </div>
              <div>
                <span className="text-gray-600">Est. Units:</span>
                <div className="font-semibold text-green-700">
                  {Math.floor(parcelDetails.reduce((sum, p) => sum + p.deededacreage, 0) * 25)}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Est. IRR:</span>
                <div className="font-semibold text-purple-700">
                  {selectedParcelIds.length >= 2 ? '16.2%' : '14.5%'}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-sm text-gray-600 mt-2">
          {selectedCount} parcel{selectedCount !== 1 ? 's' : ''} selected
          {selectedCount === 1 && ' - Single parcel analysis available'}
          {selectedCount > 1 && ' - Multi-parcel assemblage available'}
        </p>
        
        {/* Optimize Button - Available for 1+ parcels */}
        {selectedCount > 0 && (
          <Guard roles={['analyst']}>
            <button
              onClick={handleOptimizeMassing}
              disabled={isOptimizing}
              className={`w-full mt-3 flex items-center justify-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                isOptimizing 
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isOptimizing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              <span>{isOptimizing ? 'Optimizing...' : 'Optimize Massing'}</span>
            </button>
          </Guard>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {/* Create Assemblage Form - Only show for 2+ parcels */}
        {showCreateForm && selectedCount > 1 && (
          <div className="p-4 bg-blue-50 border-b border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-3">Create New Assemblage</h3>
            
            {/* Selected Parcels Preview */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selected Parcels ({parcelDetails.length})
              </label>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {parcelDetails.map((parcel) => (
                  <div key={parcel.id} className="text-xs bg-white p-2 rounded border">
                    <span className="font-medium">{parcel.address}</span>
                    <span className="text-gray-500 ml-2">
                      {formatAcres(parcel.deededacreage)} • {parcel.zoning}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm">
                <span className="font-medium">Total: </span>
                <span>{formatAcres(parcelDetails.reduce((sum, p) => sum + p.deededacreage, 0))}</span>
                <span className="text-gray-500 ml-2">
                  Mixed zoning: {Array.from(new Set(parcelDetails.map(p => p.zoning))).join(', ')}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Assemblage Name
                </label>
                <input
                  type="text"
                  value={newAssemblageName}
                  onChange={(e) => setNewAssemblageName(e.target.value)}
                  placeholder="e.g. Main Street Development"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus-ring"
                />
              </div>
              
              <div className="flex space-x-2">
                <button
                  onClick={handleCreateAssemblage}
                  disabled={!newAssemblageName.trim()}
                  className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                >
                  Create Assemblage
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Single Parcel Analysis */}
        {selectedCount === 1 && (
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Single Parcel Analysis</h3>
            {parcelDetails.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h4 className="font-semibold text-gray-900">{parcelDetails[0].address}</h4>
                    <p className="text-sm text-gray-600">
                      {parcelDetails[0].parcelnumb} • {formatAcres(parcelDetails[0].deededacreage)}
                    </p>
                  </div>
                </div>

                {/* Single Parcel Metrics */}
                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div className="text-center">
                    <div className="font-semibold text-blue-600">
                      {getZoningFAR(parcelDetails[0].zoning)}
                    </div>
                    <div className="text-xs text-gray-600">Max FAR</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-purple-600">
                      {getZoningHeight(parcelDetails[0].zoning)}ft
                    </div>
                    <div className="text-xs text-gray-600">Max Height</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-green-600">
                      {Math.floor(parcelDetails[0].sqft * 0.8).toLocaleString()}sf
                    </div>
                    <div className="text-xs text-gray-600">Buildable</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Multi-Parcel Assemblages */}
        {selectedCount > 1 && (
          <div className="p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Multi-Parcel Assemblage</h3>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-gray-900">
                    {selectedCount}-Parcel Assemblage
                  </h4>
                  <p className="text-sm text-gray-600">
                    {formatAcres(parcelDetails.reduce((sum, p) => sum + p.deededacreage, 0))} total
                  </p>
                </div>
              </div>

              {/* Zoning Mix */}
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-700 mb-1 block">Zoning Mix:</label>
                <div className="flex flex-wrap gap-1">
                  {Array.from(new Set(parcelDetails.map(p => p.zoning))).map((zoning) => {
                    const acres = parcelDetails
                      .filter(p => p.zoning === zoning)
                      .reduce((sum, p) => sum + p.deededacreage, 0);
                    return (
                      <span
                        key={zoning}
                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium"
                      >
                        {zoning} ({formatAcres(acres)})
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Assemblage Metrics */}
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="text-center">
                  <div className="font-semibold text-blue-600">
                    {Math.min(...parcelDetails.map(p => getZoningFAR(p.zoning))).toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-600">Max FAR</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-purple-600">
                    {Math.min(...parcelDetails.map(p => getZoningHeight(p.zoning)))}ft
                  </div>
                  <div className="text-xs text-gray-600">Max Height</div>
                </div>
                <div className="text-center">
                  <div className="font-semibold text-green-600">
                    {Math.floor(parcelDetails.reduce((sum, p) => sum + p.sqft, 0) * 0.9).toLocaleString()}sf
                  </div>
                  <div className="text-xs text-gray-600">Buildable</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedCount === 0 && (
          <div className="text-center py-8">
            <Combine className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No parcels selected</p>
            <p className="text-sm text-gray-500 mt-1">
              Click parcels on the map to start site analysis
            </p>
          </div>
        )}

        {/* Optimization Results */}
        {optimizationResults.length > 0 && selectedCount > 0 && (
          <div className="p-4 border-t border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
              <Target className="w-4 h-4" />
              <span>Top 3 IRR Scenarios</span>
            </h3>
            <div className="space-y-3">
              {optimizationResults.slice(0, 3).map((scenario, index) => (
                <OptimalScenarioCard key={index} scenario={scenario} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Optimal Scenario Card Component
function OptimalScenarioCard({ 
  scenario
}: {
  scenario: YieldScenario;
}) {
  const getRankingColor = (irr: number) => {
    if (irr >= 18) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (irr >= 15) return 'bg-green-100 text-green-800 border-green-200';
    return 'bg-blue-100 text-blue-800 border-blue-200';
  };

  return (
    <div className={`border rounded-lg p-3 ${getRankingColor(scenario.estimatedIRR)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">
            {scenario.estimatedIRR >= 18 ? '🥇' : scenario.estimatedIRR >= 15 ? '🥈' : '🥉'}
          </span>
          <h4 className="font-semibold">{scenario.scenarioName}</h4>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg">{scenario.estimatedIRR.toFixed(1)}% IRR</div>
          <div className="text-xs">{scenario.estimatedROI.toFixed(1)}% ROI</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-gray-600">FAR:</span>
          <div className="font-medium">{(scenario.farUtilization * 4.0).toFixed(2)}</div>
        </div>
        <div>
          <span className="text-gray-600">Height:</span>
          <div className="font-medium">{Math.floor(scenario.heightUtilization * 90)}ft</div>
        </div>
        <div>
          <span className="text-gray-600">Units:</span>
          <div className="font-medium">{scenario.estimatedUnits}</div>
        </div>
        <div>
          <span className="text-gray-600">Coverage:</span>
          <div className="font-medium">{(scenario.coverageUtilization * 100).toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-2 flex justify-between items-center">
        <button className="text-xs bg-white bg-opacity-60 px-2 py-1 rounded border hover:bg-opacity-80 transition-colors">
          Apply to Project
        </button>
        <button className="text-xs bg-white bg-opacity-60 px-2 py-1 rounded border hover:bg-opacity-80 transition-colors">
          View Details
        </button>
      </div>
    </div>
  );
}