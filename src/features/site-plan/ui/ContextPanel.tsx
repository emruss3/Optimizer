import React from 'react';
import type { Confidence, ContextValue, DesignContext } from '../api/designContext';
import { describeContextFlag, type PrecedentPriors, type RegridPrecedentSelection } from '../api/plannerContext';

const CONF_STYLE: Record<Confidence, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-200 text-gray-600',
  review_required: 'bg-red-100 text-red-700',
};

const ConfidencePill: React.FC<{ confidence?: Confidence }> = ({ confidence }) =>
  confidence && CONF_STYLE[confidence] ? (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CONF_STYLE[confidence]}`}>
      {confidence.replace('_', ' ')}
    </span>
  ) : null;

/** A zoning value row with the provenance badge — the product differentiator. */
const Row: React.FC<{ label: string; v?: ContextValue; unit?: string }> = ({ label, v, unit }) => {
  if (!v || v.value == null) return null;
  const estimated = v.source !== 'zoning' && v.source !== 'ordinance';
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-gray-600">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-gray-900">
        {v.value}{unit ? ` ${unit}` : ''}
        <span
          title={`Source: ${v.source}${v.confidence ? ` (${v.confidence})` : ''}`}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            estimated ? 'bg-amber-100 text-amber-700' : 'bg-blue-50 text-blue-600'
          }`}
        >
          {estimated ? 'est.' : v.source}
        </span>
      </span>
    </div>
  );
};

const p = (o: unknown, ...keys: string[]): unknown => {
  let cur: unknown = o;
  for (const k of keys) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
};
const fmtNum = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v).toLocaleString() : null;
const fmtUsd = (v: unknown): string | null =>
  typeof v === 'number' && Number.isFinite(v) ? `$${v >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2)}` : null;

// ── Local precedent basis (planner_context_v2 Regrid selection) ─────────────

const SELECTION_LABEL: Record<RegridPrecedentSelection['mode'], string> = {
  exact_same_zoning: 'exact-use',
  exact_any_zoning: 'exact-use, nearby zoning',
  compatible_same_zoning: 'compatible-use',
  compatible_any_zoning: 'compatible-use, nearby zoning',
  zoning_only: 'zoning-only',
  all_nearby: 'all-nearby',
};

/** How far the selection had to relax, in words the user can act on. */
function selectionRelaxationNote(sel: RegridPrecedentSelection): string | null {
  switch (sel.mode) {
    case 'exact_same_zoning':
      return null;
    case 'exact_any_zoning':
      return 'Not enough exact local precedents in this zoning subtype — the context was expanded across nearby zoning districts.';
    case 'compatible_same_zoning':
      return 'Not enough exact local precedents were available — the context includes compatible building uses in the same zoning subtype.';
    case 'compatible_any_zoning':
      return 'Only a few exact local precedents were available — the context was expanded to compatible uses across nearby zoning districts.';
    case 'zoning_only':
      return 'No reliable use match nearby — the context compares against the zoning subtype only.';
    case 'all_nearby':
      return 'No reliable use or zoning match nearby — the context is a broad all-nearby fallback. Treat these priors with caution.';
  }
}

const fmt1 = (v: number | undefined): string | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1))
    : null;

const TypeRow: React.FC<{ label: string; value: string | null; basis: string }> = ({ label, value, basis }) =>
  value == null ? null : (
    <div className="flex justify-between text-sm py-0.5">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium tabular-nums">
        {value} <span className="text-[10px] text-gray-400 font-normal">{basis}</span>
      </span>
    </div>
  );

/**
 * "Local precedent basis" — what NEARBY BUILDINGS of the selected use look
 * like, and exactly how that comparison set was chosen. These are soft design
 * priors from Regrid building geometry, not legal limits.
 */
const PrecedentBasis: React.FC<{
  precedent: PrecedentPriors;
  typology?: string | null;
  zoningBase?: string | null;
}> = ({ precedent, typology, zoningBase }) => {
  const sel = precedent.selection ?? null;
  const n = sel?.sample_size ?? precedent.sample_size;
  const confidence = sel?.confidence ?? precedent.confidence;
  if (n == null && !precedent.footprint_sqft) return null;

  const useLabel = (sel?.requested_typology ?? typology ?? 'local').replace(/_/g, ' ');
  const zoningLabel = sel?.same_zoning_required && zoningBase ? `${zoningBase} ` : '';
  const modeLabel = sel ? SELECTION_LABEL[sel.mode] : null;
  const headline = [
    `${useLabel.charAt(0).toUpperCase()}${useLabel.slice(1)}`,
    `${n ?? '—'} ${modeLabel ? `${modeLabel} ` : ''}${zoningLabel}precedents`,
    confidence ? `${confidence} confidence` : null,
  ].filter(Boolean).join(' · ');

  const relaxNote = sel ? selectionRelaxationNote(sel) : null;
  const typeMix = precedent.type_mix && Object.keys(precedent.type_mix).length > 0
    ? Object.entries(precedent.type_mix)
        .sort((a, b) => b[1] - a[1])
        .map(([t, c]) => `${t.replace(/_/g, ' ')} ${c}`)
        .join(' · ')
    : null;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="text-xs font-semibold text-gray-900 mb-0.5">Local precedent basis</div>
      <p className="text-[11px] text-gray-500 mb-1.5 leading-snug">{headline}</p>

      {relaxNote && (
        <div className="mb-2 text-[11px] px-2 py-1.5 rounded bg-amber-50 text-amber-800 border border-amber-200 leading-snug">
          {relaxNote}
        </div>
      )}

      <div className="text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">Typical form</div>
      <TypeRow label="Footprint" value={fmtNum(precedent.footprint_sqft?.p50) && `${fmtNum(precedent.footprint_sqft?.p50)} SF`} basis="median" />
      <TypeRow label="Depth" value={fmt1(precedent.depth_ft?.p50) && `${fmt1(precedent.depth_ft?.p50)} ft`} basis="median" />
      <TypeRow label="Length" value={fmt1(precedent.length_ft?.p75) && `${fmt1(precedent.length_ft?.p75)} ft`} basis="p75" />
      <TypeRow
        label="Stories"
        value={
          precedent.stories?.p50 != null
            ? precedent.stories?.p75 != null && precedent.stories.p75 !== precedent.stories.p50
              ? `${fmt1(precedent.stories.p50)}–${fmt1(precedent.stories.p75)}`
              : fmt1(precedent.stories.p50)
            : null
        }
        basis="typical"
      />
      <TypeRow label="Coverage" value={fmt1(precedent.coverage_pct?.p75) && `${fmt1(precedent.coverage_pct?.p75)}%`} basis="p75" />
      <TypeRow label="Buildings per site" value={fmt1(precedent.building_count?.p50)} basis="median" />
      {sel?.lot_band && (
        <TypeRow label="Lot-size band" value={sel.lot_band === 'any' ? 'any lot size' : `${sel.lot_band} of subject`} basis="" />
      )}
      {typeMix && (
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
          <span className="font-medium text-gray-600">Observed uses:</span> {typeMix}
        </p>
      )}
      <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">
        Soft design priors from nearby Regrid building geometry — zoning and physical constraints remain hard limits.
      </p>
    </div>
  );
};

interface ContextPanelProps {
  /** DISPLAY-ONLY projection of the one compiled planner context */
  context: DesignContext | null;
  /** solver_brief.precedent_priors from the SAME compiled snapshot the
   *  solvers read — the local Regrid built-form basis (v2) or the reduced
   *  footprint/stories priors (v1). */
  precedent?: PrecedentPriors | null;
  /** context.market from the compiled snapshot (pricing comps) */
  pricing?: unknown;
  /** One-line snapshot identity (version · precedents · prior · access) */
  contextSummary?: string | null;
  loading: boolean;
  /** As-of-right uses for the selector (workspace-fetched, once per parcel) */
  uses: string[];
  use: string;
  onUseChange: (use: string) => void;
  /** Compile said this use is not permitted as-of-right */
  generationBlocked?: boolean;
}

/**
 * Design Context panel — renders the SAME compiled snapshot the solver uses.
 * This component fetches nothing; SiteWorkspace owns the context (single
 * source of truth per the planner contract).
 */
const ContextPanel: React.FC<ContextPanelProps> = ({
  context,
  precedent,
  pricing,
  contextSummary,
  loading,
  uses,
  use,
  onUseChange,
  generationBlocked,
}) => {
  const priceBldgSf = fmtUsd(p(pricing, 'price_per_building_sf', 'p50'));
  const priceLotSf = fmtUsd(p(pricing, 'price_per_lot_sf', 'p50'));
  const saleP50 = fmtUsd(p(pricing, 'sale_price', 'p50'));
  const saleP25 = fmtUsd(p(pricing, 'sale_price', 'p25'));
  const saleP75 = fmtUsd(p(pricing, 'sale_price', 'p75'));
  const hasPricing = priceBldgSf || priceLotSf || saleP50;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Design Context</h3>
        <ConfidencePill confidence={context?.confidence} />
      </div>

      {contextSummary && (
        <p className="text-[11px] text-gray-500 mb-2 leading-snug">{contextSummary}</p>
      )}

      {loading && !context && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Compiling local context…</p>
          <div className="space-y-2 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="h-3 bg-gray-100 rounded w-3/5" />
          </div>
        </div>
      )}

      {!loading && !context && (
        <p className="text-xs text-gray-500">
          Context unavailable — using standard defaults.
        </p>
      )}

      {context && (
        <>
          <div className="flex items-center gap-2 mb-2">
            {context.zoningBase && (
              <span className="text-xs font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                {context.zoningBase}
                {context.zoningSubtype ? ` · ${context.zoningSubtype}` : ''}
              </span>
            )}
            {context.parkingStrategy && (
              <span className="text-[10px] text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                {context.parkingStrategy.replace(/_/g, ' ')} parking
              </span>
            )}
          </div>

          {generationBlocked && (
            <div className="mb-2 text-xs font-medium px-2 py-1.5 rounded bg-red-50 text-red-700 border border-red-200">
              This use is not permitted as-of-right — generation is blocked.
              Pick a permitted use below.
            </div>
          )}

          <Row label="Front setback" v={context.setbackFrontFt} unit="ft" />
          <Row label="Side setback" v={context.setbackSideFt} unit="ft" />
          <Row label="Rear setback" v={context.setbackRearFt} unit="ft" />
          <Row label="Max FAR" v={context.maxFar} />
          <Row label="Max height" v={context.maxHeightFt} unit="ft" />
          <Row label="Max density" v={context.maxDensityDuAc} unit="DU/ac" />
          <Row label="Max coverage" v={context.maxCoveragePct} unit="%" />
          {context.flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {context.flags.map(flag => (
                <span
                  key={flag}
                  title={flag}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                >
                  ⚠ {describeContextFlag(flag)}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {uses.length > 0 && (
        <div className="mt-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Use (as-of-right only)
          </label>
          <select
            value={use}
            onChange={e => onUseChange(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
          >
            {!uses.includes(use) && <option value={use}>{use.replace(/_/g, ' ')}</option>}
            {uses.map(u => (
              <option key={u} value={u}>
                {u.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      )}

      {precedent && (
        <PrecedentBasis
          precedent={precedent}
          typology={context?.typology}
          zoningBase={context?.zoningBase}
        />
      )}

      {hasPricing && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-900 mb-1.5">Local pricing</div>
          {priceBldgSf && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Price / bldg SF</span>
              <span className="font-medium">{priceBldgSf}</span>
            </div>
          )}
          {priceLotSf && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Price / lot SF</span>
              <span className="font-medium">{priceLotSf}</span>
            </div>
          )}
          {saleP50 && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Sale price (median)</span>
              <span className="font-medium">
                {saleP50}
                {saleP25 && saleP75 && (
                  <span className="text-gray-400 font-normal"> ({saleP25}–{saleP75})</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextPanel;
