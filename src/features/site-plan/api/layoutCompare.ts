// Two layouts of one parcel, side by side: what each places, what the land costs per home under
// a price the reviewer enters, and what is not known about either.
//
// A figure the app does not have is "unknown", never zero, and no option borrows the other's
// drawing or figures. The land price is the reviewer's assumption: it is kept apart from what
// the plan measures and is never stored with it.

export interface LayoutOption {
  key: 'multifamily' | 'neighborhood';
  /** "70 apartments", "25 townhomes (mews)" */
  label: string;
  homes: number | null;
  /** true when this option is the one drawn on the sheet now */
  shown: boolean;
  /** facts of the drawn option only: the other option's are not known until it is drawn */
  parking?: string | null;
  floorArea?: string | null;
}

export interface LayoutComparison {
  rows: Array<{ label: string; a: string; b: string; note?: string }>;
  /** one sentence a reviewer can repeat, or null when a side is missing */
  tradeOff: string | null;
  /** what is not known, by name */
  missing: string[];
}

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const UNKNOWN = 'Unknown';

export function compareLayouts(a: LayoutOption, b: LayoutOption, landPrice: number | null): LayoutComparison {
  const rows: LayoutComparison['rows'] = [];
  const missing: string[] = [];
  const homes = (o: LayoutOption) => (o.homes != null ? o.homes.toLocaleString('en-US') : UNKNOWN);
  rows.push({ label: 'Homes', a: homes(a), b: homes(b) });
  const perHome = (o: LayoutOption) => (landPrice != null && landPrice > 0 && o.homes != null && o.homes > 0 ? landPrice / o.homes : null);
  const pa = perHome(a), pb = perHome(b);
  if (landPrice != null && landPrice > 0) {
    rows.push({ label: 'Land per home', a: pa != null ? money(pa) : UNKNOWN, b: pb != null ? money(pb) : UNKNOWN, note: `${money(landPrice)} land price, as entered ÷ homes. Not a ranking: it leaves out revenue and home size.` });
  }
  const fact = (o: LayoutOption, v: string | null | undefined, what: string) => {
    if (v) return v;
    missing.push(o.shown ? `${what} of ${o.label}` : `${what} of ${o.label}: open that layout to draw it`);
    return UNKNOWN;
  };
  rows.push({ label: 'Parking', a: fact(a, a.parking, 'Parking'), b: fact(b, b.parking, 'Parking') });
  rows.push({ label: 'Floor area', a: fact(a, a.floorArea, 'Floor area'), b: fact(b, b.floorArea, 'Floor area') });

  let tradeOff: string | null = null;
  if (a.homes != null && b.homes != null) {
    const d = a.homes - b.homes;
    const more = d >= 0 ? a : b, fewer = d >= 0 ? b : a;
    tradeOff = d === 0
      ? `Both place ${a.homes.toLocaleString('en-US')} homes.`
      : `${more.label} places ${Math.abs(d).toLocaleString('en-US')} more ${Math.abs(d) === 1 ? 'home' : 'homes'} than ${fewer.label}.`;
    if (d !== 0 && pa != null && pb != null) tradeOff += ` At the entered land price that is ${money(Math.abs(pa - pb))} less land per home.`;
  } else {
    missing.push(`Home count of ${a.homes == null ? a.label : b.label}`);
  }
  return { rows, tradeOff, missing };
}

/**
 * A land price as a reviewer types it: digits with commas, an optional $, and an optional K or M.
 * "1.2M" is 1,200,000. Anything else is not a price, and is said to be one rather than read as $1.20.
 */
export function parseLandPrice(text: string): { value: number | null; hint: string | null } {
  const t = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (!t) return { value: null, hint: null };
  const m = /^(\d+(?:\.\d+)?)\s*([kKmM])?$/.exec(t);
  if (!m) return { value: null, hint: 'Enter a price such as 1,200,000 or 1.2M.' };
  const v = Number(m[1]) * (m[2] ? (m[2].toLowerCase() === 'm' ? 1_000_000 : 1_000) : 1);
  return v > 0 ? { value: v, hint: null } : { value: null, hint: 'Enter a price above zero.' };
}
