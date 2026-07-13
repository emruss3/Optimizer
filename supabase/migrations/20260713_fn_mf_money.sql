-- A3: the money block. Composable valuation for a generated scheme —
-- revenue from LOCAL SALES (fn_local_pricing), costs from
-- default_costs_by_use when seeded (labeled default until then), land from
-- the parcel's assessed value. Called per generation AND per live-drag
-- preview, so the margin ticks while you design.
--
-- NOTE: already applied to the live database via MCP on 2026-07-13.
-- Committed for version control — safe to re-run; the DB is not behind.

CREATE OR REPLACE FUNCTION public.fn_mf_money(
  p_ogc_fid integer,
  p_gfa_sqft numeric,
  p_units integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $function$
DECLARE
  pr jsonb;
  price_psf numeric; n_sales integer; conf text;
  hard_psf numeric := NULL; cost_src text := 'default_estimate';
  land numeric := 0;
  sellable numeric; gdv numeric; hard numeric; total_cost numeric;
  margin numeric;
  flags jsonb := '[]'::jsonb;
BEGIN
  IF p_gfa_sqft IS NULL OR p_gfa_sqft <= 0 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no GFA');
  END IF;

  pr := public.fn_local_pricing(p_ogc_fid);
  price_psf := (pr#>>'{price_per_building_sf,p50}')::numeric;
  n_sales := COALESCE((pr->>'n_comps')::int, 0);
  conf := COALESCE(pr->>'confidence', 'unknown');
  IF price_psf IS NULL OR price_psf <= 0 THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no local sales pricing',
      'n_sales', n_sales);
  END IF;
  IF conf IN ('insufficient', 'low') THEN
    flags := flags || to_jsonb(('pricing_confidence_' || conf)::text);
  END IF;

  -- Hard cost: seeded table wins; explicit labeled default until then
  BEGIN
    SELECT d.hard_cost_per_sf INTO hard_psf
    FROM public.default_costs_by_use d
    WHERE d.use_type ~* 'multi' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    hard_psf := NULL;
  END;
  IF hard_psf IS NULL OR hard_psf <= 0 THEN
    hard_psf := 175;  -- garden MF hard cost default, $/GSF
    flags := flags || to_jsonb('costs_default_table_empty'::text);
  ELSE
    cost_src := 'default_costs_by_use';
  END IF;

  SELECT COALESCE(parval, 0) INTO land FROM public.parcels WHERE ogc_fid = p_ogc_fid;

  sellable := p_gfa_sqft * 0.85;              -- net sellable/rentable efficiency
  gdv := sellable * price_psf;
  hard := p_gfa_sqft * hard_psf;
  total_cost := hard * 1.25 + land;           -- soft costs + contingency load
  margin := CASE WHEN total_cost > 0 THEN (gdv - total_cost) / total_cost ELSE NULL END;

  RETURN jsonb_build_object(
    'available', true,
    'gdv', round(gdv),
    'total_cost', round(total_cost),
    'land', round(land),
    'hard_cost_psf', hard_psf,
    'cost_source', cost_src,
    'price_psf_p50', price_psf,
    'n_sales', n_sales,
    'pricing_confidence', conf,
    'margin_on_cost', round(margin, 4),
    'basis', format('for-sale margin on cost · 85%% sellable · $%s/SF from %s local sale%s (%s)',
                    round(price_psf), n_sales, CASE WHEN n_sales = 1 THEN '' ELSE 's' END, conf),
    'flags', flags
  );
END $function$;
