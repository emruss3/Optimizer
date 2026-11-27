import type { Element } from '../../../engine/types';
import { parentLotOf } from './eligibility';
import { roofHeight } from './drawings';
import { findHome } from './originalDesigns';
import { placeHome, residentialHomes } from './placement';

// Small-lot pilot: these are authored, dimensioned-in-the-model concepts, NOT
// architect-issued plans. Keep the automatic solver independent of stock listings,
// the project's proposed studies and any geometry that hasn't cleared the same fit as Apply.
const STARTERS = ['tn-waverly-lane-v1', 'tn-lockeland-cottage-v1', 'tn-court-cottage-v1', 'tn-harpeth-ranch-v1'];
// about 50 ms a lot on a laptop: up to 24 lots are screened at solve time; larger plans in the background
const MAX_PILOT_LOTS = 24;

export const PROVISIONAL_PAD = 'Provisional building pad';

export function isProvisionalPad(element: Element): boolean {
  const p = element.properties;
  return element.type === 'building' && Boolean(p.house || p.singleFamilyHouse || p.townhome) && !p.housingDesignId;
}

export function isGeometryBackedHome(element: Element): boolean {
  return element.type === 'building' && !!findHome(element.properties.housingDesignId)
    && Array.isArray(element.properties.homeOrigin) && Array.isArray(element.properties.homeAxis);
}

/** Why a lot kept its engine footprint instead of a suggested starter home (audit eb378b1: every lot
 *  gets either a fit-supported home or a reason). */
export interface StarterReport { houseId: string; lot: string; placed: string | null; reason: string | null }

type StarterResult = { elements: Element[]; report: StarterReport[]; skipped: string | null; deferred?: boolean };

/** What the screening needs, or why it cannot run. */
function prepare(elements: Element[], siteBoundary: Element['geometry'] | null, maxHeightFt: number | null | undefined):
  { houses: Element[]; height: number; candidates: ReturnType<typeof findHome>[] } | { skipped: string } {
  const height = maxHeightFt != null && Number.isFinite(maxHeightFt) && maxHeightFt > 0 ? maxHeightFt : null;
  if (!siteBoundary) return { skipped: 'the parcel boundary is not a single polygon, so no lot could be screened' };
  // the height limit is required data: without it nothing is suggested (manual choice still works)
  if (height == null) return { skipped: 'no height limit is recorded for this parcel yet, so no home was suggested automatically' };
  const candidates = STARTERS.flatMap(id => {
    const design = findHome(id);
    return design && roofHeight(design) <= height ? [design] : [];
  });
  return { houses: residentialHomes(elements), height, candidates };
}

/** The screening, one lot at a time: yields after each lot so a long plan can run in slices. */
function* screen(elements: Element[], siteBoundary: Element['geometry'], prep: { houses: Element[]; height: number; candidates: ReturnType<typeof findHome>[] }): Generator<void, StarterResult> {
  const { houses, height } = prep;
  const candidates = prep.candidates.filter((d): d is NonNullable<typeof d> => !!d);
  const lotName = (h: Element, plan: Element[]) => parentLotOf(h, plan)?.name ?? h.name ?? h.id;
  let plan = elements;
  const report: StarterReport[] = [];
  for (const house of houses) {
    if (!isProvisionalPad(house)) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: null }); continue; }
    if (house.properties.townhome) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: 'an attached townhome pad: the suggested homes are detached' }); continue; }
    if (!parentLotOf(house, plan)?.properties.homeSetbacksFt) { report.push({ houseId: house.id, lot: lotName(house, plan), placed: null, reason: 'the lot carries no recorded setbacks to screen against' }); continue; }
    let first: string | null = null, placed: string | null = null;
    for (const design of candidates) {
      const fit = placeHome(design, house, plan, siteBoundary, height);
      if (!fit.placement) { first ??= `${design.name}: ${fit.reason}`; continue; }
      plan = fit.placement.elements.map(e => e.id !== house.id ? e : {
        ...e,
        properties: {
          ...e.properties,
          housingAssignmentSource: 'starter',
          housingFitReason: 'Suggested concept. Screened against the drawn lot, recorded setbacks, mapped access and the height limit. Grading and architectural sheets are not verified.',
          housingPreviousEnginePlan: house.properties.housePlan,
        },
      });
      placed = design.name;
      break;
    }
    report.push({ houseId: house.id, lot: lotName(house, plan), placed, reason: placed ? null : candidates.length ? `no suggested home fits (${first ?? 'none cleared'})` : 'no suggested home is under the height limit' });
    yield;
  }
  return { elements: plan, report, skipped: null };
}

/** Runs only on fresh SF-v1 solves, after explicit assignments have been carried.
 * Non-matches keep the surveyed/solver geometry and legacy IDs for traceability.
 * The screening is the same as manual selection's: placeHome against the drawn lot, its recorded
 * setbacks, mapped access and the recorded height limit. Without a recorded limit nothing is suggested.
 * A plan larger than `syncLots` is left for placeStarterHomesInBackground (deferred: true). */
export function placeStarterHomesWithReport(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
  syncLots = MAX_PILOT_LOTS,
): StarterResult {
  const prep = prepare(elements, siteBoundary, maxHeightFt);
  if ('skipped' in prep) return { elements, report: [], skipped: prep.skipped };
  if (prep.houses.length > syncLots) return { elements, report: [], skipped: null, deferred: true };
  const run = screen(elements, siteBoundary!, prep);
  for (;;) { const r = run.next(); if (r.done) return r.value; }
}

/** The same screening for a plan of any size, in slices of about 12 ms so the page stays responsive
 *  (owner, 11-27: "We want houses on all plans"). Resolves null when `isCurrent` turns false between
 *  slices (a new solve, a home change, another parcel): the result would no longer match the plan. */
export async function placeStarterHomesInBackground(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
  isCurrent: () => boolean,
  sliceMs = 12,
): Promise<StarterResult | null> {
  const prep = prepare(elements, siteBoundary, maxHeightFt);
  if ('skipped' in prep) return { elements, report: [], skipped: prep.skipped };
  const run = screen(elements, siteBoundary!, prep);
  for (;;) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (;;) {
      const r = run.next();
      if (r.done) return isCurrent() ? r.value : null;
      if ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0 > sliceMs) break;
    }
    await new Promise(res => setTimeout(res, 0));
    if (!isCurrent()) return null;
  }
}

export function placeStarterHomes(
  elements: Element[],
  siteBoundary: Element['geometry'] | null,
  maxHeightFt: number | null | undefined,
): Element[] {
  return placeStarterHomesWithReport(elements, siteBoundary, maxHeightFt).elements;
}
