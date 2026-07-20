-- Parcel vector tiles: refuse sub-parcel zoom levels at the source.
--
-- Measured on live data (2026-07-20): a z12 tile intersects 41,734 parcels —
-- the per-row MakeValid+Transform then hits the 20s API statement timeout,
-- which the function's EXCEPTION handler swallowed into NULL. The map spent
-- 20-22s per low-zoom tile to render nothing. A dense downtown z14 tile is
-- 3,970 parcels ≈ 1.1s — fine. Parcels are sub-pixel below z14 anyway, so
-- z < 14 now returns NULL immediately (the edge function and the client
-- source are gated to match).

CREATE OR REPLACE FUNCTION public.parcels_mvt_b64(z integer, x integer, y integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE wb3857 geometry; mvt BYTEA;
BEGIN
  -- Lot-level data only exists visually at z >= 14; anything lower is a
  -- whole-city scan that cannot finish inside the API statement timeout.
  IF z IS NULL OR z < 14 OR z > 22 THEN RETURN NULL; END IF;

  wb3857 := ST_TileEnvelope(z, x, y);

  WITH cand AS (
    SELECT
      p.ogc_fid,                               -- << unique id
      p.zoning,
      COALESCE(
        p.sqft,
        ROUND(ST_Area(p.wkb_geometry_4326::geography) * 10.76391041671)
      )::bigint AS sqft,                       -- computed if NULL
      ST_Transform(ST_CollectionExtract(ST_MakeValid(p.wkb_geometry_4326), 3), 3857) AS g3857
    FROM public.parcels p
    WHERE p.wkb_geometry_4326 && ST_Transform(wb3857, 4326)
  ),
  mvtgeom AS (
    SELECT
      ogc_fid, zoning, sqft,                   -- << keep as properties
      ST_AsMVTGeom(g3857, wb3857, 4096, 64, TRUE) AS geom
    FROM cand
    WHERE g3857 IS NOT NULL AND NOT ST_IsEmpty(g3857)
  )
  SELECT ST_AsMVT(
           mvtgeom,
           'parcels',                          -- source-layer name
           4096,
           'geom',
           'ogc_fid'                           -- << FEATURE ID = ogc_fid
         )
  INTO mvt FROM mvtgeom;

  IF mvt IS NULL THEN RETURN NULL; END IF;
  RETURN encode(mvt, 'base64');
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END; $function$;
