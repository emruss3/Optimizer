-- P0 ledger item 1: COMPACT PLEX grammar for tiny envelopes (the largest
-- failure class in the random generalization sweep: 0.2-0.5 ac lots).
-- (A) A shallow envelope (34-44 ft deep) gets a 28+ ft plex bar with short
--     runs instead of the 'too shallow' refusal; below 28 ft buildable
--     depth the refusal is STRUCTURED (dimensions in payload).
-- (B) Envelopes under 95 ft wide or 12,000 sqft swap the full-height
--     central spine (24+ ft of width) for a street-side aisle stub on the
--     entry edge: street-loaded apron access, like every small walk-up.
-- Both changes gate strictly on small-envelope conditions; all currently
-- solving parcels are byte-identical (verified post-apply).

DO $mig$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_generate_mf_site_plan_v2';

  IF md5(v_src) <> '1453d43d14be5bc39fae2a35826495e6' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 1453d43d14be5bc39fae2a35826495e6', md5(v_src);
  END IF;

  v_new := v_src;
  v_new := replace(v_new, $q1o$  IF bar_depth > avail_h - 4 THEN
    RETURN jsonb_build_object('error', 'envelope too shallow for a building bar');
  END IF;$q1o$, $q1n$  IF bar_depth > avail_h - 4 THEN
    IF avail_h >= 34 THEN
      -- COMPACT PLEX (P0 ledger, generalization sweep): a shallow envelope
      -- hosts a shallow building, not a refusal. Plex depth 28+ ft, short
      -- runs; downstream parking/convergence machinery runs unchanged.
      bar_depth := GREATEST(28, avail_h - 6);
      bar_min := LEAST(bar_min, 40);
      lead_street := false;
      flags := flags || to_jsonb('compact_plex_shallow_envelope'::text);
    ELSE
      RETURN jsonb_build_object('error', 'planner_envelope_unbuildable_depth',
        'envelope_depth_ft', round(avail_h),
        'minimum_building_depth_ft', 28,
        'flags', flags);
    END IF;
  END IF;$q1n$);
  v_new := replace(v_new, $q2o$  spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 50), bxmax - 50);
  spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  avoid := ST_Buffer(spine, 4);$q2o$, $q2n$  IF (bxmax - bxmin) < 95 OR ST_Area(rot) < 12000 THEN
    -- COMPACT PLEX access (P0 ledger): a tiny envelope cannot afford a
    -- full-height central spine (24+ ft of its width). A street-side aisle
    -- stub on the entry edge serves apron parking directly off the curb.
    IF abs(ST_Y(entry_rot) - bymin) <= abs(ST_Y(entry_rot) - bymax) THEN
      spine := ST_Intersection(rot, ST_MakeEnvelope(bxmin, bymin, bxmax, bymin + aisle, 2274));
    ELSE
      spine := ST_Intersection(rot, ST_MakeEnvelope(bxmin, bymax - aisle, bxmax, bymax, 2274));
    END IF;
    spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 25), bxmax - 25);
    flags := flags || to_jsonb('compact_plex_street_loaded_access'::text);
  ELSE
  spine_x := LEAST(GREATEST(ST_X(entry_rot), bxmin + 50), bxmax - 50);
  spine := ST_Intersection(rot, ST_MakeEnvelope(spine_x - aisle/2, bymin, spine_x + aisle/2, bymax, 2274));
  END IF;
  avoid := ST_Buffer(spine, 4);$q2n$);

  IF md5(v_new) <> '8b731f44c6eba1fda73f71fc8774e4cd' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 8b731f44c6eba1fda73f71fc8774e4cd', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_generate_mf_site_plan_v2(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
