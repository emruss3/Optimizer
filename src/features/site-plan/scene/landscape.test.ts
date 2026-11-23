import { describe, it, expect } from 'vitest';
import { plantTrees, seeded, MAX_TREES } from './landscape';
import { pointInPolygon, type Pt } from './frame';
import { renderSitePlanSheet, renderViewSheet, sheetLayout, stallStripes, viewSheetLayout } from './sheetSvg';
import { buildDrawingScene } from './buildScene';
import type { SceneFeature, ScenePolygons } from './types';
import type { Element } from '../../../engine/types';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { feature4326To3857 } from '../../../utils/reproject';
import type { Polygon } from 'geojson';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const feature = (id: string, role: SceneFeature['role'], styleRole: SceneFeature['styleRole'], ring: Pt[]): SceneFeature => ({
  id, role, styleRole, name: id, polygons: [[ring]], label: null, stalls: null, reportedAreaSqFt: null, provenance: { elementType: 'x', generator: null },
});

describe('planting', () => {
  const parcel: ScenePolygons = [[box(0, 0, 400, 300)]];
  const street = feature('street-1', 'street', 'street', box(0, 140, 400, 164));
  const lot = feature('lot-1', 'lot', 'lot', box(20, 170, 100, 290));
  const house = feature('house-1', 'building', 'house', box(40, 200, 80, 240));
  const drive = feature('drive-1', 'drive', 'driveway', box(45, 164, 57, 200));

  it('plants street trees beside the street and yard trees on the lot, none on anything built', () => {
    const trees = plantTrees([street, lot, house, drive], parcel);
    expect(trees.filter(t => t.kind === 'street').length).toBeGreaterThan(8);
    expect(trees.filter(t => t.kind === 'yard').length).toBeGreaterThanOrEqual(1);
    for (const t of trees) {
      for (const f of [street, house, drive]) expect(pointInPolygon(t.at[0], t.at[1], f.polygons[0] ?? [])).toBe(false);
      expect(pointInPolygon(t.at[0], t.at[1], parcel[0] ?? [])).toBe(true);
    }
    for (const t of trees.filter(x => x.kind === 'yard')) expect(pointInPolygon(t.at[0], t.at[1], lot.polygons[0] ?? [])).toBe(true);
  });

  it('plants the same trees every time', () => {
    expect(plantTrees([street, lot, house, drive], parcel)).toEqual(plantTrees([street, lot, house, drive], parcel));
    const r = seeded(7), q = seeded(7);
    expect([r(), r(), r()]).toEqual([q(), q(), q()]);
  });

  it('plants the property line when there are no lots, and stops at its limit', () => {
    const building = feature('b', 'building', 'building', box(100, 100, 300, 200));
    const edge = plantTrees([building], parcel);
    expect(edge.length).toBeGreaterThan(20);
    expect(edge.every(t => t.kind === 'edge')).toBe(true);
    const many = Array.from({ length: 80 }, (_, i) => feature(`s${i}`, 'street', 'street', box(0, i * 60, 4000, i * 60 + 24)));
    expect(plantTrees(many, [[box(0, 0, 4000, 5000)]]).length).toBe(MAX_TREES);
  });
});

describe('stall stripes', () => {
  it('shows exactly the count the plan reports, or nothing', () => {
    const bay = box(0, 0, 90, 18);
    const ten = stallStripes(bay, 10);
    expect(ten?.stalls).toHaveLength(10);
    expect(ten?.lines).toHaveLength(9);
    // two rows of ten in a double bay
    expect(stallStripes(box(0, 0, 90, 36), 20)?.stalls).toHaveLength(20);
    // 7 stalls would be 12.9 ft wide: not drawn
    expect(stallStripes(bay, 7)).toBeNull();
    expect(stallStripes(bay, null)).toBeNull();
    // a point on a straight side is not a corner
    const withMid: Pt[] = [[0, 0], [45, 0], [90, 0], [90, 18], [0, 18], [0, 0]];
    expect(stallStripes(withMid, 10)?.stalls).toHaveLength(10);
    // an L is not striped
    expect(stallStripes([[0, 0], [90, 0], [90, 18], [40, 18], [40, 40], [0, 40], [0, 0]], 10)).toBeNull();
  });
});

describe('the sheet', () => {
  const X0 = 1731047.065, Y0 = 669334.005;
  const sq = (x: number, y: number, w: number, d: number): Polygon => feature4326To3857(geom2274To4326({ type: 'Polygon', coordinates: [[[X0 + x, Y0 + y], [X0 + x + w, Y0 + y], [X0 + x + w, Y0 + y + d], [X0 + x, Y0 + y + d], [X0 + x, Y0 + y]]] } as never) as never) as Polygon;
  const el = (id: string, type: Element['type'], geometry: Polygon, properties: Record<string, unknown> = {}, name = id): Element => ({
    id, type, name, geometry, properties: properties as Element['properties'], metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
  });
  const scene = buildDrawingScene({
    parcelId: 9, schemeId: 's',
    parcelGeometry: sq(-40, -40, 400, 300),
    elements: [
      el('b1', 'building', sq(0, 60, 200, 60), { floors: 3, areaSqFt: 12000, planUnits: 24 }),
      el('p1', 'parking', sq(0, 0, 90, 18), { parkingSpaces: 10 }),
      el('d1', 'circulation', sq(0, 18, 200, 24), {}, 'Main Drive'),
    ],
    schedule: { units: 24, stalls: 10 },
  })!;
  const title = { project: 'P', date: 'd', data: [{ label: 'Zoning', value: 'RM20' }, { label: 'Density', value: '11.2 per acre' }] };

  it('keeps an unresolved route on the download, and draws none when the route is whole', () => {
    const whole = new DOMParser().parseFromString(renderSitePlanSheet(scene, title, 'tabloid').svg, 'image/svg+xml');
    expect(whole.querySelector('[data-role="route-break"]')).toBeNull();
    const broken = new DOMParser().parseFromString(
      renderSitePlanSheet(scene, { ...title, routeBreak: { from: [0, 18], to: [0, -30] } }, 'tabloid').svg, 'image/svg+xml');
    expect(broken.querySelector('parsererror')).toBeNull();
    const mark = broken.querySelector('[data-role="route-break"]');
    expect(mark?.querySelectorAll('circle').length).toBe(2);
    expect(mark?.textContent).toMatch(/no drawn connection to the street/);
    const measured = new DOMParser().parseFromString(
      renderSitePlanSheet(scene, { ...title, routeBreak: { from: [0, 18], to: [0, -30], gapFt: 20.85 } }, 'tabloid').svg, 'image/svg+xml');
    expect(measured.querySelector('[data-role="route-break"]')?.textContent).toMatch(/21 ft short/);
  });

  it('prints the decision figures ahead of the other site data, and says so when a legend is cut short', () => {
    const decided = { ...title, decision: [{ label: 'Parking', value: '238 supplied · 226 required' }, { label: 'Street access', value: 'Unresolved: no drive reaches the street' }] };
    const doc = new DOMParser().parseFromString(renderSitePlanSheet(scene, decided, 'slide').svg, 'image/svg+xml');
    const rows = [...doc.querySelectorAll('[data-site-data]')].map(g => g.getAttribute('data-site-data'));
    expect(rows.slice(0, 3)).toEqual(['Parking', 'Street access', 'Zoning']);
    expect(doc.querySelector('[data-decision="Parking"]')?.textContent).toBe('Parking238 supplied · 226 required');
    // every legend item is either drawn or counted in the "more" note
    const drawn = doc.querySelectorAll('[data-legend]').length;
    const more = doc.querySelector('[data-legend-more]')?.getAttribute('data-legend-more');
    expect(drawn > 0 || more === 'all').toBe(true);
  });

  // Live Design handoff 2026-11-23: W Heiman parking / street-access text overran Letter (~0.60 in) and slide (~3 pts)
  it('wraps long decision values inside the strip on Letter and slide', () => {
    const decided = {
      ...title,
      decision: [
        { label: 'Parking', value: '127 drawn · 20 reported · 122 required · reported count 102 short of required' },
        { label: 'Street access', value: 'Unresolved: no drive reaches the street' },
      ],
    };
    for (const size of ['letter', 'slide'] as const) {
      const sheet = renderSitePlanSheet(scene, decided, size);
      const layout = sheetLayout(scene, size);
      const tx = layout.strip.x + 14, tw = layout.strip.w - 28;
      const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      const parking = doc.querySelector('[data-decision="Parking"]');
      expect(parking?.getAttribute('data-wrapped')).toBe('true');
      expect(parking?.getAttribute('data-alert')).toBe('true');
      expect(parking?.textContent).toMatch(/short of required/);
      // every value fragment starts at the indent and ends before the strip's right content edge
      for (const t of parking?.querySelectorAll('text') ?? []) {
        const x = Number(t.getAttribute('x'));
        const text = t.textContent ?? '';
        if (text === 'Parking') {
          expect(x).toBeCloseTo(tx, 1);
          continue;
        }
        expect(x).toBeGreaterThanOrEqual(tx + 46 - 0.5);
        const approxW = text.length * 5.9 * 0.52;
        expect(x + approxW).toBeLessThanOrEqual(tx + tw + 1);
      }
      const access = doc.querySelector('[data-decision="Street access"]');
      expect(access?.getAttribute('data-alert')).toBe('true');
      expect(access?.textContent).toMatch(/Unresolved/);
    }
  });

  it('prints the key figures, the site data and the stripes it could draw', () => {
    const sheet = renderSitePlanSheet(scene, title, 'tabloid');
    expect(sheet.figures.map(f => [f.label, f.value])).toEqual([['HOMES', '24'], ['BUILDING', '1'], ['STORIES', '3'], ['PARKING STALLS', '10']]);
    expect(sheet.striped).toEqual([{ id: 'p1', stalls: 10 }]);
    const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelector('[data-site-data="Zoning"]')?.textContent).toBe('ZoningRM20');
    expect(doc.querySelector('[data-role="shadows"]')?.getAttribute('data-illustration')).toBe('true');
    expect(doc.querySelector('[data-role="trees"]')?.getAttribute('data-illustration')).toBe('true');
    expect(sheet.svg).toContain('are illustration');
  });

  it('numbers the lots, and steps the surroundings back under a picture', () => {
    const lots = buildDrawingScene({
      parcelId: 9, schemeId: 's', parcelGeometry: sq(-20, -20, 300, 200),
      elements: [el('lot-1', 'other', sq(0, 0, 80, 120), { areaSqFt: 9600 }, 'Lot 1'), el('lot-2', 'other', sq(80, 0, 80, 120), { areaSqFt: 9600 }, 'Lot 2')],
    })!;
    const drawn = new DOMParser().parseFromString(renderSitePlanSheet(lots, title, 'slide').svg, 'image/svg+xml');
    expect([...drawn.querySelectorAll('[data-label="lot"]')].map(n => n.textContent)).toEqual(['1', '2']);
    expect(drawn.querySelector('[data-role="surroundings"]')).toBeNull();
    const over = new DOMParser().parseFromString(renderSitePlanSheet(lots, title, 'slide', { href: 'data:image/jpeg;base64,AAAA' }).svg, 'image/svg+xml');
    expect(over.querySelector('parsererror')).toBeNull();
    expect(over.querySelector('[data-role="surroundings"]')).not.toBeNull();
    expect(over.querySelectorAll('[data-label="lot"]')).toHaveLength(2);
  });

  it('states no numeric scale on a slide', () => {
    expect(renderSitePlanSheet(scene, title, 'tabloid').numericScale).toMatch(/^1" = \d+'$/);
    const slide = renderSitePlanSheet(scene, title, 'slide');
    expect(slide.numericScale).toBeNull();
    expect(slide.svg).toMatch(/width="13.333in" height="7.5in"/);
  });

  it('lays linework over a picture: every feature keeps its id, nothing is painted twice', () => {
    const sheet = renderSitePlanSheet(scene, title, 'slide', { href: 'data:image/jpeg;base64,AAAA' });
    const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const image = doc.querySelector('image[data-role="underlay"]');
    const layout = sheetLayout(scene, 'slide');
    expect(Number(image?.getAttribute('width'))).toBeCloseTo(layout.draw.w, 3);
    expect([...doc.querySelectorAll('path[data-feature-id]')].map(n => n.getAttribute('data-feature-id')).sort()).toEqual(['b1', 'd1', 'p1']);
    expect([...doc.querySelectorAll('path[data-feature-id]')].every(n => n.getAttribute('fill') === 'none')).toBe(true);
    expect(doc.querySelector('[data-role="shadows"]')).toBeNull();
    expect(doc.querySelector('[data-label="building-tag"][data-feature-id="b1"] text')?.textContent).toBe('A');
    expect(doc.querySelector('[data-schedule-row="b1"]')).not.toBeNull();
    // the picture covers exactly the ground the page shows
    expect((layout.ground.maxX - layout.ground.minX) * layout.k).toBeCloseTo(layout.draw.w, 6);
    expect((layout.ground.maxY - layout.ground.minY) * layout.k).toBeCloseTo(layout.draw.h, 6);
  });

  it('makes A-02 from a picture, the project, the figures and a plain statement of what it is', () => {
    const pending = renderViewSheet(scene, title, 'slide', null);
    expect(pending.svg).toContain('Rendering the view');
    const sheet = renderViewSheet(scene, title, 'slide', { href: 'data:image/jpeg;base64,AAAA' });
    const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const layout = viewSheetLayout('slide');
    expect(Number(doc.querySelector('image[data-role="rendering"]')?.getAttribute('height'))).toBeCloseTo(layout.image.h, 3);
    expect(doc.querySelector('[data-role="sheet-number"]')?.textContent).toBe('A-02');
    expect(doc.querySelector('[data-figure="Density"]')?.textContent).toBe('11.2 per acreDENSITY');
    expect(doc.querySelector('[data-role="view-note"]')?.textContent).toMatch(/are illustration, not a design/);
    expect(sheet.svg).toMatch(/width="13.333in" height="7.5in"/);
    // a picture on ground graded for it says the grading is assumed; one on flat or ungraded ground does not
    expect(doc.querySelector('[data-role="view-note"]')?.textContent).not.toMatch(/not a grading plan/);
    const graded = renderViewSheet(scene, title, 'slide', { href: 'data:image/jpeg;base64,AAAA', graded: true });
    // the note wraps to more than one line, and still reads as whole sentences
    const gdoc = new DOMParser().parseFromString(graded.svg, 'image/svg+xml');
    const note = gdoc.querySelector('[data-role="view-note"]');
    expect(note?.querySelectorAll('tspan').length).toBeGreaterThanOrEqual(2);
    expect(note?.textContent).toMatch(/graded to 4% or less: an assumption of the picture, not a grading plan/);
    expect(note?.textContent).toMatch(/are illustration, not a design/);
    const painted = renderViewSheet(scene, title, 'slide', { href: 'data:image/jpeg;base64,AAAA', ai: true, graded: true });
    expect(painted.svg).not.toContain('not a grading plan');
  });
});

