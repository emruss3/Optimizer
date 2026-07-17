-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid)'::regprocedure
  );

  old := $old$    + sc_open * COALESCE((w->>'open_space_quality')::numeric, 0.03), 3);$old$;
  new := $new$    + sc_open * COALESCE((w->>'open_space_quality')::numeric, 0.03), 3);

  IF gsf_capture<0.85 THEN
    score_total := LEAST(
      score_total,
      round(gsf_capture * CASE WHEN yield_clamp_reason IS NULL THEN 0.50 ELSE 0.65 END,3)
    );
    flags := flags || to_jsonb('overall_score_capped_below_85pct_gsf_capture'::text);
  END IF;$new$;

  if position(old in d)=0 then
    raise exception 'v3 score-cap insertion marker not found';
  end if;
  d := replace(d,old,new);
  execute d;
end
$patch$;

comment on function public.fn_generate_mf_site_plan_v3(integer,text,integer,jsonb,uuid,boolean,uuid) is
  'Max-GSF multifamily solver. Overall score is explicitly capped when GSF capture is below 85 percent, even when financial or open-space components are favorable.';
