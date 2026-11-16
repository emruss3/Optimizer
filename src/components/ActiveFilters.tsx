import React from 'react';
import { X, Filter } from 'lucide-react';
import { useUIStore } from '../store/ui';

/**
 * What the map is filtered by, on the map: one chip a district, each
 * removable, and Clear all. Shown only while a filter is applied, so an
 * unfiltered map carries no bar.
 */
const ActiveFilters: React.FC = () => {
  const { zoningFilters, setZoningFilters } = useUIStore();
  const zones = zoningFilters.activeZones;
  if (zones.length === 0) return null;
  const apply = (next: string[]) => {
    setZoningFilters({ activeZones: next });
    document.dispatchEvent(new CustomEvent('forceMapReload', { detail: { zoningFilters: next } }));
  };
  return (
    <div className="absolute top-2 left-2 right-2 z-10 flex flex-wrap items-center gap-1.5 bg-white/95 border border-gray-200 rounded-lg shadow-sm px-2 py-1.5 text-xs" data-testid="active-filters" role="group" aria-label="Active map filters">
      <Filter className="w-3.5 h-3.5 text-gray-500" />
      <span className="text-gray-600">Showing {zones.length} zoning district{zones.length === 1 ? '' : 's'}:</span>
      {zones.map(z => (
        <span key={z} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
          {z}
          <button type="button" onClick={() => apply(zones.filter(x => x !== z))} aria-label={`Remove ${z} from the filter`} className="rounded-full hover:bg-blue-100 p-0.5">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={() => apply([])} data-testid="filters-clear-all" className="ml-auto px-2 py-0.5 rounded border border-gray-300 text-gray-700 hover:bg-gray-50">
        Clear all
      </button>
    </div>
  );
};

export default ActiveFilters;
