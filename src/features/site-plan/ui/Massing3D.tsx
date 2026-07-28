import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView, LightingEffect, AmbientLight, DirectionalLight } from '@deck.gl/core';
import { PolygonLayer, PathLayer, ColumnLayer } from '@deck.gl/layers';
import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import type { EdgeClassification } from '../../../engine/setbacks';
import { buildMassingData, type MassingPolygon } from './massingData';
import { sunPosition, SUN_DATES } from './sunPosition';
import { feature4326To3857 } from '../../../utils/reproject';
import { normalizeToPolygon } from '../../../engine/geometry';

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
const Massing3D: React.FC<{
  elements: Element[];
  parcelGeometry?: Polygon | MultiPolygon | null;
  envelope?: Polygon | null;
  /** Neighborhood context — existing buildings extrude as white massing */
  neighbors?: import('../api/neighbors').PlannerNeighbors | null;
  /** Front-edge classifications (3857) — street trees plant along fronts */
  edgeClassifications?: EdgeClassification[];
}> = ({ elements, parcelGeometry, envelope, neighbors, edgeClassifications }) => {
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
  const { polygons, extent, groundPaths, contextPolygons, trees, floorLines, origin } = useMemo(
    () =>
      buildMassingData(elements, {
        parcelRing: ringIn3857(parcelGeometry),
        envelopeRing: envelope?.coordinates?.[0],
        contextBuildings: neighbors?.buildings,
        contextParcels: neighbors?.parcels,
        frontEdges: (edgeClassifications ?? [])
          .filter(e => e.type === 'front' && e.edge.length >= 2)
          .map(e => [e.edge[0], e.edge[1]] as [number[], number[]]),
      }),
    [elements, parcelGeometry, envelope, neighbors, edgeClassifications]
  );

  const [viewState, setViewState] = useState<Record<string, unknown> | null>(null);
  const [sunKey, setSunKey] = useState('jun21');
  const [sunHour, setSunHour] = useState(12);
  const [shadows, setShadows] = useState(true);
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
    const ambient = new AmbientLight({ color: [255, 255, 255], intensity: sun.altitudeDeg > 0 ? 1.1 : 1.8 });
    if (sun.altitudeDeg <= 0) {
      // Sun below the horizon: flat ambient only — no fake daylight.
      return [new LightingEffect({ ambient })];
    }
    const sunLight = new DirectionalLight({
      color: [255, 250, 240],
      intensity: 1.6,
      direction: sun.direction,
      _shadow: shadows,
    });
    const effect = new LightingEffect({ ambient, sunLight });
    (effect as unknown as { shadowColor: number[] }).shadowColor = [0, 0, 0, 0.35];
    return [effect];
  }, [sun, shadows]);

  const layers = useMemo(
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
        getFillColor: (d: MassingPolygon) => d.color,
        getLineColor: [30, 41, 59, 255],
        getLineWidth: 0.3,
        lineWidthUnits: 'meters',
        pickable: true,
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
    [polygons, groundPaths, contextPolygons, trees, floorLines]
  );

  const snapshot = useCallback(() => {
    const canvas = deckRef.current?.deck?.canvas;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'massing.png';
    a.click();
  }, []);

  if (polygons.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-200">
        Generate a plan to see the 3D massing.
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
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
        }}
        getTooltip={({ object }) =>
          object ? { text: (object as MassingPolygon).label } : null
        }
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
            {key}
          </button>
        ))}
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
        Drag to orbit · scroll to zoom
      </div>
    </div>
  );
};

export default Massing3D;
