/**
 * Middle Tennessee product catalogue — first vertical slice.
 *
 * Demo 1: America’s Best House Plans 1754-00010 on 0 Delk Ave (675423).
 * Demo 2: The Lanes Unit A — stub only (no assets / fit yet).
 */
import type { HousingDesignRecord } from './types';

/** Parcel pinned for the Delk cottage baseline (RS5, five-lot rev 316a0d36). */
export const DELK_PARCEL_ID = '675423';
export const DELK_BASELINE_REVISION = '316a0d36';

/** America’s Best House Plans 1754-00010 — 3br/2ba ranch, no attached garage. */
export const DELK_COTTAGE_ID = 'abhp:1754-00010';

const W = 40;
/** 34′2″ */
const D = 34 + 2 / 12;
const HEATED = 1141;
const PORCH_SF = 48; // schematic porch band on the 40-ft face; not a photographic claim

export const DELK_COTTAGE_1754_00010: HousingDesignRecord = {
  id: DELK_COTTAGE_ID,
  assetVersion: '2026-11-22.1',
  name: 'ABHP 1754-00010 · three-bedroom cottage',
  planNumber: '1754-00010',
  source: {
    publisher: "America's Best House Plans",
    url: 'https://www.houseplans.com/',
    citation: "America's Best House Plans plan 1754-00010 — 3 bed / 2 bath ranch, 1,141 heated sf, 40′ × 34′2″, porch on the 40-ft face, no attached garage (Housing design brief, Nov 22, 2026).",
    rights: 'citation-only',
  },
  stories: 1,
  beds: 3,
  baths: 2,
  heatedSf: HEATED,
  attachedGarage: false,
  garageSf: 0,
  porchSf: PORCH_SF,
  footprint: { widthFt: W, depthFt: D },
  porchFace: 'width',
  parking: 'pad',
  elevations: ['front', 'left', 'right', 'rear'],
  mirrors: ['none', 'left-right'],
  footprintsByFloor: [
    {
      floor: 1,
      ringFt: [
        [0, 0],
        [W, 0],
        [W, D],
        [0, D],
        [0, 0],
      ],
      heatedSf: HEATED,
      garageSf: 0,
      porchSf: PORCH_SF,
    },
  ],
  // Entry centred on the porch (width) face at y = 0.
  entry: { alongFt: W / 2, facingDeg: 180, widthFt: 3, wall: 'front' },
  // No attached garage — parking is a pad independent of the entry.
  vehicle: null,
  verification: 'trial-cleared',
  notes: [
    'Trial cleared setbacks on Delk lots 1–3 with porch to the lane.',
    'Lots 4–5 need frontage edge resolution; report unplaced with constraint.',
    'Helen Street (Ashland City) is the orientation regression: porch on the short face.',
  ],
};

/**
 * The Lanes Unit A — narrow urban product (second demo). Stub only: no
 * footprints, openings, or CubiCasa reuse until the Delk handoff is solid.
 */
export const LANES_UNIT_A_STUB: HousingDesignRecord = {
  id: 'lanes:unit-a',
  assetVersion: 'stub.0',
  name: 'The Lanes · Unit A (stub)',
  planNumber: 'Unit A',
  source: {
    publisher: 'The Lanes',
    url: null,
    citation: 'The Lanes Unit A — suitable narrow urban lot (Housing design brief, Nov 22, 2026). Assets not produced in this slice.',
    rights: 'unknown',
  },
  stories: 2,
  beds: 0,
  baths: null,
  heatedSf: 0,
  attachedGarage: null,
  garageSf: null,
  porchSf: null,
  footprint: { widthFt: 0, depthFt: 0 },
  porchFace: 'depth',
  parking: 'unknown',
  elevations: [],
  mirrors: ['none'],
  footprintsByFloor: [],
  entry: { alongFt: 0, facingDeg: 0, widthFt: 0, wall: 'front' },
  vehicle: null,
  verification: 'unverified',
  notes: ['Stub for the second demo wave — do not place or draw yet.'],
};

export const HOUSING_CATALOGUE: HousingDesignRecord[] = [
  DELK_COTTAGE_1754_00010,
  // LANES_UNIT_A_STUB intentionally omitted from selectable catalogue until assets exist.
];

export function housingDesignById(id: string): HousingDesignRecord | undefined {
  if (id === DELK_COTTAGE_ID || id === '1754-00010') return DELK_COTTAGE_1754_00010;
  if (id === LANES_UNIT_A_STUB.id) return LANES_UNIT_A_STUB;
  return HOUSING_CATALOGUE.find(d => d.id === id || d.planNumber === id);
}

/** Designs offered in the Delk picker (session catalogue for parcel 675423). */
export function designsForParcel(parcelId: string): HousingDesignRecord[] {
  if (String(parcelId) === DELK_PARCEL_ID) return [DELK_COTTAGE_1754_00010];
  return [];
}
