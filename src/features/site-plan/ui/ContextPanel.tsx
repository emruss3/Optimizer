import React from 'react';
import type { Confidence, ContextValue, DesignContext } from '../api/designContext';

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

interface ContextPanelProps {
  /** DISPLAY-ONLY projection of the one compiled planner context */
  context: DesignContext | null;
  /** context.precedent from the compiled snapshot (built-form comps) */
  builtForm?: unknown;
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
  builtForm,
  pricing,
  contextSummary,
  loading,
  uses,
  use,
  onUseChange,
  generationBlocked,
}) => {
  // Live accessor paths (fn_local_built_form / fn_local_pricing shapes)
  const nComps = fmtNum(p(builtForm, 'n_comps'));
  const targetFootprint = fmtNum(
    p(builtForm, 'underwrite_target', 'footprint_sqft_p75') ??
    p(builtForm, 'underwrite_target', 'footprint_sqft')
  );
  const distFp = (q: string) => fmtNum(p(builtForm, 'distribution', 'footprint_sqft', q));
  const p25Footprint = distFp('p25');
  const medianFootprint = distFp('p50');
  const p75Footprint = distFp('p75');
  const p90Footprint = distFp('p90');
  const stories = fmtNum(p(builtForm, 'distribution', 'stories', 'p50'));
  const priceBldgSf = fmtUsd(p(pricing, 'price_per_building_sf', 'p50'));
  const priceLotSf = fmtUsd(p(pricing, 'price_per_lot_sf', 'p50'));
  const saleP50 = fmtUsd(p(pricing, 'sale_price', 'p50'));
  const saleP25 = fmtUsd(p(pricing, 'sale_price', 'p25'));
  const saleP75 = fmtUsd(p(pricing, 'sale_price', 'p75'));
  const hasComps = nComps || targetFootprint || medianFootprint || priceBldgSf || saleP50;

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
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-gray-100 rounded w-2/3" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-3/5" />
        </div>
      )}

      {!loading && !context && (
        <p className="text-xs text-gray-500">
          Context engine unavailable — planning on standard defaults.
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
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200"
                >
                  ⚠ {flag.replace(/_/g, ' ')}
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

      {hasComps && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="text-xs font-semibold text-gray-900 mb-1.5">
            What&apos;s being built nearby
            {nComps && <span className="font-normal text-gray-500"> · {nComps} comps</span>}
          </div>
          {targetFootprint && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Underwrite target</span>
              <span className="font-medium">{targetFootprint} SF</span>
            </div>
          )}
          {medianFootprint && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Footprints p25–p90</span>
              <span className="font-medium tabular-nums">
                {[p25Footprint, medianFootprint, p75Footprint, p90Footprint]
                  .filter(Boolean)
                  .join(' · ')}{' '}
                SF
              </span>
            </div>
          )}
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
          {stories && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">Typical stories</span>
              <span className="font-medium">{stories}</span>
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
