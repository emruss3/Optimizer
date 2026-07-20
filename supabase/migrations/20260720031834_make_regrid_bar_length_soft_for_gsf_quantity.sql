-- Applied live to project okxrvetbzpoazrybhcqj on 2026-07-20.
--
-- Regrid's local p75 length was still used as a hard per-bar maximum. On parcel
-- 669046 that capped total footprint even after the solver had enough parking
-- for the full program. Preserve Regrid provenance and score fit, but let the
-- solver use the 300-foot constructability maximum when quantity requires it.

do $patch$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  v_definition := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  if position('precedent_bar_length_soft_target_not_quantity_cap' in v_definition)=0 then
    v_old := $old$
  -- Bar length target from precedent footprint (p90 underwrite target)
  IF p90fp IS NOT NULL AND n_prec >= 5 THEN
    bar_max := round(p90fp / bar_depth);
    IF bar_max < bar_min THEN
      flags := flags || to_jsonb('bar_length_clamped_min_constructability'::text);
      bar_max := bar_min;
    ELSIF bar_max > 300 THEN
      flags := flags || to_jsonb('bar_length_clamped_max_constructability'::text);
      bar_max := 300;
    ELSE
      flags := flags || to_jsonb('bar_length_from_precedent_p90'::text);
    END IF;
  ELSE
    bar_max := 250;
    flags := flags || to_jsonb('bar_length_fallback_default'::text);
  END IF;
$old$;
    v_new := $new$
  -- Regrid length is a form preference, never a quantity ceiling. Retain its
  -- provenance for scoring and segmentation, but allow the hard constructable
  -- maximum when additional length is needed to approach the GSF frontier.
  IF p90fp IS NOT NULL AND n_prec >= 5 THEN
    flags := flags || to_jsonb('bar_length_preference_from_regrid'::text);
  ELSE
    flags := flags || to_jsonb('bar_length_preference_fallback_default'::text);
  END IF;
  bar_max := 300;
  flags := flags || to_jsonb('precedent_bar_length_soft_target_not_quantity_cap'::text);
$new$;
    if position(v_old in v_definition)=0 then
      raise exception 'MF precedent bar-length marker not found';
    end if;
    v_definition := replace(v_definition,v_old,v_new);
  end if;

  execute v_definition;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v2(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Production MF max-GSF solver. Regrid building length is scored as a soft form preference and cannot cap buildable GSF; the hard per-bar constructability maximum is 300 feet.';

notify pgrst, 'reload schema';
