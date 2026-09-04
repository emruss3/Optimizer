-- Subdivision generator v1.1 (Eric, 2026-09-03: "This isn't a good site plan.
-- You just cut a road straight through the middle, and colored random squares
-- as 'amenities'. You didn't take into account wetlands, flood plains, etc.")
--
-- What changes from v1:
--   1. HAZARDS ARE HELD OUT. FEMA special flood hazard areas (A/AE/AH/AO/V/VE,
--      floodway included) and NWI wetlands (25-ft buffer) — now real geometry in
--      hazard_flood_2274 / hazard_wetland_2274, fetched from FEMA and USFWS by
--      the database itself — are carved out of the lot pattern: lots, alleys
--      and courts never sit in them; they are returned as GREENWAY polygons.
--      Streets may cross them (culvert or bridge) and say so. When the FEMA/NWI
--      tiles for an area are not ingested yet, the parcel-level FEMA fraction
--      is flagged instead — never silently ignored.
--   2. OPEN SPACE WITH INTENT. The amenity goes next to the greenway when the
--      site has one (otherwise at the head); courts sit on a block rhythm — a
--      mid-block green every p_court_spacing_ft (600 ft, the max block) on both
--      faces — not on a lot counter.
--   3. ESTATE LOTS (district minimum ≥ 40,000 sf) have no alleys.
-- Everything else — streets first on the long axis, the lot objective, cross
-- connectors ≤ 600-ft blocks, rear alleys, access reading with the street
-- test, cul-de-sac over 750 ft, whole/irregular lot rules, no overlapping ROW
-- — is v1 (20260903040000). Frame: EPSG:2274 feet; every area is PostGIS.

drop function if exists public.fn_generate_subdivision(integer, numeric, numeric, numeric, numeric, integer, numeric, numeric, text);

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
  v_hazards jsonb := '[]'::jsonb; v_hx0 numeric; v_hx1 numeric; v_cross numeric;
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
  v_nb_start text; v_nb_end text;
  v_access text; v_access_basis text; v_side_x numeric; v_side_sign integer := 0;
  v_x_lo numeric; v_x_hi numeric; v_bulb_start boolean := false; v_bulb_end boolean := false;
  v_deadend_start numeric := 0; v_deadend_end numeric := 0; v_bulbs geometry[] := '{}'; v_far_zone geometry;
  -- network
  v_streets geometry[] := '{}'; v_street_meta jsonb := '[]'::jsonb; v_row_union geometry; v_str geometry; v_ln geometry;
  v_cross_x numeric[] := '{}'; v_k integer := 1; v_i integer; v_j integer; v_sgn integer;
  v_network text; v_blocks integer := 0; v_street_len numeric := 0; v_row_area numeric := 0;
  -- amenity / lots / alleys / courts
  v_amenity geometry; v_amenity_area numeric := 0; v_amenity_len numeric := 0; v_head text;
  v_dface numeric; v_has_alley boolean; v_ylo numeric; v_yhi numeric; v_alo numeric; v_ahi numeric;
  v_strip geometry; v_piece geometry; v_px0 numeric; v_px1 numeric; v_t numeric;
  v_rect geometry; v_lotg geometry; v_a numeric; v_court_here boolean; v_court_w numeric;
  v_court_x numeric[] := '{}'; v_ci integer; v_cst numeric; v_nstations integer := 0; v_best_score numeric;
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
  -- valid geometry or the boolean ops below throw (5% of large tracts in the sweep)
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
  -- world → local: rotate by −θ about the box centre (x along the long axis)
  v_pl := st_makevalid(st_affine(v_g, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy)));

  -- 1b. Hazards held out of the lot pattern. Coverage first: are the FEMA tiles for this
  --     area ingested? (the wetland tiles ride along; both queues run county-wide)
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
    v_haz_l := st_makevalid(st_affine(v_haz, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy)));
  else
    v_dev := v_g;
  end if;
  if not v_haz_covered then v_flags := v_flags || '"hazard_layers_not_ingested_for_this_area_yet"'::jsonb; end if;
  v_pl_dev := st_buffer(st_makevalid(st_affine(v_dev, v_cs, v_sn, -v_sn, v_cs, -(v_cs*v_cx + v_sn*v_cy), (v_sn*v_cx - v_cs*v_cy))), 0);
  -- the held-out pieces, for the drawing (world coordinates, the pieces the parcel actually contains)
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
    return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.1',
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
  -- Estate and rural lots (district minimum ≥ 40,000 sf: R40/RS40/R80/RS80/AR2a)
  -- have no rear alleys — drives come off the street; the 20-ft alley is the
  -- urban default and applies only when the caller left it at the default.
  if v_min_area is not null and v_min_area >= 40000 and p_alley_width_ft = 20 then
    v_alley := 0; v_flags := v_flags || '"estate_lots_no_alleys_front_loaded"'::jsonb;
  end if;
  if p_lot_depth_ft is not null then
    v_depth_target := p_lot_depth_ft; v_depth_basis := 'requested';
  elsif v_min_area is not null and v_min_area > 0 then
    -- depth ≈ 1.5 × width at the district minimum, clamped to a buildable range
    v_depth_target := least(220, greatest(90, round(sqrt(1.5 * v_min_area) / 5) * 5)); v_depth_basis := 'district_min_lot_area';
  else
    v_depth_target := 100; v_depth_basis := 'default_100';
  end if;
  v_dmin := greatest(70, round(0.6 * v_depth_target / 5) * 5);

  -- 3. Cross-section solve: through-streets across the short axis at pitch = ROW + 2·depth + alley.
  --    Objective = lots (street faces × frontage ÷ the lot width that depth needs for the
  --    district minimum area). A shallower lot must beat the deeper one by 8% to win, so an
  --    R15 tract keeps 100×150 lots on two streets over 145×105 lots on three.
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
    -- too narrow for alleys at the edges: outer rows front-loaded (flagged)
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
    return jsonb_build_object('parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.1',
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
  v_court_w := greatest(v_lot_w, 40);
  v_buildable := v_d - v_front - v_rear;
  if v_buildable <= 0 then v_flags := v_flags || '"buildable_depth_not_positive_after_setbacks"'::jsonb; end if;

  -- Street centrelines across the section (centred; leftover split to the edges,
  -- up to 40 ft of it deepening the outer rows)
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

  -- 4. Access. Boundary not shared with another parcel, classified by the OBB
  --    side it lies on (normalised distance, so a slanted end still reads as an
  --    end), then a STREET TEST: a parcel across the unshared edge within a
  --    ROW-width gap (15–90 ft) means a street; a wider gap is a railroad,
  --    greenway or water (2400 W Heiman: 2,309 ft of unshared edge with a
  --    104-ft gap = the CSX corridor, not a frontage).
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
        v_sidx := case when v_mx < 0 then 1 else 2 end;   -- 1 = start end, 2 = end end
      else
        v_sidx := case when v_my < 0 then 3 else 4 end;   -- 3 = bottom side, 4 = top side
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
  -- who is across each end (a stub there is a future through-connection)
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
    -- street on a long side only: an entrance connector from that side at the frontage's middle
    v_side_sign := case when (v_side_street[4] and v_len_top >= 100) and (not (v_side_street[3] and v_len_bot >= 100) or v_len_top >= v_len_bot) then 1 else -1 end;
    v_side_x := st_x(st_centroid(v_side_geom[case when v_side_sign = 1 then 4 else 3 end]));
    v_access_basis := 'street_across_unshared_long_side_entrance_connector';
  else
    v_acc_start := true; v_acc_end := true; v_access_basis := 'assumed_both_ends_no_street_read_on_any_edge';
    v_flags := v_flags || '"access_assumed_both_ends_stubs_to_neighbours"'::jsonb;
  end if;
  v_access := case when v_side_sign <> 0 then 'side' when v_acc_start and v_acc_end then 'both' when v_acc_start then 'start' else 'end' end;

  -- Dead-end rule (spine only — a ladder/grid loops back on itself): bulb when a dead-end exceeds 750 ft
  v_x_lo := -v_L/2 - 5; v_x_hi := v_L/2 + 5;
  if v_n = 1 and not v_single_loaded then
    if v_access = 'start' then v_deadend_end := v_L;
    elsif v_access = 'end' then v_deadend_start := v_L;
    elsif v_access = 'side' then v_deadend_start := v_side_x + v_L/2; v_deadend_end := v_L/2 - v_side_x;
    end if;
    if v_deadend_start > 750 then v_bulb_start := true; v_x_lo := -(v_L/2 - v_ea - 52); end if;
    if v_deadend_end > 750 then v_bulb_end := true; v_x_hi := v_L/2 - v_ea - 52; end if;
    if v_bulb_start then
      v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_x_lo, v_y[1]), 2274), 50), v_pl);
      v_flags := v_flags || to_jsonb(format('cul_de_sac_at_start_end_dead_end_%s_ft_over_750', round(v_deadend_start)));
      v_far_zone := public.fn_subdiv_world(st_makeenvelope(-v_L/2 - 10, -v_W/2, -v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy);
      if v_nb is not null and st_intersects(v_nb, v_far_zone) then v_flags := v_flags || '"through_connection_possible_at_start_end_via_neighbour_parcel"'::jsonb; end if;
    end if;
    if v_bulb_end then
      v_bulbs := v_bulbs || st_intersection(st_buffer(st_setsrid(st_point(v_x_hi, v_y[1]), 2274), 50), v_pl);
      v_flags := v_flags || to_jsonb(format('cul_de_sac_at_end_end_dead_end_%s_ft_over_750', round(v_deadend_end)));
      v_far_zone := public.fn_subdiv_world(st_makeenvelope(v_L/2 - 10, -v_W/2, v_L/2 + 10, v_W/2, 2274), v_cs, v_sn, v_cx, v_cy);
      if v_nb is not null and st_intersects(v_nb, v_far_zone) then v_flags := v_flags || '"through_connection_possible_at_end_end_via_neighbour_parcel"'::jsonb; end if;
    end if;
  end if;

  -- 5. Streets: through-streets (ROW polygons + centrelines), cross connectors, entrance connector, bulbs.
  --    Streets run on the whole parcel; where one crosses a held-out hazard it says so (culvert/bridge).
  v_network := case when v_single_loaded then 'single_loaded' when v_n = 1 then 'spine' when v_n = 2 then 'ladder' else 'grid' end;
  for v_i in 1..v_n loop
    v_str := st_intersection(st_makeenvelope(v_x_lo, v_y[v_i]-v_row/2, v_x_hi, v_y[v_i]+v_row/2, 2274), v_pl);
    v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_x_lo, v_y[v_i]), st_point(v_x_hi, v_y[v_i])), 2274), v_pl);
    v_cross := case when v_haz_l is null then 0 else coalesce(st_length(st_intersection(v_ln, v_haz_l)), 0) end;
    if v_cross > 0 then v_flags := v_flags || to_jsonb(format('street_%s_crosses_held_out_hazard_%s_ft_culvert_or_bridge', chr(64+v_i), round(v_cross))); end if;
    v_streets := v_streets || v_str;
    v_street_len := v_street_len + st_length(v_ln);
    v_street_meta := v_street_meta || jsonb_build_object(
      'name', format('Street %s', chr(64+v_i)), 'kind', 'through', 'width_ft', v_row,
      'length_ft', round(st_length(v_ln)), 'hazard_crossing_ft', round(v_cross),
      'geom_2274', st_asgeojson(public.fn_subdiv_world(v_str, v_cs, v_sn, v_cx, v_cy))::jsonb,
      'centerline_2274', st_asgeojson(public.fn_subdiv_world(v_ln, v_cs, v_sn, v_cx, v_cy))::jsonb);
  end loop;
  -- Cross connectors, the entrance and the bulbs are emitted MINUS everything already
  -- emitted (a running union) so no two ROW polygons overlap — the client's plan gate
  -- rejects overlapping pavement.
  v_through_union := st_setsrid(st_union(v_streets), 2274);
  if v_n >= 2 then
    v_k := greatest(ceil(v_L / p_max_block_ft)::integer, 2);
    for v_j in 1..(v_k-1) loop
      v_cross_x := v_cross_x || (-v_L/2 + v_j * v_L / v_k);
    end loop;
    for v_j in 1..array_length(v_cross_x, 1) loop
      v_str := st_difference(st_intersection(st_makeenvelope(v_cross_x[v_j]-v_row/2, v_y[1]-v_row/2, v_cross_x[v_j]+v_row/2, v_y[v_n]+v_row/2, 2274), v_pl), v_through_union);
      v_through_union := st_union(v_through_union, v_str);
      v_ln := st_intersection(st_setsrid(st_makeline(st_point(v_cross_x[v_j], v_y[1]), st_point(v_cross_x[v_j], v_y[v_n])), 2274), v_pl);
      v_cross := case when v_haz_l is null then 0 else coalesce(st_length(st_intersection(v_ln, v_haz_l)), 0) end;
      v_streets := v_streets || v_str;
      v_street_len := v_street_len + st_length(v_ln);
      v_street_meta := v_street_meta || jsonb_build_object(
        'name', format('Cross %s', v_j), 'kind', 'cross', 'width_ft', v_row, 'length_ft', round(st_length(v_ln)), 'hazard_crossing_ft', round(v_cross),
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
  -- (st_setsrid: the array form of st_union drops the SRID for a one-element array)
  v_row_union := st_setsrid(st_union(v_streets), 2274);
  v_row_area := st_area(v_row_union);
  v_blocks := (case when v_n >= 2 then v_k else 1 end) * (v_n + 1);

  -- 6. Amenity: next to the greenway when the site has one (≥ 3% held out), else at the head.
  --    It replaces lot land; the streets run through.
  if p_amenity_pct > 0 then
    v_amenity_len := (p_amenity_pct/100.0 * v_area) / greatest(v_W - v_n*v_row, 50);
    if v_haz_l is not null and v_haz_area >= 0.03 * v_area then
      -- next to the greenway: the window along the axis (amenity length wide, full section)
      -- that touches the held-out land and holds the most developable ground
      v_best_score := -1; v_cst := -v_L/2;
      while v_cst + v_amenity_len <= v_L/2 loop
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

  -- Courts on a block rhythm: a mid-block green every p_court_spacing_ft along the street,
  -- both faces at the same station — a walkable green every block, not a counter.
  if p_court_spacing_ft > 0 then
    v_cst := -v_L/2 + p_court_spacing_ft/2;
    while v_cst + v_court_w <= v_L/2 loop
      v_court_x := v_court_x || v_cst; v_cst := v_cst + p_court_spacing_ft;
    end loop;
  end if;
  v_nstations := coalesce(array_length(v_court_x, 1), 0);

  -- 7. Lots on every street face of the DEVELOPABLE land (parcel minus held-out hazards);
  --    whole or irregular-with-complete-front lots; alleys behind; courts at their stations.
  for v_i in 1..v_n loop
    for v_sgn in select unnest(case when v_single_loaded then array[1] else array[1,-1] end) loop
      v_dface := v_d + case when (v_i = 1 and v_sgn = -1) or (v_i = v_n and v_sgn = 1) then v_extra else 0 end;
      v_has_alley := v_alley > 0 and (case when (v_i = 1 and v_sgn = -1) or (v_i = v_n and v_sgn = 1) then v_ea > 0 else true end);
      if v_single_loaded then v_has_alley := false; end if;
      if v_sgn = 1 then
        v_ylo := v_y[v_i] + v_row/2; v_yhi := v_ylo + v_dface; v_alo := v_yhi; v_ahi := v_yhi + v_alley;
      else
        v_yhi := v_y[v_i] - v_row/2; v_ylo := v_yhi - v_dface; v_ahi := v_ylo; v_alo := v_ylo - v_alley;
      end if;
      v_strip := st_difference(st_intersection(st_makeenvelope(-v_L/2 - 5, v_ylo, v_L/2 + 5, v_yhi, 2274), v_pl_dev), v_row_union);
      if v_amenity is not null then v_strip := st_difference(v_strip, v_amenity); end if;
      for v_piece in select d.geom from st_dump(v_strip) d where st_area(d.geom) >= 0.5 * v_lot_w * v_dface loop
        v_px0 := st_xmin(v_piece); v_px1 := st_xmax(v_piece);
        v_t := v_px0; v_ci := 1;
        while v_t + v_lot_w <= v_px1 + 1e-6 loop
          while v_ci <= v_nstations and v_court_x[v_ci] < v_t loop v_ci := v_ci + 1; end loop;
          v_court_here := v_ci <= v_nstations and v_court_x[v_ci] < v_t + v_lot_w and (v_t + v_court_w) <= v_px1 + 1e-6;
          if v_court_here then
            v_ci := v_ci + 1;
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

  -- Alleys: union of the strips behind the lots (continuous where the rows are continuous)
  if coalesce(array_length(v_alleys, 1), 0) > 0 then
    v_alley_union := st_setsrid(st_union(v_alleys), 2274);
    v_alley_area := st_area(v_alley_union);
  end if;

  -- Residual land (nothing assigned, hazards excluded): perimeter reserve, slanted ends, leftover width
  v_placed_union := v_row_union;
  if v_alley_union is not null then v_placed_union := st_union(v_placed_union, v_alley_union); end if;
  if coalesce(array_length(v_lots_g, 1), 0) > 0 then v_placed_union := st_union(v_placed_union, st_setsrid(st_union(v_lots_g), 2274)); end if;
  if coalesce(array_length(v_courts_g, 1), 0) > 0 then v_placed_union := st_union(v_placed_union, st_setsrid(st_union(v_courts_g), 2274)); end if;
  if v_amenity is not null then v_placed_union := st_union(v_placed_union, v_amenity); end if;
  v_residual := st_difference(v_pl_dev, v_placed_union);
  v_residual_area := coalesce(st_area(v_residual), 0);
  if v_residual_area > 0.15 * v_area then
    v_flags := v_flags || to_jsonb(format('residual_land_%s_pct_unassigned', round(100.0*v_residual_area/v_area)));
  end if;
  if v_n = 1 and v_L > 1320 then
    v_flags := v_flags || to_jsonb(format('single_spine_block_%s_ft_exceeds_1320_no_cross_street_possible_in_%s_ft_width', round(v_L), round(v_W)));
  end if;

  -- Parcel-level FEMA fraction: only a fallback when the geometry is not ingested for this area
  select fema_flood_zone_raw::jsonb into v_fema from public.parcels where ogc_fid = p_ogc_fid;
  begin
    select coalesce(sum((e->>'percent')::numeric),0) into v_ae_pct
    from jsonb_array_elements(coalesce(v_fema,'[]'::jsonb)) e
    where e->>'zone' in ('A','AE','AH','AO','VE','V');
  exception when others then v_ae_pct := 0; end;
  if not v_haz_covered and v_ae_pct > 0 then
    v_flags := v_flags || to_jsonb(format('floodplain_not_carved_layer_not_ingested_here_parcel_level_fema_%s_pct', v_ae_pct));
  end if;

  v_basis := format('%s lots @ %s×%s ft (%s; depth %s) on %s %s-ft through-street%s%s · %s · %s court%s on a %s-ft rhythm · %s%% of land in ROW, %s%% in lots%s · buildable depth %s ft after %s/%s setbacks · access %s (%s) · generator subdivision_v1.1%s',
    v_nlots, v_lot_w, v_d, v_lot_w_basis, v_depth_basis, v_n, v_row, case when v_n = 1 then '' else 's' end,
    case when v_k >= 2 then format(' + %s cross connector%s (blocks ≤ %s ft)', v_k-1, case when v_k-1 = 1 then '' else 's' end, p_max_block_ft) else '' end,
    case when v_alley > 0 then format('alleys %s ft', v_alley) else 'no alleys (estate lots, front-loaded)' end,
    v_ncourts, case when v_ncourts = 1 then '' else 's' end, p_court_spacing_ft,
    round(100.0*v_row_area/nullif(v_area,0),1), round(100.0*v_lot_area_sum/nullif(v_area,0),1),
    case when v_haz_area > 0 then format(', %s%% held out as greenway (floodplain %s%%, wetland %s%%)',
      round(100.0*v_haz_area/v_area,1), round(100.0*v_flood_area/v_area,1), round(100.0*v_wet_area/v_area,1)) else '' end,
    v_buildable, v_front, v_rear, v_access, v_access_basis,
    case when not v_haz_covered then ' · flood/wetland geometry not ingested for this area yet'
         || case when v_ae_pct > 0 then format(' (parcel-level FEMA %s%%)', v_ae_pct) else '' end else '' end);

  return jsonb_build_object(
    'parcel_ogc_fid', p_ogc_fid, 'generator_version', 'subdivision_v1.1',
    'pattern', case when v_n >= 2 then 'subdivision_street_grid' else 'subdivision_row_spine' end,
    'network', v_network,
    'frame', jsonb_build_object('theta_deg', round(degrees(v_theta)::numeric,1), 'obb_length_ft', round(v_L), 'obb_width_ft', round(v_W),
                                'streets_across', v_n, 'pitch_ft', v_pitch, 'leftover_width_ft', round(v_left), 'outer_row_extra_depth_ft', round(v_extra)),
    'access', jsonb_build_object('mode', v_access, 'basis', v_access_basis,
                                 'unshared_ft', jsonb_build_object('start', round(v_len_start), 'end', round(v_len_end), 'top', round(v_len_top), 'bottom', round(v_len_bot)),
                                 'gap_ft', jsonb_build_object('start', round(v_side_gap[1]), 'end', round(v_side_gap[2]), 'bottom', round(v_side_gap[3]), 'top', round(v_side_gap[4])),
                                 'street_read', jsonb_build_object('start', v_side_street[1], 'end', v_side_street[2], 'bottom', v_side_street[3], 'top', v_side_street[4]),
                                 'across_start_end', v_nb_start, 'across_end_end', v_nb_end,
                                 'dead_end_ft', jsonb_build_object('start', round(v_deadend_start), 'end', round(v_deadend_end))),
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
      'streets', v_n + (case when v_k >= 2 then v_k - 1 else 0 end) + (case when v_access = 'side' then 1 else 0 end),
      'blocks', v_blocks, 'street_length_ft', round(v_street_len), 'row_area_sqft', round(v_row_area),
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
