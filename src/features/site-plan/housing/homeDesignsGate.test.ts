import { describe, it, expect } from 'vitest';
import { HOME_DESIGNS } from './originalDesigns';
import { residentialHomes } from './placement';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import fixture from '../api/__fixtures__/delk-675423.json';
import {
  designMatchesHouseTypology,
  eligibleHomeDesigns,
  isApartmentMassingPlan,
  schemeAllowsHomeDesigns,
  showHomeDesignsControl,
  typologyEligibleHomeDesigns,
} from './homeDesignsGate';
import type { Element } from '../../../engine/types';

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
