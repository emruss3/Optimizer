-- Applied to project okxrvetbzpoazrybhcqj on 2026-07-17.

alter table planner.context_snapshot
  add column if not exists request_fingerprint text,
  add column if not exists cache_expires_at timestamptz;

create index if not exists context_snapshot_request_cache_idx
  on planner.context_snapshot(parcel_ogc_fid,selected_use,context_version,request_fingerprint,cache_expires_at desc)
  where is_current and request_fingerprint is not null;

do $patch$
declare
  d text;
  old text;
  new text;
begin
  d := pg_get_functiondef(
    'public.fn_compile_planner_context(integer,text,jsonb)'::regprocedure
  );

  old := $old$
  v_context_version constant text := 'planner_context_v2';
  v_selected_use text;
$old$;
  new := $new$
  v_context_version constant text := 'planner_context_v2';
  v_compiler_revision constant text := 'planner_context_v2_gsf_20260717';
  v_cache_ttl constant interval := interval '30 minutes';
  v_selected_use text;
$new$;
  if position(old in d)=0 then raise exception 'context cache constant marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
  v_created_at timestamptz;
begin
$old$;
  new := $new$
  v_created_at timestamptz;
  v_request_fingerprint text;
  v_cache_expires_at timestamptz;
  v_cached planner.context_snapshot%rowtype;
begin
$new$;
  if position(old in d)=0 then raise exception 'context cache declaration marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
  v_use_key := case
    when v_typology = 'multifamily' then 'multi_family'
    when v_selected_use in ('two_family','duplex') then 'two_family'
    when v_typology = 'single_family' then 'single_family'
    else v_selected_use
  end;

  select to_jsonb(t) into v_spec
$old$;
  new := $new$
  v_use_key := case
    when v_typology = 'multifamily' then 'multi_family'
    when v_selected_use in ('two_family','duplex') then 'two_family'
    when v_typology = 'single_family' then 'single_family'
    else v_selected_use
  end;

  v_request_fingerprint := encode(
    extensions.digest(
      v_compiler_revision || '|' || p_ogc_fid::text || '|' || v_selected_use || '|' || p_user_intent::text,
      'sha256'
    ),
    'hex'
  );

  select * into v_cached
  from planner.context_snapshot c
  where c.parcel_ogc_fid=p_ogc_fid
    and c.selected_use=v_selected_use
    and c.context_version=v_context_version
    and c.request_fingerprint=v_request_fingerprint
    and c.is_current
    and c.cache_expires_at>now()
  order by c.cache_expires_at desc,c.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'context_id',v_cached.id,
      'context_version',v_cached.context_version,
      'context_hash',v_cached.context_hash,
      'created_at',v_cached.created_at,
      'generation_allowed',v_cached.generation_allowed,
      'context',v_cached.compiled_context,
      'solver_brief',v_cached.solver_brief,
      'cache_status','hit',
      'cache_expires_at',v_cached.cache_expires_at
    );
  end if;

  select to_jsonb(t) into v_spec
$new$;
  if position(old in d)=0 then raise exception 'context cache early-return marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    'compiled_at', now(),
    'context_version', v_context_version,
$old$;
  new := $new$
    'compiled_at', now(),
    'context_version', v_context_version,
    'compiler_revision',v_compiler_revision,
    'request_fingerprint',v_request_fingerprint,
    'cache_ttl_minutes',extract(epoch from v_cache_ttl)/60,
$new$;
  if position(old in d)=0 then raise exception 'context cache provenance marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    objective_profile, created_by, is_current
  ) values (
$old$;
  new := $new$
    objective_profile, created_by, is_current, request_fingerprint, cache_expires_at
  ) values (
$new$;
  if position(old in d)=0 then raise exception 'context cache insert columns marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    v_objectives, auth.uid(), true
  )
$old$;
  new := $new$
    v_objectives, auth.uid(), true, v_request_fingerprint, now()+v_cache_ttl
  )
$new$;
  if position(old in d)=0 then raise exception 'context cache insert values marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    generation_allowed = excluded.generation_allowed,
    refreshed_at = now(),
    is_current = true
  returning id, created_at into v_id, v_created_at;
$old$;
  new := $new$
    generation_allowed = excluded.generation_allowed,
    request_fingerprint = excluded.request_fingerprint,
    cache_expires_at = excluded.cache_expires_at,
    refreshed_at = now(),
    is_current = true
  returning id, created_at, cache_expires_at into v_id, v_created_at, v_cache_expires_at;
$new$;
  if position(old in d)=0 then raise exception 'context cache conflict marker not found'; end if;
  d := replace(d,old,new);

  old := $old$
    'context', v_context,
    'solver_brief', v_solver_brief
  );
$old$;
  new := $new$
    'context', v_context,
    'solver_brief', v_solver_brief,
    'cache_status','miss',
    'cache_expires_at',v_cache_expires_at
  );
$new$;
  if position(old in d)=0 then raise exception 'context cache return marker not found'; end if;
  d := replace(d,old,new);

  execute d;
end
$patch$;

comment on column planner.context_snapshot.request_fingerprint is
  'SHA-256 of compiler revision, parcel, selected use and canonical JSONB user intent. Used only for bounded snapshot reuse.';
comment on column planner.context_snapshot.cache_expires_at is
  'Absolute expiration for server-side compile reuse. Reuse is bounded rather than sliding so source changes are eventually observed.';
comment on function public.fn_compile_planner_context(integer,text,jsonb) is
  'Compiles or reuses a recent identical planner context. Cache keys include compiler revision, parcel, selected use and canonical JSONB intent; reuse expires after 30 minutes.';
