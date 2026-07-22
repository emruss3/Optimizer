// Dev-build census banner (GENERATION_STRATEGY_v2 Stage 5): the latest
// committed census snapshot — sample health + the top violation cluster —
// surfaced where the people generating plans will actually see it.
// Production bundles render nothing.
import React from 'react';
import census from '../../../../qa/census/latest.json';

type Cluster = { class: string; count: number };
type Stratum = {
  summary: {
    n: number;
    ok: number;
    error_rate_pct: number | null;
    median_capture_pct: number | null;
    clusters: Cluster[];
  };
};

export const CensusBanner: React.FC = () => {
  if (!import.meta.env.DEV) return null;
  const full = (census as { date?: string; strata?: Record<string, Stratum> }).strata?.full;
  if (!full) return null;
  const { n, ok, clusters } = full.summary;
  const top = clusters.find(c => c.class.startsWith('error:') || c.class === 'exception');
  const exceptions = clusters.find(c => c.class === 'exception')?.count ?? 0;
  return (
    <div
      data-testid="census-banner"
      className={`px-4 py-1 text-xs border-b flex items-center gap-3 ${
        exceptions > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
      }`}
    >
      <span className="font-semibold">Census {(census as { date?: string }).date}</span>
      <span>{ok}/{n} ok (full universe)</span>
      {top && (
        <span>
          top cluster: <span className="font-mono">{top.class.replace('error:', '')}</span> ×{top.count}
        </span>
      )}
      {exceptions > 0 && <span className="font-semibold">{exceptions} unhandled exception(s)</span>}
      <span className="text-[10px] opacity-70">qa/census · dev only</span>
    </div>
  );
};
