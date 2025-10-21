import React, { useState, useEffect } from 'react';
import { X, Building, TrendingUp, Map, Users, DollarSign, Target, Car, Eye } from 'lucide-react';
import { useUIStore } from '../store/ui';
import HBUAnalysisPanel from './HBUAnalysisPanel';
import SitePlanDesigner from './SitePlanDesigner';
import EnterpriseSitePlanner from './EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from './ErrorBoundary';
import { SelectedParcel, isValidParcel, createFallbackParcel, InvestmentAnalysis } from '../types/parcel';
import { toPolygon } from '../engine/geometry/normalize';

interface FullAnalysisModalProps {
  parcel: SelectedParcel;
  isOpen: boolean;
  onClose: () => void;
}

const FullAnalysisModal = React.memo(function FullAnalysisModal({ parcel, isOpen, onClose }: FullAnalysisModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'hbu' | 'siteplan' | 'visual' | 'financial'>('overview');

  // Debug logging for parcel data
  useEffect(() => {
    if (parcel) {
      console.log('🔍 FullAnalysisModal parcel object:', parcel);
      console.log('🔍 isValidParcel check:', isValidParcel(parcel));
      console.log('🔍 Parcel properties:', {
        id: parcel.id,
        ogc_fid: parcel.ogc_fid,
        address: parcel.address,
        sqft: parcel.sqft,
        deeded_acres: parcel.deeded_acres
      });
    }
  }, [parcel]);

  if (!isOpen || !parcel) return null;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Map },
    { id: 'hbu', label: 'HBU Analysis', icon: TrendingUp },
    { id: 'siteplan', label: 'Site Plan', icon: Building },
    { id: 'visual', label: 'Site Design', icon: Eye },
    { id: 'financial', label: 'Financial', icon: DollarSign }
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-7xl max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Building className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900">Full Parcel Analysis</h1>
            </div>
            <div className="text-sm text-gray-600">
              {parcel.address} • {parcel.parcelnumb}
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
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'overview' | 'hbu' | 'siteplan' | 'visual' | 'financial')}
                className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Parcel Summary */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Parcel Summary</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 mb-2">Property Details</h3>
                      <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Address:</span> {parcel.address}</div>
                        <div><span className="font-medium">Parcel #:</span> {parcel.parcelnumb}</div>
                        <div><span className="font-medium">Lot Size:</span> {(parcel.deeded_acres || 0).toFixed(2)} acres</div>
                        <div><span className="font-medium">Zoning:</span> {parcel.zoning}</div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 mb-2">Ownership</h3>
                      <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Owner:</span> {parcel.primary_owner || 'N/A'}</div>
                        <div><span className="font-medium">Use:</span> {parcel.usedesc || 'N/A'}</div>
                        <div><span className="font-medium">Year Built:</span> {parcel.yearbuilt || 'N/A'}</div>
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-600 mb-2">Valuation</h3>
                      <div className="space-y-2 text-sm">
                        <div><span className="font-medium">Total Value:</span> ${(parcel.parval || 0).toLocaleString()}</div>
                        <div><span className="font-medium">Land Value:</span> ${(parcel.landval || 0).toLocaleString()}</div>
                        <div><span className="font-medium">Improvement Value:</span> ${(parcel.improvval || 0).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zoning Regulations */}
                {parcel.zoning_data && (
                  <div className="bg-white border border-gray-200 rounded-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">Zoning Regulations</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-medium text-gray-600 mb-2">Development Constraints</h3>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Max FAR:</span> {parcel.zoning_data.max_far || 'N/A'}</div>
                          <div><span className="font-medium">Max Height:</span> {parcel.zoning_data.max_building_height_ft || 'N/A'} ft</div>
                          <div><span className="font-medium">Max Coverage:</span> {parcel.zoning_data.max_coverage_pct || 'N/A'}%</div>
                          <div><span className="font-medium">Max Density:</span> {parcel.zoning_data.max_density_du_per_acre || 'N/A'} DU/acre</div>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-600 mb-2">Setback Requirements</h3>
                        <div className="space-y-2 text-sm">
                          <div><span className="font-medium">Front:</span> {parcel.zoning_data.min_front_setback_ft || 'N/A'} ft</div>
                          <div><span className="font-medium">Rear:</span> {parcel.zoning_data.min_rear_setback_ft || 'N/A'} ft</div>
                          <div><span className="font-medium">Side:</span> {parcel.zoning_data.min_side_setback_ft || 'N/A'} ft</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'hbu' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Highest & Best Use Analysis</h2>
                  <HBUAnalysisPanel parcel={parcel} />
                </div>
              </div>
            )}

            {activeTab === 'siteplan' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Site Plan Designer</h2>
                  <SitePlanDesigner 
                    parcel={(() => {
                      // Normalize geometry: accept Polygon or MultiPolygon
                      const poly = parcel?.geometry ? toPolygon(parcel.geometry) : null;   // MultiPolygon → Polygon
                      const parcelForPlanner = poly ? { ogc_fid: String(parcel.ogc_fid), geometry: poly } : null;
                      return parcelForPlanner;
                    })()}
                    onUnderwritingUpdate={(financialData) => {
                      console.log('Site plan financial update:', financialData);
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'visual' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Visual Site Plan</h2>
                  <div className="h-[800px]">
                    <SitePlannerErrorBoundary>
                      <EnterpriseSitePlanner
                        parcel={isValidParcel(parcel) ? parcel : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356)}
                        marketData={{
                          avgPricePerSqFt: 300,
                          avgRentPerSqFt: 2.50,
                          capRate: 0.06,
                          constructionCostPerSqFt: 200
                        }}
                        onInvestmentAnalysis={(analysis: InvestmentAnalysis) => {
                          console.log('Investment analysis:', analysis);
                        }}
                      />
                    </SitePlannerErrorBoundary>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'financial' && (
              <div className="space-y-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Financial Analysis</h2>
                  <div className="text-gray-600">
                    Financial analysis tools will be integrated here.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default FullAnalysisModal;
