import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView, LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { PolygonLayer, PathLayer, ColumnLayer, SolidPolygonLayer } from '@deck.gl/layers';
import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import { buildMassingData, SITE_MATERIALS, type MassingPolygon } from './massingData';
import { groundShadow, type RenderSlab, type RenderWindow } from './renderModel';
import { sunPosition, SUN_DATES } from './sunPosition';
import { feature4326To3857 } from '../../../utils/reproject';
import { normalizeToPolygon } from '../../../engine/geometry';
import type { DrawingScene } from '../scene/types';
import { SceneInspector } from './SceneInspector';
import { RenderView } from '../render3d/RenderView';
import { useArchStyle } from './archStyle';

const ORBIT_VIEW = new OrbitView({ orbitAxis: 'Z' });

/** Parcel geometry arrives in either frame; the massing frame is 3857. */
function ringIn3857(geom: Polygon | MultiPolygon | undefined | null): number[][] | undefined {
  if (!geom) return undefined;
  try {
    const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
    const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
    return normalizeToPolygon(reprojected).coordinates[0];
  } catch {
    return undefined;
  }
}

interface Disc { polygon: number[][]; elevation: number; color: [number, number, number, number] }
/** A crown in five discs: height above the canopy's base and radius, both as a share of its radius. */
const CANOPY_PROFILE: Array<[number, number]> = [[0, 0.5], [0.24, 0.78], [0.48, 0.95], [0.72, 1], [0.96, 0.93], [1.2, 0.76], [1.44, 0.46]];

/** The selected building: darker and saturated, so it reads without colour too. */
const SELECTED_FILL: [number, number, number, number] = [234, 88, 12, 240];

/** Camera bookmarks: repeatable views for decks and comparisons. */
const CAMERA_BOOKMARKS: Record<string, { rotationX: number; rotationOrbit: number }> = {
  iso: { rotationX: 45, rotationOrbit: -30 },
  top: { rotationX: 89.9, rotationOrbit: 0 },
  street: { rotationX: 12, rotationOrbit: -55 },
};

/**
 * 3D extruded massing of the current plan.
 * Uses a map-free OrbitView in local metres (no Mapbox token required), so it
 * works anywhere the plan does. Buildings extrude by floor count with
 * spandrel lines at every floor; a sun-study light (solstice/equinox presets
 * × hour slider, positions from the scene's own latitude) casts real
 * shadows — the entitlement argument, not decoration. Parking, circulation
 * and open space render as flatwork; the parcel line and buildable envelope
 * ground the scene. Camera bookmarks + a PNG snapshot make the view a
 * shareable artifact.
 */
type Massing3DProps = {
  elements: Element[];
  parcelGeometry?: Polygon | MultiPolygon | null;
  envelope?: Polygon | null;
  /** Neighborhood context — existing buildings extrude as white massing */
  neighbors?: import('../api/neighbors').PlannerNeighbors | null;
  /** Front-edge classifications (3857) — street trees plant along fronts */
  edgeClassifications?: EdgeClassification[];
  /** The drawing scene of the plan on the sheet: the model's buildings carry
   *  its ids, and the inspector shows its values. */
  scene?: DrawingScene | null;
  /** The selected feature, shared with the plan. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
};

/** The deck.gl view: the original massing, and the fallback for the rendering. */
const DeckMassing: React.FC<Massing3DProps> = ({ elements, parcelGeometry, envelope, neighbors, edgeClassifications, scene, selectedId, onSelect }) => {
  // Order-6 item 5b (second head of the same bug): during a resize/teardown
  // race, luma's device probe reads `limits.maxTextureDimension2D` off an
  // undefined device and throws UNCAUGHT — it never reaches DeckGL's onError
  // (which already guards the routed form). Scoped window listener: recognize
  // exactly that signature while the 3D view is mounted, recover quietly.
  useEffect(() => {
    const onWindowError = (ev: ErrorEvent) => {
      if (String(ev.message ?? '').includes('maxTextureDimension2D')) {
        console.warn('[Massing3D] transient device probe during resize — recovered.');
        ev.preventDefault();
      }
    };
    window.addEventListener('error', onWindowError);
    return () => window.removeEventListener('error', onWindowError);
  }, []);
  const archStyle = useArchStyle();
  const { polygons, extent, groundPaths, contextPolygons, trees, floorLines, slabs, windows, roofs, lawn, roofLines, shrubs, walks, curbs, roads, stripes, cars, origin } = useMemo(
    () =>
      buildMassingData(elements, {
        style: archStyle,
        parcelRing: ringIn3857(parcelGeometry),
        envelopeRing: envelope?.coordinates?.[0],
        contextBuildings: neighbors?.buildings,
        contextParcels: neighbors?.parcels,
        ...(scene && neighbors?.roads ? { contextRoads: neighbors.roads } : {}),
        frontEdges: (edgeClassifications ?? [])
          .filter(e => e.type === 'front' && e.edge.length >= 2)
          .map(e => [e.edge[0], e.edge[1]] as [number[], number[]]),
        ...(scene ? { treePoints: scene.landscape.trees.map(t => ({ at: scene.frame.fromFeet(t.at), radiusM: t.radiusFt * 0.3048 })) } : {}),
      }),
    [elements, parcelGeometry, envelope, neighbors, edgeClassifications, scene, archStyle]
  );

  const [viewState, setViewState] = useState<Record<string, unknown> | null>(null);
  // The rendered view opens on an equinox afternoon: a raking light that
  // models the walls and casts a shadow. The original view keeps its noon.
  const [sunKey, setSunKey] = useState(scene ? 'mar21' : 'jun21');
  const [sunHour, setSunHour] = useState(scene ? 15 : 12);
  const [shadows, setShadows] = useState(true);
  // A renderer failure deck reports asynchronously (device lost, WebGL
  // unavailable) is re-thrown on the next render so the planner's boundary
  // catches it and offers Retry 3D / Back to 2D (the scope's P0.3). Left in
  // deck's own handler it only reached the console, over a blank canvas.
  const [fatal, setFatal] = useState<Error | null>(null);
  if (fatal) throw fatal;
  const deckRef = useRef<{ deck?: { canvas?: HTMLCanvasElement } } | null>(null);

  const baseViewState = useMemo(
    () => ({
      target: [0, 0, 0] as [number, number, number],
      rotationX: 45,
      rotationOrbit: -30,
      // OrbitView: scale = 2^zoom px per world unit; fit extent into ~480px.
      zoom: Math.log2(Math.max(1e-3, 480 / extent)),
      minZoom: -5,
      maxZoom: 10,
    }),
    [extent]
  );

  const sun = useMemo(() => {
    const day = SUN_DATES.find(d => d.key === sunKey)?.dayOfYear ?? 172;
    return sunPosition(day, sunHour, origin.latDeg);
  }, [sunKey, sunHour, origin.latDeg]);

  const effects = useMemo(() => {
    // the rendered view is lit softer: its materials are light, and the original
    // levels wash a pale wall or a lawn out to white
    const soft = !!scene;
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: sun.altitudeDeg > 0 ? (soft ? 0.78 : 1.1) : (soft ? 1.15 : 1.8) });
    if (sun.altitudeDeg <= 0) {
      // Sun below the horizon: flat ambient only — no fake daylight.
      return [new LightingEffect({ ambient })];
    }
    const sunLight = new DirectionalLight({
      color: [255, 250, 240],
      intensity: soft ? 1.0 : 1.6,
      direction: sun.direction,
      // the rendered view draws its own shadows (below): the effect's shadow map
      // throws a false band across the site at a low sun in this view
      _shadow: shadows && !soft,
    });
    const effect = new LightingEffect({ ambient, sunLight });
    (effect as unknown as { shadowColor: number[] }).shadowColor = [0, 0, 0, soft ? 0.3 : 0.35];
    return [effect];
  }, [sun, shadows, scene]);

  // The original massing view: flat colours, one solid a building. Drawn when
  // there is no scene (`?drawing=classic`).
  const classicLayers = useMemo(
    () => [
      // White context massing under everything — the block the plan lives in
      new PolygonLayer<MassingPolygon>({
        id: 'context-massing',
        data: contextPolygons,
        extruded: true,
        getPolygon: (d: MassingPolygon) => d.polygon,
        getElevation: (d: MassingPolygon) => d.elevation,
        getFillColor: (d: MassingPolygon) => d.color,
        getLineColor: [203, 213, 225, 255],
        getLineWidth: 0.25,
        lineWidthUnits: 'meters',
        pickable: false,
      }),
      new PathLayer({
        id: 'ground-lines',
        data: groundPaths,
        getPath: (d: { path: number[][] }) => d.path,
        getColor: (d: { color: [number, number, number, number] }) => d.color,
        getWidth: (d: { widthM: number }) => d.widthM,
        widthUnits: 'meters',
        widthMinPixels: 1,
      }),
      new PolygonLayer<MassingPolygon>({
        id: 'massing',
        data: polygons,
        extruded: true,
        getPolygon: (d: MassingPolygon) => d.polygon,
        getElevation: (d: MassingPolygon) => d.elevation,
        getFillColor: (d: MassingPolygon) => (d.building && d.id === selectedId ? SELECTED_FILL : d.color),
        getLineColor: [30, 41, 59, 255],
        getLineWidth: 0.3,
        lineWidthUnits: 'meters',
        pickable: true,
        updateTriggers: { getFillColor: [selectedId] },
      }),
      // Spandrel rings at every floor line + parapet: the slab reads as a
      // building. Same arithmetic as the extrusion heights.
      new PathLayer({
        id: 'floor-lines',
        data: floorLines,
        getPath: (d: { path: number[][] }) => d.path,
        getColor: [30, 41, 59, 110],
        getWidth: 0.18,
        widthUnits: 'meters',
        widthMinPixels: 1,
      }),
      // Street trees: stylized trunk + canopy cylinders at the SAME points
      // the 2D landscape pass plants (front edges, drive corridor skipped).
      new ColumnLayer<{ position: [number, number] }>({
        id: 'tree-trunks',
        data: trees,
        diskResolution: 6,
        radius: 0.3,
        extruded: true,
        getPosition: d => d.position,
        getElevation: 2.5,
        getFillColor: [120, 83, 52, 255],
        pickable: false,
      }),
      new ColumnLayer<{ position: [number, number] }>({
        id: 'tree-canopies',
        data: trees,
        diskResolution: 8,
        radius: 2.2,
        extruded: true,
        getPosition: d => d.position,
        getElevation: 6.5,
        getFillColor: [74, 160, 90, 200],
        pickable: false,
      }),
    ],
    [polygons, groundPaths, contextPolygons, trees, floorLines, selectedId]
  );
  // Canopies and shrubs as stacked discs. A canopy of radius R sits on a trunk
  // and swells to R a third of the way up; a shrub is two low discs.
  const planting = useMemo(() => {
    const out: Disc[] = [];
    const disc = (x: number, y: number, z: number, r: number, h: number, color: [number, number, number, number]) => {
      const polygon: number[][] = [];
      for (let i = 0; i < 12; i++) polygon.push([x + Math.cos((i * Math.PI) / 6) * r, y + Math.sin((i * Math.PI) / 6) * r, z]);
      out.push({ polygon, elevation: h, color });
    };
    trees.forEach((t, n) => {
      const R = t.radiusM ?? 2.6;
      const tone = (n * 37) % 22;
      CANOPY_PROFILE.forEach(([rz, rr], k) => disc(t.position[0], t.position[1], R * (0.75 + rz), R * rr, R * 0.26, [88 + tone + k * 5, 134 + tone + k * 4, 76 + tone / 2 + k * 3, 255]));
    });
    shrubs.forEach(([x, y, r], n) => {
      const tone = (n * 29) % 18;
      disc(x, y, 0.1, r, 0.45, [84 + tone, 128 + tone, 76 + tone / 2, 255]);
      disc(x, y, 0.5, r * 0.7, 0.3, [98 + tone, 144 + tone, 86 + tone / 2, 255]);
    });
    return out;
  }, [trees, shrubs]);

  // The rendered view: buildings as stacked stories in their materials with
  // window bays, on a planted site with pavement, among the block's existing
  // buildings in white. Heights and footprints are the scene's; the facades
  // are illustration and the view says so.
  const renderedLayers = useMemo(
    () => [
      new PolygonLayer<MassingPolygon>({
        id: 'context-massing',
        data: contextPolygons,
        extruded: true,
        getPolygon: (d: MassingPolygon) => d.polygon,
        getElevation: (d: MassingPolygon) => d.elevation,
        getFillColor: (d: MassingPolygon) => (d.elevation < 1 ? [233, 231, 224, 255] : [249, 248, 245, 255]),
        getLineColor: [214, 211, 203, 255],
        getLineWidth: 0.2,
        lineWidthUnits: 'meters',
        material: { ambient: 0.8, diffuse: 0.4, shininess: 4 },
        pickable: false,
      }),
      new PolygonLayer<MassingPolygon>({
        id: 'site-lawn',
        data: lawn,
        extruded: true,
        getPolygon: (d: MassingPolygon) => d.polygon,
        getElevation: (d: MassingPolygon) => d.elevation,
        getFillColor: (d: MassingPolygon) => d.color,
        material: { ambient: 0.62, diffuse: 0.45, shininess: 2 },
        pickable: false,
      }),
      // the block's streets: a walk, a planted strip and the roadway on the centre line
      ...([[13.4, [222, 218, 206, 255], 0.03], [10.6, [206, 220, 190, 255], 0.04], [7.3, [140, 140, 138, 255], 0.05]] as Array<[number, [number, number, number, number], number]>).map(
        ([w, color, z], n) =>
          new PathLayer<{ path: number[][] }>({
            id: `context-road-${n}`,
            data: roads,
            getPath: (d: { path: number[][] }) => d.path.map(p => [p[0] ?? 0, p[1] ?? 0, z]) as never,
            getColor: color,
            getWidth: w,
            widthUnits: 'meters',
            capRounded: true,
            jointRounded: true,
          }),
      ),
      // walks, wide lines under what they follow: the half outside shows
      new PathLayer<{ path: number[][]; widthM: number; strip: boolean }>({
        id: 'site-walks',
        data: walks,
        getPath: (d: { path: number[][] }) => d.path.map(p => [p[0] ?? 0, p[1] ?? 0, 0.09]) as never,
        getColor: [226, 222, 210, 255],
        getWidth: (d: { widthM: number }) => d.widthM,
        widthUnits: 'meters',
        jointRounded: true,
      }),
      new PathLayer<{ path: number[][]; widthM: number; strip: boolean }>({
        id: 'site-strips',
        data: walks.filter(w => w.strip),
        getPath: (d: { path: number[][] }) => d.path.map(p => [p[0] ?? 0, p[1] ?? 0, 0.11]) as never,
        getColor: [206, 222, 188, 255],
        getWidth: (d: { widthM: number }) => d.widthM / 2,
        widthUnits: 'meters',
        jointRounded: true,
      }),
      new PolygonLayer<MassingPolygon>({
        id: 'site-flatwork',
        data: polygons.filter(p => !p.building),
        extruded: true,
        getPolygon: (d: MassingPolygon) => d.polygon,
        getElevation: (d: MassingPolygon) => d.elevation,
        getFillColor: (d: MassingPolygon) => SITE_MATERIALS[d.kind ?? ''] ?? d.color,
        material: { ambient: 0.62, diffuse: 0.45, shininess: 2 },
        pickable: true,
      }),
      new PathLayer<{ path: number[][] }>({
        id: 'site-curbs',
        data: curbs,
        getPath: (d: { path: number[][] }) => d.path.map(p => [p[0] ?? 0, p[1] ?? 0, 0.17]) as never,
        getColor: [232, 230, 222, 255],
        getWidth: 0.22,
        widthUnits: 'meters',
        widthMinPixels: 0.6,
      }),
      new PathLayer<{ path: number[][] }>({
        id: 'stall-stripes',
        data: stripes,
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: [246, 246, 242, 255],
        getWidth: 0.12,
        widthUnits: 'meters',
        widthMinPixels: 0.5,
      }),
      new SolidPolygonLayer<RenderSlab>({
        id: 'parked-cars',
        data: cars,
        extruded: true,
        getPolygon: (d: RenderSlab) => d.polygon as never,
        getElevation: (d: RenderSlab) => d.elevation,
        getFillColor: (d: RenderSlab) => d.color,
        material: { ambient: 0.7, diffuse: 0.45, shininess: 40, specularColor: [90, 90, 90] },
        pickable: false,
      }),
      new PathLayer({
        id: 'ground-lines',
        data: groundPaths.slice(0, 1),
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: [70, 76, 84, 255],
        getWidth: 0.35,
        widthUnits: 'meters',
        widthMinPixels: 1,
      }),
      new SolidPolygonLayer<RenderSlab>({
        id: 'building-slabs',
        data: slabs,
        extruded: true,
        getPolygon: (d: RenderSlab) => d.polygon as never,
        getElevation: (d: RenderSlab) => d.elevation,
        getFillColor: (d: RenderSlab) => d.color,
        material: { ambient: 0.8, diffuse: 0.42, shininess: 12, specularColor: [30, 30, 30] },
        pickable: true,
      }),
      new SolidPolygonLayer<RenderWindow>({
        id: 'building-windows',
        data: windows,
        extruded: false,
        _full3d: true,
        getPolygon: (d: RenderWindow) => d.polygon as never,
        getFillColor: (d: RenderWindow) => d.color,
        material: { ambient: 0.7, diffuse: 0.35, shininess: 80, specularColor: [150, 165, 180] },
        pickable: false,
      }),
      new SolidPolygonLayer<RenderWindow>({
        id: 'building-roofs',
        data: roofs,
        extruded: false,
        _full3d: true,
        getPolygon: (d: RenderWindow) => d.polygon as never,
        getFillColor: (d: RenderWindow) => d.color,
        material: { ambient: 0.75, diffuse: 0.5, shininess: 6 },
        pickable: false,
      }),
      // story lines: a thin shadow line at each floor, so the stories read
      new PathLayer({
        id: 'floor-lines',
        data: floorLines,
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: [60, 56, 50, 70],
        getWidth: 0.1,
        widthUnits: 'meters',
        widthMinPixels: 0.5,
      }),
      // the selected building: an outline at its roof line, the material kept
      new PathLayer({
        id: 'selection-outline',
        data: roofLines.filter(r => r.id === selectedId),
        getPath: (d: { path: number[][] }) => d.path as never,
        getColor: [234, 88, 12, 255],
        getWidth: 0.6,
        widthUnits: 'meters',
        widthMinPixels: 3,
      }),
      new ColumnLayer<{ position: [number, number] }>({
        id: 'tree-trunks',
        data: trees,
        diskResolution: 6,
        radius: 0.22,
        extruded: true,
        getPosition: d => d.position,
        getElevation: 3.2,
        getFillColor: [104, 82, 62, 255],
        pickable: false,
      }),
      // canopies and shrubs: stacked discs that swell and close like a crown
      new SolidPolygonLayer<Disc>({
        id: 'planting',
        data: planting,
        extruded: true,
        getPolygon: (d: Disc) => d.polygon as never,
        getElevation: (d: Disc) => d.elevation,
        getFillColor: (d: Disc) => d.color,
        material: { ambient: 0.72, diffuse: 0.45, shininess: 4 },
        pickable: false,
      }),
    ],
    [polygons, groundPaths, contextPolygons, trees, floorLines, slabs, windows, roofs, lawn, roofLines, walks, curbs, roads, stripes, cars, planting, selectedId]
  );
  const rendered = !!scene;
  // Shadows on the ground, from each building's footprint and height and the
  // sun's position: one polygon a building, under the buildings and the trees.
  const shadowLayer = useMemo(() => {
    if (!rendered || !shadows || sun.altitudeDeg <= 3) return null;
    const tops = new Map<string, number>();
    for (const sl of slabs) tops.set(sl.id, Math.max(tops.get(sl.id) ?? 0, (sl.polygon[0]?.[0]?.[2] ?? 0) + sl.elevation));
    const seen = new Set<string>();
    const data: Array<{ polygon: number[][] }> = [];
    for (const sl of slabs) {
      if (sl.part !== 'base' || seen.has(sl.id)) continue;
      seen.add(sl.id);
      const ring = sl.polygon[0];
      const poly = ring ? groundShadow(ring, tops.get(sl.id) ?? 0, sun.direction) : null;
      if (poly) data.push({ polygon: poly });
    }
    for (const t of trees) {
      const R = (t.radiusM ?? 2.6) * 0.9;
      const disc = Array.from({ length: 10 }, (_, i) => [t.position[0] + Math.cos((i * Math.PI) / 5) * R, t.position[1] + Math.sin((i * Math.PI) / 5) * R]);
      const poly = groundShadow(disc, R * 2.2, sun.direction);
      if (poly) data.push({ polygon: poly });
    }
    return new SolidPolygonLayer<{ polygon: number[][] }>({
      id: 'ground-shadows',
      data,
      extruded: false,
      getPolygon: (d: { polygon: number[][] }) => d.polygon as never,
      getFillColor: [28, 34, 44, 46],
      material: false,
      pickable: false,
    });
  }, [rendered, shadows, sun, slabs, trees]);
  const layers = useMemo(() => {
    if (!rendered) return classicLayers;
    if (!shadowLayer) return renderedLayers;
    // above the lawn and the pavement, below everything that stands up
    const i = renderedLayers.findIndex(l => l.id === 'building-slabs');
    return [...renderedLayers.slice(0, i), shadowLayer, ...renderedLayers.slice(i)];
  }, [rendered, classicLayers, renderedLayers, shadowLayer]);


  const snapshot = useCallback(() => {
    const canvas = deckRef.current?.deck?.canvas;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'massing.png';
    a.click();
  }, []);

  const sceneBuildings = scene?.buildings ?? [];
  const selected = selectedId ? sceneBuildings.find(b => b.id === selectedId) ?? null : null;
  const tagged = sceneBuildings.filter(b => b.tagOnPlan);

  if (polygons.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        Generate a plan to see the 3D massing.
      </div>
    );
  }

  return (
    <div
      data-testid="massing-3d"
      data-scene-key={scene?.identity.key ?? ''}
      data-rendered={rendered ? 'true' : 'false'}
      className="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200"
      style={rendered ? { background: 'linear-gradient(180deg, #cfe0ee 0%, #e9eff3 38%, #efeee8 62%, #e9e7df 100%)' } : undefined}
    >
      <DeckGL
        ref={deckRef as never}
        views={ORBIT_VIEW}
        viewState={(viewState ?? baseViewState) as never}
        onViewStateChange={({ viewState: vs }: { viewState: unknown }) =>
          setViewState(vs as Record<string, unknown>)
        }
        controller={true}
        layers={layers}
        effects={effects}
        glOptions={{ preserveDrawingBuffer: true } as never}
        // Order-5 item 2b: deck's device probe crashes on resize when the
        // context is mid-recreate (reading 'maxTextureDimension2D' of
        // undefined). A guarded onError keeps the probe failure from
        // unmounting the view — the next frame re-acquires the device; any
        // other error still surfaces.
        onError={(err: Error) => {
          if (String(err?.message ?? err).includes('maxTextureDimension2D')) {
            console.warn('[Massing3D] transient device probe during resize — recovered.');
            return;
          }
          console.error('[Massing3D]', err);
          setFatal(err instanceof Error ? err : new Error(String(err)));
        }}
        onClick={(info: { object?: unknown }) => {
          if (!onSelect) return;
          const o = info.object as MassingPolygon | undefined;
          onSelect(o?.building && o.id ? o.id : null);
        }}
        getTooltip={({ object }) => {
          const o = object as MassingPolygon | undefined;
          if (!o) return null;
          const b = o.building ? sceneBuildings.find(x => x.id === o.id) : undefined;
          return { text: b ? `${b.display.title} · ${b.display.floors} · ${b.display.heightLabel.toLowerCase()} ${b.display.height}` : o.label };
        }}
      />
      {/* Sun study + camera controls */}
      <div className="absolute top-2 left-2 flex items-center gap-2 bg-white/90 rounded-lg px-2 py-1.5 text-[11px] text-gray-700 shadow-sm">
        <select
          value={sunKey}
          onChange={e => setSunKey(e.target.value)}
          className="border border-gray-200 rounded px-1 py-0.5 bg-white"
          aria-label="Sun study date"
          data-testid="sun-date"
        >
          {SUN_DATES.map(d => (
            <option key={d.key} value={d.key}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          type="range"
          min={6}
          max={20}
          step={0.5}
          value={sunHour}
          onChange={e => setSunHour(Number(e.target.value))}
          className="w-24"
          aria-label="Solar hour"
          data-testid="sun-hour"
        />
        <span className="tabular-nums w-14">
          {sun.altitudeDeg > 0
            ? `${String(Math.floor(sunHour)).padStart(2, '0')}:${sunHour % 1 ? '30' : '00'} · ${Math.round(sun.altitudeDeg)}°`
            : 'night'}
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={shadows} onChange={e => setShadows(e.target.checked)} />
          shadows
        </label>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm">
        {Object.entries(CAMERA_BOOKMARKS).map(([key, cam]) => (
          <button
            key={key}
            onClick={() => setViewState({ ...(viewState ?? baseViewState), ...cam })}
            className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700 capitalize"
            data-testid={`camera-${key}`}
          >
            {rendered && key === 'iso' ? 'Aerial' : key}
          </button>
        ))}
        {rendered && (
          <>
            <button
              onClick={() => setViewState({ ...(viewState ?? baseViewState), target: baseViewState.target, zoom: baseViewState.zoom })}
              className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700"
              title="Bring the whole site back into view, keeping the angle"
              data-testid="camera-fit"
            >
              Fit site
            </button>
            {[[-45, 'Turn left', '⟲'], [45, 'Turn right', '⟳']].map(([step, label, glyph]) => (
              <button
                key={label}
                onClick={() => {
                  const vs = (viewState ?? baseViewState) as { rotationOrbit?: number };
                  setViewState({ ...(viewState ?? baseViewState), rotationOrbit: (vs.rotationOrbit ?? 0) + (step as number) });
                }}
                className="px-1.5 py-0.5 rounded hover:bg-gray-100 text-gray-700"
                title={`${label} 45°`}
                aria-label={`${label} 45 degrees`}
                data-testid={`camera-turn-${(step as number) < 0 ? 'left' : 'right'}`}
              >
                {glyph}
              </button>
            ))}
          </>
        )}
        <button
          onClick={snapshot}
          className="px-1.5 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-700"
          title="Download the current view as PNG"
          data-testid="massing-snapshot"
        >
          PNG
        </button>
      </div>
      <div className="absolute bottom-2 left-2 text-[11px] text-gray-600 bg-white/80 rounded px-2 py-1 pointer-events-none">
        Drag to orbit · scroll to zoom{onSelect && tagged.length > 0 ? ' · click a building' : ''}
        {rendered && slabs.length > 0 ? ' · facades are illustrative' : ''}
      </div>
      {/* The buildings of the scene by tag: selection without a pointer, and
          the same tags the plan and the sheets carry. */}
      {onSelect && tagged.length > 0 && (
        <div className="absolute top-11 right-2 flex flex-wrap justify-end items-center gap-1 max-w-[50%] bg-white/90 rounded-lg px-1.5 py-1 text-[11px] shadow-sm" role="group" aria-label="Buildings">
          <span className="text-gray-500 px-0.5">Buildings</span>
          {tagged.slice(0, 16).map(b => (
            <button
              key={b.id}
              type="button"
              aria-pressed={b.id === selectedId}
              title={b.display.oneLine}
              onClick={() => onSelect(b.id === selectedId ? null : b.id)}
              data-testid={`scene-select-${b.tag}`}
              className={`h-5 min-w-5 px-1 rounded-full border text-[11px] font-bold ${b.id === selectedId ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-900 border-gray-400 hover:border-gray-900'}`}
            >
              {b.tag}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <SceneInspector building={selected} onClose={onSelect ? () => onSelect(null) : undefined} className="absolute right-2 bottom-2" />
      )}
    </div>
  );
};

/**
 * The 3D view of the plan. With a drawing scene it is the rendering
 * (render3d/RenderView); without one (`?drawing=classic`), or on a device that
 * cannot draw the rendering, it is the deck.gl view above.
 */
const Massing3D: React.FC<Massing3DProps> = props => {
  const [failed, setFailed] = useState<Error | null>(null);
  const onFail = useCallback((err: Error) => {
    console.warn('[3D] the rendering is not available on this device; showing the massing view.', err);
    setFailed(err);
  }, []);
  if (props.scene && !failed && props.elements.length > 0) {
    return (
      <RenderView
        elements={props.elements}
        parcelRing={ringIn3857(props.parcelGeometry)}
        envelopeRing={props.envelope?.coordinates?.[0]}
        neighbors={props.neighbors}
        edgeClassifications={props.edgeClassifications}
        scene={props.scene}
        selectedId={props.selectedId}
        onSelect={props.onSelect}
        onFail={onFail}
      />
    );
  }
  return <DeckMassing {...props} />;
};

export default Massing3D;
