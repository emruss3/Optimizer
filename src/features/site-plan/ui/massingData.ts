import { isProvisionalPad, PROVISIONAL_PAD } from '../housing/starterHomes';
import { Kit, mat } from './architecture/kit';
import { findHome } from '../housing/originalDesigns';
import { placedArchitecture } from '../housing/architecture';
import { makeTerrain } from '../render3d/terrain';
import { point2274To3857 } from '../api/parcelTopo';
import type { Element } from '../../../engine/types';
import { isConstraintSource, type ConstraintSource } from '../api/sfV1Plan';
import { METERS_PER_FOOT } from '../../../engine/units';
import { pointsAlongSegment, type Segment } from '../../../components/site-planner/planRendering';
import { createGroundFrame, pointInPolygon } from '../scene/frame';
import { buildingHeight } from '../scene/heights';
import { buildingUse, pavementKind } from '../scene/buildScene';
import { isMappedAlley } from '../scene/mappedAlley';
import { isOutdoorAmenityName, OUTDOOR_DECK_HEIGHT_FT } from '../scene/outdoorAmenity';
import { clearestAzimuth, MAX_WINDOWS, type RenderSlab, type RenderWindow } from './renderModel';
import { buildArchitecture, DEFAULT_STYLE, type ArchStyle } from './architecture';
import type { HouseAccess } from './architecture/fittedHouse';
import { houseAccessFromProperties } from '../housing/handoff';
import { stallStripes } from '../scene/sheetSvg';
import { seeded } from '../scene/landscape';

/** Selection→drawing handoff: design identity, garage flag, porch/entry anchors. */
function houseAccessFor(el: Element, driveways: Array<Array<[number, number]>>): HouseAccess | undefined {
  const properties = (el.properties ?? {}) as Record<string, unknown>;
  const access = houseAccessFromProperties(properties, driveways);
  if (access) return access;
  const catalogued = typeof properties.floorplanId === 'string' || typeof properties.housePlan === 'string';
  if (!catalogued && driveways.length === 0) return undefined;
  return {
    driveways,
    garage: typeof properties.houseGarage === 'boolean' ? properties.houseGarage : null,
    catalogued,
  };
}

export interface MassingPolygon {
  /** The plan element's id: the same id the plan and the sheets use. Absent on context. */
  id?: string;
  /** True for a plan building: the only solids that can be selected. */
  building?: boolean;
  detached?: boolean;
  /** The plan element's type, for a view that chooses its own materials. */
  kind?: string;
  hazard?: 'wetland' | 'floodplain' | 'floodway' | 'slope';
  /** what the held land is (wetland, its buffer, a fill hold, a hillside), apart from its hatch */
  source?: ConstraintSource;
  privateDrive?: boolean;
  mappedAlley?: boolean;
  /** Polygon rings in local metres, centred on the plan's bbox centre */
  polygon: number[][][];
  /** Extrusion height in metres */
  elevation: number;
  color: [number, number, number, number];
  label: string;
}

const TYPE_COLORS: Record<string, [number, number, number, number]> = {
  building: [59, 130, 246, 230],
  'parking-bay': [226, 232, 240, 210],
  parking: [226, 232, 240, 210],
  'parking-aisle': [203, 213, 225, 190],
  circulation: [148, 163, 184, 190],
  road: [148, 163, 184, 190],
  greenspace: [134, 239, 172, 170],
};

/** Everything the 3D views draw, in local metres. */
export type MassingData = ReturnType<typeof buildMassingData>;

/** Site materials of the rendered view: pavement, parking and planted
 *  ground. A building's own materials are in renderModel. */
export const SITE_MATERIALS: Record<string, [number, number, number, number]> = {
  street: [128, 128, 126, 255],
  drive: [150, 150, 146, 255],
  driveway: [208, 204, 194, 255],
  walk: [196, 190, 176, 255],
  'parking-bay': [212, 212, 207, 255],
  parking: [212, 212, 207, 255],
  'parking-aisle': [158, 158, 154, 255],
  circulation: [158, 158, 154, 255],
  greenspace: [170, 202, 144, 255],
};

/** Height of an existing neighborhood building from its story count, in
 *  metres: an estimate, from the one table of story heights (scene/heights). */
export function buildingHeightM(floors: number): number {
  return buildingHeight('existing', floors).aboveGradeFt * METERS_PER_FOOT;
}

/**
 * Convert plan elements (EPSG:3857) into centred, true-ground-metre massing
 * polygons for the 3D view. Applies the Mercator scale factor cos(lat) so
 * horizontal distances match the extrusion heights (which are real metres) —
 * otherwise buildings at Nashville's latitude would look ~24% too squat.
 */
export function buildMassingData(
  elements: Element[],
  ground?: {
    /** The parcel's surveyed elevations (api/parcelTopo): the scene stands on them. */
    topo?: import('../api/parcelTopo').ParcelTopo | null;
    parcelRing?: number[][];
    envelopeRing?: number[][];
    /** Where the route to the street breaks: the end of the drive and the street edge it does not reach (EPSG:3857). */
    accessBreak?: { from: number[]; to: number[] } | null;
    /** Existing neighborhood buildings (3857) — extruded white context */
    contextBuildings?: Array<{ polygon: { coordinates: number[][][] }; stories: number }>;
    /** Neighbor parcel outlines (3857) — flat ground plates */
    contextParcels?: Array<{ coordinates: number[][][] }>;
    /** Front property edges (3857) — street trees plant along these, exactly
     *  like the 2D landscape pass (10 m spacing, 4 m end inset, drive skip) */
    frontEdges?: Segment[];
    /** Trees (3857, canopy radius in metres) from the drawing scene. When
     *  given they are used as they are, so the model and the sheet plant the
     *  same trees. */
    treePoints?: Array<{ at: number[]; radiusM: number }>;
    /** Street centre lines of the block (3857). */
    contextRoads?: Array<{ line: { coordinates: number[][] } }>;
    /** The architectural style the buildings are drawn in. It changes how they look and nothing else. */
    style?: ArchStyle;
  }
): {
  polygons: MassingPolygon[];
  extent: number;
  groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }>;
  contextPolygons: MassingPolygon[];
  /** Street-tree positions in the same centred local frame */
  trees: Array<{ position: [number, number]; radiusM?: number }>;
  /** Foundation planting from the rendered buildings: x, y, radius. */
  shrubs: Array<[number, number, number]>;
  /** Walks, as lines to be drawn wide under what they follow: the plan's own
   *  streets (with a planted strip inside the walk) and the larger buildings. */
  walks: Array<{ id?: string; path: number[][]; widthM: number; strip: boolean }>;
  /** Curbs: the edges of the plan's streets and drives. */
  curbs: Array<{ id?: string; path: number[][]; guideOnly?: boolean }>;
  /** The block's streets, centre lines in local metres. */
  roads: Array<{ id?: string; path: number[][] }>;
  /** Stall stripes, where a bay's reported count divides into whole stalls. */
  stripes: Array<{ path: number[][] }>;
  /** Parked cars in some of those stalls. Illustration. */
  cars: RenderSlab[];
  /** The plan explicitly reports a disconnected approach to the street. */
  vehicleAccessBreak?: boolean;
  /** Where to look from for an aerial view: degrees clockwise from south,
   *  the diagonal least blocked by the existing buildings. */
  aerialAzimuth: number;
  /** A projected point (EPSG:3857) in this model's local metres. */
  toLocal: (p: number[]) => number[];
  /** Spandrel rings at every floor line + parapet — the massing reads as a
   *  building with real floors, not an extruded slab. */
  floorLines: Array<{ path: number[][] }>;
  /** The rendered buildings: stacked stories in their materials. */
  slabs: RenderSlab[];
  /** Window bays on their walls. Illustration: the plan carries no elevations. */
  windows: RenderWindow[];
  /** Pitched roofs of houses and townhomes. Illustration above the eaves. */
  roofs: RenderWindow[];
  /** The site itself as a planted plate, when the parcel is known. */
  lawn: MassingPolygon[];
  /** Roof-line ring of each building, for the selection outline. */
  roofLines: Array<{ id: string; path: number[][] }>;
  /** The lots of a subdivision, as rings in local metres. */
  lots: number[][][];
  /** Scene origin (derived from the plan's own Mercator frame) — feeds the
   *  sun-study light; never a hardcoded city. */
  origin: { latDeg: number; lonDeg: number };
  /** The surveyed ground under the plan, in this model's frame; null or absent where the parcel has no survey. */
  /** Buildings that are one structure and so stand on one floor level, by id. */
  structures?: string[][];
  terrain?: import('../render3d/terrain').Terrain | null;
} {
  const drawable = elements.filter(
    e => TYPE_COLORS[e.type] && e.geometry?.coordinates?.[0]?.length >= 4
  );
  if (drawable.length === 0)
    return {
      polygons: [], extent: 100, groundPaths: [], contextPolygons: [], trees: [],
      floorLines: [], slabs: [], windows: [], roofs: [], lawn: [], roofLines: [], lots: [], shrubs: [], walks: [], curbs: [], roads: [], stripes: [], cars: [], aerialAzimuth: -38, toLocal: p => p, origin: { latDeg: 0, lonDeg: 0 },
    };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of drawable) {
    for (const ring of el.geometry.coordinates) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // EPSG:3857 → ground metres: the drawing workspace's one frame (scene/frame)
  const frame = createGroundFrame(cx, cy);
  const m = (p: number[]): number[] => frame.toMeters(p);
  // A building's height comes from the one place a story count becomes a
  // height (scene/heights), so the model, the plan and the sheets agree.
  // Outdoor amenity pads (pool decks) are a paved surface, not a story.
  const propertiesOutdoor = (el: Element) =>
    el.properties?.outdoor === true || isOutdoorAmenityName(el.name);
  const heightOf = (el: Element) => {
    const outdoor = propertiesOutdoor(el);
    if (buildingUse(el) === 'amenity' && outdoor) {
      return {
        aboveGradeFt: OUTDOOR_DECK_HEIGHT_FT,
        basis: 'estimated' as const,
        label: 'Estimated height' as const,
        levelsFt: [OUTDOOR_DECK_HEIGHT_FT],
        assumption: null,
        note: 'Outdoor amenity pad: paved deck surface, not an enclosed story.',
      };
    }
    return buildingHeight(buildingUse(el), (el.properties?.floors as number) ?? (el.properties?.stories as number) ?? 1, el.properties?.heightFt);
  };

  const polygons: MassingPolygon[] = drawable.map(el => {
    const hazard = el.properties?.hazardKind;
    return {
      id: el.id,
      building: el.type === 'building',
      ...(el.type === 'building' && buildingUse(el) === 'house' ? { detached: true } : {}),
      kind: el.type === 'circulation' && el.name === 'Walk' ? 'walk' : el.properties?.kind === 'pond' ? 'pond' : pavementKind(el) ?? el.type,
      ...(isMappedAlley(el) ? { mappedAlley: true } : {}),
      ...(hazard === 'wetland' || hazard === 'floodplain' || hazard === 'floodway' || hazard === 'slope' ? { hazard } : {}),
      ...(isConstraintSource(el.properties?.constraintSource) ? { source: el.properties.constraintSource } : {}),
      ...(el.properties?.privateDrive === true || /private drive/i.test(el.name ?? '') ? { privateDrive: true } : {}),
      polygon: el.geometry.coordinates.map(ring => ring.map(m)),
      elevation: el.type === 'building' ? heightOf(el).aboveGradeFt * METERS_PER_FOOT : 0.15,
      color: TYPE_COLORS[el.type]!,
      label: el.type === 'building'
        ? (propertiesOutdoor(el)
          ? `${el.name ?? el.id} · outdoor deck`
          : `${el.name ?? el.id} · ${Math.max(1, Math.floor((el.properties?.floors as number) ?? 1))} floors`)
        : el.name ?? el.id,
    };
  });

  // Parcel + envelope outlines on the ground plane, in the SAME centred frame
  const groundPaths: Array<{ path: number[][]; color: [number, number, number, number]; widthM: number }> = [];
  const toLocal = (ring: number[][]) => ring.map(p => [...m(p), 0.05]);
  if (ground?.parcelRing && ground.parcelRing.length >= 4) {
    groundPaths.push({ path: toLocal(ground.parcelRing), color: [71, 85, 105, 255], widthM: 0.9 });
  }
  if (ground?.envelopeRing && ground.envelopeRing.length >= 4) {
    groundPaths.push({ path: toLocal(ground.envelopeRing), color: [37, 99, 235, 200], widthM: 0.5 });
  }
  // the unresolved connection sits at the same place the plan marks it
  if (ground?.accessBreak) {
    groundPaths.push({ path: toLocal([ground.accessBreak.from, ground.accessBreak.to]), color: [220, 38, 38, 255], widthM: 1.4 });
    // a ring round the end of the drive, so a short break still reads from across the site
    const [bx, by] = m(ground.accessBreak.from);
    const ring: number[][] = [];
    for (let i = 0; i <= 24; i++) ring.push([(bx ?? 0) + 6 * Math.cos((i / 24) * Math.PI * 2), (by ?? 0) + 6 * Math.sin((i / 24) * Math.PI * 2), 0.05]);
    groundPaths.push({ path: ring, color: [220, 38, 38, 255], widthM: 1.1 });
  }

  // Neighborhood context in the SAME centred frame: existing buildings as
  // white massing (ed_stories × 10 ft), neighbor parcels as ground plates.
  const contextPolygons: MassingPolygon[] = [];
  for (const p of ground?.contextParcels ?? []) {
    const ring = p.coordinates?.[0];
    if (!ring || ring.length < 4) continue;
    contextPolygons.push({
      polygon: [ring.map(m)],
      elevation: 0.05,
      color: [241, 245, 249, 160],
      label: 'Neighboring parcel',
    });
  }
  for (const b of ground?.contextBuildings ?? []) {
    const ring = b.polygon?.coordinates?.[0];
    if (!ring || ring.length < 4) continue;
    contextPolygons.push({
      polygon: [ring.map(m)],
      elevation: buildingHeightM(b.stories),
      color: [255, 255, 255, 235],
      label: `Existing · ${Math.max(1, Math.round(b.stories))} floors`,
    });
  }

  // Street trees mirror the 2D landscape pass: planted along FRONT property
  // edges at 10 m spacing (4 m end inset), skipping points near a drive so
  // the curb cut stays clear. Same rules, same trees — only the projection
  // into the centred frame differs.
  const trees: Array<{ position: [number, number]; radiusM?: number }> = [];
  if (ground?.treePoints) {
    for (const t of ground.treePoints) trees.push({ position: m(t.at) as [number, number], radiusM: t.radiusM });
  } else if (ground?.frontEdges?.length) {
    const driveRings = elements
      .filter(e => e.type === 'circulation')
      .map(e => e.geometry?.coordinates?.[0])
      .filter((r): r is number[][] => Array.isArray(r));
    const nearDrive = (x: number, y: number): boolean =>
      driveRings.some(ring => ring.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 8));
    for (const edge of ground.frontEdges) {
      for (const [tx, ty] of pointsAlongSegment(edge, 10, 4)) {
        if (nearDrive(tx, ty)) continue;
        trees.push({ position: m([tx, ty]) as [number, number] });
      }
    }
  }

  // Floor banding: a spandrel ring at the top of every story, the last at the
  // roof line. The levels are the scene's (scene/heights).
  const floorLines: Array<{ path: number[][] }> = [];
  for (const el of drawable) {
    if (el.type !== 'building') continue;
    const ring = el.geometry.coordinates[0];
    if (!ring || ring.length < 4) continue;
    const local = ring.map(m);
    for (const zFt of heightOf(el).levelsFt.slice(0, 30)) {
      const z = zFt * METERS_PER_FOOT;
      floorLines.push({ path: local.map(([x, y]) => [x, y, z]) });
    }
  }

  // The rendered buildings (architecture.ts). A house turns its front to the
  // nearest pavement; bays widen on a very large plan so the model stays light.
  const roofLines: Array<{ id: string; path: number[][] }> = [];
  const buildings = drawable.filter(el => el.type === 'building');
  const pavement: Array<[number, number]> = drawable
    .filter(el => el.type === 'circulation' || el.type === 'parking-aisle')
    .flatMap(el => densify((el.geometry.coordinates[0] ?? []).map(m)));
  const driveways = drawable.filter(el => pavementKind(el) === 'driveway')
    .map(el => (el.geometry.coordinates[0] ?? []).map(v => m(v) as [number, number]));
  const style = ground?.style ?? DEFAULT_STYLE;
  const roadFrontage = (ground?.contextRoads ?? []).flatMap(road => densify((road.line?.coordinates ?? []).map(m)));
  const frontage = roadFrontage.length ? roadFrontage : (ground?.frontEdges ?? []).flatMap(edge => densify(edge.map(m)));
  const outlines = buildings.map(el => (el.geometry.coordinates[0] ?? []).map(m));
  // A parking structure under the plan (a wrap's garage): its footprint, the height of its deck,
  // and where the engine puts its entries. The deck is as high as the parking levels of the
  // buildings that stand on it, read from the same story heights as everything else.
  const inside = (p: number[], ring: number[][]) => pointInPolygon(p[0] ?? 0, p[1] ?? 0, [ring]);
  const middleOf = (ring: number[][]) => [ring.reduce((t, q) => t + (q[0] ?? 0), 0) / Math.max(1, ring.length), ring.reduce((t, q) => t + (q[1] ?? 0), 0) / Math.max(1, ring.length)];
  const garages = drawable
    .filter(el => el.type === 'parking' && el.properties?.structured === true)
    .map(el => {
      const ring = (el.geometry.coordinates[0] ?? []).map(m);
      const levels = Math.max(1, Math.round(Number(el.properties?.levels) || 1));
      const deckM = (buildingHeight('apartments', levels).aboveGradeFt) * METERS_PER_FOOT;
      const entries = (Array.isArray(el.properties?.garageEntries) ? el.properties.garageEntries as number[][] : []).map(p => m(p));
      // the buildings of this structure: the bars the engine says stand over it, and any that touch it
      const bars = buildings.filter(b => b.properties?.overGarage === true || b.properties?.wrapBar != null).map(b => b.id);
      // what stands on the deck: a building wholly inside the garage's footprint that is not one of its bars
      const onDeck = buildings.filter(b => !bars.includes(b.id) && inside(middleOf((b.geometry.coordinates[0] ?? []).map(m)), ring)).map(b => b.id);
      return { id: el.id, label: el.name ?? 'Garage', ring, levels, deckM, entries, bars, onDeck };
    })
    .filter(g => g.ring.length >= 4);
  const garageOf = (el: Element) => garages.find(g => g.bars.includes(el.id)) ?? null;
  const deckUnder = (el: Element) => garages.find(g => g.onDeck.includes(el.id)) ?? null;
  // One structure stands on one floor level. A garage and everything on it is one structure; so
  // are larger buildings that stand against each other (the legs of an L, bars joined at a corner).
  // Houses and row homes are left out: a row steps down a slope home by home.
  const structures: string[][] = garages.map(g => [g.id, ...g.bars, ...g.onDeck]);
  const big = buildings.filter(b => { const u = buildingUse(b); return u === 'apartments' || u === 'amenity' || u === 'other'; });
  const ringOfBig = big.map(b => (b.geometry.coordinates[0] ?? []).map(m));
  const near = (A: number[][], B: number[][]) => A.some(q => inside(q, B) || B.some(r => Math.hypot((q[0] ?? 0) - (r[0] ?? 0), (q[1] ?? 0) - (r[1] ?? 0)) < 1.5));
  big.forEach((b, i) => {
    for (let j = i + 1; j < big.length; j++) {
      if (!near(ringOfBig[i]!, ringOfBig[j]!) && !near(ringOfBig[j]!, ringOfBig[i]!)) continue;
      const a = structures.find(s => s.includes(b.id)), c = structures.find(s => s.includes(big[j]!.id));
      if (a && c) { if (a !== c) { a.push(...c); structures.splice(structures.indexOf(c), 1); } }
      else if (a) a.push(big[j]!.id);
      else if (c) c.push(b.id);
      else structures.push([b.id, big[j]!.id]);
    }
  });
  const draw = (scale: number) => {
    const slabs: RenderSlab[] = [], windows: RenderWindow[] = [], roofs: RenderWindow[] = [];
    const shrubs: Array<[number, number, number]> = [];
    buildings.forEach((el, i) => {
      const rings = el.geometry.coordinates.map(r => r.map(m));
      if (isProvisionalPad(el)) {
        const pad = new Kit(el.id, PROVISIONAL_PAD);
        pad.mass(rings, 0, 0.25, mat(167, 165, 155, 'concrete'), 'base');
        slabs.push(...pad.done().slabs);
        return;
      }
      const outdoor = propertiesOutdoor(el);
      const label = outdoor
        ? `${el.name ?? el.id} · outdoor deck`
        : `${el.name ?? el.id} · ${Math.max(1, Math.floor((el.properties?.floors as number) ?? 1))} floors`;
      const use = buildingUse(el), properties = el.properties;
      const garage = garageOf(el), deck = deckUnder(el);
      const neighbours = outlines.filter((_, j) => j !== i);
      const design = findHome(properties.housingDesignId);
      const authored = design && Array.isArray(properties.homeOrigin) && Array.isArray(properties.homeAxis)
        ? placedArchitecture(design, el.id, label, m(properties.homeOrigin), m(properties.homeAxis), scale > 1.6, neighbours) : null;
      const a = authored ?? buildArchitecture(el.id, label, rings, use, heightOf(el), pavement, scale, style, neighbours, frontage,
        use === 'house' ? houseAccessFor(el, driveways) : undefined,
        garage ? { ring: garage.ring, deckM: garage.deckM, over: properties?.overGarage === true } : null);
      if (deck) {
        // it stands on the garage's deck, not on the ground under it
        for (const sl of a.slabs) for (const r of sl.polygon) for (const q of r) q[2] = (q[2] ?? 0) + deck.deckM;
        for (const f of [...a.glass, ...a.flats]) for (const q of f.polygon) q[2] = (q[2] ?? 0) + deck.deckM;
        a.shrubs.length = 0;
      }
      slabs.push(...a.slabs);
      windows.push(...a.glass);
      roofs.push(...a.flats);
      shrubs.push(...a.shrubs);
    });
    for (const g of garages) {
      // the garage itself: a concrete structure as high as its parking levels, with the deck on top
      slabs.push({ id: g.id, building: true, polygon: [g.ring.map(q => [q[0] ?? 0, q[1] ?? 0, 0])], elevation: g.deckM - 0.25, color: [176, 174, 168, 255], surface: 'concrete', part: 'base', label: g.label });
      slabs.push({ id: g.id, building: true, polygon: [g.ring.map(q => [q[0] ?? 0, q[1] ?? 0, g.deckM - 0.25])], elevation: 0.25, color: [198, 196, 190, 255], surface: 'concrete', part: 'detail', label: g.label });
      // planted courts on the deck are drawn on the deck
      for (const el of drawable) {
        if (el.type !== 'greenspace') continue;
        const ring = (el.geometry.coordinates[0] ?? []).map(m);
        if (ring.length < 4 || !inside(middleOf(ring), g.ring)) continue;
        slabs.push({ id: g.id, building: true, polygon: [ring.map(q => [q[0] ?? 0, q[1] ?? 0, g.deckM])], elevation: 0.12, color: [118, 142, 92, 255], surface: 'grass', part: 'detail', label: el.name ?? 'Court' });
      }
      // each entry: a dark portal in a concrete frame, standing where the engine puts the way in
      for (const e of g.entries) {
        let best: { a: number[]; b: number[]; d: number } | null = null;
        for (let i = 1; i < g.ring.length; i++) {
          const a = g.ring[i - 1]!, b = g.ring[i]!;
          const ex = (b[0] ?? 0) - (a[0] ?? 0), ey = (b[1] ?? 0) - (a[1] ?? 0), l2 = ex * ex + ey * ey || 1;
          const t = Math.max(0, Math.min(1, (((e[0] ?? 0) - (a[0] ?? 0)) * ex + ((e[1] ?? 0) - (a[1] ?? 0)) * ey) / l2));
          const d = Math.hypot((e[0] ?? 0) - ((a[0] ?? 0) + ex * t), (e[1] ?? 0) - ((a[1] ?? 0) + ey * t));
          if (!best || d < best.d) best = { a: [(a[0] ?? 0) + ex * t, (a[1] ?? 0) + ey * t], b: [ex / Math.sqrt(l2), ey / Math.sqrt(l2)], d };
        }
        if (!best) continue;
        const [px, py] = best.a as [number, number], [tx, ty] = best.b as [number, number];
        // outward is the side of the wall the entry point lies on
        const side = ((e[0] ?? 0) - px) * -ty + ((e[1] ?? 0) - py) * tx >= 0 ? 1 : -1;
        const nx = -ty * side, ny = tx * side;
        const half = 3.6, high = Math.min(3.2, g.deckM - 0.6);
        const quad = (s0: number, s1: number, d0: number, d1: number) => [[px + tx * s0 + nx * d0, py + ty * s0 + ny * d0], [px + tx * s1 + nx * d0, py + ty * s1 + ny * d0], [px + tx * s1 + nx * d1, py + ty * s1 + ny * d1], [px + tx * s0 + nx * d1, py + ty * s0 + ny * d1]];
        const part = (ring: number[][], z: number, h: number, color: [number, number, number, number], surface: NonNullable<RenderSlab['surface']>) =>
          slabs.push({ id: g.id, building: true, polygon: [ring.map(q => [q[0] ?? 0, q[1] ?? 0, z])], elevation: h, color, surface, part: 'detail', label: 'Garage entry' });
        part(quad(-half, half, -0.05, 0.12), 0, high, [30, 32, 36, 255], 'plain');
        part(quad(-half - 0.45, -half, -0.05, 0.4), 0, high + 0.45, [150, 148, 142, 255], 'concrete');
        part(quad(half, half + 0.45, -0.05, 0.4), 0, high + 0.45, [150, 148, 142, 255], 'concrete');
        part(quad(-half - 0.45, half + 0.45, -0.05, 0.4), high, 0.45, [150, 148, 142, 255], 'concrete');
      }
    }
    return { slabs, windows, roofs, shrubs };
  };
  const debug = typeof window !== 'undefined' && !!(window as unknown as { __renderDebug?: boolean }).__renderDebug;
  const t0 = debug ? performance.now() : 0;
  let model = draw(1);
  if (debug) console.info(`[time] buildings drawn once in ${Math.round(performance.now() - t0)} ms: ${model.slabs.length} solids, ${model.roofs.length} flats, ${model.windows.length} panes, ${buildings.length} buildings`);
  for (let scale = 1.5; model.windows.length + model.roofs.length + model.slabs.length > MAX_WINDOWS * 4 && scale <= 6; scale *= 1.5) model = draw(scale);
  const { slabs, windows, roofs, shrubs } = model;
  if (debug) console.info(`[time] buildings settled at ${Math.round(performance.now() - t0)} ms: ${slabs.length} solids, ${roofs.length} flats, ${windows.length} panes`);
  // walks and curbs follow the plan's own shapes
  const walks: Array<{ id: string; path: number[][]; widthM: number; strip: boolean }> = [];
  const curbs: Array<{ id: string; path: number[][]; guideOnly?: boolean }> = [];
  for (const el of drawable) {
    const kind = pavementKind(el);
    const guideOnly = el.type === 'road' || isMappedAlley(el);
    const use = el.type === 'building' ? buildingUse(el) : null;
    for (const [index, ring] of el.geometry.coordinates.entries()) {
      const path = ring.map(p => [...m(p)]);
      const id = `${el.id}:${index}`;
      if (!guideOnly && kind === 'street' && el.properties?.privateDrive !== true && !/private drive/i.test(el.name ?? '')) {
        walks.push({ id, path, widthM: 22 * METERS_PER_FOOT, strip: true });
      }
      if ((use === 'apartments' || use === 'amenity' || use === 'other') && !propertiesOutdoor(el)) {
        walks.push({ id, path, widthM: 12 * METERS_PER_FOOT, strip: false });
      }
      if (guideOnly) curbs.push({ id, path, guideOnly: true });
      else if (kind === 'drive' || (kind === 'street' && el.properties?.privateDrive !== true && !/private drive/i.test(el.name ?? ''))) curbs.push({ id, path });
    }
  }
  // stalls: stripes only where they show exactly the count the plan reports
  // (scene/sheetSvg stallStripes), and a car in about half of them
  const stripes: Array<{ path: number[][] }> = [];
  const cars: RenderSlab[] = [];
  const CAR_COLORS: Array<[number, number, number, number]> = [[236, 236, 234, 255], [52, 56, 62, 255], [150, 154, 160, 255], [122, 36, 36, 255], [40, 66, 104, 255], [196, 198, 200, 255]];
  const vehicleSeed = (id: string) => Array.from(id).reduce((hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  for (const el of drawable) {
    if (el.type !== 'parking' && el.type !== 'parking-bay') continue;
    const count = (el.properties?.parkingSpaces as number | undefined) ?? null;
    const ringM = (el.geometry.coordinates[0] ?? []).map(m);
    const FT = METERS_PER_FOOT;
    const layout = stallStripes(ringM.map(p => [(p[0] ?? 0) / FT, (p[1] ?? 0) / FT] as [number, number]), count);
    if (!layout) continue;
    for (const [u, v] of layout.lines) stripes.push({ path: [[u[0] * FT, u[1] * FT, 0.17], [v[0] * FT, v[1] * FT, 0.17]] });
    if (ground?.accessBreak || el.properties?.structured === true) continue;
    const rnd = seeded(vehicleSeed(el.id));
    layout.stalls.forEach((q, n) => {
      if (rnd() > 0.55) return;
      const [a, b, c, d] = q.map(p => [p[0] * FT, p[1] * FT] as [number, number]) as [[number, number], [number, number], [number, number], [number, number]];
      // the stall's own frame: w across it, l down its depth
      const mid = (p: [number, number], r: [number, number], t: number): [number, number] => [p[0] + (r[0] - p[0]) * t, p[1] + (r[1] - p[1]) * t];
      const box = (w0: number, w1: number, l0: number, l1: number): number[][] => {
        const p = (w: number, l: number) => mid(mid(a, b, w), mid(d, c, w), l);
        return [p(w0, l0), p(w1, l0), p(w1, l1), p(w0, l1), p(w0, l0)];
      };
      const color = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] ?? [200, 200, 200, 255];
      // Clearance inside the drawn stall, not a pre-sized toy car body.
      const body = box(0.04, 0.96, 0.05, 0.95);
      cars.push({ id: `car-${el.id}-${n}`, building: true, polygon: [body.map(p => [p[0], p[1], 0.3])], elevation: 0, color, part: 'detail', label: 'Illustrative parked vehicle' });
    });
  }
  // a car on about half of the driveways, along the drive
  for (const el of drawable) {
    if (pavementKind(el) !== 'driveway') continue;
    const r = (el.geometry.coordinates[0] ?? []).map(m);
    if (r.length !== 5) continue;
    const [a, b, c, d] = r.slice(0, 4).map(p => [p[0] ?? 0, p[1] ?? 0] as [number, number]) as [[number, number], [number, number], [number, number], [number, number]];
    const lab = Math.hypot(b[0] - a[0], b[1] - a[1]), lbc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    // p0 to p1 and q0 to q1 are the long sides
    const [p0, p1, q0, q1, long, wide] = lab >= lbc ? [a, b, d, c, lab, lbc] : [b, c, a, d, lbc, lab];
    const rnd = seeded(vehicleSeed(el.id));
    if (long < 6.5 || wide < 2.6 || rnd() > 0.55) continue;
    const mid = (u: [number, number], v: [number, number], t: number): [number, number] => [u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t];
    const at = (l: number, w: number) => mid(mid(p0, p1, l), mid(q0, q1, l), w);
    const l0 = 0.5 - 2.6 / long, l1 = 0.5 + 2.6 / long, w0 = 0.5 - 1.23 / wide, w1 = 0.5 + 1.23 / wide;
    const body = [at(l0, w0), at(l1, w0), at(l1, w1), at(l0, w1), at(l0, w0)];
    const color = CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)] ?? [200, 200, 200, 255];
    cars.push({ id: `car-${el.id}`, building: true, polygon: [body.map(p => [p[0], p[1], 0.3])], elevation: 0, color, part: 'detail', label: 'Illustrative parked vehicle' });
  }
  const roads = (ground?.contextRoads ?? [])
    .filter(r => (r.line?.coordinates?.length ?? 0) >= 2)
    .map((r, i) => ({ id: `road-${i + 1}`, path: r.line.coordinates.map(p => [...m(p)]) }));
  // The plan's drives and lanes stop at the right-of-way line; the street's pavement is drawn from its
  // centre line and is narrower than the right-of-way. The apron across that strip is drawn here, so
  // the scheme's pavement meets the street. Illustration: the plan gives the mouth, not the apron.
  const mappedRoads = new Set(drawable.filter(el => el.type === 'road').map(el => el.id));
  const mouth = streetConnection(
    polygons.filter(q => !q.building && !q.mappedAlley && !mappedRoads.has(q.id ?? '') && PAVED.has(q.kind ?? '')).map(q => (q.polygon[0] ?? []).map(v => [v[0] ?? 0, v[1] ?? 0] as [number, number])),
    roads.map(r => r.path.map(v => [v[0] ?? 0, v[1] ?? 0] as [number, number])),
    // Where the record has no centre line for the street, the parcel line stands for it: a lane that
    // leaves the site leaves it across the line, and the mouth nearest the line is the way out.
    ground?.parcelRing && ground.parcelRing.length >= 3 ? [[...ground.parcelRing, ground.parcelRing[0]!].map(q => { const v = m(q); return [v[0] ?? 0, v[1] ?? 0] as [number, number]; })] : [],
  );
  if (mouth) polygons.push({ id: 'illustration:street-connection', kind: 'drive', polygon: [mouth], elevation: 0.15, color: TYPE_COLORS.circulation ?? [150, 150, 150, 255], label: 'Drive apron (illustration)' });
  for (const el of buildings) {
    const top = heightOf(el).aboveGradeFt * METERS_PER_FOOT + 0.05;
    for (const ring of el.geometry.coordinates) roofLines.push({ id: el.id, path: ring.map(p => [...m(p), top]) });
  }

  const lawn: MassingPolygon[] = ground?.parcelRing && ground.parcelRing.length >= 4
    ? [{ polygon: [ground.parcelRing.map(m)], elevation: 0.06, color: [206, 222, 188, 255], label: 'Site' }]
    : [];

  const lots = elements
    .filter(e => /^Lot \d+$/.test(e.name ?? '') && (e.geometry?.coordinates?.[0]?.length ?? 0) >= 4)
    .map(e => (e.geometry.coordinates[0] ?? []).map(m));

  const { lonDeg, latDeg } = frame;

  const extent = Math.max((maxX - minX) * frame.kx, (maxY - minY) * frame.ky, 10);
  const terrain = ground?.topo ? makeTerrain(ground.topo, q => { const v = m(point2274To3857(q)); return [v[0] ?? 0, v[1] ?? 0]; }) : null;
  return { polygons, extent, groundPaths, contextPolygons, trees, floorLines, slabs, windows, roofs, lawn, roofLines, lots, shrubs, walks, curbs, roads, stripes, cars, vehicleAccessBreak: !!ground?.accessBreak, toLocal: m, origin: { latDeg, lonDeg }, structures, terrain,
    aerialAzimuth: clearestAzimuth(
      contextPolygons.filter(c => c.elevation > 1).map(c => {
        const r = c.polygon[0] ?? [];
        const n = Math.max(1, r.length);
        return [r.reduce((a, p) => a + (p[0] ?? 0), 0) / n, r.reduce((a, p) => a + (p[1] ?? 0), 0) / n, c.elevation] as [number, number, number];
      }),
      extent / 2,
    ),
  };
}

/** Points along a ring no more than 4 m apart: a long drive has few corners,
 *  and a house looks for the pavement nearest its door. */
function densify(ring: number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (!a || !b) continue;
    const ax = a[0] ?? 0, ay = a[1] ?? 0, bx = b[0] ?? 0, by = b[1] ?? 0;
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** The plan's paved kinds: what a car drives or parks on. */
const PAVED = new Set(['drive', 'parking-aisle', 'circulation', 'parking', 'parking-bay', 'driveway', 'street', 'alley', 'road']);
/** Half the width the street's pavement is drawn at, metres (render3d/siteScene lays a 7.3 m ribbon). */
const STREET_HALF_M = 3.65;

/**
 * The apron that joins the scheme's pavement to the street: from the edge of the plan's pavement that
 * faces the nearest street and lies closest to it, straight out to the street's pavement. Null when
 * the pavement already reaches the street, when no street is near, or when no edge is a drive's mouth.
 */
export function streetConnection(paved: Array<Array<[number, number]>>, roads: Array<Array<[number, number]>>, fronts: Array<Array<[number, number]>> = []): Array<[number, number]> | null {
  // With a centre line the apron runs to the street's pavement. Without one it runs to the parcel
  // line and a lane's width past it, onto the street the scene draws beyond the parcel.
  const byLine = roads.length > 0;
  const targets = byLine ? roads : fronts;
  if (!targets.length) return null;
  const reaches = (x: number, y: number): { d: number; q: [number, number] } => {
    let d = Infinity, q: [number, number] = [x, y];
    for (const line of targets) for (let i = 0; i + 1 < line.length; i++) {
      const p0 = line[i]!, p1 = line[i + 1]!;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - p0[0]) * dx + (y - p0[1]) * dy) / l2));
      const fx = p0[0] + dx * t, fy = p0[1] + dy * t, dist = Math.hypot(x - fx, y - fy);
      if (dist < d) { d = dist; q = [fx, fy]; }
    }
    return { d, q };
  };
  const inside = (x: number, y: number, ring: Array<[number, number]>): boolean => {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!;
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
    }
    return hit;
  };
  let best: { a: [number, number]; b: [number, number]; n: [number, number]; d: number } | null = null;
  for (const ring of paved) {
    // pavement that already lies on the street's pavement needs no apron; another piece still may
    if (byLine && ring.some(p => reaches(p[0], p[1]).d < STREET_HALF_M + 0.3)) continue;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      // a drive's mouth: about a lane to two lanes wide
      if (len < 3 || len > 11) continue;
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      // the way out of the pavement across this edge
      let n: [number, number] = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
      if (inside(mx + n[0] * 0.3, my + n[1] * 0.3, ring)) n = [-n[0], -n[1]];
      const r = reaches(mx, my);
      if (r.d > (byLine ? 45 : 12)) continue;
      // the street lies ahead of the mouth, not off to one side of it
      if (r.d > 0.5 && ((r.q[0] - mx) * n[0] + (r.q[1] - my) * n[1]) / r.d < 0.6) continue;
      if (!best || r.d < best.d) best = { a, b, n, d: r.d };
    }
  }
  if (!best) return null;
  const reach = byLine ? best.d - STREET_HALF_M + 0.6 : best.d + 6;
  if (reach < 0.9) return null;
  return [best.a, best.b, [best.b[0] + best.n[0] * reach, best.b[1] + best.n[1] * reach], [best.a[0] + best.n[0] * reach, best.a[1] + best.n[1] * reach]];
}
