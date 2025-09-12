import React from 'react';
import { 
  Plus, X, Building2, Calculator, MapPin, Ruler, 
  Target, Settings, Download, Share, Save, TrendingUp,
  DollarSign, Users, Car, Trees, AlertTriangle, CheckCircle, MessageCircle
} from 'lucide-react';
import { useParcelSelection } from '../hooks/useParcelSelection';
import { SkeletonParcelList } from './SkeletonLoader';
import { ProjectState, SelectedParcel, SiteplanConfig, BuildingMassing } from '../types/project';
import { useZoningCompliance } from '../hooks/useZoningCompliance';
import ZoningComplianceIndicator from './ZoningComplianceIndicator';
import { useProject } from '../hooks/useProject';
import { supabase } from '../lib/supabase';
import RealtimeComments from './RealtimeComments';
import Guard from './Guard';

export default function ProjectPanel() {
  const { 
    activeProjectId, 
    activeProjectName, 
    parcelIds: selectedParcelIds, 
    count: selectedCount,
    hasSelection 
  } = useParcelSelection();
  const { removeParcel, isLoading, error } = useActiveProject();
  
  const [parcelDetails, setParcelDetails] = React.useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  
  const { 
    project, 
    createProject, 
    addParcel, 
    removeParcel: removeFromProject, 
    updateSiteplanConfig, 
    calculateMassing,
    clearProject 
  } = useProject();
  
  const [projectName, setProjectName] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<'summary' | 'siteplan' | 'financial'>('summary');

  const massing = calculateMassing;

  // Zoning compliance validation
  const { compliance, validateChange } = useZoningCompliance(
    project?.parcels || [],
    massing,
    project?.siteplanConfig || {
      targetFAR: 2.0,
      targetHeight: 45,
      buildingSetbacks: { front: 25, rear: 20, side: 10 },
      targetCoverage: 40,
      buildingType: 'residential',
      unitsPerAcre: 20,
      parkingRatio: 1.2
    }
  );

  // Load parcel details when selectedParcelIds change
  React.useEffect(() => {
    if (!activeProjectId || selectedParcelIds.length === 0) {
      setParcelDetails([]);
      return;
    }

    const loadParcelDetails = async () => {
      if (!supabase) return;
      
      setLoadingDetails(true);
      try {
        const { data, error } = await supabase
          .from('parcels')
          .select('ogc_fid, parcelnumb, address, deededacreage, gisacre, sqft, zoning, landval, parval')
          .in('ogc_fid', selectedParcelIds.map(id => parseInt(id)).filter(id => !isNaN(id)))
          .limit(100);

        if (error) throw error;
        setParcelDetails(data || []);
      } catch (error) {
        console.error('Error loading parcel details:', error);
        setParcelDetails([]);
      } finally {
        setLoadingDetails(false);
      }
    };

    loadParcelDetails();
  }, [activeProjectId, selectedParcelIds]);

  const handleCreateProject = () => {
    if (projectName.trim()) {
      createProject(projectName.trim());
      setProjectName('');
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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const handleConfigChange = (key: string, value: any) => {
    // Validate changes against zoning requirements
    if (key === 'targetHeight' || key === 'targetFAR' || key === 'targetCoverage') {
      const validation = validateChange(key.replace('target', '').toLowerCase(), value);
      if (!validation.valid) {
        // Show warning but still allow the change
        console.warn('Zoning violation:', validation.message);
      }
    }
    updateSiteplanConfig({ [key]: value });
  };

  const handleRemoveParcel = async (parcelId: string) => {
    await removeParcel(parcelId);
  };
  
  // Button state based on selected parcels
  const hasSelectedParcels = hasSelection;

  if (!activeProjectId) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Project</h3>
          <p className="text-sm text-gray-600 mb-4" data-testid="no-project-message">
            Select a project from the header dropdown to start adding parcels from the map.
          </p>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-blue-700" data-testid="select-project-hint">
              💡 Click the "Project" dropdown in the header to select or create a project
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-gray-900" data-testid="active-project-title">{activeProjectName}</h2>
          {isLoading && (
            <div className="flex items-center space-x-2" data-testid="sync-indicator">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <span className="text-sm text-gray-600">Syncing...</span>
            </div>
          )}
        </div>
        <p className="text-sm text-gray-600">
          {selectedCount} parcel{selectedCount !== 1 ? 's' : ''} selected
        </p>

        {/* Error/Success Toast */}
        {error && (
          <div className={`mt-2 p-2 rounded text-sm ${
            error.includes('added') || error.includes('success') 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}
            data-testid="toast"
          >
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex mt-3 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('siteplan')}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'siteplan' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Site Plan
          </button>
          <button
            onClick={() => setActiveTab('financial')}
            className={`flex-1 px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'financial' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
            }`}
          >
            Financial
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        {activeTab === 'summary' && (
          <>
            {/* Selected Parcels */}
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center space-x-2">
                <MapPin className="w-4 h-4" />
                <span>Selected Parcels</span>
              </h3>
              
              {loadingDetails && (
                <SkeletonParcelList count={3} />
              )}
              
              {!loadingDetails && selectedParcelIds.length === 0 && (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No parcels selected</p>
                  <p className="text-sm text-gray-500 mt-1">Click parcels on the map to add them to this project</p>
                </div>
              )}
              
              {!loadingDetails && parcelDetails.length > 0 && (
                <div className="space-y-2">
                  {parcelDetails.map((parcel) => (
                    <div key={parcel.ogc_fid} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {parcel.address || 'Address not available'}
                          </p>
                          <p className="text-xs text-gray-600">#{parcel.parcelnumb}</p>
                          <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Size:</span>
                              <span className="font-medium ml-1">
                                {(parcel.deededacreage || parcel.gisacre) > 1 
                                  ? `${(parcel.deededacreage || parcel.gisacre || 0).toFixed(2)} ac`
                                  : `${formatNumber(parcel.sqft || 0)} sf`
                                }
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Zoning:</span>
                              <span className="font-medium ml-1">{parcel.zoning || 'N/A'}</span>
                            </div>
                          </div>
                          {parcel.landval && (
                            <div className="mt-1 text-xs">
                              <span className="text-gray-500">Value:</span>
                              <span className="font-medium ml-1">{formatCurrency(parcel.landval)}</span>
                            </div>
                          )}
                        </div>
                        <div className="ml-2 flex items-center space-x-1">
                          <RealtimeComments
                            projectId={activeProjectId}
                            parcelId={String(parcel.ogc_fid)}
                          />
                          <Guard roles={['analyst']}>
                            <button
                              onClick={() => handleRemoveParcel(String(parcel.ogc_fid))}
                              disabled={isLoading}
                              className="p-1 text-gray-400 hover:text-red-600 rounded disabled:opacity-50"
                              data-testid={`remove-parcel-${parcel.ogc_fid}`}
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </Guard>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Other tabs would go here but simplified for now */}
        {activeTab === 'siteplan' && (
          <div className="p-4">
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Site plan configuration</p>
              <p className="text-sm text-gray-500 mt-1">Add parcels to configure site planning options</p>
            </div>
          </div>
        )}

        {activeTab === 'financial' && (
          <div className="p-4">
            <div className="text-center py-8">
              <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Financial analysis</p>
              <p className="text-sm text-gray-500 mt-1">Add parcels to view financial projections</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 space-y-2 flex-shrink-0 bg-white">
        <div className="text-center text-sm text-gray-600 mb-2">
          Project: {activeProjectName} ({selectedCount} parcels)
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <Guard roles={['analyst']}>
              <button 
                disabled={!hasSelectedParcels}
                className="flex items-center justify-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed" 
                data-testid="save-project"
              >
                <Save className="w-4 h-4" />
                <span>Save</span>
              </button>
            </Guard>
            <Guard roles={['manager']}>
              <button className="flex items-center justify-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" data-testid="share-project">
                <Share className="w-4 h-4" />
                <span>Share</span>
              </button>
            </Guard>
            <Guard roles={['analyst']}>
              <button 
                disabled={!hasSelectedParcels}
                className="flex items-center justify-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed" 
                data-testid="export-project"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </Guard>
          </div>
          <Guard roles={['analyst']}>
            <button 
              disabled={!hasSelectedParcels}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors text-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
              data-testid="generate-analysis"
            >
              → Generate Full Analysis
            </button>
          </Guard>
        </div>
      </div>
    </div>
  );
}