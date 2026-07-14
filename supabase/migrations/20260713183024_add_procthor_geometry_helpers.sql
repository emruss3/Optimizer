-- Already applied to project okxrvetbzpoazrybhcqj on 2026-07-13.
-- Restored from supabase_migrations.schema_migrations for source-control parity.

alter table training.raw_documents
  add column if not exists quality_notes text;

create or replace function training.procthor_polygon(p_points jsonb)
returns public.geometry
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_points public.geometry[];
  v_count integer;
  v_polygon public.geometry;
begin
  select array_agg(
           public.st_setsrid(
             public.st_makepoint((p->>'x')::double precision, (p->>'z')::double precision),
             0
           ) order by ord
         )
  into v_points
  from jsonb_array_elements(p_points) with ordinality as e(p, ord)
  where p ? 'x' and p ? 'z';

  v_count := coalesce(array_length(v_points, 1), 0);
  if v_count < 3 then return null; end if;

  if not public.st_equals(v_points[1], v_points[v_count]) then
    v_points := array_append(v_points, v_points[1]);
  end if;

  v_polygon := public.st_makepolygon(public.st_makeline(v_points));
  if not public.st_isvalid(v_polygon) or public.st_area(v_polygon) <= 0 then
    return null;
  end if;
  return v_polygon;
exception when others then
  return null;
end;
$$;

create or replace function training.procthor_wall_line(p_points jsonb)
returns public.geometry
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_points public.geometry[];
begin
  select array_agg(
           public.st_setsrid(
             public.st_makepoint((p->>'x')::double precision, (p->>'z')::double precision),
             0
           ) order by ord
         )
  into v_points
  from jsonb_array_elements(p_points) with ordinality as e(p, ord)
  where ord <= 2 and p ? 'x' and p ? 'z';

  if coalesce(array_length(v_points, 1), 0) <> 2 then return null; end if;
  if public.st_equals(v_points[1], v_points[2]) then return null; end if;
  return public.st_makeline(v_points);
exception when others then
  return null;
end;
$$;
