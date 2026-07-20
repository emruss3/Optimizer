import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { PolygonLayer, PathLayer } from '@deck.gl/layers';
import type { Polygon, MultiPolygon } from 'geojson';
import type { Element } from '../../../engine/types';
import { buildMassingData, type MassingPolygon } from './massingData';
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

/**
 * 3D extruded massing of the current plan.
 * Uses a map-free OrbitView in local metres (no Mapbox token required), so it
 * works anywhere the plan does. Buildings extrude by floor count; parking,
 * circulation and open space render as flatwork; the parcel line and
 * buildable envelope ground the scene.
 */
const Massing3D: React.FC<{
  elements: Element[];
  parcelGeometry?: Polygon | MultiPolygon | null;
  envelope?: Polygon | null;
  /** Neighborhood context — existing buildings extrude as white massing */
  neighbors?: import('../api/neighbors').PlannerNeighbors | null;
}> = ({ elements, parcelGeometry, envelope, neighbors }) => {
  const { polygons, extent, groundPaths, contextPolygons } = useMemo(
    () =>
      buildMassingData(elements, {
        parcelRing: ringIn3857(parcelGeometry),
        envelopeRing: envelope?.coordinates?.[0],
        contextBuildings: neighbors?.buildings,
        contextParcels: neighbors?.parcels,
      }),
    [elements, parcelGeometry, envelope, neighbors]
  );

  const initialViewState = useMemo(
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
    ],
    [polygons, groundPaths, contextPolygons]
  );

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
        views={ORBIT_VIEW}
        initialViewState={initialViewState}
        controller={true}
        layers={layers}
        getTooltip={({ object }) =>
          object ? { text: (object as MassingPolygon).label } : null
        }
      />
      <div className="absolute bottom-2 left-2 text-[11px] text-gray-600 bg-white/80 rounded px-2 py-1 pointer-events-none">
        Drag to orbit · scroll to zoom
      </div>
    </div>
  );
};

export default Massing3D;
