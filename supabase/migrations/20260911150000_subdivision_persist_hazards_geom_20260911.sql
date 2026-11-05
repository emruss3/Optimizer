-- Persist subdivision hazard polygons onto candidate.metrics so canvas hatch can draw.
-- fn_generate_subdivision already returns top-level hazards[] with geom_2274;
-- fn_generate_subdivision_safe previously only copied scalar metrics/flags and dropped geoms.

CREATE OR REPLACE FUNCTION public.fn_generate_subdivision_safe(p_ogc_fid integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  j jsonb;
  v_session uuid;
  v_cand uuid;
  persisted boolean := false;
  perr text;
  g_lots geometry(MultiPolygon, 3857);
  g_drives geometry(MultiLineString, 3857);
  g_alleys geometry(MultiPolygon, 3857);
  z_base text;
BEGIN
  BEGIN
    j := public.fn_generate_subdivision(p_ogc_fid);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object(
      'parcel_ogc_fid', p_ogc_fid,
      'generator_version', 'subdivision_v1.2',
      'error', 'exception: ' || SQLERRM,
      'flags', '["exception"]'::jsonb,
      'persisted', false
    );
  END;

  IF j IS NULL THEN
    RETURN jsonb_build_object(
      'parcel_ogc_fid', p_ogc_fid,
      'generator_version', 'subdivision_v1.2',
      'error', 'null_result',
      'persisted', false
    );
  END IF;

  IF COALESCE(NULLIF(j->>'error', ''), '') <> '' THEN
    RETURN j || jsonb_build_object('persisted', false);
  END IF;

  SELECT ST_SetSRID(
           ST_Multi(
             ST_Collect(d.geom)
           ),
           3857
         )::geometry(MultiPolygon, 3857)
  INTO g_lots
  FROM (
    SELECT (ST_Dump(
             ST_CollectionExtract(
               ST_Transform(
                 ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom_2274')::text), 2274),
                 3857
               ),
               3
             )
           )).geom AS geom
    FROM jsonb_array_elements(COALESCE(j->'lots', '[]'::jsonb)) AS elem
    WHERE elem ? 'geom_2274'
  ) AS d;

  IF g_lots IS NULL OR ST_IsEmpty(g_lots) THEN
    RETURN j || jsonb_build_object('persisted', false, 'persist_skip', 'no_lot_geometry');
  END IF;

  SELECT ST_SetSRID(
           ST_Multi(
             ST_Collect(d.geom)
           ),
           3857
         )::geometry(MultiLineString, 3857)
  INTO g_drives
  FROM (
    SELECT (ST_Dump(
             ST_CollectionExtract(
               ST_Transform(
                 ST_SetSRID(ST_GeomFromGeoJSON((elem->'centerline_2274')::text), 2274),
                 3857
               ),
               2
             )
           )).geom AS geom
    FROM jsonb_array_elements(COALESCE(j->'streets', '[]'::jsonb)) AS elem
    WHERE elem ? 'centerline_2274'
  ) AS d;

  SELECT ST_SetSRID(
           ST_Multi(
             ST_Collect(d.geom)
           ),
           3857
         )::geometry(MultiPolygon, 3857)
  INTO g_alleys
  FROM (
    SELECT (ST_Dump(
             ST_CollectionExtract(
               ST_Transform(
                 ST_SetSRID(ST_GeomFromGeoJSON((elem->'geom_2274')::text), 2274),
                 3857
               ),
               3
             )
           )).geom AS geom
    FROM jsonb_array_elements(COALESCE(j->'alleys', '[]'::jsonb)) AS elem
    WHERE elem ? 'geom_2274'
  ) AS d;

  SELECT p.zoning INTO z_base FROM public.parcels p WHERE p.ogc_fid = p_ogc_fid;

  BEGIN
    INSERT INTO public.siteplanner_session (
      parcel_id,
      zoning_base,
      generator_version,
      objective_profile
    ) VALUES (
      p_ogc_fid::text,
      z_base,
      COALESCE(j->>'generator_version', 'subdivision_v1.2'),
      jsonb_build_object(
        'mode', 'subdivision',
        'access', COALESCE(j->'access', '{}'::jsonb),
        'flags', COALESCE(j->'flags', '[]'::jsonb)
      )
    )
    RETURNING id INTO v_session;

    INSERT INTO public.siteplanner_candidate (
      session_id,
      typology,
      geometry_buildings,
      geometry_parking,
      geometry_drives,
      metrics,
      generator_version,
      score_total,
      score_components,
      objective_profile,
      precedent_ids
    ) VALUES (
      v_session,
      'subdivision',
      g_lots,
      g_alleys,
      g_drives,
      COALESCE(j->'metrics', '{}'::jsonb) || jsonb_build_object(
        'flags', COALESCE(j->'flags', '[]'::jsonb),
        'access', COALESCE(j->'access', '{}'::jsonb),
        'frame', COALESCE(j->'frame', '{}'::jsonb),
        'hazards', COALESCE(j->'hazards', '[]'::jsonb),
        'generator_version', COALESCE(j->>'generator_version', 'subdivision_v1.2'),
        'lots', COALESCE((j->'metrics'->>'lots')::int, jsonb_array_length(COALESCE(j->'lots', '[]'::jsonb))),
        'hazard_layer_coverage', COALESCE(j#>>'{metrics,hazard_layer_coverage}', 'unknown')
      ),
      COALESCE(j->>'generator_version', 'subdivision_v1.2'),
      CASE
        WHEN COALESCE(j#>>'{metrics,hazard_layer_coverage}', '') = 'ingested' THEN 0.9
        ELSE 0.75
      END,
      jsonb_build_object(
        'lots', COALESCE((j->'metrics'->>'lots')::numeric, 0),
        'pct_land_hazard', COALESCE((j->'metrics'->>'pct_land_hazard')::numeric, 0),
        'gross_density_du_ac', COALESCE((j->'metrics'->>'gross_density_du_ac')::numeric, 0)
      ),
      jsonb_build_object('mode', 'subdivision'),
      '[]'::jsonb
    )
    RETURNING id INTO v_cand;

    persisted := true;
  EXCEPTION WHEN others THEN
    perr := SQLERRM;
    persisted := false;
    IF v_session IS NOT NULL AND v_cand IS NULL THEN
      DELETE FROM public.siteplanner_session WHERE id = v_session;
      v_session := NULL;
    END IF;
  END;

  RETURN j || jsonb_build_object(
    'session_id', v_session,
    'candidate_id', v_cand,
    'persisted', persisted,
    'persist_error', perr
  );
END;
$function$;
