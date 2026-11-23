/**
 * Middle Tennessee product catalogue — buildable stock plans people can license.
 *
 * Records cite public listing facts from America’s Best House Plans (and stubs
 * for other products). Construction drawings require a separate publisher
 * license; this repo does not ship ABHP PDFs or copyrighted elevations.
 */
import type { HousingDesignRecord, ParkingArrangement, PorchFace } from './types';

/** Parcel pinned for the Delk cottage baseline (RS5, five-lot rev 316a0d36). */
export const DELK_PARCEL_ID = '675423';
export const DELK_BASELINE_REVISION = '316a0d36';

/** America’s Best House Plans 1754-00010 — 3br/2ba ranch, no attached garage. */
export const DELK_COTTAGE_ID = 'abhp:1754-00010';

const ABHP = "America's Best House Plans";
const ABHP_SITE = 'https://www.houseplans.net';

function ring(widthFt: number, depthFt: number): Array<[number, number]> {
  return [
    [0, 0],
    [widthFt, 0],
    [widthFt, depthFt],
    [0, depthFt],
    [0, 0],
  ];
}

/** Rectangular heated ranch/cottage from public ABHP listing facts (citation-only). */
function abhpPadRanch(input: {
  planNumber: string;
  name: string;
  listingPath: string;
  heatedSf: number;
  beds: number;
  baths: number;
  widthFt: number;
  depthFt: number;
  porchSf?: number | null;
  porchFace?: PorchFace;
  verification?: HousingDesignRecord['verification'];
  notes?: string[];
}): HousingDesignRecord {
  const W = input.widthFt;
  const D = input.depthFt;
  const porchSf = input.porchSf ?? null;
  const porchFace = input.porchFace ?? 'width';
  const parking: ParkingArrangement = 'pad';
  return {
    id: `abhp:${input.planNumber}`,
    assetVersion: '2026-11-23.1',
    name: input.name,
    planNumber: input.planNumber,
    source: {
      publisher: ABHP,
      url: `${ABHP_SITE}${input.listingPath}`,
      citation: `${ABHP} plan ${input.planNumber} — ${input.beds} bed / ${input.baths} bath, ${input.heatedSf.toLocaleString()} heated sf, ${W}′ × ${D}′, no attached garage (public listing; construction license sold separately).`,
      rights: 'citation-only',
    },
    stories: 1,
    beds: input.beds,
    baths: input.baths,
    heatedSf: input.heatedSf,
    attachedGarage: false,
    garageSf: 0,
    porchSf,
    footprint: { widthFt: W, depthFt: D },
    porchFace,
    parking,
    elevations: ['front', 'left', 'right', 'rear'],
    mirrors: ['none', 'left-right'],
    footprintsByFloor: [
      {
        floor: 1,
        ringFt: ring(W, D),
        heatedSf: input.heatedSf,
        garageSf: 0,
        porchSf,
      },
    ],
    entry: {
      alongFt: (porchFace === 'width' ? W : D) / 2,
      facingDeg: 180,
      widthFt: 3,
      wall: 'front',
    },
    vehicle: null,
    verification: input.verification ?? 'provisional',
    notes: input.notes ?? [
      'Public listing facts only — purchase the ABHP construction package before building.',
      'No attached garage on the listing; use an independent parking pad or street stall.',
    ],
  };
}

const W_DELK = 40;
/** 34′2″ */
const D_DELK = 34 + 2 / 12;
const HEATED_DELK = 1141;
const PORCH_DELK = 48;

export const DELK_COTTAGE_1754_00010: HousingDesignRecord = {
  id: DELK_COTTAGE_ID,
  assetVersion: '2026-11-22.1',
  name: 'ABHP 1754-00010 · three-bedroom cottage',
  planNumber: '1754-00010',
  source: {
    publisher: ABHP,
    url: `${ABHP_SITE}/floorplans/175400010`,
    citation: `${ABHP} plan 1754-00010 — 3 bed / 2 bath ranch, 1,141 heated sf, 40′ × 34′2″, porch on the 40-ft face, no attached garage (Housing design brief, Nov 22, 2026).`,
    rights: 'citation-only',
  },
  stories: 1,
  beds: 3,
  baths: 2,
  heatedSf: HEATED_DELK,
  attachedGarage: false,
  garageSf: 0,
  porchSf: PORCH_DELK,
  footprint: { widthFt: W_DELK, depthFt: D_DELK },
  porchFace: 'width',
  parking: 'pad',
  elevations: ['front', 'left', 'right', 'rear'],
  mirrors: ['none', 'left-right'],
  footprintsByFloor: [
    {
      floor: 1,
      ringFt: ring(W_DELK, D_DELK),
      heatedSf: HEATED_DELK,
      garageSf: 0,
      porchSf: PORCH_DELK,
    },
  ],
  entry: { alongFt: W_DELK / 2, facingDeg: 180, widthFt: 3, wall: 'front' },
  vehicle: null,
  verification: 'trial-cleared',
  notes: [
    'Trial cleared setbacks on Delk lots 1–3 with porch to the lane.',
    'Lots 4–5 need frontage edge resolution; report unplaced with constraint.',
    'Helen Street (Ashland City) is the orientation regression: porch on the short face.',
    'Construction license sold separately by America’s Best House Plans.',
  ],
};

/** Compact 40×25 ranch — Mid-South starter product (1 ba, 0 cars). */
export const ABHP_5633_00365 = abhpPadRanch({
  planNumber: '5633-00365',
  name: 'ABHP 5633-00365 · compact three-bedroom ranch',
  listingPath: '/floorplans/563300365',
  heatedSf: 1000,
  beds: 3,
  baths: 1,
  widthFt: 40,
  depthFt: 25,
});

/** 40×32 ranch with 1.5 baths — pad parking. */
export const ABHP_5633_00366 = abhpPadRanch({
  planNumber: '5633-00366',
  name: 'ABHP 5633-00366 · three-bedroom ranch',
  listingPath: '/floorplans/563300366',
  heatedSf: 1120,
  beds: 3,
  baths: 1.5,
  widthFt: 40,
  depthFt: 32,
});

/** Narrower 34′6″ × 32′6″ ranch. */
export const ABHP_110_00108 = abhpPadRanch({
  planNumber: '110-00108',
  name: 'ABHP 110-00108 · three-bedroom ranch',
  listingPath: '/floorplans/11000108',
  heatedSf: 1029,
  beds: 3,
  baths: 1.5,
  widthFt: 34.5,
  depthFt: 32.5,
});

/** Narrow 31×56 cottage — deep-lot / urban product. */
export const ABHP_4848_00368 = abhpPadRanch({
  planNumber: '4848-00368',
  name: 'ABHP 4848-00368 · three-bedroom cottage',
  listingPath: '/floorplans/484800368',
  heatedSf: 1437,
  beds: 3,
  baths: 2,
  widthFt: 31,
  depthFt: 56,
  notes: [
    'Public listing facts only — purchase the ABHP construction package before building.',
    'Narrow heated width (31′) suits deep lots; porch faces the 31-ft front.',
    'No attached garage on the listing; use an independent parking pad or street stall.',
  ],
});

/** Wider 46×32 ranch, 1,288 heated sf. */
export const ABHP_5633_00358 = abhpPadRanch({
  planNumber: '5633-00358',
  name: 'ABHP 5633-00358 · three-bedroom ranch',
  listingPath: '/floorplans/563300358',
  heatedSf: 1288,
  beds: 3,
  baths: 2,
  widthFt: 46,
  depthFt: 32,
});

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

/** Buildable stock plans offered in Home Studio / pickers (stubs excluded). */
export const HOUSING_CATALOGUE: HousingDesignRecord[] = [
  DELK_COTTAGE_1754_00010,
  ABHP_5633_00365,
  ABHP_5633_00366,
  ABHP_110_00108,
  ABHP_4848_00368,
  ABHP_5633_00358,
];

export function buildableStockPlans(): HousingDesignRecord[] {
  return HOUSING_CATALOGUE.filter(d => d.footprintsByFloor.length > 0 && d.heatedSf > 0);
}

export function housingDesignById(id: string): HousingDesignRecord | undefined {
  if (id === DELK_COTTAGE_ID || id === '1754-00010') return DELK_COTTAGE_1754_00010;
  if (id === LANES_UNIT_A_STUB.id) return LANES_UNIT_A_STUB;
  return HOUSING_CATALOGUE.find(d => d.id === id || d.planNumber === id);
}

/**
 * Designs for a parcel session. Delk keeps the trial-cleared cottage first;
 * other SF / neighborhood parcels see the full buildable stock list.
 */
export function designsForParcel(parcelId: string): HousingDesignRecord[] {
  const stock = buildableStockPlans();
  if (String(parcelId) === DELK_PARCEL_ID) {
    return [DELK_COTTAGE_1754_00010, ...stock.filter(d => d.id !== DELK_COTTAGE_ID)];
  }
  return stock;
}
