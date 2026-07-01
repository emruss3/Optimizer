import React from 'react';
import MapView from './MapView';
import { useParcelSelection } from '../hooks/useParcelSelection';
import { SelectedParcel } from '../types/parcel';

// NOTE: the old "Optimize Site/Assemblage" map button was removed — it fed
// hard-coded mock parcels (1.0 ac, RM15, empty geometry) into the
// optimize_yield_scenarios RPC, so its output could never reflect the selected
// parcels. The real solve lives in the project's Site Plan tab, which runs the
// deterministic engine. useYieldEngine (assemblage RPCs) is parked for a future
// engine-backed assemblage flow.

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
    </div>
  );
});

export default MapComponent;