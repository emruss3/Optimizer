import React from 'react';
import { ErrorBoundary } from './ErrorBoundary';
import MapUnavailable from './MapUnavailable';
import type { SelectedParcel } from '../types/parcel';

// The boundary must load with the shell so it can also catch a failed map
// chunk, not just renderer initialization errors inside MapView.
const MapComponent = React.lazy(() => import('./Map'));

export default function MapPanel({ onParcelClick }: { onParcelClick: (parcel: SelectedParcel) => void }) {
  return (
    <div className="w-full h-full min-w-0 min-h-0 flex-1 flex flex-col" style={{ height: '100%' }}>
      <ErrorBoundary fallback={<MapUnavailable />}>
        <React.Suspense fallback={<div className="p-4 text-sm text-gray-500" role="status">Loading map…</div>}>
          <MapComponent onParcelClick={onParcelClick} />
        </React.Suspense>
      </ErrorBoundary>
    </div>
  );
}
