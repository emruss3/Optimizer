import { describe, expect, it } from 'vitest';
import type { Element } from '../../../engine/types';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import fixture from '../api/__fixtures__/delk-675423.json';
import { createGroundFrame } from '../scene/frame';
import { buildDrawingScene } from '../scene/buildScene';
import { buildMassingData } from '../ui/massingData';
import { assignmentsFromElements, carryAssignments, commitConcept } from './carry';
import { MIDDLE_TENNESSEE_IDS } from './middleTennesseeDesigns';
import { findHome, HOME_DESIGNS } from './originalDesigns';
import { doorAnchors, wallsFor } from './drawings';
import { homesSchedule } from './schedule';

const frame = createGroundFrame(-9679825, 4334090);
const setbacks = { front: 12, rear: 12, side: 3 };
function area(id: string, name: string, type: Element['type'], x: number, y: number, w: number, d: number, properties: Element['properties'] = {}): Element {
  return {
    id, name, type, properties,
    geometry: { type: 'Polygon', coordinates: [[[x,y],[x+w,y],[x+w,y+d],[x,y+d],[x,y]].map(p => frame.fromFeet(p))] },
  } as Element;
}
function plan() {
  const lot = area('test-lot-1', 'Lot 1', 'other', 0, 0, 72, 108, { homeSetbacksFt: setbacks });
  const house = area('test-pad-1', 'House 1', 'building', 12, 20, 48, 64, { house: true, lotId: lot.id });
  return { house, elements: [lot, house,
    area('street', 'Front street', 'road', -10, -16, 94, 16),
    area('alley', 'Rear alley', 'road', -10, 108, 94, 14, { kind: 'alley' }),
    area('link', 'Paved link', 'circulation', -18, -3, 13, 115),
  ] };
}

describe('complete authored housing catalog', () => {
  it('registers fifteen distinct authored concepts', () => {
    // Pocket Cottage (tn-pocket-cottage-v1) is an extra catalogue concept on this branch.
    expect(HOME_DESIGNS).toHaveLength(15);
    expect(new Set(HOME_DESIGNS.map(h => h.id)).size).toBe(15);
    expect(HOME_DESIGNS.some(h => h.id === 'tn-pocket-cottage-v1')).toBe(true);
  });

  it('places Lockeland on Delk without changing its neighbors', () => {
    const inPlan = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
    const before = inPlan.find(e => e.id === 'sfv1-pad-2');
    const applied = commitConcept(MIDDLE_TENNESSEE_IDS[0], 'sfv1-pad-1', inPlan);
    if (!applied.ok) throw new Error(applied.reason);
    expect(applied.elements.find(e => e.id === 'sfv1-pad-2')).toBe(before);
    expect(applied.elements.find(e => e.id === 'sfv1-pad-1')?.properties.housingDesignId).toBe(MIDDLE_TENNESSEE_IDS[0]);
    expect(applied.elements.some(e => e.name === 'Parking pad · 9 × 18 ft')).toBe(true);
  });

  it.each(MIDDLE_TENNESSEE_IDS.slice(1))('places %s through concept apply and restores it after a re-solve', id => {
    const { house, elements: bothFrontages } = plan();
    const rearLoad = id === MIDDLE_TENNESSEE_IDS[1];
    const elements = rearLoad ? bothFrontages : bothFrontages.filter(e => e.id !== 'alley' && e.id !== 'link');
    const applied = commitConcept(id, house.id, elements, undefined, 35);
    if (!applied.ok) throw new Error(applied.reason);
    const selected = applied.elements.find(e => e.id === house.id)!;
    const front = frame.toFeet(selected.properties.homeEntry3857 as number[]);
    const garage = frame.toFeet(selected.properties.homeVehicle3857 as number[]);
    if (rearLoad) expect(garage[1]!).toBeGreaterThan(front[1]! + 40);
    else expect(garage[1]!).toBeCloseTo(front[1]!, 2);
    expect(applied.elements.some(e => e.name === 'Driveway' && e.id.startsWith(house.id + '-home-'))).toBe(true);
    expect(applied.elements.some(e => e.name === 'Walk' && e.id.startsWith(house.id + '-home-'))).toBe(true);
    const scene = buildDrawingScene({ parcelId: 'catalog-test', schemeId: 'test', elements: applied.elements });
    expect(scene?.buildings[0]?.housing?.designId).toBe(id);
    expect(homesSchedule(applied.elements).rows[0]?.kind).toBe('concept');
    expect(buildMassingData(applied.elements).slabs.some(s => s.approach?.kind === 'apron')).toBe(true);
    const restored = carryAssignments(assignmentsFromElements(applied.elements), elements, setbacks, 35);
    expect(restored.lost).toHaveLength(0);
    expect(restored.kept[0]?.designId).toBe(id);
    if (rearLoad) {
      expect(commitConcept(id, house.id, elements.filter(e => e.id !== 'alley'))).toMatchObject({ ok: false, reason: expect.stringMatching(/alley/) });
      expect(doorAnchors(findHome(id)!).find(d => d.kind === 'garage')).toMatchObject({ face: 'back', width: 9 });
    }
  });

  it('keeps Motor Court’s connected upper hall between the two landings', () => {
    const motor = findHome('tn-motor-court-v1')!;
    const links = wallsFor(motor, 1).filter(w => w.other && w.cuts.length > 0)
      .map(w => [w.room, w.other].sort().join('|'));
    expect(links).toEqual(expect.arrayContaining([
      'Rear landing|Stair hall', 'Rear landing|Upper hall', 'Front landing|Upper hall', 'Bedroom 2|Front landing',
    ]));
  });
});
