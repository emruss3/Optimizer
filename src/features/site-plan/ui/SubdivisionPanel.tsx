/**
 * Neighbourhood plan panel — what the subdivision generator drew and the
 * scheme switch (district lots / SP townhome widths / SP + amenity), the two
 * programs the civil's MDHA sheets showed. Every figure is the server's.
 */
import type { SubdivisionParams, SubdivisionSummary } from '../api/generateSubdivision';
import { subdivisionSummaryLine } from '../api/generateSubdivision';

export type SubdivisionScheme = 'district' | 'sp25' | 'amenity';

export const SUBDIVISION_SCHEMES: Array<{ key: SubdivisionScheme; label: string; hint: string }> = [
  { key: 'district', label: 'District lots', hint: 'lot width from the district minimum area at the depth the parcel allows' },
  { key: 'sp25', label: 'SP townhomes · 25 ft', hint: 'the 08/21 program: 25-ft lots on the same streets (needs an SP)' },
  { key: 'amenity', label: 'SP + amenity 10%', hint: 'the 08/30 program: 25-ft lots with a tenth of the land as an amenity at the head' },
];

export function schemeParams(scheme: SubdivisionScheme): SubdivisionParams {
  switch (scheme) {
    case 'sp25': return { lotWidthFt: 25 };
    case 'amenity': return { lotWidthFt: 25, amenityPct: 10 };
    default: return {};
  }
}

function humanizeFlag(f: string): string {
  return f.replace(/_/g, ' ');
}

function networkLabel(n: string): string {
  if (n === 'spine') return 'ROW spine';
  if (n === 'ladder') return 'street ladder';
  if (n === 'grid') return 'street grid';
  return n.replace(/_/g, ' ');
}

export function SubdivisionPanel({
  summary, scheme, onScheme, busy,
}: {
  summary: SubdivisionSummary;
  scheme: SubdivisionScheme;
  onScheme: (s: SubdivisionScheme) => void;
  busy?: boolean;
}) {
  const land = [
    summary.pctRow != null ? `${summary.pctRow}% ROW` : null,
    summary.pctLots != null ? `${summary.pctLots}% lots` : null,
    summary.pctResidual != null ? `${summary.pctResidual}% residual` : null,
  ].filter(Boolean).join(' · ');
  return (
    <section
      data-testid="subdivision-panel"
      className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Neighbourhood plan</h3>
        <span
          data-testid="subdivision-lots"
          className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
        >
          {summary.lots} lots
        </span>
      </div>
      <p data-testid="subdivision-summary" className="mt-1 leading-snug text-slate-600">
        {subdivisionSummaryLine(summary)}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-slate-500">Network</dt>
        <dd data-testid="subdivision-network">{networkLabel(summary.network)} · {summary.streets} street{summary.streets === 1 ? '' : 's'}</dd>
        <dt className="text-slate-500">Lots</dt>
        <dd>
          {summary.lotWidthFt != null && summary.lotDepthFt != null ? `${summary.lotWidthFt} × ${summary.lotDepthFt} ft` : '—'}
          {summary.buildableDepthFt != null ? ` · buildable ${summary.buildableDepthFt} ft` : ''}
        </dd>
        <dt className="text-slate-500">Land</dt>
        <dd>{land || '—'}</dd>
        <dt className="text-slate-500">Held out</dt>
        <dd data-testid="subdivision-hazard">
          {summary.hazardCoverage === 'ingested'
            ? (summary.pctHazard != null && summary.pctHazard > 0
                ? `${summary.pctHazard}% greenway · floodplain ${summary.floodplainHeldOutPct ?? 0}% · wetland ${summary.wetlandHeldOutPct ?? 0}%`
                : 'no floodplain or wetland on the parcel')
            : <span className="text-amber-700">flood / wetland layers not ingested here yet</span>}
        </dd>
        <dt className="text-slate-500">Courts</dt>
        <dd>{summary.courts} · one every block · rear alleys</dd>
        <dt className="text-slate-500">Access</dt>
        <dd>{summary.accessMode ?? '—'}</dd>
        {summary.densityDuAc != null && (
          <>
            <dt className="text-slate-500">Density</dt>
            <dd>{summary.densityDuAc} du/ac gross</dd>
          </>
        )}
      </dl>
      <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Scheme">
        {SUBDIVISION_SCHEMES.map(s => (
          <button
            key={s.key}
            type="button"
            data-testid={`subdivision-scheme-${s.key}`}
            aria-pressed={scheme === s.key}
            disabled={busy}
            title={s.hint}
            onClick={() => onScheme(s.key)}
            className={
              'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-60 ' +
              (scheme === s.key
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50')
            }
          >
            {s.label}
          </button>
        ))}
      </div>
      {summary.flags.length > 0 && (
        <ul data-testid="subdivision-flags" className="mt-2 space-y-0.5 text-[11px] text-amber-700">
          {summary.flags.map(f => (
            <li key={f}>⚠ {humanizeFlag(f)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
