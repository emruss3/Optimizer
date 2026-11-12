// The architectural styles a scheme can be shown in, and the materials of
// each. A style changes how the buildings look and nothing else: footprints,
// positions, story counts and heights are the plan's in every one.
import { BLACK, CONCRETE, WHITE, mat, pick, tone, type Mat } from './kit';

export type ArchStyle = 'mansard' | 'farmhouse' | 'modern' | 'heritage';

export const ARCH_STYLES: Array<{ key: ArchStyle; name: string; blurb: string }> = [
  { key: 'mansard', name: 'Urban mansard', blurb: 'Brick ground floor, coloured siding, a shingled mansard top with boxed dormers, black windows and railings, window boxes.' },
  { key: 'farmhouse', name: 'Modern farmhouse', blurb: 'White board and batten, steep gables, black windows, metal porch roofs, timber posts.' },
  { key: 'modern', name: 'Contemporary', blurb: 'Flat roofs, white stucco over charcoal, cedar accents, large glass, roof decks with glass rails.' },
  { key: 'heritage', name: 'Craftsman and brick', blurb: 'Earth-tone siding, deep eaves and porches on brick piers for houses; brick with steel windows for larger buildings.' },
];
export const DEFAULT_STYLE: ArchStyle = 'mansard';
export const isArchStyle = (v: unknown): v is ArchStyle => typeof v === 'string' && ARCH_STYLES.some(s => s.key === v);

export const CEDAR = mat(158, 112, 70, 'wood');
export const MEMBRANE = mat(206, 206, 202, 'plain');
const CHARCOAL_SHINGLE = mat(74, 72, 72, 'shingle');

export interface HousePalette {
  found: Mat;
  /** The ground-story wall where it differs from the stories above (a brick or panel base). */
  base: Mat;
  body: Mat;
  /** The triangle of a gable, and other accents on the wall. */
  gable: Mat;
  roof: Mat;
  /** Porch and awning roofs. */
  roof2: Mat;
  fascia: Mat;
  trim: Mat;
  frame: Mat;
  casing: Mat | null;
  sill: Mat | null;
  grid: [number, number];
  door: Mat;
  garage: Mat;
  garageLites: boolean;
  post: Mat;
  rail: Mat;
  railKind: 'bars' | 'glass';
  planters: boolean;
}

/** The materials of one house or row home: the style's palette, varied by the building's own seed. */
export function housePalette(style: ArchStyle, seed: number): HousePalette {
  const a = seed >>> 4, b = seed >>> 9, c = seed >>> 14;
  if (style === 'mansard') {
    const body = pick([mat(200, 174, 140, 'siding'), mat(112, 134, 158, 'siding'), mat(178, 194, 172, 'siding'), mat(228, 220, 202, 'siding'), mat(92, 98, 106, 'siding'), mat(236, 234, 228, 'batten'), mat(150, 160, 150, 'batten')], a);
    return {
      found: CONCRETE,
      base: pick([mat(178, 150, 126, 'brick'), mat(204, 198, 188, 'brick'), mat(146, 92, 74, 'brick'), mat(120, 116, 112, 'brick')], b),
      body, gable: body,
      roof: pick([mat(78, 78, 82, 'shingle'), mat(70, 68, 68, 'shingle'), mat(86, 82, 80, 'shingle')], c),
      roof2: mat(62, 62, 64, 'metal'),
      fascia: tone(body, 1.06), trim: tone(body, 1.08),
      frame: BLACK, casing: null, sill: tone(body, 1.1), grid: [2, 3],
      door: pick([mat(40, 40, 44), mat(124, 86, 56, 'wood'), mat(52, 74, 92)], seed >>> 19),
      garage: mat(48, 48, 52), garageLites: true,
      post: BLACK, rail: BLACK, railKind: 'bars', planters: true,
    };
  }
  if (style === 'farmhouse') {
    const body = pick([mat(242, 240, 234, 'batten'), mat(242, 240, 234, 'batten'), mat(206, 210, 208, 'batten'), mat(62, 74, 88, 'batten'), mat(168, 182, 166, 'batten'), mat(74, 78, 84, 'batten')], a);
    const dark = body.color[0] < 120;
    return {
      found: mat(196, 194, 188, 'brick'),
      base: body, body,
      gable: pick([body, body, CEDAR], b),
      roof: pick([mat(72, 70, 70, 'shingle'), mat(64, 64, 66, 'metal'), mat(88, 84, 82, 'shingle')], c),
      roof2: mat(60, 60, 62, 'metal'),
      fascia: dark ? tone(body, 0.9) : WHITE, trim: dark ? tone(body, 1.15) : WHITE,
      frame: BLACK, casing: null, sill: null, grid: [2, 2],
      door: pick([CEDAR, mat(36, 36, 40), mat(150, 60, 50)], seed >>> 19),
      garage: dark ? mat(54, 56, 60) : mat(238, 236, 230), garageLites: true,
      post: CEDAR, rail: BLACK, railKind: 'bars', planters: false,
    };
  }
  if (style === 'modern') {
    return {
      found: mat(120, 120, 120, 'concrete'),
      base: pick([mat(70, 74, 80, 'panel'), mat(58, 60, 64, 'panel'), mat(98, 100, 102, 'panel')], b),
      body: pick([mat(238, 236, 230, 'plaster'), mat(238, 236, 230, 'plaster'), mat(214, 214, 210, 'plaster'), mat(84, 88, 94, 'panel')], a),
      gable: CEDAR,
      roof: MEMBRANE, roof2: mat(44, 46, 50, 'metal'),
      fascia: mat(44, 46, 50), trim: mat(44, 46, 50),
      frame: BLACK, casing: null, sill: null, grid: [1, 1],
      door: CEDAR, garage: mat(60, 62, 66), garageLites: true,
      post: BLACK, rail: BLACK, railKind: 'glass', planters: false,
    };
  }
  const body = pick([mat(132, 138, 108, 'siding'), mat(152, 136, 118, 'siding'), mat(100, 118, 132, 'siding'), mat(134, 76, 62, 'siding'), mat(206, 188, 144, 'siding'), mat(118, 126, 124, 'siding')], a);
  const cream = mat(234, 226, 208);
  return {
    found: mat(132, 114, 100, 'brick'),
    base: body, body,
    gable: as2(tone(body, pick([0.86, 1.12, 0.94], b)), 'shingle'),
    roof: pick([mat(88, 78, 70, 'shingle'), mat(74, 76, 80, 'shingle'), mat(98, 92, 84, 'shingle')], c),
    roof2: mat(88, 78, 70, 'shingle'),
    fascia: cream, trim: cream,
    frame: cream, casing: cream, sill: cream, grid: [1, 2],
    door: pick([mat(112, 60, 44, 'wood'), mat(58, 84, 72), mat(124, 86, 56, 'wood')], seed >>> 19),
    garage: cream, garageLites: true,
    post: cream, rail: cream, railKind: 'bars', planters: false,
  };
}
const as2 = (m: Mat, surface: Mat['surface']): Mat => ({ color: m.color, surface });

export interface BlockPalette {
  base: Mat;
  body: Mat;
  /** The second cladding, on alternate stretches of wall. */
  body2: Mat;
  accent: Mat;
  /** The top: mansard slopes, gable roofs or a parapet. */
  crown: Mat;
  cap: Mat;
  trim: Mat;
  frame: Mat;
  grid: [number, number];
  slab: Mat;
  rail: Mat;
  railKind: 'bars' | 'glass';
  /** Bays to a stretch of one cladding. */
  module: number;
}

/** The materials of one apartment or larger building. */
export function blockPalette(style: ArchStyle, seed: number): BlockPalette {
  const a = seed >>> 5, b = seed >>> 11;
  if (style === 'mansard') {
    return {
      base: pick([mat(170, 142, 118, 'brick'), mat(148, 92, 74, 'brick'), mat(196, 190, 180, 'brick')], a),
      body: mat(228, 220, 204, 'siding'),
      body2: pick([mat(124, 140, 158, 'siding'), mat(160, 174, 152, 'siding'), mat(180, 162, 140, 'siding')], b),
      accent: mat(242, 240, 234, 'siding'),
      crown: CHARCOAL_SHINGLE, cap: mat(58, 58, 62),
      trim: WHITE, frame: BLACK, grid: [2, 3],
      slab: mat(214, 210, 202, 'concrete'), rail: BLACK, railKind: 'bars', module: 3,
    };
  }
  if (style === 'farmhouse') {
    return {
      base: mat(150, 146, 140, 'brick'),
      body: mat(242, 240, 234, 'batten'),
      body2: pick([mat(74, 78, 84, 'batten'), mat(156, 170, 154, 'batten'), mat(64, 76, 90, 'batten')], b),
      accent: CEDAR,
      crown: mat(62, 62, 64, 'metal'), cap: mat(56, 56, 58),
      trim: WHITE, frame: BLACK, grid: [2, 2],
      slab: mat(214, 210, 202, 'concrete'), rail: BLACK, railKind: 'bars', module: 3,
    };
  }
  if (style === 'modern') {
    return {
      base: pick([mat(70, 74, 80, 'panel'), mat(88, 90, 92, 'panel')], a),
      body: mat(238, 236, 230, 'plaster'),
      body2: pick([mat(148, 152, 156, 'panel'), mat(82, 86, 92, 'panel'), mat(108, 112, 116, 'panel')], b),
      accent: CEDAR,
      crown: mat(238, 236, 230, 'plaster'), cap: mat(40, 42, 46),
      trim: mat(40, 42, 46), frame: BLACK, grid: [2, 1],
      slab: mat(222, 220, 214, 'concrete'), rail: BLACK, railKind: 'glass', module: 4,
    };
  }
  const brick = pick([mat(148, 88, 70, 'brick'), mat(126, 84, 68, 'brick'), mat(160, 104, 82, 'brick')], a);
  return {
    base: tone(brick, 0.92), body: brick,
    body2: pick([mat(112, 82, 68, 'brick'), mat(186, 160, 130, 'brick'), tone(brick, 0.84)], b),
    accent: mat(224, 216, 200, 'concrete'),
    crown: brick, cap: mat(224, 216, 200),
    trim: mat(224, 216, 200), frame: BLACK, grid: [4, 3],
    slab: mat(60, 62, 66), rail: BLACK, railKind: 'bars', module: 2,
  };
}
