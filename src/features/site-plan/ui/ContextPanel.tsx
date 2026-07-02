import React, { useEffect, useState } from 'react';
import type { Confidence, ContextValue, DesignContext } from '../api/designContext';
import {
  fetchDesignContext,
  fetchLocalBuiltForm,
  fetchLocalPricing,
  fetchPermittedUses,
  normalizeDesignContext,
  normalizePermittedUses,
} from '../api/designContext';

const CONF_STYLE: Record<Confidence, string> = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-200 text-gray-600',
  review_required: 'bg-red-100 text-red-700',
};

const ConfidencePill: React.FC<{ confidence?: Confidence }> = ({ confidence }) =>
  confidence ? (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CONF_STYLE[confidence]}`}>
      {confidence.replace('_', ' ')}
    </span>
  ) : null;

/** A zoning value row with the provenance badge — the product differentiator. */
const Row: React.FC<{ label: string; v?: ContextValue; unit?: string }> = ({ label, v, unit }) => {
  if (!v || v.value == null) return null;
  const estimated = v.source !== 'zoning';
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <span className="text-gray-600">{label}</span>
      <span className="flex items-center gap-1.5 font-medium text-gray-900">
        {v.value}{unit ? ` ${unit}` : ''}
        {estimated && (
          <span
            title={`Source: ${v.source} (${v.confidence})`}
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
          >
            est.
          </span>
        )}
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
  ogcFid: number | null;
  /** Selected use (drives the context RPC), e.g. 'single_family' */
  use: string;
  onUseChange: (use: string) => void;
  /** Fires when a context loads so the workspace can ground solver defaults */
  onContext?: (ctx: DesignContext) => void;
}

/**
 * Design Context panel (brief Phase 1): zoning + provenance, legal-use
 * selector, and local comps/pricing. Everything fails soft — if the context
 * engine is unreachable the panel says so and the planner keeps its defaults.
 */
const ContextPanel: React.FC<ContextPanelProps> = ({ ogcFid, use, onUseChange, onContext }) => {
  const [context, setContext] = useState<DesignContext | null>(null);
  const [uses, setUses] = useState<string[]>([]);
  const [builtForm, setBuiltForm] = useState<unknown>(null);
  const [pricing, setPricing] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ogcFid == null || !Number.isFinite(ogcFid)) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      // Context first (fast); comps in parallel (backend currently ~2s)
      const [ctxRaw, usesRaw] = await Promise.all([
        fetchDesignContext(ogcFid, use),
        fetchPermittedUses(ogcFid),
      ]);
      if (cancelled) return;
      const ctx = normalizeDesignContext(ctxRaw);
      setContext(ctx);
      setUses(normalizePermittedUses(usesRaw));
      if (ctx) onContext?.(ctx);
      setLoading(false);

      const [bf, pr] = await Promise.all([fetchLocalBuiltForm(ogcFid), fetchLocalPricing(ogcFid)]);
      if (cancelled) return;
      setBuiltForm(bf);
      setPricing(pr);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ogcFid, use]);

  if (ogcFid == null) return null;

  const regime = context?.regime
    ? context.regime.includes('civil') || context.regime.includes('horizontal')
      ? 'Civil · Horizontal'
      : 'Architectural · Vertical'
    : null;

  const nComps = fmtNum(p(builtForm, 'n_comps'));
  const targetFootprint = fmtNum(p(builtForm, 'underwrite_target', 'footprint_sqft') ?? p(builtForm, 'underwrite_target_footprint_sqft'));
  const medianFootprint = fmtNum(p(builtForm, 'footprint_sqft', 'p50') ?? p(builtForm, 'p50_footprint_sqft'));
  const p75Footprint = fmtNum(p(builtForm, 'footprint_sqft', 'p75') ?? p(builtForm, 'p75_footprint_sqft'));
  const priceBldgSf = fmtUsd(p(pricing, 'price_per_bldg_sqft') ?? p(pricing, 'usd_per_bldg_sf'));
  const priceLotSf = fmtUsd(p(pricing, 'price_per_lot_sqft') ?? p(pricing, 'usd_per_lot_sf'));
  const hasComps = nComps || targetFootprint || medianFootprint || priceBldgSf;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">Design Context</h3>
        <ConfidencePill confidence={context?.confidence} />
      </div>

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
            {regime && (
              <span className="text-[10px] text-gray-500 border border-gray-200 px-1.5 py-0.5 rounded">
                {regime}
              </span>
            )}
          </div>

          <Row label="Front setback" v={context.setbackFrontFt} unit="ft" />
          <Row label="Side setback" v={context.setbackSideFt} unit="ft" />
          <Row label="Rear setback" v={context.setbackRearFt} unit="ft" />
          <Row label="Max FAR" v={context.maxFar} />
          <Row label="Max height" v={context.maxHeightFt} unit="ft" />
          <Row label="Max density" v={context.maxDensityDuAc} unit="DU/ac" />
          <Row label="Max coverage" v={context.maxCoveragePct} unit="%" />
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
              <span className="text-gray-600">Median footprint</span>
              <span className="font-medium">{medianFootprint} SF</span>
            </div>
          )}
          {p75Footprint && (
            <div className="flex justify-between text-sm py-0.5">
              <span className="text-gray-600">p75 footprint</span>
              <span className="font-medium">{p75Footprint} SF</span>
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
        </div>
      )}
    </div>
  );
};

export default ContextPanel;
