import React, { useEffect, useState } from 'react';
import { 
  X, 
  MapPin, 
  Building, 
  DollarSign, 
  Calendar, 
  User, 
  Home, 
  TrendingUp, 
  Shield,
  Target,
  BarChart3,
  Plus,
  Eye
} from 'lucide-react';
import { useUIStore } from '../store/ui';
import { SelectedParcel } from '../types/parcel';
import ParcelUnderwritingPanel from './ParcelUnderwritingPanel';
import FullAnalysisModal from './FullAnalysisModal';
import MultiParcelAnalysis from './MultiParcelAnalysis';
import SitePlanDesigner from './SitePlanDesigner';
import { useParcelDetail } from '../hooks/useParcelDetail';
import { recordRecent } from '../lib/recentWork';

interface ParcelDrawerProps {
  parcel: SelectedParcel;
  isOpen: boolean;
  onClose: () => void;
  onAddToProject?: (parcel: SelectedParcel) => void;
  hasActiveProject?: boolean;
  onCreateProjectFromParcel?: (parcel: SelectedParcel) => void;
  /** Go straight to this parcel's plan (Resume last plan, the sample). */
  openPlanner?: boolean;
}

const ParcelDrawer = React.memo(function ParcelDrawer({ parcel, isOpen, onClose, onAddToProject, hasActiveProject, onCreateProjectFromParcel, openPlanner }: ParcelDrawerProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [showMultiParcelAnalysis, setShowMultiParcelAnalysis] = useState(false);
  const [showSitePlanner, setShowSitePlanner] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'underwriting'>('overview');

  // Hydrate the full parcel record (geometry + zoning constraints) for the
  // planner; the drawer's map-click payload can be thin.
  const { parcelDetail } = useParcelDetail(showSitePlanner ? parcel?.ogc_fid : null);

  const parcelId = parcel?.ogc_fid != null ? String(parcel.ogc_fid) : null;
  useEffect(() => {
    if (isOpen && parcelId && openPlanner) setShowSitePlanner(true);
  }, [isOpen, parcelId, openPlanner]);
  // remember that this parcel has a plan, for Resume last plan
  useEffect(() => {
    if (showSitePlanner && parcelId) recordRecent({ ogcFid: parcelId, address: parcel?.address ?? null, zoning: parcel?.zoning ?? null, planned: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSitePlanner, parcelId]);

  if (!isOpen || !parcel) return null;

  // two different acreages: the assessor's deeded figure, and the parcel as mapped
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
  const deeded = num(parcel.deeded_acres) ?? num((parcel as { deededacreage?: unknown }).deededacreage);
  const mapped = num((parcel as { gisacre?: unknown }).gisacre);

  const formatAcreage = (acres: number) => {
    if (acres < 1) {
      return `${Math.round(acres * 43560).toLocaleString()} sq ft`;
    }
    return `${acres.toFixed(2)} acres`;
  };

  const formatCurrency = (amount: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <>
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-xl z-40 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-2">
            <Building className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 truncate" title={parcel.address || undefined}>{parcel.address || 'Parcel'}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close parcel"
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 bg-white">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('underwriting')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'underwriting'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            Underwriting
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="p-4 space-y-6">
              {/* Feasibility first: what is known, what is not, and the one next step */}
              <div className="bg-white border border-gray-200 rounded-lg p-4" data-testid="parcel-feasibility">
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="w-4 h-4 text-blue-600" />
                  <h3 className="font-semibold text-gray-900">Feasibility</h3>
                </div>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-600">Zoning</dt>
                    <dd className="font-medium text-gray-900">{parcel.zoning || 'not on record'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-600">Deeded area <span className="text-gray-400">(assessor)</span></dt>
                    <dd className="font-medium text-gray-900" data-testid="parcel-deeded-acres">{deeded ? formatAcreage(deeded) : 'not on record'}</dd>
                  </div>
                  {mapped != null && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-600">Mapped area <span className="text-gray-400">(parcel map)</span></dt>
                      <dd className="font-medium text-gray-900" data-testid="parcel-mapped-acres">{formatAcreage(mapped)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-600">Current use</dt>
                    <dd className="font-medium text-gray-900 text-right">{parcel.usedesc || 'not on record'}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-gray-600">
                  The planner draws on the parcel as mapped, so its acreage can differ from the deeded figure.
                  Not checked yet: what the zoning allows here, street access, height and parking. The planner checks these when it draws a plan and marks what it could not verify.
                </p>
                <button
                  onClick={() => setShowSitePlanner(true)}
                  data-testid="parcel-open-planner"
                  className="mt-3 w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Building className="w-4 h-4" />
                  <span>Site Planner</span>
                </button>
              </div>

              {/* The assessor's record, for reference */}
              <details className="bg-white border border-gray-200 rounded-lg p-4" data-testid="parcel-assessor">
                <summary className="cursor-pointer select-none font-semibold text-gray-900 flex items-center gap-2">
                  <User className="w-4 h-4 text-green-600" />
                  Assessor record
                </summary>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><dt className="text-gray-600">Parcel ID</dt><dd className="font-medium text-gray-900">{parcel.parcelnumb || 'not on record'}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-gray-600">Owner</dt><dd className="font-medium text-gray-900 text-right">{parcel.primary_owner || parcel.owner || 'not on record'}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-gray-600">Assessed total value</dt><dd className="font-medium text-gray-900">{formatCurrency(parcel.parval)}</dd></div>
                  <div className="flex justify-between gap-4"><dt className="text-gray-600">Assessed land value</dt><dd className="font-medium text-gray-900">{formatCurrency(parcel.landval)}</dd></div>
                  {parcel.yearbuilt && (
                    <div className="flex justify-between gap-4"><dt className="text-gray-600">Year built</dt><dd className="font-medium text-gray-900">{parcel.yearbuilt}</dd></div>
                  )}
                </dl>
                <p className="mt-2 text-xs text-gray-500">Assessed values are the assessor's, not asking prices.</p>
              </details>

              {/* Zoning Summary */}
              {parcel.zoning_data && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-3">
                    <Shield className="w-4 h-4 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">Zoning Summary</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Type</p>
                        <p className="font-medium text-gray-900">{parcel.zoning_data.zoning_type || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Max FAR</p>
                        <p className="font-medium text-gray-900">{parcel.zoning_data.max_far || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Max Height</p>
                        <p className="font-medium text-gray-900">{parcel.zoning_data.max_building_height_ft || 'N/A'} ft</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Max Coverage</p>
                        <p className="font-medium text-gray-900">{parcel.zoning_data.max_coverage_pct || 'N/A'}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowFullAnalysis(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Full Analysis</span>
                </button>
                
                <button
                  onClick={() => setShowMultiParcelAnalysis(true)}
                  data-testid="parcel-assemble"
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add to assemblage</span>
                </button>

                {hasActiveProject && onAddToProject && (
                  <button
                    onClick={() => onAddToProject(parcel)}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" />
                    <span>Add to Project</span>
                  </button>
                )}

                {!hasActiveProject && onCreateProjectFromParcel && (
                  <button
                    onClick={() => onCreateProjectFromParcel(parcel)}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-white text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors" />
                    <span>Create Project from Parcel</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'underwriting' && (
            <div className="p-4">
              <ParcelUnderwritingPanel parcel={parcel} />
            </div>
          )}
        </div>
      </div>

      {/* Full Analysis Modal */}
      <FullAnalysisModal
        parcel={{
          ...parcel,
          ogc_fid: String(parcel.ogc_fid), // Ensure ogc_fid is string
          geometry: parcel.geometry // Pass GeoJSON geometry
        }}
        isOpen={showFullAnalysis}
        onClose={() => setShowFullAnalysis(false)}
      />

      {/* Multi-Parcel Analysis Modal */}
      <MultiParcelAnalysis
        seed={parcel as never}
        isOpen={showMultiParcelAnalysis}
        onClose={() => setShowMultiParcelAnalysis(false)}
      />

      {/* Direct site planner — one click from the parcel, no modal detour.
          SitePlanDesigner portals to <body> full-screen; closing it lands
          back here on the map. */}
      {showSitePlanner && (
        <SitePlanDesigner
          parcel={parcelDetail ?? {
            ...parcel,
            ogc_fid: String(parcel.ogc_fid),
            geometry: parcel.geometry
          }}
          onClose={() => setShowSitePlanner(false)}
        />
      )}
    </>
  );
});

export default ParcelDrawer;




