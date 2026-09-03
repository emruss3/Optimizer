/**
 * "What's being built" — one plain sentence above the plan (Eric, 2026-09-03,
 * on 2600 W Heiman: "There is a ton of stuff happening on this page; it's hard
 * to follow, and I have no clue what's actually being built").
 *
 * Everything here is read off the plan the engine returned — the building
 * elements (stories, footprint, unit mix, composition note) and the metrics
 * (GSF, stalls, parking strategy). Nothing is re-measured or invented; when a
 * number is missing the sentence leaves it out.
 */
import React from 'react';
import type { Element, SiteMetrics } from '../../../engine/types';

export interface BuiltSummary {
  units: number;
  buildings: number;
  /** Stories when every building has the same count; null when they differ */
  stories: number | null;
  gsf: number | null;
  stalls: number | null;
  stallsPerUnit: number | null;
  mix: Array<{ type: string; label: string; count: number }>;
  /** e.g. "one connected S-form bar" */
  composition: string;
  /** e.g. "a parking field behind it" */
  parking: string;
  /** "76 apartments in one 5-story building · 133,595 GSF · 118 stalls (1.6 per unit)" */
  headline: string;
  /** "One connected S-form bar with a parking field behind it · 8 studios, 30 one-beds, …" */
  detail: string;
}

const MIX_WORDS: Record<string, [string, string]> = {
  studio: ['studio', 'studios'],
  '1br': ['one-bed', 'one-beds'],
  '2br': ['two-bed', 'two-beds'],
  '3br': ['three-bed', 'three-beds'],
  townhome: ['townhome', 'townhomes'],
};
const MIX_ORDER = ['studio', '1br', '2br', '3br', 'townhome'];

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const countWord = (n: number) => (n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n));

/** The generator's composition note ("bars_connected_S_form") in words. */
export function compositionWords(note: string | null | undefined, buildings: number): string {
  const n = (note ?? '').toLowerCase();
  const form = /bars?_connected_([a-z])_form/.exec(n);
  if (form) return `one connected ${form[1].toUpperCase()}-form bar`;
  if (/single_connected_structure/.test(n)) return 'one connected building';
  if (/^l_form|_l_form/.test(n)) return 'one L-form bar';
  if (/single_bar|^bar$|frontage_bar/.test(n)) return 'one bar on the frontage';
  if (n) return n.replace(/_/g, ' ');
  return buildings === 1 ? 'one building' : `${countWord(buildings)} buildings`;
}

/** The parking strategy / regime in words. */
export function parkingWords(metrics: SiteMetrics | null, stalls: number | null): string {
  const regime = (metrics?.parkingRegime ?? '').toLowerCase();
  const strategy = (metrics?.parkingStrategy ?? '').toLowerCase();
  if (regime === 'tuck_under') return 'parking tucked under it';
  if (/rear_field/.test(strategy)) return 'a parking field behind it';
  if (/side_rows/.test(strategy)) return 'parking rows beside it';
  if (/end_rows/.test(strategy)) return 'parking rows at its ends';
  if (/front/.test(strategy)) return 'a parking field in front of it';
  if (strategy) return `${strategy.replace(/_/g, ' ')} parking`;
  if (stalls != null && stalls > 0) return 'surface parking';
  return '';
}

/** Read the summary off the plan; null when there is no building to describe. */
export function builtSummary(metrics: SiteMetrics | null, elements: Element[]): BuiltSummary | null {
  const buildings = elements.filter(e => e.type === 'building' && e.properties?.use !== 'amenity');
  if (buildings.length === 0) return null;
  // A single-family seed (one house + driveway) has its own basis line; the
  // apartment sentence would misdescribe it.
  if (buildings.every(b => /^House\b/.test(b.name ?? ''))) return null;

  const storiesOf = (b: Element) =>
    Math.max(1, Math.floor(((b.properties?.floors as number) || (b.properties?.stories as number) || 1)));
  const storySet = new Set(buildings.map(storiesOf));
  const stories = storySet.size === 1 ? [...storySet][0] : null;

  // Unit mix: the server's rows travel on each building; sum them by type.
  const byType = new Map<string, number>();
  for (const b of buildings) {
    const mix = b.properties?.unitMix as Array<{ type?: string; count?: number }> | undefined;
    for (const row of mix ?? []) {
      if (!row?.type || !(row.count! > 0)) continue;
      byType.set(row.type, (byType.get(row.type) ?? 0) + Math.round(row.count!));
    }
  }
  const mix = [...byType.entries()]
    .sort((a, b) => MIX_ORDER.indexOf(a[0]) - MIX_ORDER.indexOf(b[0]))
    .map(([type, count]) => {
      const words = MIX_WORDS[type] ?? [type, type];
      return { type, count, label: `${count} ${count === 1 ? words[0] : words[1]}` };
    });
  const mixUnits = mix.reduce((s, m) => s + m.count, 0);
  const units = Math.round(metrics?.totalUnits ?? mixUnits);
  const townhomes = mix.length > 0 && mix.every(m => m.type === 'townhome');
  const noun = townhomes ? (units === 1 ? 'townhome' : 'townhomes') : (units === 1 ? 'apartment' : 'apartments');

  const gsf = metrics?.totalBuiltSF && metrics.totalBuiltSF > 0 ? Math.round(metrics.totalBuiltSF) : null;
  const stalls = typeof metrics?.stallsProvided === 'number' ? Math.round(metrics.stallsProvided) : null;
  const stallsPerUnit = stalls != null && units > 0 ? Math.round((stalls / units) * 10) / 10 : null;

  const composition = compositionWords(buildings[0].properties?.compositionNote as string | undefined, buildings.length);
  const parking = parkingWords(metrics, stalls);

  const where = `${buildings.length === 1 ? 'one' : countWord(buildings.length)} ${stories != null ? `${stories}-story ` : ''}building${buildings.length === 1 ? '' : 's'}`;
  const headline = [
    `${units} ${noun} in ${where}`,
    gsf != null ? `${gsf.toLocaleString()} GSF` : null,
    stalls != null ? `${stalls} stall${stalls === 1 ? '' : 's'}${stallsPerUnit != null ? ` (${stallsPerUnit} per unit)` : ''}` : null,
  ].filter(Boolean).join(' · ');

  const first = composition.charAt(0).toUpperCase() + composition.slice(1);
  const detail = [
    parking ? `${first} with ${parking}` : first,
    mix.length > 0 ? mix.map(m => m.label).join(', ') : null,
  ].filter(Boolean).join(' · ');

  return { units, buildings: buildings.length, stories, gsf, stalls, stallsPerUnit, mix, composition, parking, headline, detail };
}

export const BuiltHeadline: React.FC<{ metrics: SiteMetrics | null; elements: Element[] }> = ({ metrics, elements }) => {
  const s = builtSummary(metrics, elements);
  if (!s) return null;
  return (
    <div data-testid="built-headline" className="px-4 pt-2 pb-1.5 bg-white border-b border-gray-100 flex-shrink-0">
      <div data-testid="built-headline-title" className="text-sm font-semibold text-gray-900">{s.headline}</div>
      <div data-testid="built-headline-detail" className="text-xs text-gray-600">{s.detail}</div>
    </div>
  );
};

export default BuiltHeadline;
