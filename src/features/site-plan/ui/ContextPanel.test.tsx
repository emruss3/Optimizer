import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextPanel from './ContextPanel';
import {
  plannerContextToDesignContext,
  plannerContextSummary,
  type PlannerContextResponse,
  type PrecedentPriors,
} from '../api/plannerContext';

// Live-shaped compiled snapshot (structure captured from
// fn_compile_planner_context(669046, 'multifamily')).
const RESP = {
  context_id: '46816a05-bcb2-43e1-8ce9-3be146ef8f61',
  context_version: 'planner_context_v1',
  context_hash: 'c0647b18e6a62b43925dc45e7aa7ca31f95fd4f5',
  created_at: '2026-07-13T19:31:19Z',
  generation_allowed: true,
  context: {
    schema_version: 'planner_context_v1',
    parcel_ogc_fid: 669046,
    selected_use: 'multifamily',
    typology: 'multifamily',
    generation_allowed: true,
    flags: ['frontage_geometry_is_placeholder_until_road_edge_upgrade'],
    legal: {
      permitted_as_of_right: true,
      zoning_base: 'RM40',
      zoning_subtype: 'Multi Family',
      municipality: 'Nashville',
      confidence: 'high',
      setbacks: {
        front: { value: 20, source: 'ordinance' },
        side: { value: 5, source: 'ordinance' },
        rear: { value: 20, source: 'ordinance' },
      },
      max_far: { value: 1, source: 'ordinance' },
      max_height_ft: { value: 45, source: 'ordinance' },
      max_density_du_acre: { value: 40, source: 'ordinance' },
      max_coverage_pct: { value: 60, source: 'typology_spec' },
      max_building_coverage_pct: { value: 60, source: 'typology_spec' },
      max_impervious_pct: { value: 75, source: 'ordinance' },
    },
    precedent: {
      n_comps: 64,
      confidence: 'medium',
      distribution: {
        footprint_sqft: { p25: 970, p50: 1513, p75: 2145, p90: 3216 },
        stories: { p50: 1, p75: 2, p90: 2 },
      },
      underwrite_target: { footprint_sqft_p75: 2145, footprint_sqft_p90: 3216, stories_p75: 2 },
    },
    market: {
      n_comps: 23,
      confidence: 'medium',
      price_per_building_sf: { p25: 192, p50: 256, p75: 397, p90: 736 },
      price_per_lot_sf: { p50: 102.9, p75: 238.7 },
      sale_price: { p50: 370000, p75: 615000, p90: 850000 },
    },
    parking_strategy: 'surface',
    objective_profile: { profile: 'balanced_context_v1', weights: {} },
    provenance: {},
    program_prior_version: 'existing_engine_bridge_v0_1',
  },
  solver_brief: {
    schema_version: 'planner_context_v1',
    parcel_ogc_fid: 669046,
    selected_use: 'multifamily',
    typology: 'multifamily',
    generation_allowed: true,
    flags: ['frontage_geometry_is_placeholder_until_road_edge_upgrade'],
    geometry: { front_edge_is_placeholder: true, access_method: 'road_proximity' },
    hard_constraints: {
      front_setback_ft: 20, side_setback_ft: 5, rear_setback_ft: 20,
      max_far: 1, max_height_ft: 45, max_density_du_acre: 40,
      max_coverage_pct: 60, max_building_coverage_pct: 60,
      max_impervious_pct: 75,
      coverage_semantics: {
        max_coverage_pct: 'building_footprint_only',
        max_impervious_pct: 'building_plus_parking_plus_drives_and_other_impervious',
      },
      min_open_space_pct: null, developable: true,
    },
    parking: {
      strategy: 'surface', ratio: 1.5, basis: 'per_unit',
      stall_width_ft: 9, stall_depth_ft: 18, aisle_width_ft: 24,
      permitted_angles_deg: [0, 60, 90],
    },
    precedent_priors: {
      sample_size: 64, confidence: 'medium',
      footprint_sqft: { p25: 970, p50: 1513, p75: 2145, p90: 3216 },
      stories: { p50: 1, p75: 2, p90: 2 },
      underwrite_target: { footprint_sqft_p75: 2145, footprint_sqft_p90: 3216 },
    },
    program_prior: { limitations: [] },
    program_prior_version: 'existing_engine_bridge_v0_1',
    objective_profile: { profile: 'balanced_context_v1', weights: {} },
  },
} as unknown as PlannerContextResponse;

// planner_context_v2 priors for the same parcel. Five exact examples cannot be
// called high confidence, and the 99.8-ft depth is a whole-complex OBB metric.
const MF_PRIORS_V2: PrecedentPriors = {
  sample_size: 5,
  confidence: 'medium',
  selection: {
    mode: 'exact_same_zoning',
    requested_typology: 'multifamily',
    match_mode: 'exact',
    same_zoning_required: true,
    lot_band: '+/-50%',
    sample_size: 5,
    available_count: 5,
    sample_cap: 100,
    confidence: 'medium',
  },
  type_mix: { multifamily: 5 },
  footprint_sqft: { p50: 7536 },
  depth_ft: { p50: 99.8 },
  whole_building_obb_depth_ft: { p50: 99.8 },
  depth_semantics: 'whole_building_oriented_bounding_box_not_bar_depth',
  bar_depth_source: 'typology_or_program_spec_only',
  quantity_role: 'form_only_never_caps_gsf',
  length_ft: { p75: 163.7 },
  stories: { p50: 2, p75: 2 },
  coverage_pct: { p75: 31 },
  building_count: { p50: 6 },
};

const SF_PRIORS_V2: PrecedentPriors = {
  sample_size: 67,
  confidence: 'high',
  selection: {
    mode: 'exact_same_zoning',
    requested_typology: 'single_family',
    match_mode: 'exact',
    same_zoning_required: true,
    lot_band: '+/-50%',
    sample_size: 67,
    available_count: 210,
    sample_cap: 100,
    confidence: 'high',
  },
  type_mix: { single_family: 67 },
  footprint_sqft: { p50: 1435 },
  depth_ft: { p50: 31.1 },
  length_ft: { p75: 62.2 },
  stories: { p50: 1, p75: 1 },
  coverage_pct: { p75: 18 },
  building_count: { p50: 1 },
};

describe('ContextPanel (display-only, one compiled context)', () => {
  it('renders the compiled snapshot with separate coverage semantics', () => {
    render(
      <ContextPanel
        context={plannerContextToDesignContext(RESP)}
        precedent={RESP.solver_brief.precedent_priors}
        pricing={RESP.context.market}
        contextSummary={plannerContextSummary(RESP)}
        loading={false}
        uses={['single_family', 'two_family', 'multi_family']}
        use="multi_family"
        onUseChange={() => undefined}
      />
    );
    expect(screen.getByText('RM40 · Multi Family')).toBeTruthy();
    expect(screen.getAllByText('ordinance').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('45 ft')).toBeTruthy();
    expect(screen.getByText('40 DU/ac')).toBeTruthy();
    expect(screen.getByText('Max building coverage')).toBeTruthy();
    expect(screen.getByText('60 %')).toBeTruthy();
    expect(screen.getByText('Max impervious surface')).toBeTruthy();
    expect(screen.getByText('75 %')).toBeTruthy();
    expect(screen.getByText('Local precedent basis')).toBeTruthy();
    expect(screen.getByText(/64 precedents · medium confidence/)).toBeTruthy();
    expect(screen.getByText(/1,513 SF/)).toBeTruthy();
    expect(screen.getByText('$256')).toBeTruthy();
    expect(screen.getByText(/64 precedents \(medium\)/)).toBeTruthy();
    expect(screen.getByText(/frontage heuristic pending road upgrade/)).toBeTruthy();
  });

  it('shows the generation-blocked banner and keeps the use selector working', () => {
    const onUse = vi.fn();
    render(
      <ContextPanel
        context={plannerContextToDesignContext(RESP)}
        contextSummary={null}
        loading={false}
        uses={['single_family', 'multi_family']}
        use="multi_family"
        onUseChange={onUse}
        generationBlocked
      />
    );
    expect(screen.getByText(/not permitted as-of-right/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'single_family' } });
    expect(onUse).toHaveBeenCalledWith('single_family');
  });

  it('fails closed: no verified context means generation is blocked, never mock data', () => {
    render(
      <ContextPanel context={null} loading={false} uses={[]} use="multifamily" onUseChange={() => undefined} />
    );
    expect(screen.getByText(/Verified context is unavailable — generation is blocked/)).toBeTruthy();
    expect(screen.queryByText(/standard defaults/)).toBeNull();
  });

  it('compiling state is explicit', () => {
    render(
      <ContextPanel context={null} loading uses={[]} use="multifamily" onUseChange={() => undefined} />
    );
    expect(screen.getByText(/Compiling local context/)).toBeTruthy();
  });
});

describe('Local precedent basis (planner_context_v2)', () => {
  const renderWithPriors = (precedent: PrecedentPriors, typology: string) =>
    render(
      <ContextPanel
        context={{ ...plannerContextToDesignContext(RESP), typology }}
        precedent={precedent}
        loading={false}
        uses={['single_family', 'multi_family']}
        use={typology}
        onUseChange={() => undefined}
      />
    );

  it('single-family and multifamily on the same parcel display different form evidence', () => {
    const mf = renderWithPriors(MF_PRIORS_V2, 'multifamily');
    expect(screen.getByText(/Multifamily · 5 exact-use RM40 precedents · medium confidence/)).toBeTruthy();
    expect(screen.getByText(/7,536 SF/)).toBeTruthy();
    expect(screen.getByText(/99\.8 ft/)).toBeTruthy();
    expect(screen.getByText(/OBB median · not bar depth/)).toBeTruthy();
    expect(screen.getByText(/163\.7 ft/)).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    mf.unmount();

    renderWithPriors(SF_PRIORS_V2, 'single_family');
    expect(screen.getByText(/Single family · 67 exact-use RM40 precedents · high confidence/)).toBeTruthy();
    expect(screen.getByText(/1,435 SF/)).toBeTruthy();
    expect(screen.getByText(/31\.1 ft/)).toBeTruthy();
    expect(screen.getByText(/62\.2 ft/)).toBeTruthy();
    expect(screen.queryByText(/7,536 SF/)).toBeNull();
  });

  it('an exact same-zoning selection shows no relaxation warning', () => {
    renderWithPriors(MF_PRIORS_V2, 'multifamily');
    expect(screen.queryByText(/expanded/i)).toBeNull();
  });

  it('a relaxed selection mode produces a visible warning', () => {
    renderWithPriors(
      {
        ...MF_PRIORS_V2,
        selection: {
          ...MF_PRIORS_V2.selection!,
          mode: 'compatible_any_zoning',
          match_mode: 'compatible',
          same_zoning_required: false,
          confidence: 'low',
        },
        confidence: 'low',
      },
      'multifamily'
    );
    expect(
      screen.getByText(/Only a few exact local precedents were available — the context was expanded to compatible uses across nearby zoning districts\./)
    ).toBeTruthy();
  });

  it('planner_context_v1 priors still render without crashing', () => {
    renderWithPriors(
      { sample_size: 64, confidence: 'medium', footprint_sqft: { p50: 1513 }, stories: { p50: 1, p75: 2 } },
      'multifamily'
    );
    expect(screen.getByText('Local precedent basis')).toBeTruthy();
    expect(screen.getByText(/64 precedents · medium confidence/)).toBeTruthy();
    expect(screen.getByText(/1,513 SF/)).toBeTruthy();
    expect(screen.getByText(/1–2/)).toBeTruthy();
  });

  it('does not expose raw context JSON', () => {
    renderWithPriors(MF_PRIORS_V2, 'multifamily');
    expect(screen.queryByText(/precedent_parcel_ids/)).toBeNull();
    expect(screen.queryByText(/\{/)).toBeNull();
  });
});

describe('plannerContext adapters', () => {
  it('projects the compiled snapshot onto the display shape with provenance intact', () => {
    const dc = plannerContextToDesignContext(RESP);
    expect(dc.zoningBase).toBe('RM40');
    expect(dc.maxFar).toEqual({ value: 1, source: 'ordinance', confidence: 'medium' });
    expect(dc.setbackSideFt?.value).toBe(5);
    expect(dc.maxBuildingCoveragePct).toMatchObject({ value: 60, source: 'typology_spec' });
    expect(dc.maxImperviousPct).toMatchObject({ value: 75, source: 'ordinance' });
    expect(dc.parking?.aisleWidthFt).toBe(24);
    expect(dc.flags).toContain('frontage_geometry_is_placeholder_until_road_edge_upgrade');
  });

  it('summarizes the snapshot identity for the plan-basis strip', () => {
    expect(plannerContextSummary(RESP)).toBe(
      'Context v1 · 64 precedents (medium) · prior existing_engine_bridge_v0_1 · zoning high · frontage heuristic pending road upgrade'
    );
  });
});
