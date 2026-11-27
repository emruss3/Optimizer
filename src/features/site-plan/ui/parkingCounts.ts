/**
 * One reading of a plan's parking, labelled the same on every surface (audit
 * 2026-11-26: at 6420 Holt Rd the plan reported 150 drawn stalls, the engine
 * summary 64, the headline 0 — the street-reachable count shown without its
 * name — and 115 required).
 *
 *   drawn                    stalls in the bays drawn on the sheet
 *   engine summary           the count the engine's own summary gives
 *   reachable from the street  stalls on bays a car reaches through the drawn drives
 *   required                 the requirement the plan is held to
 *
 * Unknown is not zero: a count nobody checked is left out, never printed as 0.
 */
import type { Element, SiteMetrics } from '../../../engine/types';

export interface ParkingCounts {
  drawn: number | null;
  reported: number | null;
  reachable: number | null;
  /** stalls inside a parking structure (podium or wrap garage), not drawn as bays */
  structured: number | null;
  required: number | null;
  /** false when the requirement was not evaluated for this sketch */
  requiredEvaluated: boolean;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

export function parkingCounts(m: SiteMetrics | null | undefined): ParkingCounts {
  const drawn = num(m?.stallsDrawn);
  const reported = num(m?.stallsReported);
  return {
    drawn: drawn ?? (reported == null && m?.stallsStructured == null ? num(m?.stallsProvided) : null),
    reported,
    reachable: num(m?.stallsReachable),
    structured: num(m?.stallsStructured),
    required: num(m?.stallsRequired) && (m?.stallsRequired as number) > 0 ? num(m?.stallsRequired) : null,
    requiredEvaluated: m?.parkingStatus !== 'not_evaluated',
  };
}

/** True when the counts do not all say the same supply. */
export function parkingCountsDisagree(c: ParkingCounts): boolean {
  const supply = [c.drawn, c.reported, c.reachable].filter((v): v is number => v != null);
  return new Set(supply).size > 1;
}

/** The supply figures, each with its name: "150 drawn · 64 in the engine summary · 0 reachable from the street". */
export function parkingSupplyParts(c: ParkingCounts): string[] {
  const parts: string[] = [];
  if (c.structured != null) parts.push(`${c.structured.toLocaleString()} in a garage (structured parking)`);
  if (c.drawn != null) parts.push(`${c.drawn.toLocaleString()} drawn`);
  if (c.reported != null && c.reported !== c.drawn) parts.push(`${c.reported.toLocaleString()} in the engine summary`);
  if (c.reachable != null && c.reachable !== c.drawn) parts.push(`${c.reachable.toLocaleString()} reachable from the street`);
  if (!parts.length && c.reported != null) parts.push(`${c.reported.toLocaleString()} in the engine summary`);
  return parts;
}

/** Supply and requirement in one line. */
export function parkingCountsLine(c: ParkingCounts): string | null {
  const parts = parkingSupplyParts(c);
  if (c.required != null) parts.push(`${c.required.toLocaleString()} required`);
  else if (!c.requiredEvaluated) parts.push('requirement not evaluated');
  return parts.length ? parts.join(' · ') : null;
}

/** The supply that meets the requirement: reachable when checked, else drawn, else the engine's. */
export function parkingSupplyForAdequacy(c: ParkingCounts): number | null {
  return c.reachable ?? (c.structured != null ? c.structured + (c.drawn ?? 0) : null) ?? c.drawn ?? c.reported;
}

/**
 * The stalls a plan counts on parking bays or garages that no route was traced to, or null when
 * there are none or the reachable count is known. Houses' own drives are not counted: a lot fronts
 * its street by construction.
 */
export function parkingStallsUntraced(elements: Element[], m: SiteMetrics | null | undefined): number | null {
  if (!m || num(m.stallsReachable) != null) return null;
  const bays = elements.filter(e => e.type === 'parking');
  if (!bays.length) return null;
  const c = parkingCounts(m);
  const supply = c.drawn ?? c.reported;
  return supply != null && supply > 0 ? supply : null;
}
