/**
 * Impervious area read off the plan's own geometry (audit 9379472 F1: after three home changes
 * at 0 Delk Ave the footprint moved +680 sf while the panel still read the solver's 30.6%).
 *
 * Roofs, porches, pads, drives, walks and streets are unioned once — an overlapping porch and
 * walk, or a drive under an apron, is not counted twice — and measured in ground square feet.
 * The solver's own percentage keeps its definition; the plan's change since the solve is added
 * to it, so the figure stays on the solver's basis and says so.
 */
import polygonClipping from 'polygon-clipping';
import type { Element } from '../../../engine/types';
import { createGroundFrame } from '../scene/frame';

type Ring = number[][];
type Poly = Ring[];

const PAVED_KINDS = new Set(['driveway', 'walk', 'street', 'lane', 'alley', 'pad', 'apron', 'sidewalk']);

function isImpervious(e: Element): boolean {
  if (e.type === 'building') return true;
  if (e.type === 'circulation' || e.type === 'parking' || e.type === 'road') return true;
  const k = String(e.properties?.kind ?? '');
  if (PAVED_KINDS.has(k)) return true;
  // concept parts: porch, parking pad, carriage house
  return /-home-(porch|parking-space|wing)-/.test(e.id);
}

function polysOf(e: Element): Poly[] {
  const g = e.geometry as { type?: string; coordinates?: unknown } | undefined;
  if (g?.type === 'Polygon') return [g.coordinates as Poly];
  if (g?.type === 'MultiPolygon') return g.coordinates as Poly[];
  return [];
}

function areaSf(mp: Poly[], f: ReturnType<typeof createGroundFrame>): number {
  const ringArea = (r: Ring) => {
    const pts = r.map(p => f.toFeet(p));
    let a = 0;
    for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
    return Math.abs(a) / 2;
  };
  return mp.reduce((s, poly) => s + ringArea(poly[0]!) - poly.slice(1).reduce((h, r) => h + ringArea(r), 0), 0);
}

/** Roofed and paved ground sf of these elements, unioned once. */
export function imperviousAreaSf(elements: Element[]): number {
  const polys = elements.filter(isImpervious).flatMap(polysOf).filter(p => p[0] && p[0].length >= 4);
  if (!polys.length) return 0;
  const first = polys[0]![0]![0]!;
  const f = createGroundFrame(first[0]!, first[1]!);
  try {
    const u = polygonClipping.union(...(polys as [Poly, ...Poly[]]) as never) as unknown as Poly[];
    return areaSf(u, f);
  } catch {
    return areaSf(polys, f); // a degenerate ring: sum without the union rather than nothing
  }
}

/**
 * The solver's impervious percentage moved by the plan's change since the solve.
 * Null when the solver gave none or the site area is unknown.
 */
export function imperviousNowPct(opts: { solverPct: number | null; siteSf: number | null; baseSf: number; nowSf: number }): number | null {
  if (opts.solverPct == null || !opts.siteSf || opts.siteSf <= 0) return null;
  return Math.round((opts.solverPct + (100 * (opts.nowSf - opts.baseSf)) / opts.siteSf) * 10) / 10;
}
