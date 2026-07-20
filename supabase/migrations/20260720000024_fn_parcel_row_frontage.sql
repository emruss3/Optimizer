-- P1-6 v1: VERIFIED FRONTAGE from the parcel fabric itself (G0 road-edge
-- goal, achieved without external ingestion). Definition: a boundary
-- segment is ROW-FACING when the strip just outside it is not covered by
-- any neighboring parcel — the public right-of-way is precisely the gap
-- in the parcel fabric. Validated live: 660290 (2611 W Heiman) reports
-- its 350 ft street frontage plus the 141 ft side street of the corner
-- lot, with rear/interior edges abutting; 669046 reports no ROW edge
-- (genuinely fabric-locked — access by easement, an honest flag, not a
-- guess). The 68-row OSM roads stub is NOT consulted; road names/classes
-- can enrich this later without changing the definition.

CREATE OR REPLACE FUNCTION public.fn_parcel_row_frontage(p_ogc_fid integer)
 RETURNS jsonb LANGUAGE plpgsql STABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fnbody$
DECLARE
  g geometry;
  ring geometry;
  npts integer;
  i integer;
  seg geometry;
  seg_len numeric;
  outside geometry;
  outside_area numeric;
  covered numeric;
  is_row boolean;
  segs jsonb := '[]'::jsonb;
  best_len numeric := 0;
  best_mid geometry;
  best_az numeric;
  n_row integer := 0;
BEGIN
  SELECT (ST_Dump(geom_2274)).geom INTO g FROM public.parcels WHERE ogc_fid = p_ogc_fid LIMIT 1;
  IF g IS NULL THEN
    RETURN jsonb_build_object('error', 'parcel has no geom_2274');
  END IF;
  ring := ST_Simplify(ST_ExteriorRing(g), 5);
  npts := ST_NPoints(ring);
  FOR i IN 1..(npts - 1) LOOP
    seg := ST_MakeLine(ST_PointN(ring, i), ST_PointN(ring, i + 1));
    seg_len := ST_Length(seg);
    CONTINUE WHEN seg_len <= 20;
    outside := ST_Difference(ST_Buffer(seg, 14, 'endcap=flat'), ST_Buffer(g, 1));
    outside_area := COALESCE(ST_Area(outside), 0);
    CONTINUE WHEN outside_area < 1;
    SELECT COALESCE(sum(ST_Area(ST_Intersection(n.geom_2274, outside))), 0) INTO covered
    FROM public.parcels n
    WHERE n.ogc_fid <> p_ogc_fid
      AND n.geom_2274 && ST_Expand(ST_Envelope(seg), 40);
    is_row := covered < outside_area * 0.15;
    IF is_row THEN
      n_row := n_row + 1;
      IF seg_len > best_len THEN
        best_len := seg_len;
        best_mid := ST_LineInterpolatePoint(seg, 0.5);
        best_az := ST_Azimuth(ST_PointN(ring, i), ST_PointN(ring, i + 1));
      END IF;
    END IF;
    segs := segs || jsonb_build_object(
      'i', i, 'len_ft', round(seg_len),
      'row_facing', is_row,
      'coverage_ratio', round((covered / outside_area)::numeric, 2));
  END LOOP;
  RETURN jsonb_build_object(
    'ogc_fid', p_ogc_fid,
    'method', 'parcel_fabric_gap_v1',
    'has_row_frontage', n_row > 0,
    'row_edge_count', n_row,
    'primary_len_ft', CASE WHEN best_len > 0 THEN round(best_len) ELSE NULL END,
    'primary_mid_x', CASE WHEN best_mid IS NULL THEN NULL ELSE ST_X(best_mid) END,
    'primary_mid_y', CASE WHEN best_mid IS NULL THEN NULL ELSE ST_Y(best_mid) END,
    'primary_azimuth', best_az,
    'segments', segs);
END
$fnbody$;
