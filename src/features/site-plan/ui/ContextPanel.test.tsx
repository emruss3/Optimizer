import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextPanel from './ContextPanel';
import { plannerContextToDesignContext, plannerContextSummary, type PlannerContextResponse } from '../api/plannerContext';

// Live-shaped compiled snapshot (structure captured from
// fn_compile_planner_context(669046, 'multifamily') on 2026-07-13).
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
      max_coverage_pct: 60, min_open_space_pct: null, developable: true,
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

describe('ContextPanel (display-only, one compiled context)', () => {
  it('renders the compiled snapshot: ordinance provenance, hard values, comps', () => {
    render(
      <ContextPanel
        context={plannerContextToDesignContext(RESP)}
        builtForm={RESP.context.precedent}
        pricing={RESP.context.market}
        contextSummary={plannerContextSummary(RESP)}
        loading={false}
        uses={['single_family', 'two_family', 'multi_family']}
        use="multi_family"
        onUseChange={() => undefined}
      />
    );
    expect(screen.getByText('RM40 · Multi Family')).toBeTruthy();
    // ordinance-sourced values wear their source, not an "est." badge
    expect(screen.getAllByText('ordinance').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('45 ft')).toBeTruthy(); // max height (ordinance!)
    expect(screen.getByText('40 DU/ac')).toBeTruthy();
    // comps from the SAME snapshot (no independent fetch)
    expect(screen.getByText(/64 comps/)).toBeTruthy();
    expect(screen.getByText('$256')).toBeTruthy();
    // snapshot identity line
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

  it('fails soft: no context → honest message, never mock data', () => {
    render(
      <ContextPanel context={null} loading={false} uses={[]} use="multifamily" onUseChange={() => undefined} />
    );
    expect(screen.getByText(/Context engine unavailable/)).toBeTruthy();
  });
});

describe('plannerContext adapters', () => {
  it('projects the compiled snapshot onto the display shape with provenance intact', () => {
    const dc = plannerContextToDesignContext(RESP);
    expect(dc.zoningBase).toBe('RM40');
    expect(dc.maxFar).toEqual({ value: 1, source: 'ordinance', confidence: 'medium' });
    expect(dc.setbackSideFt?.value).toBe(5);
    expect(dc.parking?.aisleWidthFt).toBe(24);
    expect(dc.flags).toContain('frontage_geometry_is_placeholder_until_road_edge_upgrade');
  });

  it('summarizes the snapshot identity for the plan-basis strip', () => {
    expect(plannerContextSummary(RESP)).toBe(
      'Context v1 · 64 precedents (medium) · prior existing_engine_bridge_v0_1 · zoning high · frontage heuristic pending road upgrade'
    );
  });
});
