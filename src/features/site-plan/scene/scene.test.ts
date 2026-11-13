import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { geom2274To4326 } from '../../../utils/tnStatePlane';
import { feature4326To3857 } from '../../../utils/reproject';
import { seedFamilyPlanToElements, type SeedFamilyResponse } from '../api/generateMfPlan';
import { buildMassingData } from '../ui/massingData';
import { METERS_PER_FOOT } from '../../../engine/units';
import {
  buildDrawingScene, buildingHeight, createGroundFrame, frameForRings, interiorPoint, letterTag, placeLabels,
  pointInPolygon, polygonArea, renderSitePlanSheet, sceneEvidence, sceneRevision, selectionFor, LABEL_PRIORITY,
  STORY_ASSUMPTIONS, type Pt,
} from './index';
import { crossings, renderSectionSheet } from './sheetSvg';

// The engine draws in EPSG:2274 (Tennessee state plane, feet): a true ground
// frame. The app reprojects that to EPSG:3857 for the canvas. These tests take
// shapes whose size is known in the engine's frame, send them down the app's
// own reprojection, and require the scene to give the same feet back.
const to3857 = <T extends Polygon | MultiPolygon>(g: T): T => feature4326To3857(geom2274To4326(g as never) as never) as T;
const must = <T,>(v: T | undefined | null): T => {
  if (v == null) throw new Error('expected a value');
  return v;
};
const ringOf = (g: Polygon): number[][] => must(g.coordinates[0]);
const len = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.hypot(must(b[0]) - must(a[0]), must(b[1]) - must(a[1]));
const edges = (ring: ArrayLike<ArrayLike<number>>) => Array.from({ length: ring.length - 1 }, (_, i) => len(must(ring[i]), must(ring[i + 1])));

const store = JSON.parse(readFileSync(resolve(__dirname, '../../../../scripts/visual-battery/fixtures/mock_store.json'), 'utf8'));
const meharry = store['rpc:fn_generate_mf_site_plan_v2:488278:multifamily'] as SeedFamilyResponse;
const meharryParcel = (() => {
  const row = store['rpc:get_parcel_by_id:488278:'];
  const g = (Array.isArray(row) ? row[0] : row)?.geometry;
  return g ? (feature4326To3857(g) as Polygon | MultiPolygon) : null;
})();

// a point of the fixture, so synthetic shapes sit at a real Nashville position
const X0 = 1731047.065, Y0 = 669334.005;
const rect2274 = (w: number, d: number, deg: number, x0 = X0, y0 = Y0): Polygon => {
  const a = (deg * Math.PI) / 180;
  const pt = (u: number, v: number) => [x0 + u * Math.cos(a) - v * Math.sin(a), y0 + u * Math.sin(a) + v * Math.cos(a)];
  return { type: 'Polygon', coordinates: [[pt(0, 0), pt(w, 0), pt(w, d), pt(0, d), pt(0, 0)]] };
};
const el = (id: string, type: Element['type'], geometry: Polygon, properties: Record<string, unknown> = {}, name = id): Element => ({
  id, type, name, geometry, properties: properties as Element['properties'],
  metadata: { createdAt: '', updatedAt: '', source: 'ai-generated' },
});

describe('ground frame', () => {
  it('returns the engine’s own edge lengths for the 1710 Meharry Blvd building', () => {
    const native = must(meharry.buildings?.[0]).geom_2274 as Polygon;
    const ring3857 = ringOf(to3857(native));
    const frame = frameForRings([ring3857])!;
    const got = edges(ring3857.map(p => frame.toFeet(p)));
    const want = edges(ringOf(native));
    // the long side is the bar: 201.5 ft in the engine's frame, "bar_len_ft: 202"
    expect(Math.max(...want)).toBeCloseTo(201.5, 0);
    want.forEach((w, i) => expect(Math.abs(must(got[i]) - w)).toBeLessThan(Math.max(0.05, w * 0.0005)));
    // raw EPSG:3857 metres read as ground metres would call that bar about 250 ft
    const raw = Math.max(...edges(ring3857)) / METERS_PER_FOOT;
    expect(raw).toBeGreaterThan(245);
  });

  it('keeps the size and the bearing of a lot turned 30 degrees', () => {
    const ring3857 = ringOf(to3857(rect2274(100, 60, 30)));
    const frame = frameForRings([ring3857])!;
    const local = ring3857.map(p => frame.toFeet(p));
    const [p0, p1, p2] = [must(local[0]), must(local[1]), must(local[2])];
    const e = edges(local);
    const [e0, e1] = [must(e[0]), must(e[1])];
    expect(e0).toBeCloseTo(100, 1);
    expect(e1).toBeCloseTo(60, 1);
    // state plane grid north is within a degree of true north here
    const bearing = (Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) * 180) / Math.PI;
    expect(Math.abs(bearing - 30)).toBeLessThan(1);
    // the corner stays square
    const dot = (p1[0] - p0[0]) * (p2[0] - p1[0]) + (p1[1] - p0[1]) * (p2[1] - p1[1]);
    expect(Math.abs(dot) / (e0 * e1)).toBeLessThan(0.002);
  });

  it('measures the same length east-west and north-south', () => {
    const frame = createGroundFrame(-9662000, 4325000);
    expect(frame.kx).not.toBeCloseTo(frame.ky, 4);
    const ew = ringOf(to3857(rect2274(300, 1, 0)));
    const ns = ringOf(to3857(rect2274(1, 300, 0)));
    const eastWest = frame.distanceFt(must(ew[0]), must(ew[1]));
    const northSouth = frame.distanceFt(must(ns[1]), must(ns[2]));
    expect(Math.abs(eastWest - 300)).toBeLessThan(0.15);
    expect(Math.abs(northSouth - 300)).toBeLessThan(0.15);
  });

  it('keeps the holes and the parts of a parcel', () => {
    const outer = ringOf(rect2274(400, 300, 12));
    const hole = ringOf(rect2274(80, 60, 12, X0 + 120, Y0 + 140));
    const island = ringOf(rect2274(50, 50, 0, X0 + 900, Y0));
    const parcel = to3857({ type: 'MultiPolygon', coordinates: [[outer, hole], [island]] } as MultiPolygon);
    const scene = buildDrawingScene({ parcelId: 1, schemeId: 's', elements: [], parcelGeometry: parcel })!;
    const parts = must(scene.parcel).polygons;
    expect(parts).toHaveLength(2);
    const [main, isle] = [must(parts[0]), must(parts[1])];
    expect(main).toHaveLength(2);
    expect(isle).toHaveLength(1);
    expect(Math.abs(polygonArea(main) / (400 * 300 - 80 * 60) - 1)).toBeLessThan(0.001);
    expect(Math.abs(polygonArea(isle) / 2500 - 1)).toBeLessThan(0.001);
  });

  it('puts a courtyard building’s label on the building, not in the court', () => {
    const ring: Pt[] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const court: Pt[] = [[25, 25], [75, 25], [75, 75], [25, 75], [25, 25]];
    const p = interiorPoint([ring, court])!;
    expect(pointInPolygon(p[0], p[1], [ring, court])).toBe(true);
    expect(pointInPolygon(50, 50, [ring, court])).toBe(false);
  });
});

describe('heights', () => {
  it('estimates from a story count and says so', () => {
    const h = buildingHeight('apartments', 4);
    expect(h.aboveGradeFt).toBe(44);
    expect(h.basis).toBe('estimated');
    expect(h.label).toBe('Estimated height');
    expect(h.levelsFt).toEqual([14, 24, 34, 44]);
    expect(h.note).toMatch(/Not a measured or controlling height/);
    expect(h.assumption).toMatchObject(STORY_ASSUMPTIONS.apartments);
  });

  it('uses a reported height when the plan carries one', () => {
    const h = buildingHeight('apartments', 4, 52);
    expect(h).toMatchObject({ aboveGradeFt: 52, basis: 'reported', label: 'Height', assumption: null });
    expect(h.levelsFt[3]).toBe(52);
  });

  it('is specific to the use and safe on a bad count', () => {
    expect(buildingHeight('house', 2).aboveGradeFt).toBe(20);
    expect(buildingHeight('townhome', 3).aboveGradeFt).toBe(30);
    expect(buildingHeight('apartments', Number.NaN).aboveGradeFt).toBe(14);
    expect(buildingHeight('apartments', 0).levelsFt).toEqual([14]);
  });
});

describe('scene from the saved multifamily plan (488278, 1710 Meharry Blvd)', () => {
  const { elements } = seedFamilyPlanToElements(meharry);
  const scene = buildDrawingScene({
    parcelId: 488278, schemeId: 'mf:test', elements, parcelGeometry: meharryParcel,
    schedule: { units: meharry.metrics?.units as number, stalls: meharry.metrics?.stalls as number },
  })!;

  it('cuts a section through the building: its stories at the scene heights, between the property lines', () => {
    const sheet = renderSectionSheet(scene, { project: '1710 MEHARRY BLVD', subtitle: 'RM20', date: '2026-11-12', notes: [] }, 'slide');
    expect(sheet.drawn).toBe(1);
    expect(sheet.svg).toContain('data-sheet="A-03"');
    // four levels, the scene's estimated height, and both property lines
    expect((sheet.svg.match(/data-level="/g) ?? []).length).toBe(4);
    expect(sheet.svg).toContain('est. 44 ft');
    expect((sheet.svg.match(/data-role="property-line"/g) ?? []).length).toBe(2);
    // a section states no horizontal distance: only the graphic scale carries feet across
    expect(sheet.svg).toContain('data-role="scale-bar"');
    expect(sheet.svg).toContain('Heights are estimated from story counts');
    expect(sheet.svg).toContain(`rev ${scene.identity.revision}`);
  });

  it('draws the zoning height control on the section and says when the building is above it', () => {
    const title = { project: '1710 MEHARRY BLVD', subtitle: 'RM20', date: '2026-11-12', notes: [] };
    // no record of a limit: no line, no finding
    const bare = renderSectionSheet(scene, title, 'slide');
    expect(bare.overLimit).toBe(false);
    expect(bare.svg).not.toContain('data-role="height-limit"');
    // the record's single figure: a 44 ft estimate is above 30 ft
    const flat = renderSectionSheet(scene, title, 'slide', { maxHeightFt: 30 });
    expect(flat.svg).toContain('Height limit 30 ft');
    expect(flat.overLimit).toBe(true);
    expect(flat.svg).toContain('estimated at 44 ft, above the 30 ft the record allows at this cut. Needs verification.');
    expect(flat.svg).toContain('an ordinance that allows more height away from the setback line is not shown');
    // a limit the building is under: the line, and nothing to verify
    const roomy = renderSectionSheet(scene, title, 'slide', { maxHeightFt: 60 });
    expect(roomy.overLimit).toBe(false);
    expect(roomy.svg).not.toContain('data-role="height-finding"');
    // the ordinance's plane, where the record states one, is drawn as a plane
    const plane = renderSectionSheet(scene, title, 'slide', { maxHeightFt: 30, plane: { heightAtSetbackFt: 30, slopeHorizontal: 1, slopeVertical: 1.5 } });
    expect(plane.svg).toContain('data-role="height-plane"');
    expect(plane.svg).toContain('30 ft at the setback line, then 1H:1.5V');
    expect(plane.svg).not.toContain('data-role="height-limit"');
  });

  it('finds where a line crosses a ring', () => {
    const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(crossings(square, [5, 5], [1, 0])).toEqual([-5, 5]);
    expect(crossings(square, [5, 5], [0, 1])).toEqual([-5, 5]);
    expect(crossings(square, [50, 5], [0, 1])).toEqual([]);
  });

  it('carries one building with the plan’s id, stories and footprint', () => {
    expect(scene.buildings).toHaveLength(1);
    const b = must(scene.buildings[0]);
    const source = elements.find(e => e.type === 'building')!;
    expect(b.id).toBe(source.id);
    expect(b.tag).toBe('A');
    expect(b.floors).toEqual({ value: 4, authority: 'engine' });
    expect(b.footprintSqFt).toEqual({ value: 13561, authority: 'engine' });
    expect(b.grossSqFt).toEqual({ value: 54244, authority: 'derived' });
    expect(b.height).toMatchObject({ aboveGradeFt: 44, basis: 'estimated', label: 'Estimated height' });
    expect(b.display.oneLine).toBe(`A · ${source.id} · Apartments · 4 stories · 13,561 sf footprint · estimated height 44 ft`);
  });

  it('checks its frame against the engine’s footprint', () => {
    expect(scene.frameCheck.status).toBe('verified');
    expect(scene.frameCheck.worstPct!).toBeLessThan(0.2);
  });

  it('adds no feature and changes no count', () => {
    expect(scene.features).toHaveLength(elements.length);
    expect(scene.features.map(f => f.id)).toEqual(elements.map(e => e.id));
    expect(scene.schedule).toMatchObject({ units: 30, stalls: 52, buildingUnits: 30, featureStalls: 52, consistent: true });
  });

  it('says when the drawn features do not add up to the schedule', () => {
    const off = buildDrawingScene({ parcelId: 488278, schemeId: 'mf:test', elements, schedule: { units: 31, stalls: 52 } })!;
    expect(off.schedule.consistent).toBe(false);
  });

  it('gives the 3D model the same building, footprint and height', () => {
    const b = must(scene.buildings[0]);
    const massing = buildMassingData(elements);
    const solid = massing.polygons.find(p => p.id === b.id)!;
    expect(solid.elevation).toBeCloseTo(b.height.aboveGradeFt * METERS_PER_FOOT, 6);
    // same footprint: the model's ring, in metres, has the engine's area
    const areaSf = polygonArea(solid.polygon) / (METERS_PER_FOOT * METERS_PER_FOOT);
    expect(Math.abs(areaSf / b.footprintSqFt!.value - 1)).toBeLessThan(0.002);
    // floor lines sit on the scene's levels
    const tops = [...new Set(massing.floorLines.map(l => Math.round((must(must(l.path[0])[2]) / METERS_PER_FOOT) * 100) / 100))];
    expect(tops).toEqual(b.height.levelsFt);
  });

  it('prints the same values on sheet A-01', () => {
    const b = must(scene.buildings[0]);
    const sheet = renderSitePlanSheet(scene, { project: '1710 MEHARRY BLVD', subtitle: 'RM20 · 1.77 ac', date: '2026-11-11' }, 'tabloid');
    expect(sheet.schedule).toEqual([{ tag: 'A', id: b.id, use: 'Apartments', floors: '4 stories', footprint: '13,561 sf', gross: '54,244 sf', height: 'Estimated height 44 ft' }]);
    const doc = new DOMParser().parseFromString(sheet.svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    const row = doc.querySelector(`[data-schedule-row="${b.id}"]`)!;
    const cells = [...row.querySelectorAll('text')].map(t => t.textContent);
    expect(cells).toEqual(['A', 'Apartments', '4', b.display.footprint, b.display.heightShort]);
    expect(doc.querySelector(`[data-label="building-tag"][data-feature-id="${b.id}"] text`)!.textContent).toBe('A');
    expect(doc.querySelector(`path[data-role="building"][data-feature-id="${b.id}"]`)).not.toBeNull();
    expect(sheet.svg).toContain('Heights are estimated from story counts');
    // every drawn feature is a scene feature
    const ids = [...doc.querySelectorAll('path[data-feature-id]')].map(n => n.getAttribute('data-feature-id'));
    expect(ids.sort()).toEqual(scene.features.map(f => f.id).sort());
  });

  it('states a numeric scale only on a verified frame, and one that fits the page', () => {
    const tabloid = renderSitePlanSheet(scene, { project: 'P', date: 'd' }, 'tabloid');
    const letter = renderSitePlanSheet(scene, { project: 'P', date: 'd' }, 'letter');
    expect(tabloid.numericScale).toBe(`1" = ${tabloid.ftPerInch}'`);
    expect(tabloid.svg).toMatch(/width="17in" height="11in"/);
    expect(letter.svg).toMatch(/width="11in" height="8.5in"/);
    expect(letter.ftPerInch).toBeGreaterThanOrEqual(tabloid.ftPerInch);
    const e = scene.extentFt;
    expect((e.maxX - e.minX) / tabloid.ftPerInch).toBeLessThan(17);
    // a lot with the engine's area verifies the frame as a footprint does
    const lot = buildDrawingScene({ parcelId: 1, schemeId: 's', elements: [el('l1', 'other', to3857(rect2274(100, 60, 0)), { areaSqFt: 6000 }, 'Lot 1')] })!;
    expect(lot.frameCheck.status).toBe('verified');
    const wrong = buildDrawingScene({ parcelId: 1, schemeId: 's', elements: [el('l1', 'other', to3857(rect2274(100, 60, 0)), { areaSqFt: 7000 }, 'Lot 1')] })!;
    expect(wrong.frameCheck.status).toBe('mismatch');
    expect(renderSitePlanSheet(wrong, { project: 'P', date: 'd' }).numericScale).toBeNull();
    const bare = buildDrawingScene({ parcelId: 1, schemeId: 's', elements: [el('lot', 'other', to3857(rect2274(100, 60, 0)))] })!;
    expect(bare.frameCheck.status).toBe('unverified');
    const sheet = renderSitePlanSheet(bare, { project: 'P', date: 'd' });
    expect(sheet.numericScale).toBeNull();
    expect(sheet.svg).toContain('Graphic scale only');
  });

  it('reports itself for the evidence record', () => {
    const ev = sceneEvidence(scene)!;
    expect(ev.identity.key).toBe('488278|mf:test');
    expect(ev.buildings[0]).toMatchObject({ tag: 'A', floors: 4, footprintSqFt: 13561, heightFt: 44, heightBasis: 'estimated' });
  });
});

describe('identity, tags and selection', () => {
  const a = el('b-1', 'building', to3857(rect2274(120, 60, 0)), { floors: 3, areaSqFt: 7200 });
  const b = el('b-2', 'building', to3857(rect2274(120, 60, 0, X0 + 200)), { floors: 3, areaSqFt: 7200 });
  const club = el('club', 'building', to3857(rect2274(40, 40, 0, X0 + 400)), { floors: 1, use: 'amenity', areaSqFt: 1600 });
  const house = el('h', 'building', to3857(rect2274(40, 30, 0, X0, Y0 + 300)), { floors: 2, house: true });
  const scene = buildDrawingScene({ parcelId: 7, schemeId: 'cand-1', elements: [a, b, club, house] })!;

  it('letters the buildings in plan order and leaves houses to their lots', () => {
    expect(scene.buildings.map(x => [x.id, x.tag, x.tagOnPlan])).toEqual([['b-1', 'A', true], ['b-2', 'B', true], ['club', 'C', true], ['h', 'H1', false]]);
    expect(letterTag(25)).toBe('Z');
    expect(letterTag(26)).toBe('AA');
    expect(must(scene.buildings[3]).footprintSqFt).toBeNull();
    expect(must(scene.buildings[3]).display.footprint).toBe('not reported');
    expect(must(scene.buildings[2]).units).toBeNull();
  });

  it('changes revision with the plan and not with anything else', () => {
    expect(sceneRevision([a, b])).toBe(sceneRevision([{ ...a, name: 'renamed' }, b]));
    expect(sceneRevision([a, b])).not.toBe(sceneRevision([{ ...a, properties: { ...a.properties, floors: 4 } }, b]));
    expect(sceneRevision([a, b])).not.toBe(sceneRevision([a]));
  });

  it('remembers a selection for its parcel and scheme only', () => {
    expect(selectionFor(scene, { key: '7|cand-1', ids: ['b-2'] })).toEqual(['b-2']);
    expect(selectionFor(scene, { key: '7|cand-2', ids: ['b-2'] })).toEqual([]);
    expect(selectionFor(scene, { key: '8|cand-1', ids: ['b-2'] })).toEqual([]);
    expect(selectionFor(scene, { key: '7|cand-1', ids: ['gone', 'b-1'] })).toEqual(['b-1']);
    expect(selectionFor(null, { key: '7|cand-1', ids: ['b-1'] })).toEqual([]);
  });

  it('escapes what it prints', () => {
    const sheet = renderSitePlanSheet(scene, { project: 'A & B <LLC>', date: 'd' }, 'letter');
    expect(sheet.svg).toContain('A &amp; B &lt;LLC&gt;');
    expect(new DOMParser().parseFromString(sheet.svg, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });
});

describe('label placement', () => {
  const box = (id: string, priority: number, x: number, y: number, extra = {}) => ({ id, priority, x, y, w: 20, h: 10, ...extra });

  it('places by priority, whatever the input order', () => {
    const out = placeLabels([box('street', LABEL_PRIORITY.streetName, 5, 0), box('tag', LABEL_PRIORITY.buildingTag, 0, 0), box('stalls', LABEL_PRIORITY.parkingCount, 60, 0)]);
    expect(out.map(l => [l.id, l.placed])).toEqual([['street', false], ['tag', true], ['stalls', true]]);
  });

  it('moves a label to an alternate before dropping it', () => {
    const out = placeLabels([box('tag', 1, 0, 0), box('cap', 2, 0, 4, { alternates: [[0, 30]] })]);
    expect(out[1]).toMatchObject({ placed: true, x: 0, y: 30 });
  });

  it('always places a required label and reports the overlap', () => {
    const out = placeLabels([box('a', 1, 0, 0, { required: true }), box('b', 1, 2, 0, { required: true })]);
    expect(out.map(l => [l.placed, l.overlapped])).toEqual([[true, false], [true, true]]);
  });

  it('keeps labels inside the drawing', () => {
    const out = placeLabels([box('edge', 1, 95, 0, { alternates: [[80, 0]] })], { bounds: { minX: 0, minY: -50, maxX: 100, maxY: 50 } });
    expect(out[0]).toMatchObject({ placed: true, x: 80 });
  });
});
