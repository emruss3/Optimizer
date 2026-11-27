/**
 * Field audit Wave 2 / Production 2D–3D audit: Brittany Park and Nashboro are
 * "frontage lots, no new street". The scheme draws driveways to the parcel edge
 * but no pave/street polygon — placeHome must still accept that as a mapped
 * vehicle approach, or every authored design returns zero fit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { placeHome, residentialHomes } from './placement';
import { HOME_DESIGNS } from './originalDesigns';
import type { Element } from '../../../engine/types';

type FrontageFixture = {
  plan: SfV1Response;
  siteBoundary: Element['geometry'];
};

const load = (name: string): FrontageFixture =>
  JSON.parse(readFileSync(join(__dirname, `../api/__fixtures__/${name}.json`), 'utf8')) as FrontageFixture;

describe('frontage lots — mapped vehicle approach (Brittany / Nashboro)', () => {
  it('Brittany Park (678964): 13 frontage drives, no street pave — cottage places on most lots', () => {
    const { plan, siteBoundary } = load('brittany-678964');
    expect(plan.pattern).toMatch(/frontage lots/i);
    const { elements } = sfV1ToElements(plan);
    const circ = elements.filter((e) => e.type === 'circulation' || e.type === 'road');
    expect(circ.every((e) => e.name === 'Driveway')).toBe(true);
    expect(circ).toHaveLength(13);

    const homes = residentialHomes(elements);
    expect(homes).toHaveLength(13);
    const cottage = HOME_DESIGNS.find((h) => h.name === 'Court Cottage')!;
    const fits = homes.map((el) => placeHome(cottage, el, elements, siteBoundary));
    // Without the frontage-approach fallback every lot failed with "no mapped vehicle approach".
    expect(fits.every((f) => !f.reason?.includes('no mapped vehicle approach'))).toBe(true);
    // Remaining misses are footprint/setback honesty, not the missing-street gate.
    const placed = fits.filter((f) => f.placement).length;
    expect(placed).toBe(7);
  }, 60_000);

  it('Nashboro Blvd (672524): 10 frontage drives — cottage is not blocked by missing street pave', () => {
    const { plan, siteBoundary } = load('nashboro-672524');
    expect(plan.pattern).toMatch(/frontage lots/i);
    const { elements } = sfV1ToElements(plan);
    const circ = elements.filter((e) => e.type === 'circulation' || e.type === 'road');
    expect(circ.every((e) => e.name === 'Driveway')).toBe(true);
    expect(circ).toHaveLength(10);

    const homes = residentialHomes(elements);
    expect(homes).toHaveLength(10);
    const cottage = HOME_DESIGNS.find((h) => h.name === 'Court Cottage')!;
    const fits = homes.map((el) => placeHome(cottage, el, elements, siteBoundary));
    expect(fits.every((f) => !f.reason?.includes('no mapped vehicle approach'))).toBe(true);
    const placed = fits.filter((f) => f.placement).length;
    expect(placed).toBeGreaterThanOrEqual(6);
  }, 60_000);

  it('still refuses when there is neither a street nor a parcel-edge driveway', () => {
    const { plan, siteBoundary } = load('brittany-678964');
    const { elements } = sfV1ToElements(plan);
    const withoutDrives = elements.filter((e) => e.name !== 'Driveway' && e.properties.kind !== 'driveway');
    const home = residentialHomes(withoutDrives)[0]!;
    const cottage = HOME_DESIGNS.find((h) => h.name === 'Court Cottage')!;
    const r = placeHome(cottage, home, withoutDrives, siteBoundary);
    expect(r.reason).toMatch(/no mapped vehicle approach/i);
  });
});
