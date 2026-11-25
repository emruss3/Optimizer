import React from 'react';
import { Clock, ArrowRight, PenTool } from 'lucide-react';
import { openParcel } from '../lib/parcelSearch';
import ParcelSearchBox from './ParcelSearchBox';
import { useRecent, type RecentParcel } from '../lib/recentWork';

const ago = (at: number): string => {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/**
 * Where work starts without the map: find a parcel by address or parcel ID,
 * reopen something recent, or go back to the last plan. The start page for
 * returning users and the fallback when the basemap cannot load.
 */
const StartPanel: React.FC<{ onOpened?: () => void; autoFocus?: boolean }> = ({ onOpened, autoFocus }) => {
  const recent = useRecent();
  const resume: RecentParcel | null = recent.find(r => r.planned) ?? null;
  const open = (p: { ogcFid: number | string; address?: string | null; zoning?: string | null }, planner: boolean) => {
    openParcel(p, planner);
    onOpened?.();
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6" data-testid="start-panel">
      <section>
        <label htmlFor="start-search" className="block text-sm font-semibold text-gray-900 mb-2">Search parcels</label>
        <ParcelSearchBox idPrefix="start" autoFocus={autoFocus} onPick={h => open(h, false)} />
      </section>

      {resume && (
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Reopen last parcel</h2>
          <button
            data-testid="start-resume"
            onClick={() => open(resume, true)}
            className="w-full text-left px-4 py-3 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 flex items-center gap-3"
          >
            <PenTool className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-gray-900 truncate">{resume.address}</span>
              <span className="block text-xs text-gray-600">{[resume.zoning, `opened ${ago(resume.at)}`].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="text-xs font-medium text-blue-700">Open its planner</span>
          </button>
          <p className="mt-1 text-xs text-gray-500">This reopens the parcel and its saved options. It does not restore the exact drawing you last had open.</p>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Recent projects</h2>
        {recent.length === 0 ? (
          <p className="text-xs text-gray-600">Nothing yet. Parcels you open on this device are listed here, with their saved schemes.</p>
        ) : (
          <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white" data-testid="start-recent">
            {recent.map(r => (
              <li key={r.ogcFid}>
                <button onClick={() => open(r, r.planned)} className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900 truncate">{r.address}</span>
                    <span className="block text-xs text-gray-500">{[r.zoning, r.planned ? 'plan' : 'parcel', ago(r.at)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default StartPanel;
