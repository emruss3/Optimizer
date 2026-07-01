import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView } from '@deck.gl/core';
import { PolygonLayer } from '@deck.gl/layers';
import type { Element } from '../../../engine/types';
import { buildMassingData, type MassingPolygon } from './massingData';

const ORBIT_VIEW = new OrbitView({ orbitAxis: 'Z' });

/**
 * 3D extruded massing of the current plan.
 * Uses a map-free OrbitView in local metres (no Mapbox token required), so it
 * works anywhere the plan does. Buildings extrude by floor count; parking,
 * circulation and open space render as flatwork.
 */
const Massing3D: React.FC<{ elements: Element[] }> = ({ elements }) => {
  const { polygons, extent } = useMemo(() => buildMassingData(elements), [elements]);

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
    [polygons]
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
