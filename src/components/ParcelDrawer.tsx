import React, { useState } from 'react';
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

interface ParcelDrawerProps {
  parcel: SelectedParcel;
  isOpen: boolean;
  onClose: () => void;
  onAddToProject?: (parcel: SelectedParcel) => void;
  hasActiveProject?: boolean;
}

const ParcelDrawer = React.memo(function ParcelDrawer({ parcel, isOpen, onClose, onAddToProject, hasActiveProject }: ParcelDrawerProps) {
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);
  const [showMultiParcelAnalysis, setShowMultiParcelAnalysis] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'underwriting'>('overview');

  if (!isOpen || !parcel) return null;

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
            <h2 className="text-lg font-semibold text-gray-900">Parcel Details</h2>
          </div>
          <button
            onClick={onClose}
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
              {/* Property Summary */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <h3 className="font-semibold text-gray-900">Property Summary</h3>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Address</p>
                    <p className="font-medium text-gray-900">{parcel.address || 'N/A'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Parcel #</p>
                      <p className="font-medium text-gray-900">{parcel.parcelnumb || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Lot Size</p>
                      <p className="font-medium text-gray-900">
                        {formatAcreage(parcel.deeded_acres || parcel.deededacreage || parcel.gisacre || 0)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Zoning</p>
                      <p className="font-medium text-gray-900">{parcel.zoning || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Use</p>
                      <p className="font-medium text-gray-900">{parcel.usedesc || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ownership & Valuation */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <User className="w-4 h-4 text-green-600" />
                  <h3 className="font-semibold text-gray-900">Ownership & Valuation</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-600">Owner</p>
                    <p className="font-medium text-gray-900">{parcel.primary_owner || parcel.owner || 'N/A'}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Total Value</p>
                      <p className="font-medium text-gray-900">{formatCurrency(parcel.parval)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Land Value</p>
                      <p className="font-medium text-gray-900">{formatCurrency(parcel.landval)}</p>
                    </div>
                  </div>

                  {parcel.yearbuilt && (
                    <div>
                      <p className="text-sm text-gray-600">Year Built</p>
                      <p className="font-medium text-gray-900">{parcel.yearbuilt}</p>
                    </div>
                  )}
                </div>
              </div>

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
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>Full Analysis</span>
                </button>
                
                <button
                  onClick={() => setShowMultiParcelAnalysis(true)}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Multi-Parcel Analysis</span>
                </button>

                {hasActiveProject && onAddToProject && (
                  <button
                    onClick={() => onAddToProject(parcel)}
                    className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add to Project</span>
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
        parcel={parcel}
        isOpen={showFullAnalysis}
        onClose={() => setShowFullAnalysis(false)}
      />

      {/* Multi-Parcel Analysis Modal */}
      <MultiParcelAnalysis
        isOpen={showMultiParcelAnalysis}
        onClose={() => setShowMultiParcelAnalysis(false)}
      />
    </>
  );
});

export default ParcelDrawer;




