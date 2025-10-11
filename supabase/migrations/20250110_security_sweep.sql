-- Security sweep: make function security explicit everywhere
-- Set explicit search_path and security posture for all RPCs

-- get_parcel_at_point - ensure consistent security posture
alter function if exists public.get_parcel_at_point(double precision, double precision)
  owner to postgres;
alter function if exists public.get_parcel_at_point(double precision, double precision)
  set search_path = public;

-- get_parcel_geometry_3857 - explicit security invoker
alter function if exists public.get_parcel_geometry_3857(int)
  set search_path = public;
alter function if exists public.get_parcel_geometry_3857(int)
  security invoker;

-- get_parcel_buildable_envelope - explicit security definer (needs to bypass RLS)
alter function if exists public.get_parcel_buildable_envelope(int)
  set search_path = public;
alter function if exists public.get_parcel_buildable_envelope(int)
  security definer;

-- get_buildable_envelope - explicit security invoker
alter function if exists public.get_buildable_envelope(text)
  set search_path = public;
alter function if exists public.get_buildable_envelope(text)
  security invoker;

-- get_parcel_detail - explicit security invoker
alter function if exists public.get_parcel_detail(int)
  set search_path = public;
alter function if exists public.get_parcel_detail(int)
  security invoker;

-- score_pad - explicit security invoker
alter function if exists public.score_pad(text, geometry, numeric, numeric, numeric, numeric, numeric)
  set search_path = public;
alter function if exists public.score_pad(text, geometry, numeric, numeric, numeric, numeric, numeric)
  security invoker;

-- compute_setback_polygon - explicit security invoker
alter function if exists public.compute_setback_polygon(geometry, numeric, numeric, numeric)
  set search_path = public;
alter function if exists public.compute_setback_polygon(geometry, numeric, numeric, numeric)
  security invoker;

-- get_assemblage_geometry - explicit security invoker
alter function if exists public.get_assemblage_geometry(text[])
  set search_path = public;
alter function if exists public.get_assemblage_geometry(text[])
  security invoker;

-- get_buildable_area_exact - explicit security invoker
alter function if exists public.get_buildable_area_exact(text[], numeric, numeric, numeric)
  set search_path = public;
alter function if exists public.get_buildable_area_exact(text[], numeric, numeric, numeric)
  security invoker;

-- get_parcels_in_bbox - explicit security invoker
alter function if exists public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[])
  set search_path = public;
alter function if exists public.get_parcels_in_bbox(double precision, double precision, double precision, double precision, integer, integer, text[])
  security invoker;
