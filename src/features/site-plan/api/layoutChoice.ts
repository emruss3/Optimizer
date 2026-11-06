/**
 * The layout choice on multifamily land (the owner, 2026-11-04): "If a
 * traditional multifamily design makes more sense, we should default to that
 * with an option to switch to a neighborhood layout."
 *
 * Makes more sense = places more homes (the owner's objective of the same
 * day: always the most units on the parcel). The two sides:
 *   - multifamily: the plan the massing engine drew (apartments, or townhome
 *     rows when that product is picked) — its unit count;
 *   - neighborhood: the pattern competition's best plan (fn_sf_v1_candidates:
 *     the grid, the neighborhood and the loop grammar, and the townhome
 *     engine where attached homes are permitted) — its homes.
 * The neighborhood becomes the default only when it places MORE homes, the
 * engine calls it buildable (no code fails), and this sheet can draw it.
 * A tie stays multifamily: the incumbent, and the design the owner named.
 */
import type { SfV1Competition, SfV1CompetitionRow } from './sfV1Plan';
import { codeFails } from './sfV1Plan';

export type LayoutKind = 'multifamily' | 'neighborhood';

export interface LayoutNeighborhood {
  /** the competition's grammar: 'townhome' | 'grid' | 'neighborhood' | 'loop' */
  requested: string;
  /** the drawn pattern: 'townhomes (mews)', 'frontage lots, no new street', … */
  label: string;
  homes: number;
  /** townhomes (attached) rather than house lots */
  attached: boolean;
  /** the engine's verdict on it: no code fails */
  buildable: boolean;
  /** the sheet can draw it (house lots always; townhomes when the v3 engine drew them) */
  drawable: boolean;
  verdict: string | null;
  codeFails: string[];
}

export interface LayoutChoice {
  /** the multifamily plan's units; null when none is drawn (it failed, or is still solving) */
  multifamilyHomes: number | null;
  multifamilyProduct: 'apartments' | 'townhomes';
  neighborhood: LayoutNeighborhood | null;
  densityCap: number | null;
  defaultKind: LayoutKind;
  /** one sentence: why the default is the default */
  sentence: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "27 townhomes" / "12 house lots" */
export function homesPhrase(n: number, attached: boolean): string {
  return attached ? plural(n, 'townhome', 'townhomes') : plural(n, 'house lot', 'house lots');
}

/** "27 townhomes (mews)" / "12 house lots (frontage lots, no new street)": the pattern, not the product twice */
export function neighborhoodWords(nb: Pick<LayoutNeighborhood, 'homes' | 'attached' | 'label'>): string {
  const m = nb.attached ? /^townhomes \((.+)\)$/.exec(nb.label) : null;
  return `${homesPhrase(nb.homes, nb.attached)} (${m ? m[1] : nb.label})`;
}

export function mfProductPhrase(n: number, product: 'apartments' | 'townhomes'): string {
  return product === 'townhomes' ? plural(n, 'townhome in rows', 'townhomes in rows') : plural(n, 'apartment', 'apartments');
}

/** The competition's best plan as the neighborhood side, or null when no pattern places a home. */
export function neighborhoodOption(comp: SfV1Competition | null | undefined): LayoutNeighborhood | null {
  if (!comp || comp.status !== 'done') return null;
  const best: SfV1CompetitionRow | undefined = comp.rows.find(r => r.isBest);
  if (!best || best.status !== 'done' || best.lots <= 0) return null;
  const attached = best.product === 'attached';
  const fails = codeFails(best.fails);
  return {
    requested: best.requested,
    label: best.label,
    homes: best.lots,
    attached,
    buildable: comp.bestBuildable ?? fails.length === 0,
    drawable: attached ? best.engine === 'v3' : true,
    verdict: comp.verdict,
    codeFails: comp.bestCodeFails.length > 0 ? comp.bestCodeFails : fails,
  };
}

export function chooseLayout(input: {
  multifamilyHomes: number | null;
  multifamilyProduct?: 'apartments' | 'townhomes';
  /** the multifamily plan failed to draw (as opposed to drawing without a reported count) */
  multifamilyFailed?: boolean;
  competition: SfV1Competition | null | undefined;
}): LayoutChoice {
  const product = input.multifamilyProduct ?? 'apartments';
  const mf = input.multifamilyHomes != null && input.multifamilyHomes > 0 ? Math.round(input.multifamilyHomes) : null;
  // A plan on the sheet whose count is not reported is not a plan that failed:
  // it is never weighed as zero homes (0 Smith Springs Rd, 2026-11-06).
  const mfUncounted = mf == null && input.multifamilyFailed === false;
  const comp = input.competition ?? null;
  const nb = neighborhoodOption(comp);
  const densityCap = comp?.homesAllowedByDensity ?? null;
  const mfWord = product === 'townhomes' ? 'The townhome rows' : 'Apartments';
  const base = { multifamilyHomes: mf, multifamilyProduct: product, neighborhood: nb, densityCap };

  if (!nb) {
    const why = !comp
      ? 'the neighborhood plans have not been drawn'
      : comp.status !== 'done'
        ? `no neighborhood plan: ${comp.reason ?? comp.status}`
        : 'no neighborhood pattern places a home here';
    // engine g13: the competition says why no pattern drew (its first reason)
    const engineWhy = comp?.status === 'done' && comp.why.length > 0 ? ` (${comp.why[0]})` : '';
    return { ...base, defaultKind: 'multifamily', sentence: `${why.charAt(0).toUpperCase()}${why.slice(1)}${engineWhy}, so the sheet stays multifamily.` };
  }
  const nbWords = neighborhoodWords(nb);
  if (mfUncounted) {
    return {
      ...base,
      defaultKind: 'multifamily',
      sentence: `The multifamily plan on the sheet does not report its unit count, so it stays the default; the neighborhood's best places ${nbWords}.`,
    };
  }
  const wins = mf == null || nb.homes > mf;
  if (wins && nb.buildable && nb.drawable) {
    return {
      ...base,
      defaultKind: 'neighborhood',
      sentence: mf == null
        ? `The multifamily plan did not draw; the neighborhood places ${nbWords}, so it is the default.`
        : `The neighborhood places more homes here: ${nbWords} against ${mfProductPhrase(mf, product)}, so it is the default.`,
    };
  }
  let sentence: string;
  if (wins && !nb.buildable) {
    sentence = `The neighborhood's best, ${nbWords}, fails a code test (${nb.codeFails.join(', ') || 'see the competition'}), so it cannot be the default; ${mf == null ? 'there is no multifamily plan either' : `${mfWord.toLowerCase()} stay on the sheet`}.`;
  } else if (wins && !nb.drawable) {
    sentence = `The neighborhood's best, ${nbWords}, is drawn by an engine this sheet cannot draw yet, so ${mf == null ? 'nothing replaces the multifamily plan' : `${mfWord.toLowerCase()} stay the default`}.`;
  } else if (mf != null && nb.homes === mf) {
    sentence = `Both place ${plural(mf, 'home', 'homes')}${densityCap != null && densityCap === mf ? ', the most the district\'s density allows' : ''}; ${mfWord.toLowerCase()} stay the default.`;
  } else {
    sentence = `${mfWord} place more homes here: ${mfProductPhrase(mf ?? 0, product)} against the neighborhood's best of ${nbWords}, so they are the default.`;
  }
  return { ...base, defaultKind: 'multifamily', sentence };
}
