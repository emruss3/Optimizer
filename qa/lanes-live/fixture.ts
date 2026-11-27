import type { Element } from '../../src/engine/types';
import { createGroundFrame } from '../../src/features/site-plan/scene/frame';
import { buildDrawingScene } from '../../src/features/site-plan/scene/buildScene';
import { commitConcept } from '../../src/features/site-plan/housing/carry';
import { WEST_HEIMAN_IDS } from '../../src/features/site-plan/housing/westHeimanDesigns';
// A purpose-built QA street, not the surveyed geometry of the photographed block.
const frame = createGroundFrame(-9679825, 4334090);
const point = ([x, y]: number[]) => frame.fromFeet([x!, y!]);
const rectangle = (x: number, y: number, w: number, d: number): Element['geometry'] =>
  ({ type: 'Polygon', coordinates: [[[x,y],[x+w,y],[x+w,y+d],[x,y+d],[x,y]].map(point)] });
const item = (id: string, name: string, type: Element['type'], geometry: Element['geometry'], properties: Element['properties'] = {}) =>
  ({ id, name, type, geometry, properties }) as Element;
const setbacks = { front: 12, rear: 12, side: 3 };
const lots = Array.from({ length: 6 }, (_, i) => {
  const x = (i % 3) * 33, y = i < 3 ? 0 : -124;
  return [
    item('lot-' + i, 'Lot ' + (i + 1), 'other', rectangle(x,y,33,86), { homeSetbacksFt: setbacks }),
    item('pad-' + i, 'House ' + (i + 1), 'building', rectangle(x + 6,y + 22,21,43), { house: true, lotId: 'lot-' + i, heightFt: 30 }),
  ];
}).flat();
const roads = [
  item('street','Front street','road',rectangle(-10,-38,119,38)),
  item('alley-n','Rear alley','road',rectangle(-10,86,119,15),{ kind: 'alley' }),
  item('alley-s','Rear alley','road',rectangle(-10,-139,119,15),{ kind: 'alley' }),
  item('link','Paved link','circulation',rectangle(-16,-127,11,216)),
  item('walk-n','Sidewalk','circulation',rectangle(0,2,99,5),{ kind: 'walk' }),
  item('walk-s','Sidewalk','circulation',rectangle(0,-45,99,5),{ kind: 'walk' }),
];
const boundary = rectangle(-18,-142,130,246);
let elements = [...lots,...roads];
for (let i = 0; i < 6; i++) {
  const result = commitConcept(WEST_HEIMAN_IDS[i % 3]!, 'pad-' + i, elements, boundary, 45);
  if (!result.ok) throw new Error('Fixture placement failed on lot ' + (i + 1) + ': ' + result.reason);
  elements = result.elements;
}
const scene = buildDrawingScene({ parcelId: 'lanes-street-fixture', schemeId: 'photo-study', elements, parcelGeometry: boundary });

export { boundary, elements, scene };
