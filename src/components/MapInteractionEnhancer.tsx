import React, { useEffect, useState } from 'react';
import { MousePointer, MapPin, Plus, CheckCircle } from 'lucide-react';

interface MapInteractionEnhancerProps {
  isProjectWorkflowOpen: boolean;
  selectedParcel?: any;
  onParcelSelect?: (parcel: any) => void;
}

export function MapInteractionEnhancer({ 
  isProjectWorkflowOpen, 
  selectedParcel, 
  onParcelSelect 
}: MapInteractionEnhancerProps) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [highlightedParcels, setHighlightedParcels] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isProjectWorkflowOpen) {
      setShowInstructions(true);
      // Add visual indicators to parcels
      const parcels = document.querySelectorAll('[data-parcel-id]');
      parcels.forEach(parcel => {
        parcel.classList.add('parcel-interactive');
      });
    } else {
      setShowInstructions(false);
      // Remove visual indicators
      const parcels = document.querySelectorAll('[data-parcel-id]');
      parcels.forEach(parcel => {
        parcel.classList.remove('parcel-interactive');
      });
    }
  }, [isProjectWorkflowOpen]);

  if (!isProjectWorkflowOpen) return null;

  return (
    <>
      {/* Map Instructions Overlay */}
      {showInstructions && (
        <div className="fixed top-20 left-4 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-center space-x-3 mb-3">
            <MousePointer className="w-5 h-5 text-blue-600" />
            <div>
              <h4 className="font-medium text-gray-900">Interactive Map</h4>
              <p className="text-sm text-gray-600">
                Click any parcel to add it to your project
              </p>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-2 text-blue-600">
              <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              <span>Click parcels to select them</span>
            </div>
            <div className="flex items-center space-x-2 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span>Selected parcels will be added to your project</span>
            </div>
          </div>
          
          <button
            onClick={() => setShowInstructions(false)}
            className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Hide instructions
          </button>
        </div>
      )}

      {/* Selected Parcel Indicator */}
      {selectedParcel && (
        <div className="fixed bottom-20 right-4 z-40 bg-green-50 border border-green-200 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-center space-x-3 mb-3">
            <MapPin className="w-5 h-5 text-green-600" />
            <div>
              <h4 className="font-medium text-green-900">Parcel Selected</h4>
              <p className="text-sm text-green-700">{selectedParcel.address}</p>
            </div>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-2 text-green-600">
              <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              <span>{selectedParcel.zoning} • {selectedParcel.sqft?.toLocaleString()} sqft</span>
            </div>
            <div className="flex items-center space-x-2 text-green-600">
              <Plus className="w-4 h-4" />
              <span>Ready to add to project</span>
            </div>
          </div>
        </div>
      )}

      {/* CSS for parcel highlighting */}
      <style jsx>{`
        .parcel-interactive {
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }
        
        .parcel-interactive:hover {
          filter: brightness(1.1) !important;
          stroke-width: 3px !important;
        }
        
        .parcel-interactive:active {
          filter: brightness(1.2) !important;
        }
      `}</style>
    </>
  );
}
