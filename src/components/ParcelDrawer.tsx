import React from 'react';
import { 
  X, MapPin, Ruler, Building, DollarSign, User, Calendar, 
  Home, Shield, TrendingUp, FileText, Globe, AlertTriangle,
  Banknote, Scale, TreePine, Waves
} from 'lucide-react';
import ParcelUnderwritingPanel from './ParcelUnderwritingPanel';
import { safeStringify } from '../utils/safeJson';

interface ParcelDrawerProps {
  parcel: any;
  isOpen: boolean;
  onClose: () => void;
  onAddToProject?: (parcel: any) => void;
  hasActiveProject?: boolean;
}

export default function ParcelDrawer({ parcel, isOpen, onClose, onAddToProject, hasActiveProject }: ParcelDrawerProps) {
  if (!isOpen || !parcel) return null;

  // Generate unique IDs for accessibility
  const drawerId = `parcel-drawer-${parcel.ogc_fid || parcel.id}`;
  const drawerTitleId = `${drawerId}-title`;

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

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatPercentage = (decimal: number) => {
    if (!decimal) return 'N/A';
    return `${(decimal * 100).toFixed(1)}%`;
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 z-50 pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-50 overflow-y-auto max-w-[90vw] pointer-events-auto focus-ring"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={drawerTitleId}
        id={drawerId}
        tabIndex={-1}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
            <div>
              <h2 id={drawerTitleId} className="text-xl font-bold text-gray-900">Parcel Analysis</h2>
              <p className="text-sm text-gray-500">#{parcel.parcelnumb || parcel.ogc_fid}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors focus-ring"
              aria-label="Close parcel analysis"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Property Address & Basic Info */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">Property Address</h3>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="font-medium text-gray-900">{parcel.address || 'Address not available'}</p>
              {parcel.city && (
                <p className="text-gray-600 text-sm">
                  {parcel.city}{parcel.state2 ? `, ${parcel.state2}` : ''} {parcel.szip || ''}
                </p>
              )}
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Ruler className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-gray-600">Lot Size</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {parcel.deededacreage ? formatAcreage(parcel.deededacreage) : 
                 parcel.gisacre ? formatAcreage(parcel.gisacre) : 'N/A'}
              </p>
              {parcel.sqft && (
                <p className="text-xs text-gray-500">{parcel.sqft.toLocaleString()} sq ft</p>
              )}
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <Building className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-gray-600">Zoning</span>
              </div>
              <p className="text-lg font-semibold text-gray-900">
                {parcel.zoning || 'N/A'}
              </p>
              {parcel.zoning_description && (
                <p className="text-xs text-gray-500 leading-tight">{parcel.zoning_description}</p>
              )}
            </div>
          </div>

          {/* Owner Information */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <User className="w-5 h-5 text-orange-600" />
              <h3 className="font-semibold text-gray-900">Owner Information</h3>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg space-y-2">
              <div>
                <span className="text-sm text-gray-600">Primary Owner:</span>
                <p className="font-medium text-gray-900">{parcel.owner || 'Not available'}</p>
              </div>
              {parcel.owner2 && (
                <div>
                  <span className="text-sm text-gray-600">Co-Owner:</span>
                  <p className="text-gray-800">{parcel.owner2}</p>
                </div>
              )}
              {parcel.mailadd && (
                <div>
                  <span className="text-sm text-gray-600">Mailing Address:</span>
                  <p className="text-gray-800 text-sm">{parcel.mailadd}</p>
                  {(parcel.mail_city || parcel.mail_state2 || parcel.mail_zip) && (
                    <p className="text-gray-600 text-sm">
                      {parcel.mail_city}{parcel.mail_state2 ? `, ${parcel.mail_state2}` : ''} {parcel.mail_zip || ''}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Property Values & Assessment */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <DollarSign className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Property Valuation</h3>
            </div>
            <div className="bg-green-50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-sm text-gray-600">Total Value:</span>
                  <p className="text-lg font-semibold text-green-700">
                    {formatCurrency(parcel.parval)}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-gray-600">Tax Assessment:</span>
                  <p className="text-lg font-semibold text-green-700">
                    {formatCurrency(parcel.taxamt)}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Land Value:</span>
                  <p className="font-medium text-gray-900">{formatCurrency(parcel.landval)}</p>
                </div>
                <div>
                  <span className="text-gray-600">Improvement Value:</span>
                  <p className="font-medium text-gray-900">{formatCurrency(parcel.improvval)}</p>
                </div>
              </div>
              {parcel.taxyear && (
                <p className="text-xs text-gray-500">Tax Year: {parcel.taxyear}</p>
              )}
            </div>
          </div>

          {/* Sale History */}
          {(parcel.saleprice || parcel.saledate) && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Recent Sale</h3>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-600">Sale Price:</span>
                    <p className="text-lg font-semibold text-blue-700">
                      {formatCurrency(parcel.saleprice)}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-600">Sale Date:</span>
                    <p className="font-medium text-gray-900">{formatDate(parcel.saledate)}</p>
                  </div>
                </div>
                {parcel.saleprice && parcel.sqft && (
                  <div className="mt-2 pt-2 border-t border-blue-200">
                    <span className="text-sm text-gray-600">Price per Sq Ft:</span>
                    <p className="font-medium text-gray-900">
                      {formatCurrency(parcel.saleprice / parcel.sqft)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Building Details */}
          {(parcel.yearbuilt || parcel.numstories || parcel.numunits || parcel.structstyle) && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <Home className="w-5 h-5 text-indigo-600" />
                <h3 className="font-semibold text-gray-900">Building Details</h3>
              </div>
              <div className="bg-indigo-50 p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {parcel.yearbuilt && (
                    <div>
                      <span className="text-gray-600">Year Built:</span>
                      <p className="font-medium text-gray-900">{parcel.yearbuilt}</p>
                    </div>
                  )}
                  {parcel.numstories && (
                    <div>
                      <span className="text-gray-600">Stories:</span>
                      <p className="font-medium text-gray-900">{parcel.numstories}</p>
                    </div>
                  )}
                  {parcel.numunits && (
                    <div>
                      <span className="text-gray-600">Units:</span>
                      <p className="font-medium text-gray-900">{parcel.numunits}</p>
                    </div>
                  )}
                  {parcel.structstyle && (
                    <div>
                      <span className="text-gray-600">Style:</span>
                      <p className="font-medium text-gray-900">{parcel.structstyle}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Environmental & Risk Factors */}
          {(parcel.fema_flood_zone || parcel.fema_nri_risk_rating) && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <Waves className="w-5 h-5 text-red-600" />
                <h3 className="font-semibold text-gray-900">Environmental Risk</h3>
              </div>
              <div className="bg-red-50 p-4 rounded-lg space-y-2">
                {parcel.fema_flood_zone && (
                  <div>
                    <span className="text-sm text-gray-600">FEMA Flood Zone:</span>
                    <p className="font-medium text-gray-900">{parcel.fema_flood_zone}</p>
                  </div>
                )}
                {parcel.fema_nri_risk_rating && (
                  <div>
                    <span className="text-sm text-gray-600">Risk Rating:</span>
                    <p className="font-medium text-gray-900">{parcel.fema_nri_risk_rating}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Location Details */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Globe className="w-5 h-5 text-teal-600" />
              <h3 className="font-semibold text-gray-900">Location Details</h3>
            </div>
            <div className="bg-teal-50 p-4 rounded-lg space-y-2 text-sm">
              {(parcel.lat && parcel.lon) && (
                <div>
                  <span className="text-gray-600">Coordinates:</span>
                  <p className="font-medium text-gray-900 font-mono">
                    {parseFloat(parcel.lat).toFixed(6)}, {parseFloat(parcel.lon).toFixed(6)}
                  </p>
                </div>
              )}
              {parcel.neighborhood && (
                <div>
                  <span className="text-gray-600">Neighborhood:</span>
                  <p className="font-medium text-gray-900">{parcel.neighborhood}</p>
                </div>
              )}
              {parcel.subdivision && (
                <div>
                  <span className="text-gray-600">Subdivision:</span>
                  <p className="font-medium text-gray-900">{parcel.subdivision}</p>
                </div>
              )}
              {parcel.census_tract && (
                <div>
                  <span className="text-gray-600">Census Tract:</span>
                  <p className="font-medium text-gray-900">{parcel.census_tract}</p>
                </div>
              )}
            </div>
          </div>

          {/* Legal Description */}
          {(parcel.legaldesc || parcel.plat || parcel.book || parcel.page) && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Legal Description</h3>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                {parcel.legaldesc && (
                  <div>
                    <span className="text-gray-600">Description:</span>
                    <p className="text-gray-900 leading-relaxed">{parcel.legaldesc}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  {parcel.plat && (
                    <div>
                      <span className="text-gray-600">Plat:</span>
                      <p className="font-medium text-gray-900">{parcel.plat}</p>
                    </div>
                  )}
                  {parcel.block && (
                    <div>
                      <span className="text-gray-600">Block:</span>
                      <p className="font-medium text-gray-900">{parcel.block}</p>
                    </div>
                  )}
                  {parcel.lot && (
                    <div>
                      <span className="text-gray-600">Lot:</span>
                      <p className="font-medium text-gray-900">{parcel.lot}</p>
                    </div>
                  )}
                  {(parcel.book && parcel.page) && (
                    <div>
                      <span className="text-gray-600">Book/Page:</span>
                      <p className="font-medium text-gray-900">{parcel.book}/{parcel.page}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Development Potential - Enhanced */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Building className="w-5 h-5 text-purple-600" />
              <h3 className="font-semibold text-gray-900">Development Analysis</h3>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Use:</span>
                  <p className="font-medium text-gray-900">{parcel.usedesc || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-600">Use Code:</span>
                  <p className="font-medium text-gray-900">{parcel.usecode || 'N/A'}</p>
                </div>
              </div>
              
              {/* Calculated Development Metrics */}
              <div className="pt-3 border-t border-purple-200">
                <h4 className="font-medium text-gray-900 mb-2">Potential Analysis:</h4>
                <div className="space-y-2 text-sm">
                  {parcel.deededacreage && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated Max Units (20 DU/acre):</span>
                      <span className="font-medium">{Math.floor(parcel.deededacreage * 20)}</span>
                    </div>
                  )}
                  {parcel.sqft && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Estimated Max FAR 2.0:</span>
                      <span className="font-medium">{(parcel.sqft * 2).toLocaleString()} sq ft</span>
                    </div>
                  )}
                  {(parcel.parval && parcel.sqft) && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Land Value per Sq Ft:</span>
                      <span className="font-medium">{formatCurrency(parcel.parval / parcel.sqft)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Investment Summary */}
          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-3">
              <Banknote className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold text-gray-900">Investment Summary</h3>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="grid grid-cols-1 gap-3 text-sm">
                {(parcel.parval && parcel.deededacreage) && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-600">Price per Acre:</span>
                    <span className="font-semibold text-green-700">
                      {formatCurrency(parcel.parval / parcel.deededacreage)}
                    </span>
                  </div>
                )}
                {(parcel.saleprice && parcel.parval) && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-gray-600">Assessment vs Sale Ratio:</span>
                    <span className="font-semibold text-green-700">
                      {((parcel.parval / parcel.saleprice) * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Investment Grade:</span>
                  <span className="font-semibold text-green-700">
                    {parcel.deededacreage > 1 && parcel.zoning?.includes('R') ? 'High Potential' : 
                     parcel.sqft > 10000 ? 'Medium Potential' : 'Low Potential'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Underwriting Tab */}
          <div className="mb-6">
            <ParcelUnderwritingPanel parcel={parcel} />
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            {hasActiveProject && onAddToProject && (
              <button 
                onClick={() => onAddToProject(parcel)}
                className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 focus-ring"
              >
                <Building className="w-4 h-4" />
                <span>Add to Current Project</span>
              </button>
            )}
            <button className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 focus-ring">
              <FileText className="w-4 h-4" />
              <span>Generate Detailed Report</span>
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button className="border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2 focus-ring">
                <TrendingUp className="w-4 h-4" />
                <span>Comps Analysis</span>
              </button>
              <button className="border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2 focus-ring">
                <Building className="w-4 h-4" />
                <span>Site Plan</span>
              </button>
            </div>
            <button className="w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50 transition-colors focus-ring">
              Save to Investment Portfolio
            </button>
          </div>

          {/* Debug Info - Collapsed by default */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 mb-2 font-medium">Technical Details</summary>
              <div className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-60">
                <div className="space-y-2 mb-4">
                  <div><strong>Database ID:</strong> {parcel.ogc_fid}</div>
                  <div><strong>Parcel Number:</strong> {parcel.parcelnumb_no_formatting}</div>
                  <div><strong>Zoning:</strong> {parcel.zoning}</div>
                  <div><strong>Address:</strong> {parcel.address}</div>
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-gray-500 mb-2">Full Object Data</summary>
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed">
                    {safeStringify(parcel)}
                  </pre>
                </details>
              </div>
            </details>
          </div>
        </div>
      </div>
    </>
  );
}