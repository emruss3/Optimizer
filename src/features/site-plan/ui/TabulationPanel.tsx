import React, { useMemo } from 'react';
import type { Element, SiteMetrics } from '../../../engine/types';
import {
  corridorEfficiency,
  PARKING_RATIO_DEFAULTS,
  type UnitMixEntry,
} from '../../../engine/model';
import type { PlannerContextResponse } from '../api/plannerContext';

const TYPE_LABELS: Record<UnitMixEntry['type'], string> = {
  studio: 'Studio',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
  townhome: 'Townhome',
};

interface Row {
  label: string;
  units: number;
  pct: number;
  avgSqft: number;
  pkgReq: number;
}

/** Short side of an element's bbox in metres — plate depth for efficiency. */
function plateDepthM(el: Element): number {
  const ring = el.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return Math.min(maxX - minX, maxY - minY);
}

/**
 * The Image-3 tabulation: unit mix with per-type parking requirements, then
 * the computed plan facts (efficiency from corridor geometry — never a
 * hardcoded 85%), with a receipts line that says where the numbers came from.
 */
const TabulationPanel: React.FC<{
  elements: Element[];
  metrics: SiteMetrics | null;
  plannerCtx: PlannerContextResponse | null;
  /** Parcel acres for DU/ac (backend value) */
  acres?: number | null;
}> = ({ elements, metrics, plannerCtx, acres }) => {
  const buildings = useMemo(
    () => elements.filter(e => e.type === 'building' && (e.properties?.use ?? 'residential') === 'residential'),
    [elements]
  );

  const rows = useMemo<Row[]>(() => {
    const byType = new Map<UnitMixEntry['type'], { units: number; sf: number }>();
    for (const b of buildings) {
      const mix = (b.properties?.unitMix as UnitMixEntry[] | undefined) ?? [];
      for (const e of mix) {
        const cur = byType.get(e.type) ?? { units: 0, sf: 0 };
        cur.units += e.count;
        cur.sf += e.count * e.avgSqft;
        byType.set(e.type, cur);
      }
    }
    let total = [...byType.values()].reduce((s, v) => s + v.units, 0);
    if (total === 0) return [];

    // Reconcile to the KPI unit count: per-building mixes round independently
    // and can drift by a unit or two from metrics.totalUnits. The table and
    // the header must agree — absorb the delta in the largest type.
    const kpiTotal = metrics?.totalUnits;
    if (kpiTotal != null && kpiTotal > 0 && kpiTotal !== total) {
      const largest = [...byType.entries()].sort((a, b) => b[1].units - a[1].units)[0];
      if (largest) {
        const delta = kpiTotal - total;
        const perUnitSf = largest[1].units > 0 ? largest[1].sf / largest[1].units : 0;
        largest[1].units = Math.max(0, largest[1].units + delta);
        largest[1].sf = largest[1].units * perUnitSf;
        total = kpiTotal;
      }
    }

    return (Object.keys(TYPE_LABELS) as UnitMixEntry['type'][])
      .filter(t => byType.has(t))
      .map(t => {
        const v = byType.get(t)!;
        const ratio = PARKING_RATIO_DEFAULTS[t];
        return {
          label: TYPE_LABELS[t],
          units: v.units,
          pct: (v.units / total) * 100,
          avgSqft: v.units ? v.sf / v.units : 0,
          pkgReq: Math.ceil(v.units * ratio),
        };
      });
  }, [buildings, metrics?.totalUnits]);

  const totals = useMemo(() => {
    const units = rows.reduce((s, r) => s + r.units, 0);
    const sf = rows.reduce((s, r) => s + r.avgSqft * r.units, 0);
    const pkg = rows.reduce((s, r) => s + r.pkgReq, 0);
    return { units, avgSqft: units ? sf / units : 0, pkg };
  }, [rows]);

  // Computed efficiency from the deepest plate on the sheet — the same
  // corridor model the engine uses, displayed, not asserted.
  const efficiency = useMemo(() => {
    const depths = buildings.map(plateDepthM).filter(d => d > 0);
    if (!depths.length) return null;
    const maxDepth = Math.max(...depths);
    return corridorEfficiency(maxDepth) * 100;
  }, [buildings]);

  const duAc = acres && acres > 0 && metrics?.totalUnits
    ? metrics.totalUnits / acres
    : null;

  // Receipts: the compiled context's provenance, always visible.
  const receipts = useMemo(() => {
    if (!plannerCtx) return 'Context not compiled — plan uses standard defaults';
    const c = plannerCtx.context;
    const n = (c.precedent as { n_comps?: number } | undefined)?.n_comps;
    const conf = (c.precedent as { confidence?: string } | undefined)?.confidence;
    const zone = (c.legal as { zoning_base?: string } | undefined)?.zoning_base;
    const farSource = (c.legal as { max_far?: { source?: string } } | undefined)?.max_far?.source;
    const envelope =
      farSource === 'ordinance' || farSource === 'zoning'
        ? '§17.12.020'
        : 'typology defaults';
    const parts = [
      n != null ? `Mix prior: ${n} local ${zone ?? ''} precedents`.replace('  ', ' ') : null,
      `Envelope: ${envelope}`,
      conf ? `Confidence: ${conf}` : null,
      'Parking ratios: typology defaults',
    ].filter(Boolean);
    return parts.join(' · ');
  }, [plannerCtx]);

  if (rows.length === 0) return null;

  const num = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-gray-500">
            <th className="text-left font-medium py-0.5">Type</th>
            <th className="text-right font-medium">Units</th>
            <th className="text-right font-medium">%</th>
            <th className="text-right font-medium">Avg SF</th>
            <th className="text-right font-medium" title="Per-type parking requirement">Pkg req</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="text-gray-800">
              <td className="py-0.5">{r.label}</td>
              <td className="text-right">{num(r.units)}</td>
              <td className="text-right">{num(r.pct)}%</td>
              <td className="text-right">{num(r.avgSqft)}</td>
              <td className="text-right">{num(r.pkgReq)}</td>
            </tr>
          ))}
          <tr className="font-semibold text-gray-900 border-t border-gray-200">
            <td className="py-0.5">Total</td>
            <td className="text-right">{num(totals.units)}</td>
            <td className="text-right">100%</td>
            <td className="text-right">{num(totals.avgSqft)}</td>
            <td className="text-right">{num(totals.pkg)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] text-gray-700 tabular-nums">
        {efficiency != null && (
          <span title="Net leasable / gross, from corridor geometry (computed)">
            Efficiency <b>{efficiency.toFixed(0)}%</b>
          </span>
        )}
        <span>FAR <b>{(metrics?.achievedFAR ?? 0).toFixed(2)}</b></span>
        <span>Coverage <b>{(metrics?.siteCoveragePct ?? 0).toFixed(0)}%</b></span>
        {duAc != null && <span>Density <b>{duAc.toFixed(1)} DU/ac</b></span>}
        <span>
          Stalls <b>{metrics?.stallsProvided ?? 0} / {metrics?.stallsRequired ?? 0}</b>
        </span>
        {metrics?.totalUnits ? (
          <span>
            Ratio <b>{((metrics.stallsProvided ?? 0) / metrics.totalUnits).toFixed(2)}/u</b>
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 pt-1.5 border-t border-gray-100 text-[10px] text-gray-500">
        {receipts}
      </div>
    </div>
  );
};

export default TabulationPanel;
