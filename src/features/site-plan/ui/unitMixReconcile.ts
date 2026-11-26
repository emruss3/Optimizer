/**
 * The plan's unit count against the unit mix its buildings carry (audit
 * 2026-11-26, 535 Main St: 131 in the headline over 13 + 52 + 45 + 19 = 129).
 *
 * The headline and the schedule used to add the difference to the largest
 * type so they agreed — which invented two one-bedroom homes. Now both read
 * this one result: the mix as the buildings carry it, and the difference
 * named, so a reader sees 129 typed homes and 2 the plan counts without a type.
 */
import type { Element } from '../../../engine/types';

export interface MixRow { type: string; units: number; sf: number }

export interface UnitMixReconciliation {
  rows: MixRow[];
  /** Homes the mix lists. */
  mixUnits: number;
  /** Homes the plan counts (metrics.totalUnits), or the mix total when the plan gives none. */
  plannedUnits: number;
  /** plannedUnits − mixUnits: positive = homes without a type, negative = the mix lists more than the plan. */
  residual: number;
}

export function reconcileUnitMix(buildings: Element[], plannedUnits: number | null | undefined): UnitMixReconciliation {
  const byType = new Map<string, MixRow>();
  for (const b of buildings) {
    const mix = b.properties?.unitMix as Array<{ type?: string; count?: number; avgSqft?: number }> | undefined;
    for (const e of mix ?? []) {
      if (!e?.type || !(Number(e.count) > 0)) continue;
      const count = Math.round(Number(e.count));
      const cur = byType.get(e.type) ?? { type: e.type, units: 0, sf: 0 };
      cur.units += count;
      cur.sf += count * (Number(e.avgSqft) || 0);
      byType.set(e.type, cur);
    }
  }
  const rows = [...byType.values()];
  const mixUnits = rows.reduce((s, r) => s + r.units, 0);
  const planned = plannedUnits != null && plannedUnits > 0 ? Math.round(plannedUnits) : mixUnits;
  return { rows, mixUnits, plannedUnits: planned, residual: mixUnits > 0 ? planned - mixUnits : 0 };
}

/** "2 homes the plan counts have no type in the unit mix" / "the unit mix lists 3 more homes than the plan counts". */
export function residualWords(r: UnitMixReconciliation): string | null {
  if (r.residual === 0) return null;
  if (r.residual > 0) return `${r.residual} home${r.residual === 1 ? '' : 's'} without a type in the unit mix (the mix lists ${r.mixUnits} of ${r.plannedUnits})`;
  return `the unit mix lists ${r.mixUnits} homes, ${-r.residual} more than the ${r.plannedUnits} the plan counts`;
}
