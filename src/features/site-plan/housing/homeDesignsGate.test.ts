import { describe, it, expect } from 'vitest';
import { HOME_DESIGNS } from './originalDesigns';
import { residentialHomes } from './placement';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import fixture from '../api/__fixtures__/delk-675423.json';
import {
  ABHP_110_00220,
  ABHP_4848_00368,
  ABHP_526_00051,
  ABHP_5633_00014,
  ABHP_5633_00022,
  ABHP_5633_00340,
  ABHP_5633_00358,
  DELK_COTTAGE_1754_00010,
  buildableStockPlans,
} from './catalogue';
import {
  designMatchesHouseTypology,
  designsFittingHouse,
  eligibleHomeDesigns,
  eligibleStockDesigns,
  isApartmentMassingPlan,
  lotFitInputForHouse,
  schemeAllowsHomeDesigns,
  showHomeDesignsControl,
  stepHomeDesignIndex,
  stockDesignsFittingLot,
  typologyEligibleHomeDesigns,
} from './homeDesignsGate';
import type { Element } from '../../../engine/types';
import type { LotFitInput } from './types';

const mfApartmentPad = (id: string): Element => ({
  id,
  type: 'building',
  name: 'Building 1',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
  properties: { use: 'residential', floors: 3 },
  metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
});

describe('homeDesignsGate — product / layout', () => {
  it('treats multifamily apartments on sheet as apartment massing', () => {
    expect(isApartmentMassingPlan({ layoutShown: 'multifamily', product: 'apartments' })).toBe(true);
    expect(isApartmentMassingPlan({ layoutShown: 'multifamily', product: 'townhomes' })).toBe(false);
    expect(isApartmentMassingPlan({ layoutShown: 'neighborhood', product: 'apartments' })).toBe(false);
  });

  it('allows Home designs for SF / neighborhood / townhomes with house lots, not apartment massing', () => {
    expect(
      schemeAllowsHomeDesigns({ layoutShown: 'multifamily', product: 'apartments', houseCount: 4 }),
    ).toBe(false);
    expect(
      schemeAllowsHomeDesigns({ layoutShown: 'neighborhood', product: 'apartments', houseCount: 5 }),
    ).toBe(true);
    expect(
      schemeAllowsHomeDesigns({ layoutShown: null, product: 'apartments', houseCount: 1 }),
    ).toBe(true);
    expect(
      schemeAllowsHomeDesigns({ layoutShown: 'neighborhood', product: 'apartments', houseCount: 0 }),
    ).toBe(false);
    expect(
      schemeAllowsHomeDesigns({ layoutShown: 'multifamily', product: 'townhomes', houseCount: 8 }),
    ).toBe(true);
  });
});

describe('homeDesignsGate — typology and fit', () => {
  it('matches attached designs only to townhome pads', () => {
    const detached = { properties: { house: true } } as Element;
    const attached = { properties: { townhome: true } } as Element;
    const row = HOME_DESIGNS.find((h) => h.attached)!;
    const cottage = HOME_DESIGNS.find((h) => !h.attached)!;
    expect(designMatchesHouseTypology(row, attached)).toBe(true);
    expect(designMatchesHouseTypology(row, detached)).toBe(false);
    expect(designMatchesHouseTypology(cottage, detached)).toBe(true);
    expect(designMatchesHouseTypology(cottage, attached)).toBe(false);
  });

  it('prefilters attached designs off a detached Delk sheet', () => {
    const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const houses = residentialHomes(elements);
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.every((h) => !h.properties.townhome)).toBe(true);
    const typed = typologyEligibleHomeDesigns(HOME_DESIGNS, houses);
    expect(typed.every((d) => !d.attached)).toBe(true);
    expect(typed.length).toBeLessThan(HOME_DESIGNS.length);
  });

  it('hides the control on apartment massing and keeps only designs that fit Delk lots', () => {
    const mf = [mfApartmentPad('mfgen-bldg-1')];
    expect(
      showHomeDesignsControl({
        layoutShown: 'multifamily',
        product: 'apartments',
        elements: mf,
        designs: HOME_DESIGNS,
      }),
    ).toMatchObject({ show: false, enabled: false, eligible: [] });

    const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const { show, enabled, eligible } = showHomeDesignsControl({
      layoutShown: 'neighborhood',
      product: 'apartments',
      elements,
      designs: HOME_DESIGNS,
    });
    expect(show).toBe(true);
    expect(enabled).toBe(true);
    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(HOME_DESIGNS.length);
    expect(eligible.every((d) => !d.attached)).toBe(true);
    // Court Cottage fits some Delk lots; the full catalogue must not all pass
    expect(eligible.some((d) => d.name === 'Court Cottage')).toBe(true);
    expect(eligibleHomeDesigns(HOME_DESIGNS, elements).map((d) => d.id)).toEqual(
      eligible.map((d) => d.id),
    );
  }, 60000);

  it('shows a disabled control when the scheme allows homes but nothing fits', () => {
    const tinyDetached: Element = {
      id: 'house-tiny',
      type: 'building',
      name: 'House',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [4, 0],
            [4, 4],
            [0, 4],
            [0, 0],
          ],
        ],
      },
      properties: { use: 'residential', house: true, floors: 1 },
      metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
    };
    const { show, enabled, eligible } = showHomeDesignsControl({
      layoutShown: 'neighborhood',
      product: 'apartments',
      elements: [tinyDetached],
      designs: HOME_DESIGNS,
    });
    expect(show).toBe(true);
    expect(enabled).toBe(false);
    expect(eligible).toEqual([]);
  });
});

describe('homeDesignsGate — stock per-lot', () => {
  it('filters stock to plans that fit a given lot envelope', () => {
    const roomy = {
      ringFt: [
        [0, 0],
        [60, 0],
        [60, 100],
        [0, 100],
        [0, 0],
      ] as Array<[number, number]>,
      frontage: null,
      setbacks: { front: 20, side: 5, rear: 20 },
      lotKind: null,
      lotIndex: 0,
    };
    const fitted = stockDesignsFittingLot(buildableStockPlans(), roomy);
    expect(fitted.length).toBeGreaterThan(0);
    expect(fitted.map((d) => d.id)).toContain(ABHP_5633_00358.id);
  });

  it('narrows further when a house is selected vs scheme-level', () => {
    const { elements } = sfV1ToElements(fixture.deep as unknown as SfV1Response);
    const houses = residentialHomes(elements);
    const house = houses[0]!;
    const forLot = eligibleStockDesigns(buildableStockPlans(), elements, {
      selectedHouseId: house.id,
    });
    const anyLot = eligibleStockDesigns(buildableStockPlans(), elements);
    expect(anyLot.length).toBeGreaterThanOrEqual(forLot.length);
    const narrow = stockDesignsFittingLot(
      [ABHP_4848_00368, ABHP_5633_00358],
      {
        ringFt: [
          [0, 0],
          [42, 0],
          [42, 120],
          [0, 120],
          [0, 0],
        ],
        frontage: null,
        setbacks: { front: 20, side: 5, rear: 20 },
        lotKind: null,
        lotIndex: 0,
      },
    );
    expect(narrow.map((d) => d.id)).toContain(ABHP_4848_00368.id);
  });
});

const rectLot = (w: number, d: number, index: number): LotFitInput => ({
  ringFt: [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d],
    [0, 0],
  ],
  frontage: { a: [0, 0], b: [w, 0] },
  setbacks: { front: 20, side: 5, rear: 20 },
  lotKind: 'standard',
  lotIndex: index,
});

describe('stockDesignsFittingLot — per-lot filter', () => {
  const stock = buildableStockPlans();

  it('lot A (wide) keeps a wide ranch that lot B (narrow) drops', () => {
    // Buildable ~60×80 after 5/20/20 — clears 46×32 and 50×28.
    const lotA = rectLot(70, 120, 0);
    // Buildable ~26×80 — clears 24×30; rejects 46×32 / 50×28.
    const lotB = rectLot(36, 120, 1);

    const onA = stockDesignsFittingLot(stock, lotA).map((d) => d.id);
    const onB = stockDesignsFittingLot(stock, lotB).map((d) => d.id);

    expect(onA).toContain(ABHP_5633_00358.id);
    expect(onA).toContain(ABHP_526_00051.id);
    expect(onA).toContain(DELK_COTTAGE_1754_00010.id);

    expect(onB).toContain(ABHP_5633_00014.id);
    expect(onB).not.toContain(ABHP_5633_00358.id);
    expect(onB).not.toContain(ABHP_526_00051.id);
    // Narrow deep cottage still clears lot B width when turned or head-on.
    expect(onB.length).toBeGreaterThan(0);
    expect(onA.length).toBeGreaterThan(onB.length);
  });

  it('mid-narrow and shallow envelopes each keep ≥2 stock swaps', () => {
    // Buildable ~32×30 — 24×30 + 30×28 both clear; 46×32 does not.
    const midNarrow = rectLot(42, 70, 0);
    const onMid = stockDesignsFittingLot(stock, midNarrow).map((d) => d.id);
    expect(onMid.length).toBeGreaterThanOrEqual(2);
    expect(onMid).toEqual(expect.arrayContaining([ABHP_5633_00014.id, ABHP_5633_00340.id]));
    expect(onMid).not.toContain(ABHP_5633_00358.id);

    // Buildable ~40×20 — 40×20 + 36×20 clear; deeper ranches do not.
    const shallow = rectLot(50, 60, 1);
    const onShallow = stockDesignsFittingLot(stock, shallow).map((d) => d.id);
    expect(onShallow.length).toBeGreaterThanOrEqual(2);
    expect(onShallow).toEqual(
      expect.arrayContaining([ABHP_110_00220.id, ABHP_5633_00022.id]),
    );
  });

  it('returns an empty eligible list when the lot is too small for every plan', () => {
    // Buildable ~10×20 after setbacks — nothing in the catalogue clears it.
    const tiny = rectLot(20, 40, 0);
    expect(stockDesignsFittingLot(stock, tiny)).toEqual([]);
    expect(stockDesignsFittingLot([ABHP_4848_00368, ABHP_5633_00014], tiny)).toEqual([]);
  });
});

describe('designsFittingHouse — concept per-lot filter', () => {
  it('Delk house 0 keeps Court Cottage while a tiny pad yields an empty list', () => {
    const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const houses = residentialHomes(elements);
    expect(houses.length).toBeGreaterThan(0);
    const house0 = houses[0]!;
    const onLot = designsFittingHouse(HOME_DESIGNS, house0, elements);
    expect(onLot.some((d) => d.name === 'Court Cottage')).toBe(true);
    expect(onLot.every((d) => !d.attached)).toBe(true);

    const tiny: Element = {
      id: 'house-tiny-plot',
      type: 'building',
      name: 'House tiny',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [3, 0],
            [3, 3],
            [0, 3],
            [0, 0],
          ],
        ],
      },
      properties: { use: 'residential', house: true, floors: 1 },
      metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
    };
    expect(designsFittingHouse(HOME_DESIGNS, tiny, [tiny])).toEqual([]);
  }, 60000);

  it('narrows further when a single Delk lot is selected', () => {
    const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const houses = residentialHomes(elements);
    const schemeEligible = eligibleHomeDesigns(HOME_DESIGNS, elements);
    const tight = houses[4]!;
    const forLot = designsFittingHouse(schemeEligible, tight, elements);
    expect(forLot.length).toBeLessThan(schemeEligible.length);
    expect(forLot.every((d) => !d.attached)).toBe(true);

    const open = houses[0]!;
    const forOpen = designsFittingHouse(schemeEligible, open, elements);
    expect(forOpen.some((d) => d.name === 'Court Cottage')).toBe(true);
    expect(forOpen.length).toBeGreaterThan(0);
  }, 60000);

  it('gives every standard Delk SF lot ≥2 concept and ≥2 stock swaps', () => {
    const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const houses = residentialHomes(elements);
    expect(houses.length).toBe(5);
    // Lots 1–3 are rectangular / standard — must support swapping among ≥2 homes.
    for (const house of houses.slice(0, 3)) {
      const concepts = designsFittingHouse(HOME_DESIGNS, house, elements);
      const stock = eligibleStockDesigns(buildableStockPlans(), elements, {
        selectedHouseId: house.id,
      });
      expect(concepts.length).toBeGreaterThanOrEqual(2);
      expect(concepts.map((d) => d.name)).toEqual(
        expect.arrayContaining(['Court Cottage', 'Pocket Cottage']),
      );
      expect(stock.length).toBeGreaterThanOrEqual(2);
      expect(stock.map((d) => d.id)).toEqual(
        expect.arrayContaining([DELK_COTTAGE_1754_00010.id, ABHP_5633_00014.id]),
      );
      // Sheet coords are 3857 — converted lot envelopes are tens of feet, not ~30.
      const lot = lotFitInputForHouse(house, elements)!;
      const xs = lot.ringFt.map((p) => p[0]);
      const ys = lot.ringFt.map((p) => p[1]);
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(50);
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(50);
    }
    // Lots 4–5 stay honest gaps (irregular / pie): true-polygon eligibility may
    // still list some stock, but fewer than a standard rectangular lot.
    const standardStockCount = eligibleStockDesigns(buildableStockPlans(), elements, {
      selectedHouseId: houses[0]!.id,
    }).length;
    for (const house of houses.slice(3)) {
      const gapStock = eligibleStockDesigns(buildableStockPlans(), elements, {
        selectedHouseId: house.id,
      });
      expect(gapStock.length).toBeLessThan(standardStockCount);
    }
  }, 60000);

  it('steps the catalogue index circularly for keyboard browse', () => {
    expect(stepHomeDesignIndex(0, 3, -1)).toBe(2);
    expect(stepHomeDesignIndex(2, 3, 1)).toBe(0);
    expect(stepHomeDesignIndex(1, 3, 1)).toBe(2);
    expect(stepHomeDesignIndex(0, 0, 1)).toBe(0);
  });
});

describe('planRoomLabel — never bare room numbers', () => {
  it('keeps program names for tight baths / HVAC / kitchens', async () => {
    const { planRoomLabel } = await import('./PlanIllustrations');
    expect(planRoomLabel('Primary bath', 6, 7)).toMatch(/Bath/i);
    expect(planRoomLabel('Mech / HVAC', 5, 4)).toBe('HVAC');
    expect(planRoomLabel('Kitchen', 15, 12)).toBe('Kitchen');
    expect(planRoomLabel('Laundry', 6, 5)).toBe('Laundry');
    expect(planRoomLabel('Bedroom 3', 4, 3)).toMatch(/BR/);
  });
});
