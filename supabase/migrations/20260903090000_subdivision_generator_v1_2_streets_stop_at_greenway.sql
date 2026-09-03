-- Subdivision generator v1.2 (Eric, 2026-09-03, on the render: "You just cut a
-- road straight through the middle"). v1.1 held the floodplain and the wetland
-- out of the lots but still ran Street A the full length of 2400 W Heiman —
-- 373 ft of it through the AE floodplain and the stream — to reach an end
-- where no street had been read. A civil does not build a road through a
-- greenway on an assumption.
--
-- What changes from v1.1 (20260903070000):
--   1. STREETS STOP AT THE GREENWAY unless through-access is read (or
--      requested) at both ends. Each through-street is walked from the access
--      end along its own centreline: it takes a greenway crossing only when
--      enough developable land lies beyond it in its own row band — two lots'
--      worth for a crossing up to 60 ft (a buffer finger or a swale: a
--      culvert), one lot more per further 30 ft (a 270-ft floodplain fill
--      wants nine lots behind it) — and stops before the first crossing that
--      is not. A street that stops gets a cul-de-sac bulb; two neighbouring
--      streets of a ladder/grid that stop at the same greenway are closed by
--      a loop connector instead. The land beyond is unserved — never lotted,
--      drawn Unassigned. Every crossing taken is priced in the flags (culvert
--      / bridge).
--   2. ASSUMED ACCESS PICKS THE END WITH THE LEAST CROSSING. With no street
--      read on any edge and a greenway on the axis, the plan enters from the
--      end that serves the most developable land for the least crossing and
--      states what the other end would cost; it no longer assumes stubs
--      through a floodplain. A dead-end over 750 ft names the neighbour
--      sharing the most boundary as the second connection to negotiate.
--   3. COURTS ARE A PAIR AT THE SAME STATION. The v1.1 court took the first
--      lot slot that held the station, so the two faces drifted by up to a
--      lot width and the pairs read as random squares. Each face now takes
--      the slot NEAREST the station: exact on a regular parcel, within half a
--      lot where a greenway carves one face — without moving off the face's
--      own lot grid, so no lot is lost to the court. A court is a whole
--      number of lots wide, and none sits within 150 ft of a real crossing
--      (≥ 60 ft) or of a greenway end — the greenway is that block's green.
--   4. LOTS ONLY WHERE THE STREET REACHES: each face's lot strip is clipped to
--      its street's served range (plus the bulb), so nothing fronts a street
--      that is not there.
-- Everything else — hazards held out, streets first on the long axis, the lot
-- objective, cross connectors ≤ 600-ft blocks, rear alleys, access reading
-- with the street test, whole/irregular lots, no overlapping ROW — is v1.1.
-- Frame: EPSG:2274 feet; every area is PostGIS.

-- The served range of one street entered from one end: walk its greenway
-- crossings from the entry; take a crossing when the developable land beyond
-- it (anywhere further along, in the band the street serves) is worth it,
-- stop before the first one that is not. Pure geometry, no tables.
create or replace function public.fn_subdiv_serve(
  p_dev geometry,             -- developable land, local frame (x along the long axis)
  p_xs numeric[], p_xe numeric[],   -- crossing intervals on the centreline, ascending, merged
  p_from_start boolean,       -- entering at p_x_lo moving +x, else at p_x_hi moving −x
  p_x_lo numeric, p_x_hi numeric,
  p_band_lo numeric, p_band_hi numeric,
  p_lot_area numeric)         -- one nominal lot (width × depth), the unit of "worth it" (capped at 15,000 sf)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_n integer := coalesce(array_length(p_xs, 1), 0);
  v_k integer; v_a numeric; v_b numeric; v_len numeric; v_beyond numeric; v_thr numeric;
  v_lo numeric := p_x_lo; v_hi numeric := p_x_hi; v_end_lo text := 'boundary'; v_end_hi text := 'boundary';
  v_taken numeric := 0; v_declined numeric := 0; v_decl_x0 numeric; v_decl_x1 numeric; v_decl_beyond numeric := 0;
  v_cross jsonb := '[]'::jsonb; v_first numeric; v_near numeric := 0;
begin
  if p_from_start then
    for v_k in 1..v_n loop
      v_a := p_xs[v_k]; v_b := p_xe[v_k];
      if v_b <= p_x_lo then continue; end if;
      if v_a >= v_hi then exit; end if;
      v_len := v_b - v_a;
      v_beyond := case when v_b >= p_x_hi - 1 then 0
                       else st_area(st_intersection(p_dev, st_makeenvelope(v_b, p_band_lo, p_x_hi, p_band_hi, 2274))) end;
      -- worth it: two lots' worth of land beyond a 60-ft crossing (a culvert), a lot more per
      -- 30 ft of crossing beyond that (a 270-ft floodplain fill wants nine lots behind it);
      -- the lot is capped at an R15 lot so estate districts are judged on land, not on 2-ac lots
      v_thr := greatest(2, v_len / 30) * least(p_lot_area, 15000);
      if v_beyond >= v_thr then
        v_taken := v_taken + v_len;
        v_cross := v_cross || jsonb_build_object('x0', round(v_a), 'x1', round(v_b), 'length_ft', round(v_len), 'taken', true, 'beyond_sqft', round(v_beyond));
      else
        v_hi := v_a; v_end_hi := 'greenway'; v_declined := v_len; v_decl_x0 := v_a; v_decl_x1 := v_b; v_decl_beyond := v_beyond;
        v_cross := v_cross || jsonb_build_object('x0', round(v_a), 'x1', round(v_b), 'length_ft', round(v_len), 'taken', false, 'beyond_sqft', round(v_beyond));
        exit;
      end if;
    end loop;
    select coalesce(min(p_xs[i]), p_x_hi) into v_first from generate_subscripts(p_xs, 1) i where p_xe[i] > p_x_lo;
    if least(v_first, v_hi) > p_x_lo + 1 then
      v_near := st_area(st_intersection(p_dev, st_makeenvelope(p_x_lo, p_band_lo, least(v_first, v_hi), p_band_hi, 2274)));
    end if;
  else
    for v_k in reverse v_n..1 loop
      v_a := p_xs[v_k]; v_b := p_xe[v_k];
      if v_a >= p_x_hi then continue; end if;
      if v_b <= v_lo then exit; end if;
      v_len := v_b - v_a;
      v_beyond := case when v_a <= p_x_lo + 1 then 0
                       else st_area(st_intersection(p_dev, st_makeenvelope(p_x_lo, p_band_lo, v_a, p_band_hi, 2274))) end;
      v_thr := greatest(2, v_len / 30) * least(p_lot_area, 15000);
      if v_beyond >= v_thr then
        v_taken := v_taken + v_len;
        v_cross := v_cross || jsonb_build_object('x0', round(v_a), 'x1', round(v_b), 'length_ft', round(v_len), 'taken', true, 'beyond_sqft', round(v_beyond));
      else
        v_lo := v_b; v_end_lo := 'greenway'; v_declined := v_len; v_decl_x0 := v_a; v_decl_x1 := v_b; v_decl_beyond := v_beyond;
        v_cross := v_cross || jsonb_build_object('x0', round(v_a), 'x1', round(v_b), 'length_ft', round(v_len), 'taken', false, 'beyond_sqft', round(v_beyond));
        exit;
      end if;
    end loop;
    select coalesce(max(p_xe[i]), p_x_lo) into v_first from generate_subscripts(p_xs, 1) i where p_xs[i] < p_x_hi;
    if greatest(v_first, v_lo) < p_x_hi - 1 then
      v_near := st_area(st_intersection(p_dev, st_makeenvelope(greatest(v_first, v_lo), p_band_lo, p_x_hi, p_band_hi, 2274)));
    end if;
  end if;
  return jsonb_build_object(
    'x_lo', v_lo, 'x_hi', v_hi, 'end_lo', v_end_lo, 'end_hi', v_end_hi,
    'crossing_ft', round(v_taken), 'declined_ft', round(v_declined),
    'declined_x0', round(v_decl_x0), 'declined_x1', round(v_decl_x1), 'declined_beyond_sqft', round(v_decl_beyond),
    'served_sqft', round(st_area(st_intersection(p_dev, st_makeenvelope(v_lo, p_band_lo, v_hi, p_band_hi, 2274)))),
    'near_sqft', round(v_near), 'crossings', v_cross);
end
$$;
revoke execute on function public.fn_subdiv_serve(geometry, numeric[], numeric[], boolean, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.fn_generate_subdivision(
  p_ogc_fid integer,
  p_lot_width_ft numeric default null,
  p_lot_depth_ft numeric default null,
  p_row_width_ft numeric default 55,
  p_alley_width_ft numeric default 20,
  p_court_spacing_ft numeric default 600,
  p_max_block_ft numeric default 600,
  p_amenity_pct numeric default 0,
  p_access text default 'auto')
returns jsonb
language plpgsql
stable
as $function$
declare
  -- parcel + oriented frame
  v_g geometry; v_g4326 geometry; v_area numeric; v_obb geometry; v_ring geometry; v_p1 geometry; v_p2 geometry; v_p3 geometry;
  v_l12 double precision; v_l23 double precision; v_theta double precision;
  v_L numeric; v_W numeric; v_cx double precision; v_cy double precision; v_cs double precision; v_sn double precision;
  v_pl geometry; v_pl_dev geometry;
  -- hazards
  v_flood geometry; v_wet geometry; v_haz geometry; v_haz_l geometry; v_dev geometry;
  v_haz_area numeric := 0; v_flood_area numeric := 0; v_wet_area numeric := 0; v_haz_covered boolean := false;
  v_hazards jsonb := '[]'::jsonb; v_hx0 numeric; v_cross numeric;
  -- standards
  v_ctx jsonb; v_front numeric; v_rear numeric; v_min_area numeric; v_min_w numeric;
  v_depth_target numeric; v_dmin numeric; v_d numeric; v_dd numeric; v_lot_w numeric; v_lot_w_basis text; v_depth_basis text;
  v_row numeric := p_row_width_ft; v_alley numeric := p_alley_width_ft;
  -- cross-section solve
  v_n integer := 0; v_nd integer; v_ea numeric; v_pitch numeric; v_used numeric; v_left numeric := 0; v_extra numeric := 0;
  v_single_loaded boolean := false; v_y numeric[] := '{}'; v_best_lots numeric := 0; v_lw_d numeric; v_lots_d numeric;
  v_fedge geometry; v_whole boolean; v_ok boolean; v_irregular integer := 0; v_through_union geometry;
  -- access
  v_nb geometry; v_unshared geometry; v_len_start numeric := 0; v_len_end numeric := 0;
  v_len_top numeric := 0; v_len_bot numeric := 0; v_acc_start boolean := false; v_acc_end boolean := false;
  v_seg geometry; v_mid geometry; v_mx numeric; v_my numeric; v_sidx integer; v_side_w geometry; v_gap_tmp numeric;
  v_side_len numeric[] := array[0,0,0,0]; v_side_geom geometry[] := array[null,null,null,null]::geometry[];
  v_side_gap numeric[] := array[null,null,null,null]::numeric[]; v_side_street boolean[] := array[false,false,false,false];
  v_nb_start text; v_nb_end text; v_nb_big text; v_nb_big_ft numeric;
  v_access text; v_access_basis text; v_side_x numeric; v_side_sign integer := 0; v_assumed boolean := false;
  v_x_lo numeric; v_x_hi numeric; v_bulb_start boolean := false; v_bulb_end boolean := false;
  v_deadend_start numeric := 0; v_deadend_end numeric := 0; v_bulbs geometry[] := '{}'; v_far_zone geometry;
  -- greenway crossings + served range per through-street (v1.2)
  v_xs_raw numeric[]; v_xe_raw numeric[]; v_xs numeric[]; v_xe numeric[]; v_ncross integer := 0; v_any_cross boolean := false;
  v_serve jsonb; v_s1 jsonb; v_s2 jsonb; v_srv jsonb[] := '{}'; v_srv_s jsonb[] := '{}'; v_srv_e jsonb[] := '{}';
  v_slo numeric[] := '{}'; v_shi numeric[] := '{}'; v_elo text[] := '{}'; v_ehi text[] := '{}';
  v_looped_lo boolean[] := '{}'; v_looped_hi boolean[] := '{}';
  v_band_lo numeric; v_band_hi numeric; v_end_lo text := 'boundary'; v_end_hi text := 'boundary';
  v_cross_taken numeric := 0; v_cross_declined numeric := 0; v_decl_beyond numeric := 0; v_lot_area numeric; v_pick_start boolean; v_alt jsonb;
  v_tot_s numeric; v_tot_e numeric; v_cr_s numeric; v_cr_e numeric; v_near_s numeric; v_near_e numeric;
  v_axs numeric[] := '{}'; v_axe numeric[] := '{}'; v_c jsonb;
  v_srv_len numeric; v_unserved numeric := 0; v_served_union geometry;
  v_loop_x numeric[] := '{}'; v_loop_i integer[] := '{}'; v_loop_name text[] := '{}'; v_lx numeric;
  -- network
  v_streets geometry[] := '{}'; v_street_meta jsonb := '[]'::jsonb; v_row_union geometry; v_str geometry; v_ln geometry; v_seg_g geometry;
  v_cross_x numeric[] := '{}'; v_k integer := 1; v_i integer; v_j integer; v_sgn integer; v_ncon integer := 0;
  v_network text; v_blocks integer := 0; v_street_len numeric := 0; v_row_area numeric := 0; v_loops integer := 0;
  -- amenity / lots / alleys / courts
  v_amenity geometry; v_amenity_area numeric := 0; v_amenity_len numeric := 0; v_head text;
  v_dface numeric; v_has_alley boolean; v_ylo numeric; v_yhi numeric; v_alo numeric; v_ahi numeric;
  v_strip geometry; v_piece geometry; v_px0 numeric; v_px1 numeric; v_t numeric;
  v_rect geometry; v_lotg geometry; v_a numeric; v_court_here boolean; v_court_w numeric;
  v_court_x numeric[] := '{}'; v_ci integer; v_cst numeric; v_nstations integer := 0; v_best_score numeric; v_c0 numeric;
  v_lots jsonb := '[]'::jsonb; v_nlots integer := 0; v_lot_area_sum numeric := 0; v_min_lot numeric; v_lots_g geometry[] := '{}';
  v_alleys geometry[] := '{}'; v_alley_union geometry; v_alley_area numeric := 0;
  v_courts_g geometry[] := '{}'; v_ncourts integer := 0; v_court_area numeric := 0;
  v_residual geometry; v_residual_area numeric := 0; v_placed_union geometry;
  v_fema jsonb; v_ae_pct numeric := 0; v_flags jsonb := '[]'::jsonb; v_basis text; v_buildable numeric;
  v_front_loaded integer := 0;
begin
  -- 1. Parcel (largest polygon) and its oriented frame
  select d.geom into v_g
  from public.parcels p, lateral st_dump(p.geom_2274) d
  where p.ogc_fid = p_ogc_fid
  order by st_area(d.geom) desc limit 1;
  if v_g is null then
    return jsonb_build_object('error','parcel not found','parcel_ogc_fid',p_ogc_fid);
  end if;
  select wkb_geometry_4326 into v_g4326 from public.parcels where ogc_fid = p_ogc_fid;
  v_g := st_makevalid(v_g);
  if st_geometrytype(v_g) <> 'ST_Polygon' then
    select d.geom into v_g from st_dump(st_collectionextract(v_g, 3)) d order by st_area(d.geom) desc limit 1;
  end if;
  v_area := st_area(v_g);
  v_obb := st_orientedenvelope(v_g);
  v_ring := st_exteriorring(v_obb);
  v_p1 := st_pointn(v_ring,1); v_p2 := st_pointn(v_ring,2); v_p3 := st_pointn(v_ring,3);
  v_l12 := st_distance(v_p1,v_p2); v_l23 := st_distance(v_p2,v_p3);
  if v_l12 >= v_l23 then
    v_theta := atan2(st_y(v_p2)-st_y(v_p1), st_x(v_p2)-st_x(v_p1)); v_L := v_l12; v_W := v_l23;
  else
    v_theta := atan2(st_y(v_p3)-st_y(v_p2), st_x(v_p3)-st_x(v_p2)); v_L := v_l23; v_W := v_l12;
  end if;
  v_cx := st_x(st_centroid(v_obb)); v_cy := st_y(st_centroid(v_obb));
  v_cs := cos(v_theta); v_sn := sin(v_theta);
  v_pl := st_makevalid(st_affine(v_g, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy)));

  -- 1b. Hazards held out of the lot pattern (v1.1). Coverage first.
  select coalesce(bool_and(t.done), false) into v_haz_covered
  from public.hazard_tile_queue t
  where t.layer = 'flood' and st_intersects(st_makeenvelope(t.bx0, t.by0, t.bx1, t.by1, 4326), v_g4326);
  select st_union(st_intersection(h.geom_2274, v_g)) into v_flood
  from public.hazard_flood_2274 h where h.sfha and st_intersects(h.geom_2274, v_g);
  select st_union(st_intersection(st_buffer(w.geom_2274, 25), v_g)) into v_wet
  from public.hazard_wetland_2274 w where st_dwithin(w.geom_2274, v_g, 25);
  if v_flood is not null and (st_isempty(v_flood) or st_area(v_flood) < 1) then v_flood := null; end if;
  if v_wet is not null and (st_isempty(v_wet) or st_area(v_wet) < 1) then v_wet := null; end if;
  v_flood_area := coalesce(st_area(v_flood), 0); v_wet_area := coalesce(st_area(v_wet), 0);
  v_haz := case when v_flood is null then v_wet when v_wet is null then v_flood else st_union(v_flood, v_wet) end;
  if v_haz is not null then
    v_haz := st_makevalid(v_haz); v_haz_area := st_area(v_haz);
    v_dev := st_makevalid(st_difference(v_g, v_haz));
    v_flags := v_flags || to_jsonb(format('hazard_held_out_%s_pct_of_parcel_floodplain_%s_pct_wetland_%s_pct',
      round(100*v_haz_area/v_area, 1), round(100*v_flood_area/v_area, 1), round(100*v_wet_area/v_area, 1)));
    v_haz_l := st_collectionextract(st_makevalid(st_affine(v_haz, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy))), 3);
    if v_haz_l is null or st_isempty(v_haz_l) then v_haz_l := null; end if;
  else
    v_dev := v_g;
  end if;
  if not v_haz_covered then v_flags := v_flags || '"hazard_layers_not_ingested_for_this_area_yet"'::jsonb; end if;
  v_pl_dev := st_buffer(st_makevalid(st_affine(v_dev, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy))), 0);
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', case when h.zone_subty ilike '%FLOODWAY%' then 'floodway' else 'floodplain' end,
           'zone', h.fld_zone, 'subtype', h.zone_subty,
           'geom_2274', st_asgeojson(st_intersection(h.geom_2274, v_g))::jsonb,
           'area_sqft', round(st_area(st_intersection(h.geom_2274, v_g))))), '[]'::jsonb)
  into v_hazards
  from public.hazard_flood_2274 h where h.sfha and st_intersects(h.geom_2274, v_g) and st_area(st_intersection(h.geom_2274, v_g)) >= 50;
  select v_hazards || coalesce(jsonb_agg(jsonb_build_object(
           'kind', 'wetland', 'zone', w.attribute, 'subtype', w.wetland_type, 'buffer_ft', 25,
           'geom_2274', st_asgeojson(st_intersection(st_buffer(w.geom_2274, 25), v_g))::jsonb,
           'area_sqft', round(st_area(st_intersection(st_buffer(w.geom_2274, 25), v_g))))), '[]'::jsonb)
  into v_hazards
  from public.hazard_wetland_2274 w where st_dwithin(w.geom_2274, v_g, 25) and st_area(st_intersection(st_buffer(w.geom_2274, 25), v_g)) >= 50;
  if st_area(v_dev) < 0.15 * v_area then
    return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.2',
      'error', 'parcel_mostly_in_flood_hazard_or_wetland', 'hazards', v_hazards,
      'metrics', jsonb_build_object('lots', 0, 'parcel_sqft', round(v_area), 'hazard_sqft', round(v_haz_area),
                                    'pct_land_hazard', round(100*v_haz_area/v_area, 1)),
      'flags', v_flags || '"parcel_mostly_hazard"'::jsonb);
  end if;

  -- 2. District standards → lot depth target, then width from the minimum area
  v_ctx := public.fn_resolve_design_context(p_ogc_fid, 'single_family');
  v_front := coalesce(nullif(v_ctx#>>'{setbacks,front,value}','')::numeric, 20);
  v_rear := coalesce(nullif(v_ctx#>>'{setbacks,rear,value}','')::numeric, 20);
  v_min_area := nullif(v_ctx#>>'{min_lot_area_sqft,value}','')::numeric;
  v_min_w := nullif(v_ctx#>>'{min_lot_width_ft,value}','')::numeric;
  if v_min_area is not null and v_min_area >= 40000 and p_alley_width_ft = 20 then
    v_alley := 0; v_flags := v_flags || '"estate_lots_no_alleys_front_loaded"'::jsonb;
  end if;
  if p_lot_depth_ft is not null then
    v_depth_target := p_lot_depth_ft; v_depth_basis := 'requested';
  elsif v_min_area is not null and v_min_area > 0 then
    v_depth_target := least(220, greatest(90, round(sqrt(1.5 * v_min_area) / 5) * 5)); v_depth_basis := 'district_min_lot_area';
  else
    v_depth_target := 100; v_depth_basis := 'default_100';
  end if;
  v_dmin := greatest(70, round(0.6 * v_depth_target / 5) * 5);

  -- 3. Cross-section solve (v1): through-streets across the short axis, objective = lots
  v_ea := v_alley;
  v_dd := v_depth_target; v_best_lots := 0;
  while v_dd >= v_dmin loop
    v_pitch := v_row + 2*v_dd + v_alley;
    v_nd := floor((v_W - v_ea) / v_pitch);
    if v_nd >= 1 then
      v_lw_d := case when p_lot_width_ft is not null then p_lot_width_ft
                     when v_min_area is not null and v_min_area > 0 then greatest(coalesce(v_min_w, 0), ceil(v_min_area / v_dd / 5.0) * 5)
                     else coalesce(v_min_w, 50) end;
      v_lots_d := 2 * v_nd * floor(v_L / v_lw_d);
      if v_lots_d > 1.08 * v_best_lots then v_best_lots := v_lots_d; v_n := v_nd; v_d := v_dd; end if;
    end if;
    v_dd := v_dd - 5;
  end loop;
  if v_n = 0 then
    v_ea := 0; v_dd := v_depth_target; v_best_lots := 0;
    while v_dd >= v_dmin loop
      v_pitch := v_row + 2*v_dd + v_alley;
      v_nd := floor((v_W + v_alley) / v_pitch);
      if v_nd >= 1 then
        v_lw_d := case when p_lot_width_ft is not null then p_lot_width_ft
                       when v_min_area is not null and v_min_area > 0 then greatest(coalesce(v_min_w, 0), ceil(v_min_area / v_dd / 5.0) * 5)
                       else coalesce(v_min_w, 50) end;
        v_lots_d := 2 * v_nd * floor(v_L / v_lw_d);
        if v_lots_d > 1.08 * v_best_lots then v_best_lots := v_lots_d; v_n := v_nd; v_d := v_dd; end if;
      end if;
      v_dd := v_dd - 5;
    end loop;
    if v_n > 0 then v_flags := v_flags || '"edge_alleys_dropped_outer_rows_front_loaded"'::jsonb; end if;
  end if;
  if v_n = 0 and v_W - v_row >= v_dmin then
    v_single_loaded := true; v_n := 1; v_ea := 0;
    v_d := least(v_depth_target, floor((v_W - v_row)/5)*5);
    v_flags := v_flags || '"single_loaded_street_parcel_too_narrow_for_two_rows"'::jsonb;
  end if;
  if v_n = 0 then
    return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.2',
      'error', 'parcel_too_narrow_for_a_street_and_a_lot', 'hazards', v_hazards,
      'metrics', jsonb_build_object('lots', 0, 'obb_length_ft', round(v_L), 'obb_width_ft', round(v_W), 'parcel_sqft', round(v_area)),
      'flags', v_flags || '"parcel_too_narrow"'::jsonb);
  end if;
  if v_d < v_depth_target then
    v_flags := v_flags || to_jsonb(format('lot_depth_reduced_%s_to_%s_ft_to_fit_%s_ft_width', v_depth_target, v_d, round(v_W)));
  end if;

  if p_lot_width_ft is not null then
    v_lot_w := p_lot_width_ft; v_lot_w_basis := 'requested';
  elsif v_min_area is not null and v_min_area > 0 then
    v_lot_w := greatest(coalesce(v_min_w, 0), ceil(v_min_area / v_d / 5.0) * 5);
    v_lot_w_basis := format('district_min_lot_area_%s_sqft_at_%s_ft_depth', v_min_area, v_d);
  elsif v_min_w is not null then
    v_lot_w := v_min_w; v_lot_w_basis := 'district_min_lot_width';
  else
    v_lot_w := 50; v_lot_w_basis := 'default_50';
  end if;
  -- a court is a whole number of lots wide (one lot; two 25-ft SP lots) so it sits on the lot grid
  v_court_w := v_lot_w * ceil(40 / v_lot_w);
  v_lot_area := v_lot_w * v_d;
  v_buildable := v_d - v_front - v_rear;
  if v_buildable <= 0 then v_flags := v_flags || '"buildable_depth_not_positive_after_setbacks"'::jsonb; end if;

  v_pitch := v_row + 2*v_d + v_alley;
  if v_single_loaded then
    v_used := v_row + v_d; v_left := greatest(v_W - v_used, 0); v_extra := least(v_left, 40);
    v_y := array[-v_W/2 + v_row/2];
  else
    v_used := v_n*v_pitch - v_alley + 2*v_ea; v_left := greatest(v_W - v_used, 0); v_extra := least(v_left/2, 40);
    for v_i in 1..v_n loop
      v_y := v_y || (-v_W/2 + v_left/2 + v_ea + v_d + v_row/2 + (v_i-1)*v_pitch);
    end loop;
  end if;

  -- 4. Access (v1): unshared boundary by OBB side, then the street test
  select st_union(p.geom_2274) into v_nb
  from public.parcels p where p.ogc_fid <> p_ogc_fid and st_dwithin(p.geom_2274, v_g, 2);
  if v_nb is null then v_unshared := st_boundary(v_g);
  else v_unshared := st_difference(st_boundary(v_g), st_buffer(v_nb, 1.5)); end if;
  if v_unshared is not null and not st_isempty(v_unshared) then
    v_unshared := st_affine(v_unshared, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy));
    for v_seg in select s.geom from st_dumpsegments(v_unshared) s loop
      if st_length(v_seg) < 1 then continue; end if;
      v_mid := st_lineinterpolatepoint(v_seg, 0.5); v_mx := st_x(v_mid); v_my := st_y(v_mid);
      if (v_L/2 - abs(v_mx))/v_L < (v_W/2 - abs(v_my))/v_W then
        v_sidx := case when v_mx < 0 then 1 else 2 end;
      else
        v_sidx := case when v_my < 0 then 3 else 4 end;
      end if;
      v_side_len[v_sidx] := v_side_len[v_sidx] + st_length(v_seg);
      v_side_geom[v_sidx] := case when v_side_geom[v_sidx] is null then v_seg else st_collect(v_side_geom[v_sidx], v_seg) end;
    end loop;
    for v_sidx in 1..4 loop
      if v_side_len[v_sidx] >= 25 then
        v_side_w := public.fn_subdiv_world(st_setsrid(v_side_geom[v_sidx], 2274), v_cs, v_sn, v_cx, v_cy);
        select min(st_distance(p.geom_2274, v_side_w)) into v_gap_tmp
        from public.parcels p
        where p.ogc_fid <> p_ogc_fid and st_dwithin(p.geom_2274, v_side_w, 120) and not st_dwithin(p.geom_2274, v_g, 2);
        v_side_gap[v_sidx] := v_gap_tmp;
        v_side_street[v_sidx] := v_gap_tmp is not null and v_gap_tmp between 15 and 90;
        if not v_side_street[v_sidx] then
          v_flags := v_flags || to_jsonb(format('unshared_%s_edge_%s_ft_gap_%s_not_read_as_street',
            (array['start','end','bottom','top'])[v_sidx], round(v_side_len[v_sidx]),
            coalesce(round(v_gap_tmp)::text || '_ft', 'none_within_120_ft')));
        end if;
      end if;
    end loop;
  end if;
  v_len_start := v_side_len[1]; v_len_end := v_side_len[2]; v_len_bot := v_side_len[3]; v_len_top := v_side_len[4];
  v_acc_start := v_len_start >= least(40, 0.3*v_W) and v_side_street[1];
  v_acc_end := v_len_end >= least(40, 0.3*v_W) and v_side_street[2];
  select string_agg(distinct coalesce(nullif(p.address,''), p.owner), '; ') into v_nb_start
  from public.parcels p where p.ogc_fid <> p_ogc_fid
    and st_dwithin(p.geom_2274, public.fn_subdiv_world(st_makeenvelope(-v_L/2 - 10, -v_W/2, -v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy), 2);
  select string_agg(distinct coalesce(nullif(p.address,''), p.owner), '; ') into v_nb_end
  from public.parcels p where p.ogc_fid <> p_ogc_fid
    and st_dwithin(p.geom_2274, public.fn_subdiv_world(st_makeenvelope(v_L/2 - 10, -v_W/2, v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy), 2);
  if p_access = 'both' then v_acc_start := true; v_acc_end := true; v_access_basis := 'requested';
  elsif p_access = 'start' then v_acc_start := true; v_acc_end := false; v_access_basis := 'requested';
  elsif p_access = 'end' then v_acc_start := false; v_acc_end := true; v_access_basis := 'requested';
  elsif v_acc_start or v_acc_end then v_access_basis := 'street_across_unshared_boundary_at_end_of_long_axis';
  elsif (v_side_street[4] and v_len_top >= 100) or (v_side_street[3] and v_len_bot >= 100) then
    v_side_sign := case when (v_side_street[4] and v_len_top >= 100) and (not (v_side_street[3] and v_len_bot >= 100) or v_len_top >= v_len_bot) then 1 else -1 end;
    v_side_x := st_x(st_centroid(v_side_geom[case when v_side_sign = 1 then 4 else 3 end]));
    v_access_basis := 'street_across_unshared_long_side_entrance_connector';
  else
    v_acc_start := true; v_acc_end := true; v_access_basis := 'assumed_both_ends_no_street_read_on_any_edge'; v_assumed := true;
  end if;
  v_access := case when v_side_sign <> 0 then 'side' when v_acc_start and v_acc_end then 'both' when v_acc_start then 'start' else 'end' end;

  -- 4b. Greenway crossings PER THROUGH-STREET (its own centreline against the held-out land) and
  --     the SERVED RANGE of each street: from the access end it takes a crossing only when the
  --     land beyond it in its own row band is worth it, and stops before the first that is not.
  --     Through-access read (or requested) at both ends runs every street through, every crossing
  --     priced. Assumed access is decided after all streets are walked from both ends.
  v_x_lo := -v_L/2 - 5; v_x_hi := v_L/2 + 5;
  for v_i in 1..v_n loop
    v_band_lo := greatest(-v_W/2 - 5, v_y[v_i] - v_row/2 - v_d - v_extra - v_alley);
    v_band_hi := least(v_W/2 + 5, v_y[v_i] + v_row/2 + v_d + v_extra + v_alley);
    v_xs := '{}'; v_xe := '{}';
    if v_haz_l is not null then
      select array_agg(x0 order by x0), array_agg(x1 order by x0) into v_xs_raw, v_xe_raw
      from (
        select st_xmin(s.geom)::numeric x0, st_xmax(s.geom)::numeric x1
        from st_dump(st_intersection(st_setsrid(st_makeline(st_point(v_x_lo, v_y[v_i]), st_point(v_x_hi, v_y[v_i])), 2274), v_haz_l)) s
        where st_length(s.geom) >= 5
      ) q;
      for v_j in 1..coalesce(array_length(v_xs_raw, 1), 0) loop
        if coalesce(array_length(v_xs, 1), 0) = 0 or v_xs_raw[v_j] > v_xe[array_length(v_xe, 1)] + 10 then
          v_xs := v_xs || v_xs_raw[v_j]; v_xe := v_xe || v_xe_raw[v_j];
        elsif v_xe_raw[v_j] > v_xe[array_length(v_xe, 1)] then
          v_xe[array_length(v_xe, 1)] := v_xe_raw[v_j];
        end if;
      end loop;
    end if;
    v_ncross := coalesce(array_length(v_xs, 1), 0);
    v_serve := null;
    if v_ncross = 0 then
      v_serve := jsonb_build_object('x_lo', v_x_lo, 'x_hi', v_x_hi, 'end_lo', 'boundary', 'end_hi', 'boundary',
        'crossing_ft', 0, 'declined_ft', 0, 'declined_beyond_sqft', 0, 'crossings', '[]'::jsonb, 'near_sqft', 0,
        'served_sqft', round(st_area(st_intersection(v_pl_dev, st_makeenvelope(v_x_lo, v_band_lo, v_x_hi, v_band_hi, 2274)))));
      v_srv_s[v_i] := v_serve; v_srv_e[v_i] := v_serve;
    elsif v_access = 'both' and not v_assumed then
      select jsonb_build_object('x_lo', v_x_lo, 'x_hi', v_x_hi, 'end_lo', 'boundary', 'end_hi', 'boundary',
               'crossing_ft', round(sum(v_xe[k] - v_xs[k])), 'declined_ft', 0, 'declined_beyond_sqft', 0, 'near_sqft', 0,
               'crossings', jsonb_agg(jsonb_build_object('x0', round(v_xs[k]), 'x1', round(v_xe[k]), 'length_ft', round(v_xe[k] - v_xs[k]), 'taken', true)),
               'served_sqft', round(st_area(st_intersection(v_pl_dev, st_makeenvelope(v_x_lo, v_band_lo, v_x_hi, v_band_hi, 2274)))))
      into v_serve from generate_subscripts(v_xs, 1) k;
    elsif v_access = 'start' then
      v_serve := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, true, v_x_lo, v_x_hi, v_band_lo, v_band_hi, v_lot_area);
    elsif v_access = 'end' then
      v_serve := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, false, v_x_lo, v_x_hi, v_band_lo, v_band_hi, v_lot_area);
    elsif v_access = 'side' then
      v_s1 := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, true, v_side_x, v_x_hi, v_band_lo, v_band_hi, v_lot_area);
      v_s2 := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, false, v_x_lo, v_side_x, v_band_lo, v_band_hi, v_lot_area);
      v_serve := jsonb_build_object('x_lo', v_s2->'x_lo', 'x_hi', v_s1->'x_hi', 'end_lo', v_s2->'end_lo', 'end_hi', v_s1->'end_hi',
        'crossing_ft', (v_s1->>'crossing_ft')::numeric + (v_s2->>'crossing_ft')::numeric,
        'declined_ft', (v_s1->>'declined_ft')::numeric + (v_s2->>'declined_ft')::numeric,
        'declined_beyond_sqft', (v_s1->>'declined_beyond_sqft')::numeric + (v_s2->>'declined_beyond_sqft')::numeric,
        'served_sqft', (v_s1->>'served_sqft')::numeric + (v_s2->>'served_sqft')::numeric, 'near_sqft', 0,
        'crossings', (v_s2->'crossings') || (v_s1->'crossings'));
    else
      -- assumed: both candidates, decided below over the whole network
      v_srv_s[v_i] := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, true, v_x_lo, v_x_hi, v_band_lo, v_band_hi, v_lot_area);
      v_srv_e[v_i] := public.fn_subdiv_serve(v_pl_dev, v_xs, v_xe, false, v_x_lo, v_x_hi, v_band_lo, v_band_hi, v_lot_area);
      v_any_cross := true;
    end if;
    v_srv[v_i] := v_serve;
  end loop;
  if v_assumed and v_any_cross then
    -- assumed both ends and a greenway on the axis: enter from the end that serves the most
    -- developable land for the least crossing; no stub through a floodplain on a guess
    select sum((s->>'served_sqft')::numeric), sum((s->>'crossing_ft')::numeric), sum(coalesce((s->>'near_sqft')::numeric, 0))
      into v_tot_s, v_cr_s, v_near_s from unnest(v_srv_s) s;
    select sum((s->>'served_sqft')::numeric), sum((s->>'crossing_ft')::numeric), sum(coalesce((s->>'near_sqft')::numeric, 0))
      into v_tot_e, v_cr_e, v_near_e from unnest(v_srv_e) s;
    if abs(v_tot_s - v_tot_e) > 0.10 * st_area(v_pl_dev) then v_pick_start := v_tot_s > v_tot_e;
    elsif v_cr_s <> v_cr_e then v_pick_start := v_cr_s < v_cr_e;
    elsif v_near_s <> v_near_e then v_pick_start := v_near_s > v_near_e;
    else v_pick_start := true; end if;
    for v_i in 1..v_n loop
      v_srv[v_i] := case when v_pick_start then v_srv_s[v_i] else v_srv_e[v_i] end;
    end loop;
    v_alt := jsonb_build_object('end', case when v_pick_start then 'end' else 'start' end,
      'crossing_ft', round(case when v_pick_start then v_cr_e else v_cr_s end),
      'served_sqft', round(case when v_pick_start then v_tot_e else v_tot_s end),
      'across', case when v_pick_start then v_nb_end else v_nb_start end);
    v_acc_start := v_pick_start; v_acc_end := not v_pick_start;
    v_access := case when v_pick_start then 'start' else 'end' end;
    v_access_basis := format('assumed_%s_end_no_street_read_least_greenway_crossing', v_access);
    v_flags := v_flags || to_jsonb(format('access_assumed_from_%s_end_%s_ft_of_greenway_crossing_the_%s_end_would_cross_%s_ft',
      v_access, round(case when v_pick_start then v_cr_s else v_cr_e end), v_alt->>'end', v_alt->>'crossing_ft'));
  elsif v_assumed then
    v_flags := v_flags || '"access_assumed_both_ends_stubs_to_neighbours"'::jsonb;
  end if;
  for v_i in 1..v_n loop
    v_slo[v_i] := (v_srv[v_i]->>'x_lo')::numeric; v_shi[v_i] := (v_srv[v_i]->>'x_hi')::numeric;
    v_elo[v_i] := v_srv[v_i]->>'end_lo'; v_ehi[v_i] := v_srv[v_i]->>'end_hi';
    v_looped_lo[v_i] := false; v_looped_hi[v_i] := false;
    v_cross_taken := v_cross_taken + coalesce((v_srv[v_i]->>'crossing_ft')::numeric, 0);
    v_cross_declined := v_cross_declined + coalesce((v_srv[v_i]->>'declined_ft')::numeric, 0);
    v_decl_beyond := v_decl_beyond + coalesce((v_srv[v_i]->>'declined_beyond_sqft')::numeric, 0);
  end loop;
  select min(x) into v_x_lo from unnest(v_slo) x;
  select max(x) into v_x_hi from unnest(v_shi) x;
  v_end_lo := case when 'greenway' = any(v_elo) then 'greenway' else 'boundary' end;
  v_end_hi := case when 'greenway' = any(v_ehi) then 'greenway' else 'boundary' end;
  if v_cross_declined > 0 then
    v_flags := v_flags || to_jsonb(format('street_stops_at_the_greenway_%s_end_declined_%s_ft_crossing_for_%s_sqft_beyond',
      case when v_end_lo = 'greenway' and v_end_hi = 'greenway' then 'either' when v_end_lo = 'greenway' then 'start' else 'end' end,
      round(v_cross_declined), round(v_decl_beyond)));
  end if;
  v_srv_len := v_x_hi - v_x_lo;

  -- 4c. Dead ends. One street across: a bulb at a greenway end always (a true dead end), at a
  --     boundary end when the dead-end exceeds 750 ft (a shorter one is a stub to the neighbour).
  --     A ladder/grid: two neighbouring streets stopping at the same greenway (within 100 ft)
  --     are closed by a loop connector; a street stopping alone gets a bulb.
  if v_n = 1 then
    if v_access = 'start' then v_deadend_end := v_srv_len;
    elsif v_access = 'end' then v_deadend_start := v_srv_len;
    elsif v_access = 'side' then v_deadend_start := v_side_x - v_x_lo; v_deadend_end := v_x_hi - v_side_x;
    end if;
    v_bulb_start := v_end_lo = 'greenway' or v_deadend_start > 750;
    v_bulb_end := v_end_hi = 'greenway' or v_deadend_end > 750;
    if v_bulb_start then
      if v_end_lo = 'greenway' then v_x_lo := v_x_lo + 60;
      else v_x_lo := -(v_L/2 - v_ea - 52); end if;
      v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_x_lo, v_y[1]), 2274), 50), v_pl_dev);
      if v_end_lo = 'greenway' then
        v_flags := v_flags || to_jsonb(format('cul_de_sac_at_start_end_street_ends_at_the_greenway_dead_end_%s_ft', round(v_deadend_start)));
      else
        v_flags := v_flags || to_jsonb(format('cul_de_sac_at_start_end_dead_end_%s_ft_over_750', round(v_deadend_start)));
        v_far_zone := public.fn_subdiv_world(st_makeenvelope(-v_L/2 - 10, -v_W/2, -v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy);
        if v_nb is not null and st_intersects(v_nb, v_far_zone) then v_flags := v_flags || '"through_connection_possible_at_start_end_via_neighbour_parcel"'::jsonb; end if;
      end if;
    end if;
    if v_bulb_end then
      if v_end_hi = 'greenway' then v_x_hi := v_x_hi - 60;
      else v_x_hi := v_L/2 - v_ea - 52; end if;
      v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_x_hi, v_y[1]), 2274), 50), v_pl_dev);
      if v_end_hi = 'greenway' then
        v_flags := v_flags || to_jsonb(format('cul_de_sac_at_end_end_street_ends_at_the_greenway_dead_end_%s_ft', round(v_deadend_end)));
      else
        v_flags := v_flags || to_jsonb(format('cul_de_sac_at_end_end_dead_end_%s_ft_over_750', round(v_deadend_end)));
        v_far_zone := public.fn_subdiv_world(st_makeenvelope(v_L/2 - 10, -v_W/2, v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy);
        if v_nb is not null and st_intersects(v_nb, v_far_zone) then v_flags := v_flags || '"through_connection_possible_at_end_end_via_neighbour_parcel"'::jsonb; end if;
      end if;
    end if;
    v_slo[1] := v_x_lo; v_shi[1] := v_x_hi;
    -- a dead-end over 750 ft needs a second connection: name the neighbour sharing the most boundary
    if greatest(v_deadend_start, v_deadend_end) > 750 then
      select coalesce(nullif(p.address,''), p.owner), round(st_length(st_intersection(st_boundary(v_g), st_buffer(p.geom_2274, 2))))
      into v_nb_big, v_nb_big_ft
      from public.parcels p where p.ogc_fid <> p_ogc_fid and st_dwithin(p.geom_2274, v_g, 2)
      order by st_length(st_intersection(st_boundary(v_g), st_buffer(p.geom_2274, 2))) desc limit 1;
      if v_nb_big is not null then
        v_flags := v_flags || to_jsonb(format('dead_end_%s_ft_exceeds_750_second_connection_needed_e_g_via_%s_%s_ft_shared',
          round(greatest(v_deadend_start, v_deadend_end)), regexp_replace(upper(v_nb_big), '[^A-Z0-9]+', '_', 'g'), v_nb_big_ft));
      end if;
    end if;
  else
    for v_i in 1..(v_n - 1) loop
      if v_ehi[v_i] = 'greenway' and v_ehi[v_i+1] = 'greenway' and abs(v_shi[v_i] - v_shi[v_i+1]) <= 100 then
        v_lx := least(v_shi[v_i], v_shi[v_i+1]) - v_row/2 - 2;
        v_loop_x := v_loop_x || v_lx; v_loop_i := v_loop_i || v_i; v_loop_name := array_append(v_loop_name, 'Loop (end)'::text);
        v_looped_hi[v_i] := true; v_looped_hi[v_i+1] := true;
        v_shi[v_i] := least(v_shi[v_i], v_lx + v_row/2); v_shi[v_i+1] := least(v_shi[v_i+1], v_lx + v_row/2);
      end if;
      if v_elo[v_i] = 'greenway' and v_elo[v_i+1] = 'greenway' and abs(v_slo[v_i] - v_slo[v_i+1]) <= 100 then
        v_lx := greatest(v_slo[v_i], v_slo[v_i+1]) + v_row/2 + 2;
        v_loop_x := v_loop_x || v_lx; v_loop_i := v_loop_i || v_i; v_loop_name := array_append(v_loop_name, 'Loop (start)'::text);
        v_looped_lo[v_i] := true; v_looped_lo[v_i+1] := true;
        v_slo[v_i] := greatest(v_slo[v_i], v_lx - v_row/2); v_slo[v_i+1] := greatest(v_slo[v_i+1], v_lx - v_row/2);
      end if;
    end loop;
    for v_i in 1..v_n loop
      if v_ehi[v_i] = 'greenway' and not v_looped_hi[v_i] then
        v_shi[v_i] := v_shi[v_i] - 60;
        v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_shi[v_i], v_y[v_i]), 2274), 50), v_pl_dev);
        v_flags := v_flags || to_jsonb(format('cul_de_sac_street_%s_end_end_ends_at_the_greenway', chr(64+v_i)));
      end if;
      if v_elo[v_i] = 'greenway' and not v_looped_lo[v_i] then
        v_slo[v_i] := v_slo[v_i] + 60;
        v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_slo[v_i], v_y[v_i]), 2274), 50), v_pl_dev);
        v_flags := v_flags || to_jsonb(format('cul_de_sac_street_%s_start_end_ends_at_the_greenway', chr(64+v_i)));
      end if;
    end loop;
    select min(x) into v_x_lo from unnest(v_slo) x;
    select max(x) into v_x_hi from unnest(v_shi) x;
  end if;
  v_srv_len := v_x_hi - v_x_lo;

  -- 5. Streets: each through-street on its own served range; cross connectors on the network's
  --    extent, each only between neighbouring streets that both reach it; loops at a greenway;
  --    the entrance connector; the bulbs. A crossing taken says so (culvert/bridge).
  v_network := case when v_single_loaded then 'single_loaded' when v_n = 1 then 'spine' when v_n = 2 then 'ladder' else 'grid' end;
  for v_i in 1..v_n loop
    v_str := st_intersection(st_makeenvelope(v_slo[v_i], v_y[v_i]-v_row/2, v_shi[v_i], v_y[v_i]+v_row/2, 2274), v_pl);
    v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_slo[v_i], v_y[v_i]), st_point(v_shi[v_i], v_y[v_i])), 2274), v_pl);
    v_cross := case when v_haz_l is null then 0 else coalesce(st_length(st_intersection(v_ln, v_haz_l)), 0) end;
    if v_cross > 0 then v_flags := v_flags || to_jsonb(format('street_%s_crosses_held_out_hazard_%s_ft_culvert_or_bridge', chr(64+v_i), round(v_cross))); end if;
    v_streets := v_streets || v_str;
    v_street_len := v_street_len + st_length(v_ln);
    v_street_meta := v_street_meta || jsonb_build_object(
      'name', format('Street %s', chr(64+v_i)), 'kind', 'through', 'width_ft', v_row,
      'length_ft', round(st_length(v_ln)), 'hazard_crossing_ft', round(v_cross),
      'ends', jsonb_build_object(
        'start', case when (v_n = 1 and v_bulb_start) or (v_n > 1 and v_elo[v_i] = 'greenway' and not v_looped_lo[v_i]) then 'cul_de_sac'
                      when v_elo[v_i] = 'greenway' then 'loop' else v_elo[v_i] end,
        'end', case when (v_n = 1 and v_bulb_end) or (v_n > 1 and v_ehi[v_i] = 'greenway' and not v_looped_hi[v_i]) then 'cul_de_sac'
                    when v_ehi[v_i] = 'greenway' then 'loop' else v_ehi[v_i] end),
      'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb,
      'centerline_2274', st_asgeojson(public.fn_subdiv_world(v_ln, v_cs, v_sn, v_cx, v_cy))::jsonb);
  end loop;
  v_through_union := st_setsrid(st_union(v_streets), 2274);
  if v_n >= 2 then
    v_k := greatest(ceil(v_srv_len / p_max_block_ft)::integer, 2);
    for v_j in 1..(v_k-1) loop
      v_cross_x := v_cross_x || (v_x_lo + v_j * v_srv_len / v_k);
    end loop;
    for v_j in 1..(v_k-1) loop
      v_str := null; v_ln := null;
      for v_i in 1..(v_n-1) loop
        if v_slo[v_i] <= v_cross_x[v_j] and v_cross_x[v_j] <= v_shi[v_i] and v_slo[v_i+1] <= v_cross_x[v_j] and v_cross_x[v_j] <= v_shi[v_i+1] then
          v_seg_g := st_intersection(st_makeenvelope(v_cross_x[v_j]-v_row/2, v_y[v_i]-v_row/2, v_cross_x[v_j]+v_row/2, v_y[v_i+1]+v_row/2, 2274), v_pl);
          v_str := case when v_str is null then v_seg_g else st_union(v_str, v_seg_g) end;
          v_seg_g := st_intersection(st_setsrid(st_makeline(st_point(v_cross_x[v_j], v_y[v_i]), st_point(v_cross_x[v_j], v_y[v_i+1])), 2274), v_pl);
          v_ln := case when v_ln is null then v_seg_g else st_union(v_ln, v_seg_g) end;
        end if;
      end loop;
      if v_str is null or st_isempty(v_str) then continue; end if;
      v_str := st_difference(v_str, v_through_union);
      v_through_union := st_union(v_through_union, v_str);
      v_cross := case when v_haz_l is null then 0 else coalesce(st_length(st_intersection(v_ln, v_haz_l)), 0) end;
      v_streets := v_streets || v_str; v_ncon := v_ncon + 1;
      v_street_len := v_street_len + st_length(v_ln);
      v_street_meta := v_street_meta || jsonb_build_object(
        'name', format('Cross %s', v_j), 'kind', 'cross', 'width_ft', v_row, 'length_ft', round(st_length(v_ln)), 'hazard_crossing_ft', round(v_cross),
        'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb,
        'centerline_2274', st_asgeojson(public.fn_subdiv_world(v_ln, v_cs, v_sn, v_cx, v_cy))::jsonb);
    end loop;
    for v_j in 1..coalesce(array_length(v_loop_x, 1), 0) loop
      v_i := v_loop_i[v_j];
      v_str := st_difference(st_intersection(st_makeenvelope(v_loop_x[v_j]-v_row/2, v_y[v_i]-v_row/2, v_loop_x[v_j]+v_row/2, v_y[v_i+1]+v_row/2, 2274), v_pl_dev), v_through_union);
      if st_isempty(v_str) then continue; end if;
      v_through_union := st_union(v_through_union, v_str);
      v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_loop_x[v_j], v_y[v_i]), st_point(v_loop_x[v_j], v_y[v_i+1])), 2274), v_pl_dev);
      v_streets := v_streets || v_str; v_loops := v_loops + 1;
      v_street_len := v_street_len + st_length(v_ln);
      v_street_meta := v_street_meta || jsonb_build_object(
        'name', v_loop_name[v_j], 'kind', 'cross', 'width_ft', v_row, 'length_ft', round(st_length(v_ln)), 'hazard_crossing_ft', 0,
        'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb,
        'centerline_2274', st_asgeojson(public.fn_subdiv_world(v_ln, v_cs, v_sn, v_cx, v_cy))::jsonb);
    end loop;
  end if;
  if v_access = 'side' then
    if v_side_sign = 1 then
      v_str := st_difference(st_intersection(st_makeenvelope(v_side_x-v_row/2, v_y[1]-v_row/2, v_side_x+v_row/2, v_W/2 + 5, 2274), v_pl), v_through_union);
      v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_side_x, v_y[1]), st_point(v_side_x, v_W/2 + 5)), 2274), v_pl);
    else
      v_str := st_difference(st_intersection(st_makeenvelope(v_side_x-v_row/2, -v_W/2 - 5, v_side_x+v_row/2, v_y[v_n]+v_row/2, 2274), v_pl), v_through_union);
      v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_side_x, -v_W/2 - 5), st_point(v_side_x, v_y[v_n])), 2274), v_pl);
    end if;
    v_through_union := st_union(v_through_union, v_str);
    v_streets := v_streets || v_str;
    v_street_len := v_street_len + st_length(v_ln);
    v_street_meta := v_street_meta || jsonb_build_object(
      'name', 'Entrance', 'kind', 'connector', 'width_ft', v_row, 'length_ft', round(st_length(v_ln)),
      'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb,
      'centerline_2274', st_asgeojson(public.fn_subdiv_world(v_ln, v_cs, v_sn, v_cx, v_cy))::jsonb);
  end if;
  for v_j in 1..coalesce(array_length(v_bulbs, 1), 0) loop
    v_str := st_difference(v_bulbs[v_j], v_through_union);
    v_through_union := st_union(v_through_union, v_str);
    v_streets := v_streets || v_str;
    v_street_meta := v_street_meta || jsonb_build_object(
      'name', format('Cul-de-sac %s', v_j), 'kind', 'cul_de_sac', 'width_ft', 100, 'length_ft', 0,
      'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb);
  end loop;
  v_row_union := st_setsrid(st_union(v_streets), 2274);
  v_row_area := st_area(v_row_union);
  v_blocks := (case when v_n >= 2 then v_k else 1 end) * (v_n + 1);

  -- 6. Amenity (v1.1): beside the greenway when the site has one (≥ 3% held out), else at the
  --    head — searched on the served range only, so it is reachable.
  if p_amenity_pct > 0 then
    v_amenity_len := (p_amenity_pct/100.0 * v_area) / greatest(v_W - v_n*v_row, 50);
    if v_haz_l is not null and v_haz_area >= 0.03 * v_area and v_x_lo + v_amenity_len <= v_x_hi then
      v_best_score := -1; v_cst := v_x_lo;
      while v_cst + v_amenity_len <= v_x_hi loop
        v_rect := st_makeenvelope(v_cst, -v_W/2 - 5, v_cst + v_amenity_len, v_W/2 + 5, 2274);
        v_a := st_area(st_intersection(v_rect, v_pl_dev)) * (case when st_dwithin(v_rect, v_haz_l, 10) then 1.0 else 0.4 end);
        if v_a > v_best_score then v_best_score := v_a; v_hx0 := v_cst; end if;
        v_cst := v_cst + greatest(25, v_amenity_len / 4);
      end loop;
      v_amenity := st_makeenvelope(v_hx0, -v_W/2 - 5, v_hx0 + v_amenity_len, v_W/2 + 5, 2274);
      v_head := 'greenway';
    elsif v_access = 'end' then
      v_amenity := st_makeenvelope(v_x_hi - v_amenity_len, -v_W/2 - 5, v_x_hi + 5, v_W/2 + 5, 2274); v_head := 'end';
    elsif v_access = 'side' then
      v_amenity := st_makeenvelope(v_side_x - v_amenity_len/2, -v_W/2 - 5, v_side_x + v_amenity_len/2, v_W/2 + 5, 2274); v_head := 'side';
    else
      v_amenity := st_makeenvelope(v_x_lo - 5, -v_W/2 - 5, v_x_lo + v_amenity_len, v_W/2 + 5, 2274); v_head := 'start';
    end if;
    v_amenity := st_difference(st_intersection(v_amenity, v_pl_dev), v_row_union);
    v_amenity_area := st_area(v_amenity);
    v_flags := v_flags || to_jsonb(format('amenity_%s_pct_at_%s', p_amenity_pct, v_head));
  end if;

  -- Court stations on the network's served range — a mid-block green every p_court_spacing_ft,
  -- the same station for every face.
  if p_court_spacing_ft > 0 then
    v_cst := v_x_lo + p_court_spacing_ft/2;
    while v_cst + v_court_w/2 <= v_x_hi loop
      v_court_x := v_court_x || v_cst; v_cst := v_cst + p_court_spacing_ft;
    end loop;
  end if;
  v_nstations := coalesce(array_length(v_court_x, 1), 0);

  -- 7. Lots on every street face of the DEVELOPABLE land its street reaches (served range + the
  --    bulb); whole or irregular-with-complete-front lots; alleys behind; a court at the lot slot
  --    nearest each station (v1.1 took the first slot holding it, so the faces drifted) — except
  --    within 150 ft of a real crossing (≥ 60 ft) this street takes or of its greenway end: the
  --    greenway is that block's green.
  for v_i in 1..v_n loop
    v_axs := '{}'; v_axe := '{}';
    for v_c in select c from jsonb_array_elements(coalesce(v_srv[v_i]->'crossings', '[]'::jsonb)) c
               where (c->>'taken')::boolean and (c->>'length_ft')::numeric >= 60 loop
      v_axs := v_axs || (v_c->>'x0')::numeric; v_axe := v_axe || (v_c->>'x1')::numeric;
    end loop;
    if v_elo[v_i] = 'greenway' then v_axs := v_axs || (v_slo[v_i] - 5000); v_axe := v_axe || v_slo[v_i]; end if;
    if v_ehi[v_i] = 'greenway' then v_axs := v_axs || v_shi[v_i]; v_axe := v_axe || (v_shi[v_i] + 5000); end if;
    for v_sgn in select unnest(case when v_single_loaded then array[1] else array[1,-1] end) loop
      v_dface := v_d + case when (v_i = 1 and v_sgn = -1) or (v_i = v_n and v_sgn = 1) then v_extra else 0 end;
      v_has_alley := v_alley > 0 and (case when (v_i = 1 and v_sgn = -1) or (v_i = v_n and v_sgn = 1) then v_ea > 0 else true end);
      if v_single_loaded then v_has_alley := false; end if;
      if v_sgn = 1 then
        v_ylo := v_y[v_i] + v_row/2; v_yhi := v_ylo + v_dface; v_alo := v_yhi; v_ahi := v_yhi + v_alley;
      else
        v_yhi := v_y[v_i] - v_row/2; v_ylo := v_yhi - v_dface; v_ahi := v_ylo; v_alo := v_ylo - v_alley;
      end if;
      v_strip := st_difference(st_intersection(st_makeenvelope(v_slo[v_i] - 52, v_ylo, v_shi[v_i] + 52, v_yhi, 2274), v_pl_dev), v_row_union);
      if v_amenity is not null then v_strip := st_difference(v_strip, v_amenity); end if;
      for v_piece in select d.geom from st_dump(v_strip) d where st_area(d.geom) >= 0.5 * v_lot_w * v_dface loop
        v_px0 := st_xmin(v_piece); v_px1 := st_xmax(v_piece);
        v_t := v_px0;
        while v_t + v_lot_w <= v_px1 + 1e-6 loop
          -- the slot nearest a station takes the court (the faces read the same station)
          v_court_here := false;
          for v_ci in 1..v_nstations loop
            if abs(v_t + v_court_w/2 - v_court_x[v_ci]) < v_lot_w/2 and v_t + v_court_w <= v_px1 + 1e-6 then
              v_court_here := true;
              for v_j in 1..coalesce(array_length(v_axs, 1), 0) loop
                if v_t + v_court_w + 150 > v_axs[v_j] and v_t - 150 < v_axe[v_j] then v_court_here := false; end if;
              end loop;
            end if;
          end loop;
          if v_court_here then
            v_rect := st_makeenvelope(v_t, v_ylo, v_t + v_court_w, v_yhi, 2274);
            v_lotg := st_intersection(v_rect, v_piece);
            if st_area(v_lotg) >= 0.9 * v_court_w * v_dface then
              v_ncourts := v_ncourts + 1; v_court_area := v_court_area + st_area(v_lotg);
              v_courts_g := v_courts_g || v_lotg;
              if v_has_alley then
                v_alleys := v_alleys || st_difference(st_intersection(st_makeenvelope(v_t, v_alo, v_t + v_court_w, v_ahi, 2274), v_pl_dev), v_row_union);
              end if;
              v_t := v_t + v_court_w;
              continue;
            end if;
          end if;
          v_rect := st_makeenvelope(v_t, v_ylo, v_t + v_lot_w, v_yhi, 2274);
          v_lotg := st_intersection(v_rect, v_piece);
          -- A whole rectangle always counts. Against a slanted boundary (or a greenway edge)
          -- an IRREGULAR lot counts when its front edge (the ROW side) is complete and it
          -- still holds ≥ 60% of the nominal area and the district minimum (requested SP
          -- widths: nominal only).
          v_fedge := st_setsrid(st_makeline(
            st_point(v_t + 0.5, case when v_sgn = 1 then v_ylo else v_yhi end),
            st_point(v_t + v_lot_w - 0.5, case when v_sgn = 1 then v_ylo else v_yhi end)), 2274);
          v_whole := st_area(v_lotg) >= 0.95 * v_lot_w * v_dface;
          v_ok := st_geometrytype(v_lotg) = 'ST_Polygon' and (v_whole or (
                    st_area(v_lotg) >= greatest(0.6 * v_lot_w * v_dface, case when p_lot_width_ft is null then coalesce(v_min_area, 0) else 0 end)
                    and st_covers(st_buffer(v_piece, 0.5), v_fedge)));
          if v_ok then
            v_nlots := v_nlots + 1; v_a := st_area(v_lotg);
            v_lot_area_sum := v_lot_area_sum + v_a;
            v_min_lot := least(coalesce(v_min_lot, v_a), v_a);
            v_lots_g := v_lots_g || v_lotg;
            if not v_has_alley then v_front_loaded := v_front_loaded + 1; end if;
            if not v_whole then v_irregular := v_irregular + 1; end if;
            v_lots := v_lots || jsonb_build_object(
              'lot', v_nlots, 'street', chr(64+v_i), 'face', v_sgn,
              'geom_2274', st_asgeojson(public.fn_subdiv_world(v_lotg, v_cs, v_sn, v_cx, v_cy))::jsonb,
              'area_sqft', round(v_a), 'width_ft', v_lot_w, 'depth_ft', v_dface,
              'buildable_depth_ft', v_dface - v_front - v_rear, 'irregular', not v_whole,
              'fronts', format('Street %s', chr(64+v_i)),
              'garage', case when v_has_alley then 'rear_alley' else 'front_loaded' end);
            if v_has_alley then
              v_alleys := v_alleys || st_difference(st_intersection(st_makeenvelope(v_t, v_alo, v_t + v_lot_w, v_ahi, 2274), v_pl_dev), v_row_union);
            end if;
            v_t := v_t + v_lot_w;
          else
            v_t := v_t + greatest(v_lot_w/4, 5);   -- slide past a slanted edge, notch or greenway edge
          end if;
        end loop;
      end loop;
    end loop;
  end loop;

  if coalesce(array_length(v_alleys, 1), 0) > 0 then
    v_alley_union := st_setsrid(st_union(v_alleys), 2274);
    v_alley_area := st_area(v_alley_union);
  end if;

  -- Residual land (nothing assigned, hazards excluded) — and the developable land no street
  -- reaches, reported on its own.
  v_placed_union := v_row_union;
  if v_alley_union is not null then v_placed_union := st_union(v_placed_union, v_alley_union); end if;
  if coalesce(array_length(v_lots_g, 1), 0) > 0 then v_placed_union := st_union(v_placed_union, st_setsrid(st_union(v_lots_g), 2274)); end if;
  if coalesce(array_length(v_courts_g, 1), 0) > 0 then v_placed_union := st_union(v_placed_union, st_setsrid(st_union(v_courts_g), 2274)); end if;
  if v_amenity is not null then v_placed_union := st_union(v_placed_union, v_amenity); end if;
  v_residual := st_difference(v_pl_dev, v_placed_union);
  v_residual_area := coalesce(st_area(v_residual), 0);
  if v_end_lo = 'greenway' or v_end_hi = 'greenway' then
    v_served_union := null;
    for v_i in 1..v_n loop
      v_band_lo := greatest(-v_W/2 - 5, v_y[v_i] - v_row/2 - v_d - v_extra - v_alley);
      v_band_hi := least(v_W/2 + 5, v_y[v_i] + v_row/2 + v_d + v_extra + v_alley);
      v_rect := st_makeenvelope(v_slo[v_i] - 52, v_band_lo, v_shi[v_i] + 52, v_band_hi, 2274);
      v_served_union := case when v_served_union is null then v_rect else st_union(v_served_union, v_rect) end;
    end loop;
    v_unserved := greatest(st_area(v_pl_dev) - st_area(st_intersection(v_pl_dev, v_served_union)), 0);
    if v_unserved >= 400 then
      v_flags := v_flags || to_jsonb(format('unserved_developable_land_beyond_the_greenway_%s_sqft', round(v_unserved)));
    end if;
  end if;
  if v_residual_area > 0.15 * v_area then
    v_flags := v_flags || to_jsonb(format('residual_land_%s_pct_unassigned', round(100.0*v_residual_area/v_area)));
  end if;
  if v_n = 1 and v_srv_len > 1320 then
    v_flags := v_flags || to_jsonb(format('single_spine_block_%s_ft_exceeds_1320_no_cross_street_possible_in_%s_ft_width', round(v_srv_len), round(v_W)));
  end if;

  select fema_flood_zone_raw::jsonb into v_fema from public.parcels where ogc_fid = p_ogc_fid;
  begin
    select coalesce(sum((e->>'percent')::numeric),0) into v_ae_pct
    from jsonb_array_elements(coalesce(v_fema,'[]'::jsonb)) e
    where e->>'zone' in ('A','AE','AH','AO','VE','V');
  exception when others then v_ae_pct := 0; end;
  if not v_haz_covered and v_ae_pct > 0 then
    v_flags := v_flags || to_jsonb(format('floodplain_not_carved_layer_not_ingested_here_parcel_level_fema_%s_pct', v_ae_pct));
  end if;

  v_basis := format('%s lots @ %s×%s ft (%s; depth %s) on %s %s-ft through-street%s%s%s · %s · %s court%s on a %s-ft rhythm · %s%% of land in ROW, %s%% in lots%s · buildable depth %s ft after %s/%s setbacks · access %s (%s)%s%s · generator subdivision_v1.2%s',
    v_nlots, v_lot_w, v_d, v_lot_w_basis, v_depth_basis, v_n, v_row, case when v_n = 1 then '' else 's' end,
    case when v_ncon >= 1 then format(' + %s cross connector%s (blocks ≤ %s ft)', v_ncon, case when v_ncon = 1 then '' else 's' end, p_max_block_ft) else '' end,
    case when v_loops > 0 then format(' + %s loop%s at the greenway', v_loops, case when v_loops = 1 then '' else 's' end) else '' end,
    case when v_alley > 0 then format('alleys %s ft', v_alley) else 'no alleys (estate lots, front-loaded)' end,
    v_ncourts, case when v_ncourts = 1 then '' else 's' end, p_court_spacing_ft,
    round(100.0*v_row_area/nullif(v_area,0),1), round(100.0*v_lot_area_sum/nullif(v_area,0),1),
    case when v_haz_area > 0 then format(', %s%% held out as greenway (floodplain %s%%, wetland %s%%)',
      round(100.0*v_haz_area/v_area,1), round(100.0*v_flood_area/v_area,1), round(100.0*v_wet_area/v_area,1)) else '' end,
    v_buildable, v_front, v_rear, v_access, v_access_basis,
    case when v_cross_taken > 0 then format(' · %s-ft greenway crossing (culvert/bridge)', round(v_cross_taken)) else '' end,
    case when v_end_lo = 'greenway' or v_end_hi = 'greenway'
         then format(' · street%s stop%s at the greenway (%s, %s-ft crossing declined)',
                     case when v_n = 1 then '' else 's' end, case when v_n = 1 then 's' else '' end,
                     case when v_loops > 0 then 'loop' else 'cul-de-sac' end, round(v_cross_declined)) else '' end,
    case when not v_haz_covered then ' · flood/wetland geometry not ingested for this area yet'
         || case when v_ae_pct > 0 then format(' (parcel-level FEMA %s%%)', v_ae_pct) else '' end else '' end);

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.2',
    'pattern', case when v_n >= 2 then 'subdivision_street_grid' else 'subdivision_row_spine' end,
    'network', v_network,
    'frame', jsonb_build_object('theta_deg', round(degrees(v_theta)::numeric,1), 'obb_length_ft', round(v_L), 'obb_width_ft', round(v_W),
                                'streets_across', v_n, 'pitch_ft', v_pitch, 'leftover_width_ft', round(v_left), 'outer_row_extra_depth_ft', round(v_extra),
                                'served_x_lo_ft', round(v_x_lo), 'served_x_hi_ft', round(v_x_hi), 'served_length_ft', round(v_srv_len)),
    'access', jsonb_build_object('mode', v_access, 'basis', v_access_basis,
                                 'unshared_ft', jsonb_build_object('start', round(v_len_start), 'end', round(v_len_end), 'top', round(v_len_top), 'bottom', round(v_len_bot)),
                                 'gap_ft', jsonb_build_object('start', round(v_side_gap[1]), 'end', round(v_side_gap[2]), 'bottom', round(v_side_gap[3]), 'top', round(v_side_gap[4])),
                                 'street_read', jsonb_build_object('start', v_side_street[1], 'end', v_side_street[2], 'bottom', v_side_street[3], 'top', v_side_street[4]),
                                 'across_start_end', v_nb_start, 'across_end_end', v_nb_end,
                                 'dead_end_ft', jsonb_build_object('start', round(v_deadend_start), 'end', round(v_deadend_end)),
                                 'ends', jsonb_build_object('start', v_end_lo, 'end', v_end_hi),
                                 'greenway_crossing_ft', round(v_cross_taken), 'declined_crossing_ft', round(v_cross_declined),
                                 'crossings', (select coalesce(jsonb_agg(jsonb_build_object('street', chr(64 + i), 'crossings', coalesce(v_srv[i]->'crossings', '[]'::jsonb),
                                                                                             'served_x_lo_ft', round(v_slo[i]), 'served_x_hi_ft', round(v_shi[i]))), '[]'::jsonb)
                                               from generate_series(1, v_n) i),
                                 'alternative', v_alt,
                                 'second_connection', case when v_nb_big is not null then jsonb_build_object('via', v_nb_big, 'shared_ft', v_nb_big_ft) else null end),
    'streets', v_street_meta,
    'alleys', (select coalesce(jsonb_agg(jsonb_build_object('geom_2274', st_asgeojson(public.fn_subdiv_world(d.geom, v_cs, v_sn, v_cx, v_cy))::jsonb, 'area_sqft', round(st_area(d.geom)))), '[]'::jsonb)
               from st_dump(coalesce(v_alley_union, 'GEOMETRYCOLLECTION EMPTY'::geometry)) d),
    'courts', (select coalesce(jsonb_agg(jsonb_build_object('geom_2274', st_asgeojson(public.fn_subdiv_world(c, v_cs, v_sn, v_cx, v_cy))::jsonb, 'area_sqft', round(st_area(c)))), '[]'::jsonb)
               from unnest(v_courts_g) c),
    'amenity', case when v_amenity is not null and not st_isempty(v_amenity)
                    then jsonb_build_object('geom_2274', st_asgeojson(public.fn_subdiv_world(v_amenity, v_cs, v_sn, v_cx, v_cy))::jsonb, 'area_sqft', round(v_amenity_area), 'at', v_head)
                    else null end,
    'hazards', v_hazards,
    'reserves', (select coalesce(jsonb_agg(jsonb_build_object('geom_2274', st_asgeojson(public.fn_subdiv_world(d.geom, v_cs, v_sn, v_cx, v_cy))::jsonb, 'area_sqft', round(st_area(d.geom)))), '[]'::jsonb)
                 from st_dump(coalesce(v_residual, 'GEOMETRYCOLLECTION EMPTY'::geometry)) d where st_area(d.geom) >= 400),
    'lots', v_lots,
    'metrics', jsonb_build_object(
      'lots', v_nlots, 'lot_width_ft', v_lot_w, 'lot_depth_ft', v_d, 'lot_width_basis', v_lot_w_basis, 'lot_depth_basis', v_depth_basis,
      'avg_lot_sqft', case when v_nlots > 0 then round(v_lot_area_sum / v_nlots) else null end,
      'min_lot_sqft', round(v_min_lot), 'buildable_depth_ft', v_buildable,
      'front_loaded_lots', v_front_loaded, 'irregular_lots', v_irregular,
      'streets', v_n + v_ncon + v_loops + (case when v_access = 'side' then 1 else 0 end),
      'blocks', v_blocks, 'street_length_ft', round(v_street_len), 'row_area_sqft', round(v_row_area),
      'served_length_ft', round(v_srv_len), 'greenway_crossing_ft', round(v_cross_taken), 'declined_crossing_ft', round(v_cross_declined),
      'unserved_sqft', round(v_unserved),
      'alley_area_sqft', round(v_alley_area), 'courts', v_ncourts, 'court_area_sqft', round(v_court_area),
      'amenity_sqft', round(v_amenity_area), 'residual_sqft', round(v_residual_area),
      'hazard_sqft', round(v_haz_area), 'floodplain_sqft', round(v_flood_area), 'wetland_sqft', round(v_wet_area),
      'pct_land_hazard', round(100.0*v_haz_area/nullif(v_area,0),1),
      'hazard_layer_coverage', case when v_haz_covered then 'ingested' else 'not_ingested' end,
      'pct_land_in_row', round(100.0*v_row_area/nullif(v_area,0),1),
      'pct_land_in_alleys', round(100.0*v_alley_area/nullif(v_area,0),1),
      'pct_land_in_lots', round(100.0*v_lot_area_sum/nullif(v_area,0),1),
      'pct_land_residual', round(100.0*v_residual_area/nullif(v_area,0),1),
      'gross_density_du_ac', case when v_area > 0 then round(v_nlots / (v_area/43560.0), 2) else null end,
      'parcel_sqft', round(v_area), 'parcel_acres', round(v_area/43560.0, 2),
      'floodplain_100yr_pct', v_ae_pct),
    'params', jsonb_build_object('lot_width_ft', p_lot_width_ft, 'lot_depth_ft', p_lot_depth_ft, 'row_width_ft', p_row_width_ft,
                                 'alley_width_ft', p_alley_width_ft, 'court_spacing_ft', p_court_spacing_ft, 'max_block_ft', p_max_block_ft,
                                 'amenity_pct', p_amenity_pct, 'access', p_access),
    'plan_basis', v_basis, 'flags', v_flags);
end
$function$;

grant execute on function public.fn_generate_subdivision(integer, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text) to anon, authenticated;

-- The exception wrapper names the vintage it could not run
create or replace function public.fn_generate_subdivision_safe(p_ogc_fid integer)
returns jsonb
language plpgsql
stable
as $$
begin
  return public.fn_generate_subdivision(p_ogc_fid);
exception when others then
  return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.2',
    'error', 'exception: ' || sqlerrm, 'flags', '["exception"]'::jsonb);
end
$$;
