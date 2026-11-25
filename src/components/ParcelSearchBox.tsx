import React, { useEffect, useState } from 'react';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import { searchParcels, type ParcelHit } from '../lib/parcelSearch';

/**
 * The one parcel search: a field, and under it the parcels that match by
 * street address or parcel ID. The start page, the header and the map
 * fallback all use it, so the same query gives the same parcels everywhere.
 * A failed request says so and offers another try; the query is kept.
 */
const ParcelSearchBox: React.FC<{
  onPick: (hit: ParcelHit) => void;
  /** Test ids and the field's id start with this: "start" or "header". */
  idPrefix: string;
  autoFocus?: boolean | undefined;
  /** Results hang under the field over the page, for a field in a toolbar. */
  floating?: boolean;
  placeholder?: string;
}> = ({ onPick, idPrefix, autoFocus, floating, placeholder = 'Street address or parcel ID' }) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ParcelHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setHits(null); setError(null); setSearching(false); return; }
    const controller = new AbortController();
    setHits(null);
    setError(null);
    setSearching(true);
    const timer = window.setTimeout(() => {
      searchParcels(term, 10, controller.signal)
        .then(found => { if (!controller.signal.aborted) { setHits(found); setError(null); } })
        .catch(e => { if (!controller.signal.aborted) { setHits(null); setError(e instanceof Error ? e.message : String(e)); } })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);

  const clear = () => { setQuery(''); setHits(null); setError(null); };
  const pick = (h: ParcelHit) => { onPick(h); if (floating) clear(); };
  const below = searching || error || hits != null;

  return (
    <div className="relative" data-testid={`${idPrefix}-search-box`}>
      <div className="relative">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          id={`${idPrefix}-search`}
          data-testid={`${idPrefix}-search`}
          aria-label="Search parcels by address or parcel ID"
          autoFocus={autoFocus}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); clear(); } }}
          placeholder={placeholder}
          className={`w-full pl-9 pr-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${floating ? 'py-2' : 'py-2.5'}`}
        />
      </div>
      {below && (
        <div className={floating ? 'absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-2' : 'mt-2'}>
          {searching && <p className="text-xs text-gray-500">Searching…</p>}
          {error && (
            <p className="text-xs text-red-700 flex items-center gap-2" role="alert">
              <span>The search did not go through ({error}). Your query is kept.</span>
              <button type="button" onClick={() => setAttempt(a => a + 1)} data-testid={`${idPrefix}-retry`} className="px-2 py-0.5 rounded border border-red-300 text-red-800 hover:bg-red-50">Try again</button>
            </p>
          )}
          {hits && hits.length === 0 && !searching && (
            <p className="text-xs text-gray-600">No parcel matches "{query.trim()}". Try the street number and name, or the parcel ID without spaces.</p>
          )}
          {hits && hits.length > 0 && (
            <ul className={`divide-y divide-gray-100 bg-white ${floating ? '' : 'border border-gray-200 rounded-lg'}`} data-testid={`${idPrefix}-results`}>
              {hits.map(h => (
                <li key={h.ogcFid}>
                  <button onClick={() => pick(h)} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                    <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-gray-900 truncate">{h.address}</span>
                      <span className="block text-xs text-gray-500 truncate">{[h.parcelNumber, h.zoning].filter(Boolean).join(' · ')}</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-300" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ParcelSearchBox;
