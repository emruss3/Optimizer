import React from 'react';
import { GitBranch, Pin } from 'lucide-react';
import type { MfCandidate } from '../api/generateMfPlan';

const n = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * A1 schemes rail: every generation persists a candidate — this makes the
 * design history browsable. Click a scheme to view it (deterministic
 * re-render from its seed + pins; no new candidate row).
 */
const SchemesRail: React.FC<{
  candidates: MfCandidate[];
  activeId: string | null;
  onView: (c: MfCandidate) => void;
  busy?: boolean;
}> = ({ candidates, activeId, onView, busy }) => {
  if (candidates.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Schemes</h3>
        <span className="text-[10px] text-gray-400">{candidates.length} saved</span>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {candidates.map(c => {
          const units = n(c.metrics.units_est);
          const stalls = n(c.metrics.stalls);
          const far = n(c.metrics.far);
          const active = c.id === activeId;
          const time = c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          return (
            <button
              key={c.id}
              onClick={() => onView(c)}
              disabled={busy}
              className={`w-full text-left px-2 py-1.5 rounded border text-xs flex items-center gap-2 disabled:opacity-50 ${
                active
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{time}</span>
              <span className="font-medium text-gray-900 tabular-nums">
                {units != null ? `${units} u` : '—'}
              </span>
              <span className="text-gray-500 tabular-nums">{stalls != null ? `${stalls} st` : ''}</span>
              <span className="text-gray-500 tabular-nums">{far != null ? `FAR ${far.toFixed(2)}` : ''}</span>
              <span className="ml-auto flex items-center gap-1 text-gray-400 flex-shrink-0">
                {c.pins.length > 0 && (
                  <span className="flex items-center gap-0.5" title={`${c.pins.length} pinned building${c.pins.length === 1 ? '' : 's'}`}>
                    <Pin className="w-3 h-3" />
                    {c.pins.length}
                  </span>
                )}
                {c.parentId && <GitBranch className="w-3 h-3" aria-label="Variation of an earlier scheme" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SchemesRail;
