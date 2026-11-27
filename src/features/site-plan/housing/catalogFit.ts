// One fit result per authored design for the target lot (handoff 11-27, Buildable plans). The same
// result drives the list's order and badge, the reason, Preview and Apply: a design that does not
// fit is still listed, with why, never dropped from the list.
import type { Element } from '../../../engine/types';
import type { HomeDesign } from './originalDesigns';
import { placeHome, type FitResult } from './placement';
import { designMatchesHouseTypology } from './homeDesignsGate';
import { withoutHomeParts } from './carry';

export type CatalogFitStatus = 'fits' | 'no-fit' | 'other-typology' | 'no-lot';

export interface CatalogFitRow {
  design: HomeDesign;
  status: CatalogFitStatus;
  /** The placement when it fits; the reason when it does not; null when no lot is chosen. */
  result: FitResult | null;
  /** What the badge says, short. */
  badge: string;
}

const ORDER: Record<CatalogFitStatus, number> = { fits: 0, 'no-fit': 1, 'other-typology': 2, 'no-lot': 3 };

/** Every design, fitted to the lot, fits first; within a status the catalogue's own order is kept. */
export function catalogFitRows(
  designs: readonly HomeDesign[],
  house: Element | null | undefined,
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
  maxHeightFt?: number | null,
): CatalogFitRow[] {
  // a house carrying a committed concept is fitted without that concept's porch, walk and pad
  const base = house ? withoutHomeParts(elements, house.id) : elements;
  const rows = designs.map((design, i): CatalogFitRow & { i: number } => {
    if (!house) return { design, status: 'no-lot', result: null, badge: 'choose a lot to check', i };
    if (!designMatchesHouseTypology(design, house)) {
      const reason = design.attached ? 'an attached design: this lot is a detached house lot' : 'a detached design: this lot is an attached townhome pad';
      return { design, status: 'other-typology', result: { reason }, badge: design.attached ? 'attached · not this lot type' : 'detached · not this lot type', i };
    }
    const result = placeHome(design, house, base, siteBoundary, maxHeightFt);
    return result.placement
      ? { design, status: 'fits', result, badge: 'fits this lot', i }
      : { design, status: 'no-fit', result, badge: shortReason(result.reason), i };
  });
  return rows.sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.i - b.i).map(({ i: _i, ...row }) => row);
}

/** The first clause of a fit reason, for a list badge. */
export function shortReason(reason: string | undefined): string {
  if (!reason) return 'does not fit';
  const first = reason.split(/[;:.]/)[0]!.trim();
  return first.length > 46 ? `${first.slice(0, 44)}…` : first;
}

/** The lots on the plan a design fits, for "Find compatible lots". */
export function compatibleLots(
  design: HomeDesign,
  houses: Element[],
  elements: Element[],
  siteBoundary?: Element['geometry'] | null,
  maxHeightFt?: number | null,
): Element[] {
  return houses.filter(h => designMatchesHouseTypology(design, h) && !!placeHome(design, h, withoutHomeParts(elements, h.id), siteBoundary, maxHeightFt).placement);
}

/**
 * What a design is, by the source that was actually verified. Every authored design in the
 * catalogue today is a schematic concept: room zones and volumes drawn for site fit, not a
 * dimensioned set. The West Heiman studies follow the plans' revision 14 room zones, and are still
 * schematic until checked against the dimensioned sheets.
 */
export type DesignSource = 'project-plan' | 'authored-concept' | 'stock-listing';

export const SOURCE_LABEL: Record<DesignSource, string> = {
  'project-plan': 'Dimensioned project plan',
  'authored-concept': 'Authored concept · schematic',
  'stock-listing': 'Stock listing footprint',
};

/** Designs verified against dimensioned project sheets. None yet: a design is added here only once checked. */
export const DIMENSIONED_PROJECT_PLANS: ReadonlySet<string> = new Set<string>();

export function authoredSource(designId: string): DesignSource {
  return DIMENSIONED_PROJECT_PLANS.has(designId) ? 'project-plan' : 'authored-concept';
}
