import React, { useState, lazy, Suspense } from 'react';
import { Layers, TrendingUp, Map as MapIcon, Activity, Eye, EyeOff } from 'lucide-react';

// Dynamic imports for deck.gl to keep initial bundle small
const DeckGL = lazy(() => import('@deck.gl/react').then(module => ({ default: module.DeckGL })));
const HexagonLayer = lazy(() => import('@deck.gl/aggregation-layers').then(module => ({ default: module.HexagonLayer })));
const HeatmapLayer = lazy(() => import('@deck.gl/aggregation-layers').then(module => ({ default: module.HeatmapLayer })));

interface OverlayLayersProps {
  viewport: any;
  onViewportChange: (viewport: any) => void;
  parcels: any[];
}

export default function OverlayLayers({ viewport, onViewportChange, parcels }: OverlayLayersProps) {
  const [activeLayers, setActiveLayers] = useState({
    heatmap: false,
    hexagon: false,
    traffic: false,
    density: false
  });

  // Process parcel data for heatmap (sale_price_ft2)
  const heatmapData = React.useMemo(() => {
    return parcels
      .filter(p => p.saleprice && p.sqft && p.lat && p.lon)
      .map(p => ({
        position: [parseFloat(p.lon), parseFloat(p.lat)],
        weight: (p.saleprice / p.sqft) || 0 // Price per sq ft
      }));
  }, [parcels]);

  // Process data for hexagon layer (traffic/density simulation)
  const hexagonData = React.useMemo(() => {
    return parcels
      .filter(p => p.lat && p.lon)
      .map(p => ({
        position: [parseFloat(p.lon), parseFloat(p.lat)],
        // Simulate traffic based on zoning and property value
        value: getTrafficWeight(p.zoning, p.parval)
      }));
  }, [parcels]);

  const toggleLayer = (layerName: string) => {
    setActiveLayers(prev => ({
      ...prev,
      [layerName]: !prev[layerName as keyof typeof prev]
    }));
  };

  // Create deck.gl layers
  const layers = React.useMemo(() => {
    const deckLayers = [];

    if (activeLayers.heatmap && heatmapData.length > 0) {
      deckLayers.push(
        React.createElement(HeatmapLayer as any, {
          id: 'price-heatmap',
          data: heatmapData,
          getPosition: (d: any) => d.position,
          getWeight: (d: any) => d.weight,
          radiusPixels: 100,
          intensity: 1,
          threshold: 0.05,
          colorRange: [
            [255, 255, 178, 25],
            [254, 204, 92, 85],
            [253, 141, 60, 127],
            [240, 59, 32, 170],
            [189, 0, 38, 255]
          ]
        })
      );
    }

    if (activeLayers.hexagon && hexagonData.length > 0) {
      deckLayers.push(
        React.createElement(HexagonLayer as any, {
          id: 'traffic-hexagon',
          data: hexagonData,
          getPosition: (d: any) => d.position,
          getElevationWeight: (d: any) => d.value,
          elevationScale: 100,
          extruded: true,
          radius: 200,
          coverage: 0.8,
          colorRange: [
            [255, 255, 204],
            [199, 233, 180],
            [127, 205, 187],
            [65, 182, 196],
            [44, 127, 184],
            [37, 52, 148]
          ]
        })
      );
    }

    return deckLayers;
  }, [activeLayers, heatmapData, hexagonData]);

  return (
    <div className="absolute top-4 right-4 z-10">
      {/* Layer Controls */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-4">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center space-x-2">
            <Layers className="w-4 h-4" />
            <span>Data Overlays</span>
          </h3>
        </div>
        <div className="p-3 space-y-2">
          <button
            onClick={() => toggleLayer('heatmap')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
              activeLayers.heatmap 
                ? 'bg-red-100 text-red-700 border border-red-200' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-4 h-4" />
              <span>Price Heatmap</span>
            </div>
            {activeLayers.heatmap ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => toggleLayer('hexagon')}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
              activeLayers.hexagon 
                ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4" />
              <span>Traffic Density</span>
            </div>
            {activeLayers.hexagon ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Deck.GL Overlay */}
      {(activeLayers.heatmap || activeLayers.hexagon) && (
        <Suspense fallback={<div className="text-xs text-gray-500">Loading overlay...</div>}>
          <DeckGL
            viewState={viewport}
            onViewStateChange={({ viewState }) => onViewportChange(viewState)}
            layers={layers}
            controller={false} // Let Mapbox handle interactions
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
            width="100%"
            height="100%"
          />
        </Suspense>
      )}
      
      {/* Legend */}
      {(activeLayers.heatmap || activeLayers.hexagon) && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-3">
          <h4 className="text-xs font-semibold text-gray-900 mb-2">Legend</h4>
          <div className="space-y-1 text-xs">
            {activeLayers.heatmap && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gradient-to-r from-yellow-200 to-red-600 rounded"></div>
                <span>Price per sq ft</span>
              </div>
            )}
            {activeLayers.hexagon && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-gradient-to-r from-blue-200 to-blue-800 rounded"></div>
                <span>Traffic density</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getTrafficWeight(zoning: string, propertyValue: number): number {
  // Simulate traffic based on zoning type and property value
  let baseWeight = 1;
  
  if (zoning?.startsWith('C') || zoning?.includes('MU')) {
    baseWeight = 5; // Commercial areas have more traffic
  } else if (zoning?.startsWith('R')) {
    baseWeight = 2; // Residential areas
  }
  
  // Higher value properties in denser areas
  const valueMultiplier = Math.log10(propertyValue || 100000) / 5;
  
  return baseWeight * valueMultiplier;
}