// Dev-build census banner (GENERATION_STRATEGY_v2 Stage 5 / capstone 0.4):
// the latest census — sample health, top violation cluster, and the error-
// rate TREND from planner.census_run — surfaced where the people generating
// plans will actually see it. Production bundles render nothing.
import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import committed from '../../../../qa/census/latest.json';

type Cluster = { class: string; count: number };
type StratumSummary = {
  n: number;
  ok: number;
  error_rate_pct: number | null;
  median_capture_pct: number | null;
  clusters: Cluster[];
};
type TrendRow = { run_date: string; summary?: Record<string, StratumSummary> };

const committedFull = (committed as { date?: string; strata?: Record<string, { summary: StratumSummary }> })
  .strata?.full?.summary;

export const CensusBanner: React.FC = () => {
  const [trend, setTrend] = useState<TrendRow[] | null>(null);
  // Collapsed by default: the census is a dev diagnostic, and a red line at
  // the top of every page read as an alarm about the plan below it (Eric,
  // 2026-09-03: "a ton of stuff happening on this page"). One click opens it.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !supabase) return;
    let cancelled = false;
    supabase.rpc('fn_census_trend', { p_limit: 10 }).then(({ data }: { data: unknown }) => {
      if (!cancelled && Array.isArray(data)) setTrend(data as TrendRow[]);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  if (!import.meta.env.DEV) return null;

  // Live trend head wins; the committed snapshot is the offline fallback.
  const head = trend?.[0];
  const full: StratumSummary | undefined = head?.summary?.full ?? committedFull;
  const date = head?.run_date ?? (committed as { date?: string }).date;
  if (!full) return null;
  const top = full.clusters.find(c => c.class.startsWith('error:') || c.class === 'exception');
  const exceptions = full.clusters.find(c => c.class === 'exception')?.count ?? 0;
  // Oldest→newest error-rate walk, e.g. "err%: 86.7 → 42.0 → 8.1"
  const walk = trend && trend.length > 1
    ? [...trend].reverse().map(t => t.summary?.full?.error_rate_pct).filter(v => v != null).join(' → ')
    : null;
  if (!open) {
    return (
      <div
        data-testid="census-banner"
        className="px-4 py-0.5 text-[11px] border-b border-gray-200 bg-gray-50 text-gray-500 flex items-center gap-3"
      >
        <span>Census {date} · {full.ok}/{full.n} ok{exceptions > 0 ? ` · ${exceptions} exception${exceptions === 1 ? '' : 's'}` : ''} · dev only</span>
        <button type="button" onClick={() => setOpen(true)} className="underline decoration-dotted hover:text-gray-700">
          details
        </button>
      </div>
    );
  }
  return (
    <div
      data-testid="census-banner"
      className={`px-4 py-1 text-xs border-b flex items-center gap-3 ${
        exceptions > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}
    >
      <button type="button" onClick={() => setOpen(false)} className="underline decoration-dotted" title="Collapse">
        hide
      </button>
      <span className="font-semibold">Census {date}</span>
      <span>{full.ok}/{full.n} ok (full universe)</span>
      {top && (
        <span>
          top cluster: <span className="font-mono">{top.class.replace('error:', '')}</span> ×{top.count}
        </span>
      )}
      {exceptions > 0 && <span className="font-semibold">{exceptions} unhandled exception(s)</span>}
      {walk && <span>err%: {walk}</span>}
      <span className="text-[10px] opacity-70">planner.census_run · dev only</span>
    </div>
  );
};
