/**
 * Why a scheme with houses offers no home design (masterplan audit 2026-11-26:
 * 330 Athens Way drew 79 townhome pads and "Buildable plans" was simply
 * disabled). The answer separates the reasons the audit names: a housing form
 * the catalogue does not cover, no mapped vehicle approach, an envelope too
 * small, and no matching design — counted across the lots, most common first.
 */
import type { Element } from '../../../engine/types';
import type { HomeDesign } from './originalDesigns';
import { designMatchesHouseTypology } from './homeDesignsGate';
import { placeHome, residentialHomes } from './placement';
import type { HouseLotEligibility } from './eligibility';
import { createGroundFrame } from '../scene/frame';
import { designBounds } from './drawings';

export interface HomeDiagnosis {
  /** "79 attached townhome pads, about 20 × 40 ft" */
  summary: string;
  /** one line per reason, most common first: "79 of 79 lots: …" */
  lines: string[];
}

function padSize(e: Element): string | null {
  const r = (e.geometry as { coordinates?: number[][][] } | undefined)?.coordinates?.[0];
  if (!Array.isArray(r) || r.length < 4) return null;
  const f = createGroundFrame(r[0]![0]!, r[0]![1]!);
  const pts = r.map(p => f.toFeet(p));
  const edges = pts.slice(0, -1).map((p, i) => Math.hypot(pts[i + 1]![0] - p[0], pts[i + 1]![1] - p[1])).sort((a, b) => a - b);
  if (edges.length < 4) return null;
  return `${Math.round(edges[0]!)} × ${Math.round(edges[edges.length - 1]!)} ft`;
}

export function homeDesignsDiagnosis(opts: {
  elements: Element[];
  concepts: readonly HomeDesign[];
  siteBoundary?: Element['geometry'] | null;
  stockRows: HouseLotEligibility[];
  /** false when the zoning does not take detached stock plans (RM, CS…) */
  stockAllowed: boolean;
  /** check at most this many lots (a 150-lot plan stays quick); the counts say how many were read */
  sample?: number;
}): HomeDiagnosis {
  const houses = residentialHomes(opts.elements);
  const attached = houses.filter(h => h.properties?.townhome);
  const detached = houses.length - attached.length;
  const size = houses[0] ? padSize(houses[0]) : null;
  const kind = attached.length === houses.length ? 'attached townhome pad' : detached === houses.length ? 'detached house lot' : 'house lot';
  const summary = `${houses.length} ${kind}${houses.length === 1 ? '' : 's'}${size ? `, about ${size}` : ''}`;

  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  const n = Math.min(houses.length, opts.sample ?? 40);
  for (const h of houses.slice(0, n)) {
    const typed = opts.concepts.filter(d => designMatchesHouseTypology(d, h));
    if (!typed.length) { bump(h.properties?.townhome ? 'no attached concept study in the catalogue' : 'no detached concept study in the catalogue'); continue; }
    // the reason the first (smallest-first) design gives is the binding one for this lot
    const width = (d: HomeDesign) => designBounds(d)[2];
    const sorted = [...typed].sort((a, b) => width(a) - width(b));
    const r = placeHome(sorted[0]!, h, opts.elements, opts.siteBoundary);
    bump(r.placement ? 'a concept study fits' : `concept studies: ${r.reason ?? 'not placed'}`);
  }
  const lines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([why, c]) => `${c} of ${n} lot${n === 1 ? '' : 's'}${n < houses.length ? ' checked' : ''}: ${why.replace(/\.$/, '')}`);
  if (attached.length > 0) lines.push(`Buildable stock plans are detached houses; the ${attached.length} attached pad${attached.length === 1 ? '' : 's'} cannot take one.`);
  else if (!opts.stockAllowed) lines.push('Buildable stock plans are offered on single-family districts (or a labelled rezone); this parcel is not one.');
  else {
    const none = opts.stockRows.filter(r => r.eligible.length === 0);
    if (none.length) lines.push(`Stock plans: none fit ${none.length} of ${opts.stockRows.length} lots — ${none[0]!.lotProblem ?? none[0]!.rejected[0]?.reason ?? 'not placed'}.`);
  }
  return { summary, lines };
}
