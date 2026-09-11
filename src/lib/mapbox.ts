import mapboxgl from 'mapbox-gl';

export const MAPBOX_TOKEN = 
  import.meta.env.VITE_MAPBOX_TOKEN ||
  import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ||
  import.meta.env.VITE_MAPBOX_API_KEY;

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

mapboxgl.accessToken = MAPBOX_TOKEN || '';

if (!MAPBOX_TOKEN) {
  console.warn('Missing Mapbox API key. Add one of these to your .env: VITE_MAPBOX_TOKEN, VITE_MAPBOX_ACCESS_TOKEN, or VITE_MAPBOX_API_KEY');
}

export const NASHVILLE_CENTER = {
  longitude: -86.7816,
  latitude: 36.1627,
  zoom: 12
};

export const MAP_STYLE = 'mapbox://styles/mapbox/light-v11';

// Edge function tile endpoint
export const PARCELS_TILE_URL =
  "https://okxrvetbzpoazrybhcqj.supabase.co/functions/v1/mvt-parcels?z={z}&x={x}&y={y}";