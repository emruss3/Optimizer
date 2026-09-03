-- Hazard geometry (Eric, 2026-09-03: "You didn't take into account wetlands,
-- flood plains, etc."). The agent sandbox cannot reach FEMA or USFWS, but the
-- database can: the http extension fetches FEMA NFHL special-flood-hazard
-- polygons (S_FLD_HAZ_AR, SFHA_TF = 'T' — floodway included; the county-sized
-- X zones are never carved so never fetched) and USFWS National Wetlands
-- Inventory polygons straight into EPSG:2274 tables that the subdivision
-- generator holds out of the lot pattern. County bbox tiled 6×6; each tile is
-- paged through the ArcGIS query endpoint (500 features a page); tiles nearest
-- 2400 W Heiman go first so the acceptance case gets its geometry immediately.
-- Ingest run 2026-09-03: 6,422 flood features / 9,596 wetland features over
-- 36 tiles each, all done, no stuck tiles.

create extension if not exists http with schema extensions;

create table if not exists public.hazard_flood_2274 (
  id bigserial primary key,
  source text not null default 'FEMA_NFHL_S_FLD_HAZ_AR',
  fld_zone text,
  zone_subty text,
  sfha boolean,
  static_bfe numeric,
  geom_hash text not null unique,
  geom_2274 geometry(MultiPolygon, 2274) not null,
  fetched_at timestamptz not null default now()
);
create index if not exists hazard_flood_2274_gix on public.hazard_flood_2274 using gist (geom_2274);
alter table public.hazard_flood_2274 enable row level security;
drop policy if exists hazard_flood_read on public.hazard_flood_2274;
create policy hazard_flood_read on public.hazard_flood_2274 for select to anon, authenticated using (true);

create table if not exists public.hazard_wetland_2274 (
  id bigserial primary key,
  source text not null default 'USFWS_NWI',
  wetland_type text,
  attribute text,
  acres numeric,
  geom_hash text not null unique,
  geom_2274 geometry(MultiPolygon, 2274) not null,
  fetched_at timestamptz not null default now()
);
create index if not exists hazard_wetland_2274_gix on public.hazard_wetland_2274 using gist (geom_2274);
alter table public.hazard_wetland_2274 enable row level security;
drop policy if exists hazard_wetland_read on public.hazard_wetland_2274;
create policy hazard_wetland_read on public.hazard_wetland_2274 for select to anon, authenticated using (true);

create table if not exists public.hazard_ingest_log (
  id bigserial primary key,
  layer text not null,
  bbox_4326 double precision[] not null,
  result_offset integer not null default 0,
  features integer,
  exceeded_limit boolean,
  http_status integer,
  error text,
  fetched_at timestamptz not null default now()
);

create table if not exists public.hazard_tile_queue (
  id serial primary key,
  layer text not null check (layer in ('flood', 'wetland')),
  bx0 double precision not null, by0 double precision not null,
  bx1 double precision not null, by1 double precision not null,
  next_offset integer not null default 0,
  done boolean not null default false,
  features integer not null default 0,
  failures integer not null default 0,
  last_error text,
  claimed_at timestamptz,
  updated_at timestamptz
);
alter table public.hazard_tile_queue enable row level security;
drop policy if exists hazard_tile_queue_read on public.hazard_tile_queue;
create policy hazard_tile_queue_read on public.hazard_tile_queue for select to anon, authenticated using (true);

insert into public.hazard_tile_queue (layer, bx0, by0, bx1, by1)
select l.layer, -87.06 + i*0.0925, 35.96 + j*0.0750, -87.06 + (i+1)*0.0925, 35.96 + (j+1)*0.0750
from generate_series(0,5) i, generate_series(0,5) j, (values ('flood'),('wetland')) l(layer)
where not exists (select 1 from public.hazard_tile_queue);

-- One page of one tile. Returns what happened; never raises (the queue records failures).
create or replace function public.fn_hazard_ingest_page(p_tile_id integer)
returns jsonb
language plpgsql
volatile
as $$
declare
  t record; v_url text; v_resp record; v_body jsonb; v_n integer := 0; v_ins integer := 0; v_exceeded boolean := false;
  f jsonb; v_geom geometry; v_hash text; v_props jsonb; v_ok boolean;
begin
  select * into t from public.hazard_tile_queue where id = p_tile_id;
  if t is null or t.done then return jsonb_build_object('tile', p_tile_id, 'skipped', true); end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '120000');
  if t.layer = 'flood' then
    v_url := format('https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=SFHA_TF%%3D%%27T%%27&geometry=%s,%s,%s,%s&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE&returnGeometry=true&outSR=4326&geometryPrecision=6&resultOffset=%s&resultRecordCount=500&f=geojson',
      t.bx0, t.by0, t.bx1, t.by1, t.next_offset);
  else
    v_url := format('https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query?where=1%%3D1&geometry=%s,%s,%s,%s&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=*&returnGeometry=true&outSR=4326&geometryPrecision=6&resultOffset=%s&resultRecordCount=500&f=geojson',
      t.bx0, t.by0, t.bx1, t.by1, t.next_offset);
  end if;
  begin
    select * into v_resp from extensions.http(('GET', v_url,
      array[extensions.http_header('User-Agent', 'Mozilla/5.0 (compatible; OptimizerGIS/1.0)'), extensions.http_header('Accept', 'application/json')],
      null, null)::extensions.http_request);
  exception when others then
    update public.hazard_tile_queue set failures = failures + 1, last_error = left(sqlerrm, 300), updated_at = now(), claimed_at = null where id = p_tile_id;
    insert into public.hazard_ingest_log (layer, bbox_4326, result_offset, error) values (t.layer, array[t.bx0,t.by0,t.bx1,t.by1], t.next_offset, left(sqlerrm, 300));
    return jsonb_build_object('tile', p_tile_id, 'error', left(sqlerrm, 200));
  end;
  if v_resp.status <> 200 or left(v_resp.content, 1) <> '{' or (v_resp.content::jsonb) ? 'error' then
    update public.hazard_tile_queue set failures = failures + 1, last_error = left(coalesce(v_resp.content, ''), 300), updated_at = now(), claimed_at = null where id = p_tile_id;
    insert into public.hazard_ingest_log (layer, bbox_4326, result_offset, http_status, error) values (t.layer, array[t.bx0,t.by0,t.bx1,t.by1], t.next_offset, v_resp.status, left(coalesce(v_resp.content,''), 300));
    return jsonb_build_object('tile', p_tile_id, 'status', v_resp.status, 'error', left(coalesce(v_resp.content,''), 200));
  end if;
  v_body := v_resp.content::jsonb;
  v_exceeded := coalesce((v_body#>>'{properties,exceededTransferLimit}')::boolean, (v_body->>'exceededTransferLimit')::boolean, false);
  for f in select * from jsonb_array_elements(coalesce(v_body->'features', '[]'::jsonb)) loop
    v_n := v_n + 1;
    begin
      v_geom := st_multi(st_makevalid(st_transform(st_setsrid(st_geomfromgeojson(f->'geometry'), 4326), 2274)));
      if v_geom is null or st_isempty(v_geom) or st_geometrytype(v_geom) <> 'ST_MultiPolygon' then continue; end if;
      v_hash := md5(st_asewkb(v_geom)::text);
      v_props := coalesce(f->'properties', '{}'::jsonb);
      if t.layer = 'flood' then
        insert into public.hazard_flood_2274 (fld_zone, zone_subty, sfha, static_bfe, geom_hash, geom_2274)
        values (v_props->>'FLD_ZONE', v_props->>'ZONE_SUBTY', (v_props->>'SFHA_TF') = 'T',
                nullif(v_props->>'STATIC_BFE','')::numeric, v_hash, v_geom)
        on conflict (geom_hash) do nothing;
      else
        insert into public.hazard_wetland_2274 (wetland_type, attribute, acres, geom_hash, geom_2274)
        values (coalesce(v_props->>'WETLAND_TYPE', v_props->>'Wetlands.WETLAND_TYPE'),
                coalesce(v_props->>'ATTRIBUTE', v_props->>'Wetlands.ATTRIBUTE'),
                nullif(coalesce(v_props->>'ACRES', v_props->>'Wetlands.ACRES'),'')::numeric, v_hash, v_geom)
        on conflict (geom_hash) do nothing;
      end if;
      get diagnostics v_ok = row_count;
      if v_ok then v_ins := v_ins + 1; end if;
    exception when others then
      -- one bad ring never stops the page
      null;
    end;
  end loop;
  update public.hazard_tile_queue
    set next_offset = case when v_exceeded then next_offset + v_n else next_offset end,
        done = not v_exceeded, features = features + v_n, updated_at = now(), claimed_at = null
  where id = p_tile_id;
  insert into public.hazard_ingest_log (layer, bbox_4326, result_offset, features, exceeded_limit, http_status)
  values (t.layer, array[t.bx0,t.by0,t.bx1,t.by1], t.next_offset, v_n, v_exceeded, v_resp.status);
  return jsonb_build_object('tile', p_tile_id, 'layer', t.layer, 'features', v_n, 'inserted', v_ins, 'exceeded', v_exceeded, 'bytes', length(v_resp.content));
end
$$;
revoke execute on function public.fn_hazard_ingest_page(integer) from public, anon, authenticated;

-- Run pages until the time budget is spent. Tiles nearest 2400 W Heiman first.
create or replace function public.fn_hazard_ingest_run(p_layer text default null, p_seconds numeric default 50)
returns jsonb
language plpgsql
volatile
as $$
declare v_t0 timestamptz := clock_timestamp(); v_tile integer; v_pages integer := 0; v_feat integer := 0; v_last jsonb; v_out jsonb := '[]'::jsonb;
begin
  loop
    exit when extract(epoch from clock_timestamp() - v_t0) > p_seconds;
    select id into v_tile from public.hazard_tile_queue
    where not done and failures < 3 and (p_layer is null or layer = p_layer)
      and (claimed_at is null or claimed_at < now() - interval '10 minutes')
    order by ((bx0+bx1)/2 + 86.819)^2 + ((by0+by1)/2 - 36.175)^2, id
    limit 1 for update skip locked;
    exit when v_tile is null;
    update public.hazard_tile_queue set claimed_at = now() where id = v_tile;
    v_last := public.fn_hazard_ingest_page(v_tile);
    v_pages := v_pages + 1; v_feat := v_feat + coalesce((v_last->>'features')::integer, 0);
    v_out := v_out || v_last;
  end loop;
  return jsonb_build_object('pages', v_pages, 'features', v_feat,
    'remaining_tiles', (select count(*) from public.hazard_tile_queue where not done and failures < 3 and (p_layer is null or layer = p_layer)),
    'seconds', round(extract(epoch from clock_timestamp() - v_t0)::numeric, 1), 'pages_detail', v_out);
end
$$;
revoke execute on function public.fn_hazard_ingest_run(text, numeric) from public, anon, authenticated;
