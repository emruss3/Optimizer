// Accepts: plain GeoJSON Polygon/MultiPolygon OR { geometry, srid?, centroid?, area_sqft? }
export type NormalizedEnvelope = {
  srid: 4326 | 3857;
  geometry: GeoJSON.Polygon;
  centroid?: GeoJSON.Point;
  area_sqft?: number;
};

function isLonLat([x, y]: number[]) {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

export function normalizeEnvelope(input: any): NormalizedEnvelope | null {
  if (!input) return null;

  const raw = input.geometry ?? input; // support wrapped or plain
  let geometry = raw;

  // MultiPolygon -> first Polygon
  if (geometry?.type === "MultiPolygon") {
    geometry = { type: "Polygon", coordinates: geometry.coordinates?.[0] };
  }
  if (geometry?.type !== "Polygon" || !geometry.coordinates?.length) return null;

  // Ensure exterior ring is closed
  const ring = geometry.coordinates[0];
  if (ring.length) {
    const [ax, ay] = ring[0];
    const [bx, by] = ring[ring.length - 1];
    if (ax !== bx || ay !== by) ring.push([ax, ay]);
  }

  // SRID: trust provided srid, else infer (lon/lat ⇒ 4326; else 3857)
  const srid: 4326 | 3857 =
    typeof input.srid === "number"
      ? (input.srid as any)
      : isLonLat(ring[0])
        ? 4326
        : 3857;

  return {
    srid,
    geometry,
    centroid: input.centroid,
    area_sqft: input.area_sqft,
  };
}
