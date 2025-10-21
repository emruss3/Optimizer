// Mock parcel data for development when database is unavailable
export function createMockParcelData(bbox: [number, number, number, number]) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  
  // Create a grid of mock parcels within the bounding box
  const parcels = [];
  const gridSize = 0.01; // ~1km spacing
  const lngStep = (maxLng - minLng) / 10;
  const latStep = (maxLat - minLat) / 10;
  
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      const lng = minLng + (i * lngStep);
      const lat = minLat + (j * latStep);
      
      parcels.push({
        type: 'Feature',
        properties: {
          ogc_fid: 10000 + (i * 100) + j, // Generate numeric IDs
          parcelnumb: `MOCK-${i}-${j}`,
          address: `${i + 100} Mock Street`,
          zoning: 'R-1',
          sqft: 5000 + (i * j * 1000),
          deeded_acres: 0.1 + (i * j * 0.01),
          gisacre: 0.1 + (i * j * 0.01),
          landval: 50000 + (i * j * 10000),
          parval: 75000 + (i * j * 15000),
          yearbuilt: 1990 + (i * j),
          numstories: 1 + (i % 3),
          numunits: 1 + (i % 2),
          lat: lat,
          lon: lng
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [lng, lat],
            [lng + lngStep * 0.8, lat],
            [lng + lngStep * 0.8, lat + latStep * 0.8],
            [lng, lat + latStep * 0.8],
            [lng, lat]
          ]]
        }
      });
    }
  }
  
  return {
    type: 'FeatureCollection',
    features: parcels
  } as GeoJSON.FeatureCollection;
}
