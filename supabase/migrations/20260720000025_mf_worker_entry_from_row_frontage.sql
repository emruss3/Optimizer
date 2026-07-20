-- P1-6 v1 (part 2): the MF worker's entry point comes from VERIFIED
-- FRONTAGE. fn_parcel_row_frontage (fabric-gap detector) replaces the
-- longest-edge guess whenever the parcel has a real right-of-way edge;
-- fabric-locked parcels keep the heuristic and carry
-- 'entry_heuristic_no_row_frontage' so the access assumption is visible.
-- Flag 'entry_from_row_frontage_v1' marks upgraded entries. The compiled
-- brief's front_edge_is_placeholder is untouched (compiler owned by the
-- context-engine session; it can consume the same detector later).

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core';

  IF md5(v_new) <> '0554f68b3e74bcdf789a4a6a9b1f0c98' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 0554f68b3e74bcdf789a4a6a9b1f0c98', md5(v_new);
  END IF;

  v_new := replace(v_new, $e1o$  park_floors integer := 0;
$e1o$, $e1n$  park_floors integer := 0;
  frontage jsonb;
$e1n$);
  v_new := replace(v_new, $e2o$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
    END IF;
  END LOOP;
$e2o$, $e2n$      entry_pt := ST_LineInterpolatePoint(ST_MakeLine(seg_a, seg_b), 0.5);
    END IF;
  END LOOP;

  -- VERIFIED FRONTAGE (P1-6): the fabric-gap detector replaces the
  -- longest-edge guess whenever the parcel actually has a right-of-way
  -- edge (the ROW is the gap in the parcel fabric); fabric-locked parcels
  -- keep the heuristic and say so honestly.
  frontage := public.fn_parcel_row_frontage(p_ogc_fid);
  IF COALESCE((frontage->>'has_row_frontage')::boolean, false) THEN
    entry_pt := ST_SetSRID(ST_MakePoint(
      (frontage->>'primary_mid_x')::numeric,
      (frontage->>'primary_mid_y')::numeric), 2274);
    flags := flags || to_jsonb('entry_from_row_frontage_v1'::text);
  ELSE
    flags := flags || to_jsonb('entry_heuristic_no_row_frontage'::text);
  END IF;
$e2n$);

  IF md5(v_new) <> '7469e89c31ea93c25656a6643b3fa089' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 7469e89c31ea93c25656a6643b3fa089', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
