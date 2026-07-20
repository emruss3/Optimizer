-- P0-4: parking/impervious SELF-SIZING (v2 — no CASE in IF condition).
-- Both trim loops destroyed the LAST remaining building when it could not
-- shrink above the 90-ft grammar floor. Now: the last building shrinks
-- toward the compact-plex minimum (1,120 sqft), then floors reduce, and
-- only then does the solver concede. Multi-building parcels untouched.

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '61eb1bfa913a910a74e33ca6059459f9' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 61eb1bfa913a910a74e33ca6059459f9', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $t1o$IF last_area-excess_area >= bar_min*bar_depth THEN$t1o$, $t1n$IF last_area-excess_area >= bar_min*bar_depth
       OR (array_length(bars_arr,1)=1 AND last_area-excess_area >= 1120) THEN$t1n$);
  v_new := replace(v_new, $t2o$    ELSE
      tot_fp := tot_fp-last_area;
      IF array_length(bars_arr,1)>1 THEN
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
      ELSE
        bars_arr := '{}'::geometry[];
      END IF;
      n_bars := n_bars-1;
    END IF;$t2o$, $t2n$    ELSE
      IF array_length(bars_arr,1)>1 THEN
        tot_fp := tot_fp-last_area;
        bars_arr := bars_arr[1:array_length(bars_arr,1)-1];
        n_bars := n_bars-1;
      ELSIF last_area > 1140 THEN
        -- SELF-SIZING (P0-4): never destroy the last building for the
        -- arithmetic — shrink it toward the compact-plex minimum first.
        shrink_len := (last_area - GREATEST(1120, last_area - excess_area))
                      / GREATEST(ST_YMax(last_bar)-ST_YMin(last_bar), 1);
        bars_arr[1] := ST_MakeEnvelope(
          ST_XMin(last_bar),ST_YMin(last_bar),
          ST_XMax(last_bar)-shrink_len,ST_YMax(last_bar),2274);
        tot_fp := ST_Area(bars_arr[1]);
        flags := flags || to_jsonb('last_building_shrunk_for_self_sizing'::text);
      ELSIF floors > 1 THEN
        -- ...then take floors down before conceding.
        floors := floors - 1;
        flags := flags || to_jsonb('floors_reduced_for_self_sizing'::text);
      ELSE
        tot_fp := tot_fp-last_area;
        bars_arr := '{}'::geometry[];
        n_bars := n_bars-1;
      END IF;
    END IF;$t2n$);

  IF md5(v_new) <> 'c7f4dff093155ef315608a7b3cf25a6c' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected c7f4dff093155ef315608a7b3cf25a6c', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
