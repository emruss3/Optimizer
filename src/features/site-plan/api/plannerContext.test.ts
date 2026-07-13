import { describe, it, expect } from 'vitest';
import {
  isSolverBrief,
  isPlannerContextResponse,
  compileCacheKey,
  briefToZoningPatch,
  briefToParkingPatch,
  briefToWorkerBrief,
  type PlannerContextResponse,
  type SolverBrief,
} from './plannerContext';

const BRIEF: SolverBrief = {
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
  program_prior: { average_unit_sqft: { value: 950, source: 'existing_server_generator_v1', confidence: 'low' } },
  program_prior_version: 'existing_engine_bridge_v0_1',
  objective_profile: { profile: 'balanced_context_v1', weights: { financial_return: 0.2 } as never },
};

const RESP = {
  context_id: 'x', context_version: 'planner_context_v1', context_hash: 'h',
  created_at: 'now', generation_allowed: true,
  context: { typology: 'multifamily' }, solver_brief: BRIEF,
} as unknown as PlannerContextResponse;

describe('planner context type guards', () => {
  it('accepts the live shape and rejects junk', () => {
    expect(isSolverBrief(BRIEF)).toBe(true);
    expect(isPlannerContextResponse(RESP)).toBe(true);
    expect(isSolverBrief(null)).toBe(false);
    expect(isSolverBrief({ parcel_ogc_fid: 1 })).toBe(false);
    expect(isPlannerContextResponse({ context_id: 'x' })).toBe(false);
  });
});

describe('compile cache key', () => {
  it('is stable across intent key order and distinct per use', () => {
    expect(compileCacheKey(1, 'multifamily', { a: 1, b: 2 }))
      .toBe(compileCacheKey(1, 'multifamily', { b: 2, a: 1 }));
    expect(compileCacheKey(1, 'multifamily')).not.toBe(compileCacheKey(1, 'single_family'));
  });
});

describe('the worker fallback receives the SAME context values as the server', () => {
  it('hard constraints → zoning patch, verbatim', () => {
    expect(briefToZoningPatch(BRIEF)).toEqual({
      frontSetbackFt: 20, sideSetbackFt: 5, rearSetbackFt: 20,
      maxFar: 1, maxHeightFt: 45, maxDensityDuPerAcre: 40, maxCoveragePct: 60,
    });
  });
  it('brief parking → parking patch, verbatim', () => {
    expect(briefToParkingPatch(BRIEF)).toEqual({
      targetRatio: 1.5, stallWidthFt: 9, stallDepthFt: 18, aisleWidthFt: 24,
    });
  });
  it('precedent priors + gate → worker brief', () => {
    expect(briefToWorkerBrief(RESP)).toEqual({
      generationAllowed: true,
      precedent: { storiesP50: 1, storiesP75: 2, footprintP90SqFt: 3216, sampleSize: 64 },
      programPrior: { averageUnitSqft: 950 },
      objectiveWeights: { financial_return: 0.2 },
    });
  });
});
