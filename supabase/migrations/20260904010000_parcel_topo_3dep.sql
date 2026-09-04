-- Topography per parcel (Eric, 2026-09-04: "The output looks rudimentary.
-- This should look like a full civil set with elevations, etc."). The agent
-- sandbox cannot reach USGS, but the database can: fn_parcel_topo_fetch posts
-- a 20-ft grid of sample points (EPSG:2274, the parcel plus a 100-ft margin)
-- to the USGS 3DEP 1-m elevation image service (getSamples, ≤ 900 points a
-- call), stores the answers as a PostGIS raster in feet (NAVD88), and
-- fn_parcel_topo serves what a civil sheet needs from it: 1-ft contours
-- (index every 5 ft), the sample grid for street profiles and spot grades,
-- and slope statistics over the parcel. Cached per parcel; refetched after
-- 180 days. Nothing is estimated: every elevation is the DEM's own value.

create table if not exists public.parcel_topo (
  ogc_fid integer primary key,
  fetched_at timestamptz not null default now(),
  source text not null default 'USGS 3DEP 1 m DEM (elevation.nationalmap.gov, getSamples), NAVD88 feet',
  spacing_ft integer not null,
  n_samples integer not null,
  z_min_ft numeric,
  z_max_ft numeric,
  mean_slope_pct numeric,
  max_slope_pct numeric,
  rast raster not null
);
alter table public.parcel_topo enable row level security;
drop policy if exists parcel_topo_read on public.parcel_topo;
create policy parcel_topo_read on public.parcel_topo for select to anon, authenticated using (true);

-- Fetch + cache. SECURITY DEFINER: the http extension and the cache write
-- belong to the database, never to the app role; the only input is a parcel id.
create or replace function public.fn_parcel_topo_fetch(p_ogc_fid integer, p_spacing_ft integer default 20)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_g geometry; v_buf geometry; v_x0 integer; v_y0 integer; v_x1 integer; v_y1 integer; v_nx integer; v_ny integer;
  v_rast raster; v_pts geometry[]; v_n integer; v_chunk integer := 900; v_i integer; v_k integer;
  v_geom text; v_status integer; v_content text; v_body jsonb; v_e jsonb; v_gv geomval[] := '{}'; v_z numeric; v_got integer := 0;
  v_clip raster; v_min double precision; v_max double precision; v_smean double precision; v_smax double precision;
begin
  select geom_2274 into v_g from public.parcels where ogc_fid = p_ogc_fid;
  if v_g is null then return jsonb_build_object('error', 'parcel not found', 'parcel_ogc_fid', p_ogc_fid); end if;
  v_g := st_makevalid(v_g);
  v_buf := st_buffer(v_g, 100);
  v_x0 := floor(st_xmin(v_buf))::integer; v_y0 := floor(st_ymin(v_buf))::integer;
  v_x1 := ceil(st_xmax(v_buf))::integer; v_y1 := ceil(st_ymax(v_buf))::integer;
  v_nx := ceil((v_x1 - v_x0)::numeric / p_spacing_ft)::integer + 1;
  v_ny := ceil((v_y1 - v_y0)::numeric / p_spacing_ft)::integer + 1;
  -- sample points on the grid, inside the margin
  select array_agg(pt order by j, i) into v_pts
  from (select i, j, st_setsrid(st_point(v_x0 + i * p_spacing_ft, v_y0 + j * p_spacing_ft), 2274) pt
        from generate_series(0, v_nx - 1) i, generate_series(0, v_ny - 1) j) q
  where st_intersects(v_buf, pt);
  v_n := coalesce(array_length(v_pts, 1), 0);
  if v_n = 0 then return jsonb_build_object('error', 'no sample points', 'parcel_ogc_fid', p_ogc_fid); end if;
  if v_n > 14000 then
    return jsonb_build_object('error', 'parcel_too_large_for_topo_fetch', 'points', v_n, 'parcel_ogc_fid', p_ogc_fid);
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '60000');
  -- the raster's pixel centres land on the sample points
  v_rast := st_addband(
    st_makeemptyraster(v_nx, v_ny, v_x0 - p_spacing_ft / 2.0, v_y0 + (v_ny - 1) * p_spacing_ft + p_spacing_ft / 2.0,
                       p_spacing_ft, -p_spacing_ft, 0, 0, 2274),
    '32BF'::text, -9999, -9999);
  v_i := 1;
  while v_i <= v_n loop
    select jsonb_build_object('points', jsonb_agg(jsonb_build_array(round(st_x(p4)::numeric, 6), round(st_y(p4)::numeric, 6)) order by k),
                              'spatialReference', jsonb_build_object('wkid', 4326))::text
      into v_geom
    from (select st_transform(v_pts[k], 4326) p4, k from generate_series(v_i, least(v_i + v_chunk - 1, v_n)) k) q;
    select r.status, r.content into v_status, v_content
    from extensions.http_post('https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples',
      'geometry=' || extensions.urlencode(v_geom) || '&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&interpolation=RSP_BilinearInterpolation&f=json',
      'application/x-www-form-urlencoded') r;
    if v_status <> 200 or left(coalesce(v_content, ''), 1) <> '{' or (v_content::jsonb) ? 'error' then
      return jsonb_build_object('error', 'usgs_3dep_unavailable', 'status', v_status, 'detail', left(coalesce(v_content, ''), 200), 'parcel_ogc_fid', p_ogc_fid);
    end if;
    v_body := v_content::jsonb;
    -- samples come back with locationId = index within the posted chunk; metres → feet
    for v_e in select * from jsonb_array_elements(coalesce(v_body->'samples', '[]'::jsonb)) loop
      if (v_e->>'value') !~ '^-?[0-9]+(\.[0-9]+)?$' then continue; end if;
      v_k := v_i + (v_e->>'locationId')::integer;
      if v_k < 1 or v_k > v_n then continue; end if;
      v_z := (v_e->>'value')::numeric * 3.28084;
      v_gv := v_gv || (v_pts[v_k], v_z::double precision)::geomval;
      v_got := v_got + 1;
    end loop;
    v_i := v_i + v_chunk;
  end loop;
  if v_got < 4 then return jsonb_build_object('error', 'usgs_3dep_no_data', 'parcel_ogc_fid', p_ogc_fid); end if;
  v_rast := st_setvalues(v_rast, 1, v_gv, false);
  -- statistics over the parcel itself (feet; slope in percent from the 20-ft grid)
  v_clip := st_clip(v_rast, v_g, -9999, true);
  select s.min, s.max into v_min, v_max from st_summarystats(v_clip, 1, true) s;
  select s.mean, s.max into v_smean, v_smax from st_summarystats(st_slope(v_clip, 1, '32BF', 'PERCENT', 1.0, true), 1, true) s;
  insert into public.parcel_topo as t (ogc_fid, fetched_at, spacing_ft, n_samples, z_min_ft, z_max_ft, mean_slope_pct, max_slope_pct, rast)
  values (p_ogc_fid, now(), p_spacing_ft, v_got, round(v_min::numeric, 1), round(v_max::numeric, 1), round(v_smean::numeric, 1), round(v_smax::numeric, 1), v_rast)
  on conflict (ogc_fid) do update set fetched_at = excluded.fetched_at, spacing_ft = excluded.spacing_ft, n_samples = excluded.n_samples,
    z_min_ft = excluded.z_min_ft, z_max_ft = excluded.z_max_ft, mean_slope_pct = excluded.mean_slope_pct, max_slope_pct = excluded.max_slope_pct, rast = excluded.rast;
  return jsonb_build_object('ok', true, 'parcel_ogc_fid', p_ogc_fid, 'samples', v_got, 'grid', jsonb_build_object('nx', v_nx, 'ny', v_ny, 'spacing_ft', p_spacing_ft),
    'z_min_ft', round(v_min::numeric, 1), 'z_max_ft', round(v_max::numeric, 1), 'mean_slope_pct', round(v_smean::numeric, 1), 'max_slope_pct', round(v_smax::numeric, 1));
end
$$;
revoke execute on function public.fn_parcel_topo_fetch(integer, integer) from public, anon, authenticated;

-- What the sheet needs: contours, the sample grid, the statistics. Fetches on
-- first use (or after 180 days); SECURITY DEFINER so the app role never needs
-- the fetch function or the http extension.
create or replace function public.fn_parcel_topo(p_ogc_fid integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  t record; v_g geometry; v_f jsonb; v_win geometry; v_contours jsonb; v_samples jsonb; v_ul_x double precision; v_ul_y double precision;
begin
  select geom_2274 into v_g from public.parcels where ogc_fid = p_ogc_fid;
  if v_g is null then return jsonb_build_object('error', 'parcel not found', 'parcel_ogc_fid', p_ogc_fid); end if;
  select * into t from public.parcel_topo where ogc_fid = p_ogc_fid and fetched_at > now() - interval '180 days';
  if t is null then
    v_f := public.fn_parcel_topo_fetch(p_ogc_fid, 20);
    if v_f ? 'error' then return v_f; end if;
    select * into t from public.parcel_topo where ogc_fid = p_ogc_fid;
  end if;
  v_win := st_buffer(st_makevalid(v_g), 60);
  -- 1-ft contours over the parcel and a 60-ft margin, index every 5 ft, lightly simplified
  select coalesce(jsonb_agg(jsonb_build_object(
           'elevation_ft', c.value, 'index', (round(c.value)::integer % 5 = 0),
           'geom_2274', st_asgeojson(st_simplifypreservetopology(st_intersection(c.geom, v_win), 1.0), 1)::jsonb) order by c.value), '[]'::jsonb)
    into v_contours
  from st_contour(t.rast, 1, 1.0, 0.0, '{}'::double precision[], false) c
  where st_intersects(c.geom, v_win);
  -- the sample grid as [col, row, z_ft], with the grid's origin so the client can interpolate
  v_ul_x := st_upperleftx(t.rast); v_ul_y := st_upperlefty(t.rast);
  select coalesce(jsonb_agg(jsonb_build_array(p.x - 1, p.y - 1, round(p.val::numeric, 1)) order by p.y, p.x), '[]'::jsonb)
    into v_samples
  from st_pixelascentroids(t.rast, 1, true) p;
  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'source', t.source, 'datum', 'NAVD88', 'units', 'ft', 'fetched_at', t.fetched_at,
    'spacing_ft', t.spacing_ft, 'n_samples', t.n_samples,
    'grid', jsonb_build_object('origin_x', v_ul_x + t.spacing_ft / 2.0, 'origin_y', v_ul_y - t.spacing_ft / 2.0,
                               'cols', st_width(t.rast), 'rows', st_height(t.rast), 'spacing_ft', t.spacing_ft,
                               'note', 'x = origin_x + col*spacing, y = origin_y - row*spacing (EPSG:2274 ft)'),
    'z_min_ft', t.z_min_ft, 'z_max_ft', t.z_max_ft, 'mean_slope_pct', t.mean_slope_pct, 'max_slope_pct', t.max_slope_pct,
    'contour_interval_ft', 1, 'index_interval_ft', 5,
    'contours', v_contours, 'samples', v_samples);
end
$$;
grant execute on function public.fn_parcel_topo(integer) to anon, authenticated;
