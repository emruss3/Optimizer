import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ContextLineage, { resolveContextApplication, type PlanLineage } from './ContextLineage';
import type { PlannerContextResponse } from '../api/plannerContext';

// Active v2 snapshot: five exact multifamily precedents with Regrid geometry.
// The approximately 100-foot depth is whole-building OBB evidence and must not
// be presented as an apartment-bar target.
const ACTIVE = {
  context_id: 'ctx-active',
  context_version: 'planner_context_v2',
  context_hash: 'abcdef0123456789',
  created_at: 'now',
  generation_allowed: true,
  context: { typology: 'multifamily' },
  solver_brief: {
    precedent_priors: {
      sample_size: 5,
      confidence: 'medium',
      selection: {
        mode: 'exact_same_zoning',
        requested_typology: 'multifamily',
        match_mode: 'exact',
        same_zoning_required: true,
        lot_band: '+/-50%',
        sample_size: 5,
        confidence: 'medium',
      },
      depth_ft: { p50: 99.8 },
      whole_building_obb_depth_ft: { p50: 99.8 },
      depth_semantics: 'whole_building_oriented_bounding_box_not_bar_depth',
      bar_depth_source: 'typology_or_program_spec_only',
      quantity_role: 'form_only_never_caps_gsf',
      length_ft: { p75: 163.7 },
      stories: { p50: 2, p75: 2 },
      underwrite_target: { depth_ft_p50: 99.8, length_ft_p75: 163.7 },
    },
  },
} as unknown as PlannerContextResponse;

/** A server plan whose own lineage matches the active snapshot. */
const SERVER_LINEAGE: PlanLineage = {
  solvedBy: 'server',
  contextId: 'ctx-active',
  contextVersion: 'planner_context_v2',
  contextHash: 'abcdef0123456789',
  generatorVersion: 'mf_max_gsf_v1',
  scoreVersion: 'context_score_gsf_v1',
  programPriorVersion: 'existing_engine_bridge_v0_1',
  scoreTotal: 0.834,
  scoreComponents: { precedent_fit: 0.834 },
  flags: ['bar_depth_from_regrid_geometry_p50'],
  buildings: 2,
  floors: 4,
  footprintSqft: 19215,
};

const args = (over: Partial<Parameters<typeof resolveContextApplication>[0]> = {}) => ({
  compiling: false,
  blocked: false,
  planStale: false,
  activeContext: ACTIVE,
  lineage: SERVER_LINEAGE,
  ...over,
});

describe('resolveContextApplication (the six honest states)', () => {
  it('matching server lineage → applied', () => {
    expect(resolveContextApplication(args())).toBe('applied');
  });

  it('"Context applied" is NOT claimed when the plan context id differs from the active one', () => {
    expect(
      resolveContextApplication(args({ lineage: { ...SERVER_LINEAGE, contextId: 'ctx-OLDER' } }))
    ).toBe('unavailable');
  });

  it('a v1 context version or a legacy generator is never "applied"', () => {
    expect(
      resolveContextApplication(args({ lineage: { ...SERVER_LINEAGE, contextVersion: 'planner_context_v1' } }))
    ).toBe('unavailable');
    expect(
      resolveContextApplication(args({ lineage: { ...SERVER_LINEAGE, generatorVersion: 'garden_v1' } }))
    ).toBe('unavailable');
  });

  it('a worker plan is applied only when it actually carried the active brief', () => {
    const worker: PlanLineage = {
      solvedBy: 'worker',
      contextId: 'ctx-active',
      contextVersion: 'planner_context_v2',
      workerUsedActiveContext: true,
    };
    expect(resolveContextApplication(args({ lineage: worker }))).toBe('applied');
    expect(
      resolveContextApplication(args({ lineage: { ...worker, workerUsedActiveContext: false } }))
    ).toBe('unavailable');
    expect(
      resolveContextApplication(args({ lineage: { ...worker, contextId: 'ctx-other' } }))
    ).toBe('unavailable');
  });

  it('blocked beats everything; stale beats compiling; compiling only before a context exists', () => {
    expect(resolveContextApplication(args({ blocked: true, planStale: true }))).toBe('blocked');
    expect(resolveContextApplication(args({ planStale: true, compiling: true }))).toBe('stale');
    expect(resolveContextApplication(args({ compiling: true, activeContext: null, lineage: null }))).toBe('compiling');
  });

  it('a server generator that read the standards straight from the ordinance resolver is "standards-direct", not "unavailable"', () => {
    // The subdivision generator (2026-09-03): district setbacks / min lot area
    // via fn_resolve_design_context, no compiled brief consumed.
    const direct: PlanLineage = { solvedBy: 'server', contextId: null, generatorVersion: 'subdivision_v1', standardsDirect: true };
    expect(resolveContextApplication(args({ lineage: direct }))).toBe('standards-direct');
    expect(resolveContextApplication(args({ lineage: direct, activeContext: null }))).toBe('standards-direct');
    // blocked / stale still win; a worker plan never gets the label
    expect(resolveContextApplication(args({ lineage: direct, blocked: true }))).toBe('blocked');
    expect(resolveContextApplication(args({ lineage: { ...direct, solvedBy: 'worker' } }))).toBe('unavailable');
  });

  it('no context or no plan yet → unavailable, never current-authoritative', () => {
    expect(resolveContextApplication(args({ activeContext: null }))).toBe('unavailable');
    expect(resolveContextApplication(args({ lineage: null }))).toBe('unavailable');
  });

  it('a relaxed Regrid selection is applied WITH fallback evidence, not plain applied', () => {
    const relaxed = structuredClone(ACTIVE) as unknown as PlannerContextResponse;
    (relaxed.solver_brief.precedent_priors.selection as { mode: string }).mode = 'compatible_any_zoning';
    expect(resolveContextApplication(args({ activeContext: relaxed }))).toBe('applied-fallback');
  });

  it('relaxation flags on the plan itself also demote to applied-fallback', () => {
    expect(
      resolveContextApplication(args({
        lineage: { ...SERVER_LINEAGE, flags: ['regrid_zoning_filter_relaxed'] },
      }))
    ).toBe('applied-fallback');
  });
});

describe('<ContextLineage> (decision explanation near Plan Basis)', () => {
  it('applied: names the form precedents without presenting OBB depth as bar depth', () => {
    render(
      <ContextLineage state="applied" activeContext={ACTIVE} lineage={SERVER_LINEAGE} />
    );
    expect(screen.getByText('Context applied')).toBeTruthy();
    expect(
      screen.getByText('5 exact multifamily precedents supplied form evidence: 164 ft local length · 2-story local form norm')
    ).toBeTruthy();
    expect(screen.queryByText(/100 ft/)).toBeNull();
    expect(screen.getByText(/2 buildings · 4 stories · 19,215 SF footprint/)).toBeTruthy();
    expect(screen.getByText(/Precedent fit: 0\.834/)).toBeTruthy();
  });

  it('details view shows the full lineage and translated flags', () => {
    render(
      <ContextLineage state="applied" activeContext={ACTIVE} lineage={SERVER_LINEAGE} />
    );
    fireEvent.click(screen.getByText('Details'));
    expect(screen.getByText(/context_version: planner_context_v2/)).toBeTruthy();
    expect(screen.getByText(/context_hash: abcdef0123…/)).toBeTruthy();
    expect(screen.getByText(/generator_version: mf_max_gsf_v1/)).toBeTruthy();
    expect(screen.getByText(/score_version: context_score_gsf_v1/)).toBeTruthy();
    expect(screen.getByText(/program_prior_version: existing_engine_bridge_v0_1/)).toBeTruthy();
    expect(screen.getByText(/regrid_precedents: 5/)).toBeTruthy();
    // Flags are translated, not raw snake_case, and explicitly disavow OBB depth.
    expect(screen.getByText(/Legacy local depth value recorded; it must not control apartment-bar depth\./)).toBeTruthy();
  });

  it('each honest state renders its own message, never "Context applied"', () => {
    const cases: Array<[string, RegExp]> = [
      ['compiling', /Compiling local context/],
      ['applied-fallback', /Context applied with fallback evidence/],
      ['standards-direct', /District standards applied directly/],
      ['unavailable', /Context not verified — no authoritative plan basis/],
      ['blocked', /Generation blocked by legal or physical constraints/],
      ['stale', /Plan is stale — selected use or context has changed/],
    ];
    for (const [state, re] of cases) {
      const { unmount } = render(
        <ContextLineage
          state={state as never}
          activeContext={state === 'unavailable' ? null : ACTIVE}
          lineage={null}
          blockedReason={state === 'blocked' ? '"multifamily" is not permitted as-of-right on this parcel.' : null}
        />
      );
      expect(screen.getByText(re)).toBeTruthy();
      expect(screen.queryByText('Context applied')).toBeNull();
      unmount();
    }
  });

  it('blocked state explains WHICH use is blocked', () => {
    render(
      <ContextLineage
        state="blocked"
        activeContext={ACTIVE}
        lineage={null}
        blockedReason='"multifamily" is not permitted as-of-right on this parcel. Pick a permitted use in the Design Context panel.'
      />
    );
    expect(screen.getByText(/"multifamily" is not permitted as-of-right/)).toBeTruthy();
  });
});
