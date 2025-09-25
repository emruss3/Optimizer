import React from 'react';
import MapView from './MapView';
import { useParcelSelection } from '../hooks/useParcelSelection';
import { Target } from 'lucide-react';
import { useYieldEngine } from '../hooks/useYieldEngine';
import { SelectedParcel } from '../types/parcel';

// Map Optimize Massing Button Component
const MapOptimizeButton = React.memo(function MapOptimizeButton({ parcelIds }: { parcelIds: string[] }) {
  const { optimizeYieldScenarios, isOptimizing } = useYieldEngine();
  const { activeProjectId } = useParcelSelection();
  
  // Show for 1+ parcels
  if (!activeProjectId || parcelIds.length === 0) return null;
  
  const handleOptimize = async () => {
    try {
      // Mock parcel data for optimization
      const mockParcels = parcelIds.map(id => ({
        id,
        parcelnumb: `PARCEL-${id}`,
        address: `Address ${id}`,
        deededacreage: 1.0,
        sqft: 43560,
        zoning: 'RM15',
        geometry: {},
        landval: 500000,
        parval: 600000
      }));
      
      await optimizeYieldScenarios(mockParcels);
    } catch (error) {
      console.error('Optimization error:', error);
    }
  };
  
  return (
    <div className="absolute top-20 right-4 z-20">
      <button
        onClick={handleOptimize}
        disabled={isOptimizing}
        className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors shadow-lg ${
          isOptimizing 
            ? 'bg-gray-300 text-gray-600 cursor-not-allowed' 
            : 'bg-green-600 text-white hover:bg-green-700'
        }`}
      >
        {isOptimizing ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
        ) : (
          <Target className="w-4 h-4" />
        )}
        <span>{isOptimizing ? 'Optimizing...' : `Optimize ${parcelIds.length === 1 ? 'Site' : 'Assemblage'}`}</span>
      </button>
    </div>
  );
});

interface MapComponentProps {
  onParcelClick: (parcel: SelectedParcel) => void;
}

const MapComponent = React.memo(function MapComponent({ onParcelClick }: MapComponentProps) {
  const { activeProjectId, activeProjectName, parcelIds: selectedParcelIds } = useParcelSelection();

  return (
    <div className="w-full h-full min-h-0 relative">
      <MapView
        onParcelClick={onParcelClick}
        selectedParcelIds={selectedParcelIds}
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
      />
      
      {/* Map Optimize Massing Button */}
      <MapOptimizeButton parcelIds={selectedParcelIds} />
    </div>
  );
});

export default MapComponent;