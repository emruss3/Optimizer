import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { feature4326To3857 } from '../../../utils/reproject';
import { frameForRings, interiorPoint, polygonArea, type GroundFrame, type Pt } from './frame';
import { buildingHeight, cleanFloors, type BuildingUse } from './heights';
import type {
  BuildingDisplay, DrawingScene, FeatureRole, FrameCheck, SceneBuilding, SceneFeature, SceneIdentity,
  ScenePolygons, Sourced, StyleRole,
} from './types';

export interface SceneInput {
  parcelId: string | number;
  /** The scheme on the sheet (a candidate id, or generator and pattern). */
  schemeId: string;
  /** The accepted scheme's elements, EPSG:3857. Read, never changed. */
  elements: Element[];
  /** The parcel as the record gives it: EPSG:3857 or longitude and latitude. */
  parcelGeometry?: Polygon | MultiPolygon | null;
  envelope?: Polygon | null;
  context?: {
    buildings?: Array<{ polygon: Polygon; stories?: number }>;
    parcels?: Polygon[];
    roads?: Array<{ line: { coordinates: number[][] }; name?: string | null }>;
  } | null;
  /** Units and stalls of the accepted scheme's schedule. */
  schedule?: { units?: number | null; stalls?: number | null } | null;
  generator?: string | null;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

const ROLE: Record<string, [FeatureRole, StyleRole]> = {
  building: ['building', 'building'],
  parking: ['parking', 'parking'],
  'parking-bay': ['parking', 'parking'],
  'parking-aisle': ['drive', 'drive'],
  circulation: ['drive', 'drive'],
  road: ['street', 'street'],
  greenspace: ['open-space', 'open-space'],
};

function roleOf(el: Element): [FeatureRole, StyleRole] {
  const r = ROLE[el.type];
  if (r) return r;
  if (/^Lot \d+$/.test(el.name ?? '')) return ['lot', 'lot'];
  return ['other', 'other'];
}

export function buildingUse(el: Element): BuildingUse {
  const p = (el.properties ?? {}) as Record<string, unknown>;
  if (p.use === 'amenity') return 'amenity';
  if (p.townhome) return 'townhome';
  if (p.house || p.singleFamilyHouse) return 'house';
  if (p.use == null || p.use === 'residential') return 'apartments';
  return 'other';
}

const USE_LABEL: Record<BuildingUse, string> = {
  apartments: 'Apartments',
  amenity: 'Amenity',
  townhome: 'Townhome',
  house: 'House',
  existing: 'Existing building',
  other: 'Building',
};

/** A, B, … Z, AA, AB, … */
export function letterTag(i: number): string {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** FNV-1a over the scheme's ids, types, stories and geometry to the centimetre. */
export function sceneRevision(elements: Element[]): string {
  let h = 0x811c9dc5;
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const el of elements) {
    eat(`${el.id}|${el.type}|${(el.properties as Record<string, unknown> | undefined)?.floors ?? ''}|`);
    for (const ring of el.geometry?.coordinates ?? []) {
      for (const p of ring) eat(`${Math.round((p[0] ?? 0) * 100)},${Math.round((p[1] ?? 0) * 100)};`);
      eat('/');
    }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The parcel record can arrive in degrees; everything else here is EPSG:3857. */
function in3857(geom: Polygon | MultiPolygon | null | undefined): Polygon | MultiPolygon | null {
  if (!geom) return null;
  try {
    const first = geom.type === 'Polygon' ? geom.coordinates?.[0]?.[0] : geom.coordinates?.[0]?.[0]?.[0];
    if (!first) return null;
    const projected = Math.abs(first[0] ?? 0) > 1000 || Math.abs(first[1] ?? 0) > 1000;
    return projected ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
  } catch {
    return null;
  }
}

function toPolygons(geom: Polygon | MultiPolygon | null | undefined, frame: GroundFrame): ScenePolygons {
  if (!geom) return [];
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : [];
  const out: ScenePolygons = [];
  for (const poly of polys) {
    const rings = (poly ?? [])
      .filter(r => Array.isArray(r) && r.length >= 4)
      .map(r => r.map(p => frame.toFeet(p)));
    if (rings.length) out.push(rings);
  }
  return out;
}

function describe(b: Omit<SceneBuilding, 'display'>): BuildingDisplay {
  const floors = `${b.floors.value} ${b.floors.value === 1 ? 'story' : 'stories'}`;
  const footprint = b.footprintSqFt ? `${fmt(b.footprintSqFt.value)} sf` : 'not reported';
  const gross = b.grossSqFt ? `${fmt(b.grossSqFt.value)} sf` : 'not reported';
  const units = b.units ? fmt(b.units.value) : 'not reported';
  const height = `${fmt(b.height.aboveGradeFt)} ft`;
  const heightShort = b.height.basis === 'estimated' ? `est. ${height}` : height;
  const use = USE_LABEL[b.use];
  return {
    title: `Building ${b.tag}`,
    use,
    floors,
    footprint,
    gross,
    units,
    heightLabel: b.height.label,
    height,
    heightShort,
    planLines: [
      b.units ? `${use} · ${floors} · ${units} ${b.units.value === 1 ? 'unit' : 'units'}` : `${use} · ${floors}`,
      b.footprintSqFt ? `${footprint} footprint · ${heightShort}` : heightShort,
    ],
    oneLine: `${b.tag} · ${b.id} · ${use} · ${floors} · ${b.footprintSqFt ? `${footprint} footprint` : 'footprint not reported'} · ${b.height.label.toLowerCase()} ${height}`,
  };
}

/**
 * Build the scene from the accepted scheme. Positions are converted to ground
 * feet here and nowhere else. Counts and areas are carried from the plan as
 * reported: nothing here measures an area for display or counts a stall.
 */
export function buildDrawingScene(input: SceneInput): DrawingScene | null {
  const elements = (input.elements ?? []).filter(e => (e?.geometry?.coordinates?.[0]?.length ?? 0) >= 4);
  const parcelRings: number[][][] = [];
  const pg = in3857(input.parcelGeometry);
  if (pg?.type === 'Polygon') parcelRings.push(...pg.coordinates);
  else if (pg?.type === 'MultiPolygon') for (const poly of pg.coordinates) parcelRings.push(...poly);
  const frame = frameForRings(parcelRings.length ? parcelRings : elements.flatMap(e => e.geometry.coordinates.slice(0, 1)));
  if (!frame) return null;

  const features: SceneFeature[] = [];
  const buildings: SceneBuilding[] = [];
  let letters = 0, houses = 0, towns = 0;
  for (const el of elements) {
    const [role, styleRole] = roleOf(el);
    const p = (el.properties ?? {}) as Record<string, unknown>;
    const polygons = toPolygons(el.geometry, frame);
    if (!polygons.length) continue;
    const base: SceneFeature = {
      id: el.id,
      role,
      styleRole,
      name: el.name ?? el.id,
      polygons,
      stalls: role === 'parking' ? num(p.parkingSpaces) ?? num(p.stalls) : null,
      reportedAreaSqFt: num(p.areaSqFt),
      provenance: { elementType: el.type, generator: input.generator ?? null },
    };
    if (role !== 'building') {
      features.push(base);
      continue;
    }
    const use = buildingUse(el);
    const small = use === 'house' || use === 'townhome';
    const tag = use === 'house' ? `H${++houses}` : use === 'townhome' ? `T${++towns}` : letterTag(letters++);
    const floorsN = cleanFloors(num(p.floors) ?? num(p.stories) ?? 1);
    const floors: Sourced<number> = { value: floorsN, authority: p.storiesAssumed ? 'estimated' : 'engine' };
    const fp = num(p.areaSqFt);
    const footprintSqFt: Sourced<number> | null = fp != null && fp > 0 ? { value: fp, authority: 'engine' } : null;
    const grossSqFt: Sourced<number> | null = footprintSqFt ? { value: footprintSqFt.value * floorsN, authority: 'derived' } : null;
    const mix = Array.isArray(p.unitMix) ? (p.unitMix as Array<{ count?: number }>) : null;
    const mixUnits = mix ? mix.reduce((s, m) => s + (num(m.count) ?? 0), 0) : null;
    // the count the plan's own caption states, then the element's, then its mix
    const unitsN = num(p.planUnits) ?? num(p.units) ?? (mixUnits != null && mixUnits > 0 ? mixUnits : null);
    const units: Sourced<number> | null = use === 'amenity' || unitsN == null ? null : { value: unitsN, authority: 'engine' };
    const height = buildingHeight(use, floorsN, p.heightFt);
    const outline = polygons[0] ?? [];
    const labelPoint: Pt = interiorPoint(outline) ?? outline[0]?.[0] ?? [0, 0];
    const b: Omit<SceneBuilding, 'display'> = {
      ...base, role: 'building', styleRole: use === 'amenity' ? 'amenity' : small ? 'house' : 'building',
      tag, tagOnPlan: !small, use, floors, footprintSqFt, grossSqFt, units, height, labelPoint,
    };
    const full: SceneBuilding = { ...b, display: describe(b) };
    features.push(full);
    buildings.push(full);
  }

  // The frame is checked against the plan itself: a shape's area in this frame
  // must equal the area the engine reports for it. Apartment and amenity
  // footprints and lots only: a house pad's reported area is a program figure.
  let worst = 0, samples = 0;
  for (const f of features) {
    const checked = f.role === 'lot' || (f.role === 'building' && (f as SceneBuilding).tagOnPlan);
    if (!checked || f.reportedAreaSqFt == null || f.reportedAreaSqFt <= 0) continue;
    const a = f.polygons.reduce((s, poly) => s + polygonArea(poly), 0);
    if (a <= 0) continue;
    samples++;
    worst = Math.max(worst, Math.abs(a / f.reportedAreaSqFt - 1) * 100);
  }
  const frameCheck: FrameCheck = samples === 0
    ? { status: 'unverified', samples: 0, worstPct: null, note: 'No footprint or lot with an engine-reported area to check the frame against.' }
    : worst <= 1.5
      ? { status: 'verified', samples, worstPct: Math.round(worst * 100) / 100, note: `Areas in the drawing frame match the engine's within ${Math.max(0.1, Math.round(worst * 10) / 10)}%.` }
      : { status: 'mismatch', samples, worstPct: Math.round(worst * 100) / 100, note: `An area in the drawing frame differs from the engine's by ${Math.round(worst * 10) / 10}%.` };

  const parcel = parcelRings.length ? { polygons: toPolygons(pg, frame) } : null;
  const envelope = input.envelope ? { polygons: toPolygons(input.envelope, frame) } : null;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (polys: ScenePolygons) => {
    for (const poly of polys) for (const p of poly[0] ?? []) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  };
  if (parcel) grow(parcel.polygons);
  for (const f of features) grow(f.polygons);

  const scheduleUnits = num(input.schedule?.units);
  const scheduleStalls = num(input.schedule?.stalls);
  const dwellings = buildings.filter(b => b.use !== 'amenity');
  const buildingUnits = dwellings.length && dwellings.every(b => b.units) ? dwellings.reduce((s, b) => s + (b.units?.value ?? 0), 0) : null;
  const parking = features.filter(f => f.role === 'parking');
  const featureStalls = parking.length && parking.every(f => f.stalls != null) ? parking.reduce((s, f) => s + (f.stalls ?? 0), 0) : null;
  const consistent =
    (scheduleUnits == null || buildingUnits == null || scheduleUnits === buildingUnits) &&
    (scheduleStalls == null || featureStalls == null || scheduleStalls === featureStalls);

  const parcelId = String(input.parcelId);
  const identity: SceneIdentity = {
    parcelId,
    schemeId: input.schemeId,
    revision: sceneRevision(elements),
    key: `${parcelId}|${input.schemeId}`,
  };

  return {
    identity,
    frame,
    units: { horizontal: 'ft', vertical: 'ft' },
    vertical: { heights: 'above-grade', groundElevations: 'unavailable', datum: null },
    parcel,
    envelope,
    features,
    buildings,
    context: {
      buildings: (input.context?.buildings ?? [])
        .map(b => ({ polygons: toPolygons(b.polygon, frame), stories: cleanFloors(b.stories) }))
        .filter(b => b.polygons.length > 0),
      parcels: (input.context?.parcels ?? []).flatMap(p => toPolygons(p, frame)),
      roads: (input.context?.roads ?? [])
        .filter(r => (r.line?.coordinates?.length ?? 0) >= 2)
        .map(r => ({ path: r.line.coordinates.map(p => frame.toFeet(p)), name: r.name ?? null })),
    },
    schedule: { units: scheduleUnits, stalls: scheduleStalls, buildingUnits, featureStalls, consistent },
    extentFt: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: -50, minY: -50, maxX: 50, maxY: 50 },
    frameCheck,
  };
}

/** What a selection is remembered for: the parcel and the scheme, not the revision. */
export interface SelectionCache {
  key: string;
  ids: string[];
}

/** The remembered selection, if it belongs to this scene and its features still exist. */
export function selectionFor(scene: DrawingScene | null, cache: SelectionCache | null): string[] {
  if (!scene || !cache || cache.key !== scene.identity.key) return [];
  const known = new Set(scene.features.map(f => f.id));
  return cache.ids.filter(id => known.has(id));
}

/** A small, serialisable account of the scene for tests and evidence. */
export function sceneEvidence(scene: DrawingScene | null) {
  if (!scene) return null;
  return {
    identity: scene.identity,
    frame: { crs: scene.frame.crs, groundScale: Math.round(scene.frame.groundScale * 1e5) / 1e5, check: scene.frameCheck },
    buildings: scene.buildings.map(b => ({
      id: b.id,
      tag: b.tag,
      use: b.use,
      floors: b.floors.value,
      footprintSqFt: b.footprintSqFt?.value ?? null,
      heightFt: b.height.aboveGradeFt,
      heightBasis: b.height.basis,
      oneLine: b.display.oneLine,
    })),
    features: scene.features.length,
    schedule: scene.schedule,
  };
}
