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

    // A detached house rides the 'townhome' mix slot (the mix has no house
    // type); on a sheet of houses only, the row says what it is — the single
    // house on 0 Riverfront Dr was tabulated as a "Townhome" (2026-11-04).
    const allHouses = buildings.length > 0 && buildings.every(b => b.properties?.house === true || b.properties?.singleFamilyHouse === true);
    const rows = (Object.keys(TYPE_LABELS) as UnitMixEntry['type'][])
      .filter(t => byType.has(t))
      .map(t => {
        const v = byType.get(t)!;
        const ratio = PARKING_RATIO_DEFAULTS[t];
        return {
          label: allHouses && t === 'townhome' ? (v.units === 1 ? 'Single-family house' : 'Single-family houses') : TYPE_LABELS[t],
          units: v.units,
          pct: (v.units / total) * 100,
          avgSqft: v.units ? v.sf / v.units : 0,
          pkgReq: Math.ceil(v.units * ratio),
        };
      });
    // The requirement the plan is held to is the engine's (its ratio, with
    // guest and accessible stalls where it counts them). The per-type column
    // splits THAT figure by units (largest remainder), so the table's total
    // is the header's: 0 Whites Creek Pike (2026-11-09) tabulated 80 stalls
    // required from typology defaults under a header that said 92.
    const engineRequired = metrics?.stallsRequired;
    if (typeof engineRequired === 'number' && engineRequired > 0 && total > 0) {
      const raw = rows.map(r => (r.units / total) * engineRequired);
      const floors = raw.map(Math.floor);
      let left = Math.round(engineRequired) - floors.reduce((s, v) => s + v, 0);
      const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
      for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k]![1]] += 1;
      rows.forEach((r, i) => { r.pkgReq = floors[i] ?? 0; });
    }
    return rows;
  }, [buildings, metrics?.totalUnits, metrics?.stallsRequired]);

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
    const parkingBasis = metrics?.parkingStatus === 'not_evaluated'
      ? 'Parking requirement: not evaluated for this sketch'
      : typeof metrics?.stallsRequired === 'number' && metrics.stallsRequired > 0
        ? `Parking required: ${metrics.stallsRequired} from the engine, split by units${metrics.parkingStatus === 'needs_verification' ? ' · provided count needs verification' : ''}`
        : 'Parking ratios: typology defaults';
    if (!plannerCtx) return `Context not compiled — plan uses standard defaults · ${parkingBasis}`;
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
      parkingBasis,
    ].filter(Boolean);
    return parts.join(' · ');
  }, [plannerCtx, metrics?.stallsRequired, metrics?.parkingStatus]);

  if (rows.length === 0) return null;

  const num = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });
  // an unknown requirement is shown as unknown, never as a typology guess (1289 Currey Rd)
  const notEvaluated = metrics?.parkingStatus === 'not_evaluated';
  const unverified = metrics?.parkingStatus === 'needs_verification';

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
              <td className="text-right">{notEvaluated ? '—' : num(r.pkgReq)}</td>
            </tr>
          ))}
          <tr className="font-semibold text-gray-900 border-t border-gray-200">
            <td className="py-0.5">Total</td>
            <td className="text-right">{num(totals.units)}</td>
            <td className="text-right">100%</td>
            <td className="text-right">{num(totals.avgSqft)}</td>
            <td className="text-right" data-testid="tab-pkg-total">{notEvaluated ? '—' : num(totals.pkg)}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px] text-gray-700 tabular-nums">
        {efficiency != null && (
          <span title="Net leasable / gross, from corridor geometry (computed)">
            Efficiency <b>{efficiency.toFixed(0)}%</b>
          </span>
        )}
        {/* A zero here is a figure the engine did not report, not a measured zero: a plan
            with floor area cannot have no floor area ratio (1710 Meharry Blvd: "FAR 0.00"
            and "Coverage 0%" beside 54,244 sf). The app does not measure them itself. */}
        <span data-testid="tab-far" title={(metrics?.achievedFAR ?? 0) > 0 ? undefined : 'The engine that drew this plan did not report a floor area ratio.'}>
          FAR <b>{(metrics?.achievedFAR ?? 0) > 0 ? (metrics?.achievedFAR ?? 0).toFixed(2) : 'not reported'}</b>
        </span>
        <span data-testid="tab-coverage" title={(metrics?.siteCoveragePct ?? 0) > 0 ? undefined : 'The engine that drew this plan did not report building coverage.'}>
          Coverage <b>{(metrics?.siteCoveragePct ?? 0) > 0 ? `${(metrics?.siteCoveragePct ?? 0).toFixed(0)}%` : 'not reported'}</b>
        </span>
        {duAc != null && <span>Density <b>{duAc.toFixed(1)} DU/ac</b></span>}
        <span
          title={
            typeof metrics?.stallsDrawn === 'number' && typeof metrics?.stallsReported === 'number' && metrics.stallsDrawn !== metrics.stallsReported
              ? `The drawn bays hold ${metrics.stallsDrawn} stalls; the engine's summary said ${metrics.stallsReported}. The sheet counts the drawn bays.`
              : undefined
          }
        >
          Stalls <b>{metrics?.stallsProvided ?? 0} / {notEvaluated ? 'not evaluated' : (metrics?.stallsRequired ?? 0)}</b>
          {typeof metrics?.stallsDrawn === 'number' && typeof metrics?.stallsReported === 'number' && metrics.stallsDrawn !== metrics.stallsReported && (
            <span data-testid="tab-stalls-reported" className="ml-1 text-[10px] text-amber-700">(engine summary {metrics.stallsReported}{unverified ? ' · needs verification' : ''})</span>
          )}
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
