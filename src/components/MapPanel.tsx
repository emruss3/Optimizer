import React from 'react';
import MapComponent from './Map';
import { SelectedParcel } from '../types/parcel';

interface MapPanelProps {
  onParcelClick: (parcel: SelectedParcel) => void;
  activeProjectName: string | null;
}

export default function MapPanel({ onParcelClick, activeProjectName }: MapPanelProps) {
  return (
    <div className="w-full h-full min-w-0 min-h-0 flex-1 flex flex-col" style={{ height: '100%' }}>
      <MapComponent 
        onParcelClick={onParcelClick} 
        activeProjectName={activeProjectName}
      />
    </div>
  );
}