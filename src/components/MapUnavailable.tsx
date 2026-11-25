import React from 'react';
import { MapPinOff } from 'lucide-react';
import StartPanel from './StartPanel';

/**
 * The basemap could not load. That stops browsing by map and nothing else:
 * search, recent work and the planner do not need it.
 */
const MapUnavailable: React.FC<{ devHint?: string }> = ({ devHint }) => (
  <div className="flex-1 h-full overflow-y-auto bg-gray-50" data-testid="map-unavailable">
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-start gap-3 mb-8">
        <MapPinOff className="w-6 h-6 text-gray-500 flex-shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Map unavailable</h2>
          <p className="text-sm text-gray-600">
            The basemap could not load, so parcels cannot be picked from the map right now.
            Search by address or parcel ID, or reopen recent work below. The site planner works without the map.
          </p>
          {import.meta.env.DEV && devHint && <p className="mt-2 text-xs text-gray-500">Developer note: {devHint}</p>}
        </div>
      </div>
      <StartPanel />
    </div>
  </div>
);

export default MapUnavailable;
