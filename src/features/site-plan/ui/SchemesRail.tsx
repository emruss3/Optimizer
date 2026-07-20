import React from 'react';
import { GitBranch, Pin, History, RefreshCw } from 'lucide-react';
import type { MfCandidate } from '../api/generateMfPlan';

const n = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;

/**
 * A1 schemes rail: every generation persists a candidate — this makes the
 * design history browsable. Click a scheme to view it (deterministic
 * re-render from its seed + pins under its STORED context; no new candidate
 * row). Candidates from an older/unknown context wear a badge and offer an
 * explicit "Regenerate with current context" action instead of being
 * silently re-planned on today's basis.
 */
const SchemesRail: React.FC<{
  candidates: MfCandidate[];
  activeId: string | null;
  onView: (c: MfCandidate) => void;
  busy?: boolean;
  /** The workspace's ACTIVE compiled context id (null = none compiled) */
  activeContextId?: string | null;
  onRegenerateWithCurrentContext?: (c: MfCandidate) => void;
  /** Lot's legal max GSF (fn_max_buildout) — enables the utilization chip */
  maxGsf?: number | null;
}> = ({ candidates, activeId, onView, busy, activeContextId, onRegenerateWithCurrentContext, maxGsf = null }) => {
  // Pre-context schemes (no stored context id) are STALE noise next to
  // current ones — collapse them under a disclosure instead of deleting.
  const current = candidates.filter(c => c.contextId != null);
  const stale = candidates.filter(c => c.contextId == null);

  /** Short generator tag: which engine/version produced the scheme. */
  const genTag = (v: string | null | undefined): string | null => {
    if (!v) return null;
    if (v.startsWith('th_context')) return null; // TH chip already shown
    if (v.startsWith('mf_context_v2')) return 'v2';
    if (v.startsWith('mf_context')) return 'ctx';
    return 'v1';
  };
  if (candidates.length === 0) return null;

  // A3 ranking: best market margin gets the badge (order stays chronological
  // so lineage still reads top-down)
  const margins = candidates.map(c => c.marginOnCost).filter((m): m is number => typeof m === 'number');
  const bestMargin = margins.length > 0 ? Math.max(...margins) : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Schemes</h3>
        <span className="text-[10px] text-gray-400">{candidates.length} saved</span>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {current.map(c => {
          const units = n(c.metrics.units_est);
          const stalls = n(c.metrics.stalls);
          const far = n(c.metrics.far);
          // SF-first: this scheme's yield against the lot's legal max GSF
          const gfa = n(c.metrics.gfa_sqft);
          const util = maxGsf && maxGsf > 0 && gfa != null ? (gfa / maxGsf) * 100 : null;
          // Only th_context_v1 writes unit-form metrics — the product tag
          const isTownhome = c.metrics.unit_w_ft != null;
          const active = c.id === activeId;
          const margin = typeof c.marginOnCost === 'number' ? c.marginOnCost : null;
          const isBest = bestMargin != null && margin === bestMargin && margins.length > 1;
          const time = c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
          // Older context: the candidate was produced under a snapshot that is
          // not the active one (or predates the context contract entirely).
          const olderContext =
            activeContextId != null && (c.contextId == null || c.contextId !== activeContextId);
          return (
            <div
              key={c.id}
              className={`w-full rounded border text-xs ${
                active
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-100 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <button
                onClick={() => onView(c)}
                disabled={busy}
                className="w-full text-left px-2 py-1.5 flex items-center gap-2 disabled:opacity-50"
              >
                <span className="font-mono text-[10px] text-gray-400 flex-shrink-0">{time}</span>
                {isTownhome && (
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 flex-shrink-0"
                    title="Townhome scheme (attached-dwelling standards)"
                  >
                    TH
                  </span>
                )}
                {genTag(c.generatorVersion) && (
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-50 border border-slate-200 rounded px-1 flex-shrink-0"
                    title={`Generator: ${c.generatorVersion}`}
                  >
                    {genTag(c.generatorVersion)}
                  </span>
                )}
                <span className="font-medium text-gray-900 tabular-nums">
                  {units != null ? `${units} u` : '—'}
                </span>
                <span className="text-gray-500 tabular-nums">{stalls != null ? `${stalls} st` : ''}</span>
                <span className="text-gray-500 tabular-nums">{far != null ? `FAR ${far.toFixed(2)}` : ''}</span>
                {util != null && (
                  <span
                    className={`tabular-nums ${util >= 85 ? 'text-green-700' : util >= 60 ? 'text-amber-600' : 'text-gray-500'}`}
                    title="Achieved GSF vs the lot's legal max buildout"
                  >
                    {util.toFixed(0)}%
                  </span>
                )}
                {margin != null && (
                  <span
                    className={`tabular-nums font-medium ${
                      isBest ? 'text-green-700' : margin < 0 ? 'text-red-600' : 'text-gray-600'
                    }`}
                    title="Margin on cost at local pricing"
                  >
                    {isBest ? '★ ' : ''}
                    {(margin * 100).toFixed(1)}%
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1 text-gray-400 flex-shrink-0">
                  {olderContext && (
                    <span
                      className="flex items-center gap-0.5 text-amber-600"
                      title={c.contextId == null
                        ? 'Saved before the context contract — views use the legacy basis it was built on'
                        : 'Saved under an older context version — views use its stored context'}
                    >
                      <History className="w-3 h-3" />
                    </span>
                  )}
                  {c.pins.length > 0 && (
                    <span className="flex items-center gap-0.5" title={`${c.pins.length} pinned building${c.pins.length === 1 ? '' : 's'}`}>
                      <Pin className="w-3 h-3" />
                      {c.pins.length}
                    </span>
                  )}
                  {c.parentId && <GitBranch className="w-3 h-3" aria-label="Variation of an earlier scheme" />}
                </span>
              </button>
              {olderContext && onRegenerateWithCurrentContext && (
                <button
                  onClick={() => onRegenerateWithCurrentContext(c)}
                  disabled={busy}
                  className="w-full text-left px-2 pb-1.5 -mt-0.5 flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  Regenerate with current context
                </button>
              )}
            </div>
          );
        })}
        {stale.length > 0 && (
          <details className="pt-1 text-[11px] text-gray-500">
            <summary className="cursor-pointer select-none">
              {stale.length} older scheme{stale.length === 1 ? '' : 's'} (pre-context — numbers may predate current rules)
            </summary>
            <div className="mt-1 space-y-0.5">
              {stale.map(c => (
                <button
                  key={c.id}
                  onClick={() => onView(c)}
                  disabled={busy}
                  className="w-full text-left px-2 py-1 rounded border border-gray-100 hover:border-gray-300 flex items-center gap-2 disabled:opacity-50"
                >
                  <span className="font-mono text-[10px] text-gray-400">
                    {c.createdAt ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                  <span className="tabular-nums">{n(c.metrics.units_est) ?? '—'} u</span>
                  <span className="ml-auto text-[9px] uppercase tracking-wide text-gray-400">stale</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

export default SchemesRail;
