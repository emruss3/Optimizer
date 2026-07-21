-- DESIGN GRAMMAR v2.1: the court is a BOUNDED courtyard, not a greenbelt.
-- The v2 court band spanned the full parcel width; on wide XL sites that
-- severed the plan and consumed an entire parking street (558613 measured
-- 100 -> 60.7 capture). Now the court is a 120-180 ft window at the band
-- end away from the arrival spine — wrapped by buildings — and the rest
-- of the band keeps working as a full double-loaded parking street, so
-- the pitch is uniform (drive_gap) and only the stalls inside the window
-- are spent on the court.

DO $mig$
DECLARE
  v_new text;
BEGIN
  SELECT prosrc INTO v_new
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_mf_solve_core';

  IF md5(v_new) <> '5ba320fbac46dd2ee9300ad09df246fe' THEN
    RAISE EXCEPTION 'pre-image md5 % does not match expected 5ba320fbac46dd2ee9300ad09df246fe', md5(v_new);
  END IF;

  v_new := replace(v_new, $cA_o$    use_court := (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + court_gap + drive_gap + stall_d + 6;
    gap := CASE WHEN use_court THEN court_gap ELSE drive_gap END;
$cA_o$, $cA_n$    use_court := (NOT court_used) AND n_bars > 0
                 AND avail_h >= 2*bar_depth + 2*drive_gap + 6
                 AND (bxmax - bxmin) >= 300;
    gap := drive_gap;
$cA_n$);
  v_new := replace(v_new, $cB_o$      IF use_court THEN
        court_band := ST_Difference(
          ST_Intersection(rot, ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
          protected_court := court_band;
          flags := flags || to_jsonb('designed_central_court_v1'::text);
        END IF;
        court_used := true;
$cB_o$, $cB_n$      IF use_court THEN
        -- BOUNDED courtyard at the band end away from the arrival spine —
        -- wrapped by buildings, never a full-width greenbelt severing the
        -- site. The rest of this band keeps working as a parking street.
        px := LEAST(180, GREATEST(120, (bxmax - bxmin) * 0.25));
        IF spine_x - bxmin <= bxmax - spine_x THEN
          court_band := ST_Difference(ST_Intersection(rot,
            ST_MakeEnvelope(bxmax - px, y + bar_depth + 4, bxmax, y + bar_depth + gap - 4, 2274)), avoid);
          a0 := bxmin; a1 := bxmax - px - 4;
        ELSE
          court_band := ST_Difference(ST_Intersection(rot,
            ST_MakeEnvelope(bxmin, y + bar_depth + 4, bxmin + px, y + bar_depth + gap - 4, 2274)), avoid);
          a0 := bxmin + px + 4; a1 := bxmax;
        END IF;
        IF court_band IS NOT NULL AND NOT ST_IsEmpty(court_band) THEN
          greens := CASE WHEN greens IS NULL THEN court_band ELSE ST_Union(greens, court_band) END;
          protected_court := court_band;
          flags := flags || to_jsonb('designed_central_court_v1'::text);
        END IF;
        court_used := true;
        drive_band := ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth + stall_d, a1, y + bar_depth + stall_d + aisle, 2274)),
          ST_Difference(avoid, ST_Buffer(spine, 4)));
        IF drive_band IS NOT NULL AND NOT ST_IsEmpty(drive_band) THEN
          drives := CASE WHEN drives IS NULL THEN drive_band ELSE ST_Union(drives, drive_band) END;
          mid := y + bar_depth + stall_d + aisle / 2;
          cl := ST_Intersection(rot, ST_SetSRID(ST_MakeLine(ST_MakePoint(a0, mid), ST_MakePoint(a1, mid)), 2274));
          IF cl IS NOT NULL AND NOT ST_IsEmpty(cl) THEN
            drives_cl := CASE WHEN drives_cl IS NULL THEN cl ELSE ST_Union(drives_cl, cl) END;
          END IF;
        END IF;
        park_band := ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth, a1, y + bar_depth + stall_d, 2274)), avoid);
        park_band := ST_Union(park_band, ST_Difference(ST_Intersection(rot,
          ST_MakeEnvelope(a0, y + bar_depth + stall_d + aisle, a1, y + bar_depth + drive_gap, 2274)), avoid));
        IF park_band IS NOT NULL AND NOT ST_IsEmpty(park_band) THEN
          parks := CASE WHEN parks IS NULL THEN park_band ELSE ST_Union(parks, park_band) END;
        END IF;
$cB_n$);

  IF md5(v_new) <> '88f16323c35edeff3f6668adb0dce25e' THEN
    RAISE EXCEPTION 'patched md5 % does not match expected 88f16323c35edeff3f6668adb0dce25e', md5(v_new);
  END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.fn_mf_solve_core(p_ogc_fid integer, p_typology text, p_seed integer, p_pins jsonb, p_parent uuid, p_persist boolean, p_context_id uuid, p_regime text)'
       || ' RETURNS jsonb LANGUAGE plpgsql'
       || ' SET search_path TO ''pg_catalog'', ''public'', ''extensions'''
       || ' AS $fnbody$' || v_new || '$fnbody$';
END
$mig$;
