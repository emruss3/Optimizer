import { describe, expect, it } from 'vitest';
import type { Element } from '../../../engine/types';
import fixture from '../api/__fixtures__/delk-675423.json';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import { assignmentsFromElements, commitConcept } from './carry';
import { residentialHomes } from './placement';
import { homesSchedule } from './schedule';
import { isGeometryBackedHome, placeStarterHomes, placeStarterHomesInBackground, placeStarterHomesWithReport, PROVISIONAL_PAD } from './starterHomes';

const plan = () => sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
function boundingTestParcel(elements: Element[]): Element['geometry'] {
  const points = elements.filter(e => e.id.startsWith('sfv1-lot-')).flatMap(e => e.geometry.coordinates[0]!);
  const w = Math.min(...points.map(c => c[0]!)) - 1;
  const e = Math.max(...points.map(c => c[0]!)) + 1;
  const s = Math.min(...points.map(c => c[1]!)) - 1;
  const n = Math.max(...points.map(c => c[1]!)) + 1;
  return { type: 'Polygon', coordinates: [[[w,s],[e,s],[e,n],[w,n],[w,s]]] };
}

describe('starter homes on the captured Delk five-lot layout', () => {
  it('places a coherent concept where it fits, preserving lot polygons and yield', () => {
    const base = plan();
    const placed = placeStarterHomes(base, boundingTestParcel(base), 35);
    const houses = residentialHomes(placed);
    expect(houses).toHaveLength(residentialHomes(base).length);
    expect(houses[0]!.properties.housingDesignId).toBe('tn-lockeland-cottage-v1');
    expect(houses[0]!.properties.housingAssignmentSource).toBe('starter');
    expect(isGeometryBackedHome(houses[0]!)).toBe(true);
    expect(placed.filter(e => e.id.startsWith('sfv1-lot-')).map(e => e.geometry))
      .toEqual(base.filter(e => e.id.startsWith('sfv1-lot-')).map(e => e.geometry));
    expect(placed.find(e => e.type === 'road')).toBe(base.find(e => e.type === 'road'));
    expect(assignmentsFromElements(placed)).toEqual([]);
    expect(homesSchedule(placed).rows.some(row => row.design.includes('starter concept'))).toBe(true);
  });
  it('keeps an explicit choice, including when applying the suggested home manually', () => {
    const base = plan();
    const boundary = boundingTestParcel(base);
    const placed = placeStarterHomes(base, boundary, 35);
    const first = residentialHomes(placed)[0]!;
    const chosen = commitConcept('tn-lockeland-cottage-v1', first.id, placed, boundary, 35);
    if (!chosen.ok) throw new Error(chosen.reason);
    const committed = placeStarterHomes(chosen.elements, boundary, 35);
    expect(committed.find(e => e.id === first.id)?.properties.housingAssignmentSource).toBe('manual');
    expect(assignmentsFromElements(committed)).toHaveLength(1);
  });
  it('fails closed with no parcel, no recorded height, or no starter below the height limit', () => {
    const base = plan();
    expect(placeStarterHomes(base, null, 35)).toBe(base);
    expect(placeStarterHomes(base, boundingTestParcel(base), null)).toBe(base);
    expect(placeStarterHomes(base, boundingTestParcel(base), 1)).toBe(base);
    expect(homesSchedule(base).rows.every(row => row.design === PROVISIONAL_PAD && row.beds === null)).toBe(true);
  });
  it('leaves a plan over the solve-time limit for the background pass, which gives the same homes', async () => {
    const base = plan();
    const boundary = boundingTestParcel(base);
    const deferred = placeStarterHomesWithReport(base, boundary, 35, 2);
    expect(deferred.deferred).toBe(true);
    expect(deferred.elements).toBe(base);
    const sync = placeStarterHomesWithReport(base, boundary, 35);
    const bg = await placeStarterHomesInBackground(base, boundary, 35, () => true, 0);
    expect(bg?.elements.map(e => e.properties.housingDesignId ?? null)).toEqual(sync.elements.map(e => e.properties.housingDesignId ?? null));
    expect(bg?.report).toEqual(sync.report);
  });
  it('drops the background result when the plan changes before it finishes', async () => {
    const base = plan();
    let calls = 0;
    const bg = await placeStarterHomesInBackground(base, boundingTestParcel(base), 35, () => ++calls < 2, 0);
    expect(bg).toBeNull();
  });
  it('reports why the background pass could not run without waiting', async () => {
    const base = plan();
    const bg = await placeStarterHomesInBackground(base, boundingTestParcel(base), null, () => true);
    expect(bg?.elements).toBe(base);
    expect(bg?.skipped).toContain('height limit');
  });
});
