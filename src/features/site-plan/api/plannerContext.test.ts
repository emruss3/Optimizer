import { describe, it, expect } from 'vitest';
import {
  isSolverBrief,
  isPlannerContextResponse,
  compileCacheKey,
  canonicalJson,
  briefToZoningPatch,
  briefToParkingPatch,
  briefToWorkerBrief,
  planUsedActiveContext,
  isContextAwareGeneratorVersion,
  describeContextFlag,
  CONTEXT_VERSION_V2,
  type PlannerContextResponse,
  type SolverBrief,
  type PrecedentPriors,
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

// planner_context_v2 priors — structure per fn_local_built_form_v2 on parcel
// 669046 (multifamily): 5 exact-use RM40 precedents with real geometry.
const V2_PRIORS: PrecedentPriors = {
  sample_size: 5,
  confidence: 'high',
  selection: {
    mode: 'exact_same_zoning',
    requested_typology: 'multifamily',
    match_mode: 'exact',
    same_zoning_required: true,
    lot_band: '+/-50%',
    sample_size: 5,
    available_count: 5,
    sample_cap: 100,
    confidence: 'high',
  },
  type_mix: { multifamily: 5 },
  precedent_parcel_ids: [1, 2, 3, 4, 5],
  footprint_sqft: { p25: 5000, p50: 7536, p75: 9100, p90: 12000 },
  total_footprint_sqft: { p50: 41000 },
  building_count: { p25: 3, p50: 6, p75: 8, p90: 10 },
  coverage_pct: { p25: 22, p50: 27, p75: 31, p90: 35 },
  stories: { p50: 2, p75: 2, p90: 3 },
  length_ft: { p25: 110, p50: 140, p75: 163.7, p90: 190 },
  depth_ft: { p25: 60, p50: 99.8, p75: 110, p90: 120 },
  aspect_ratio: { p50: 1.6 },
  compactness: { p50: 0.62 },
  underwrite_target: {
    footprint_sqft_p75: 9100,
    footprint_sqft_p90: 12000,
    stories_p75: 2,
    length_ft_p75: 163.7,
    depth_ft_p50: 99.8,
    coverage_pct_p75: 31,
    building_count_p50: 6,
  },
};

const RESP_V2 = {
  ...RESP,
  context_id: 'ctx-v2',
  context_version: CONTEXT_VERSION_V2,
  solver_brief: { ...BRIEF, precedent_priors: V2_PRIORS },
} as unknown as PlannerContextResponse;

describe('planner context type guards', () => {
  it('accepts the live shape and rejects junk', () => {
    expect(isSolverBrief(BRIEF)).toBe(true);
    expect(isPlannerContextResponse(RESP)).toBe(true);
    expect(isSolverBrief(null)).toBe(false);
    expect(isSolverBrief({ parcel_ogc_fid: 1 })).toBe(false);
    expect(isPlannerContextResponse({ context_id: 'x' })).toBe(false);
  });

  it('planner_context_v2 payloads (selection, geometry distributions) parse too', () => {
    expect(isPlannerContextResponse(RESP_V2)).toBe(true);
  });
});

describe('canonical JSON serializer (cache-key correctness)', () => {
  it('sorts keys recursively, not just at the top level', () => {
    const a = { profile: 'x', weights: { far: 1, yield: 2 } };
    const b = { weights: { yield: 2, far: 1 }, profile: 'x' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it('distinct nested values do NOT collide', () => {
    const a = { weights: { far: 1, yield: 2 } };
    const b = { weights: { far: 2, yield: 1 } };
    expect(canonicalJson(a)).not.toBe(canonicalJson(b));
  });

  it('handles arrays, nulls and drops undefined members', () => {
    expect(canonicalJson({ a: [1, { z: 1, y: 2 }], b: null, c: undefined }))
      .toBe('{"a":[1,{"y":2,"z":1}],"b":null}');
  });
});

describe('compile cache key', () => {
  it('is stable across intent key order (deep) and distinct per use', () => {
    expect(compileCacheKey(1, 'multifamily', { a: 1, b: { x: 1, y: 2 } }))
      .toBe(compileCacheKey(1, 'multifamily', { b: { y: 2, x: 1 }, a: 1 }));
    expect(compileCacheKey(1, 'multifamily')).not.toBe(compileCacheKey(1, 'single_family'));
    expect(compileCacheKey(1, 'multifamily', { w: { a: 1 } }))
      .not.toBe(compileCacheKey(1, 'multifamily', { w: { a: 2 } }));
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
  it('v1 priors + gate → worker brief (new fields null, no crash)', () => {
    expect(briefToWorkerBrief(RESP)).toEqual({
      generationAllowed: true,
      precedent: {
        storiesP50: 1, storiesP75: 2,
        footprintP75SqFt: 2145, footprintP90SqFt: 3216,
        depthP50Ft: null, lengthP75Ft: null, coverageP75Pct: null, buildingCountP50: null,
        sampleSize: 64, confidence: 'medium',
        selectionMode: null, precedentParcelIds: undefined,
      },
      programPrior: { averageUnitSqft: 950 },
      objectiveWeights: { financial_return: 0.2 },
    });
  });
  it('v2 Regrid geometry priors travel: depth, length, coverage, building count, selection', () => {
    const wb = briefToWorkerBrief(RESP_V2);
    expect(wb.precedent).toMatchObject({
      depthP50Ft: 99.8,
      lengthP75Ft: 163.7,
      coverageP75Pct: 31,
      buildingCountP50: 6,
      storiesP50: 2,
      storiesP75: 2,
      footprintP75SqFt: 9100,
      footprintP90SqFt: 12000,
      sampleSize: 5,
      confidence: 'high',
      selectionMode: 'exact_same_zoning',
      precedentParcelIds: [1, 2, 3, 4, 5],
    });
    expect(wb.objectiveWeights).toEqual({ financial_return: 0.2 });
  });
});

describe('planUsedActiveContext (the "Context applied" gate)', () => {
  const v2plan = {
    context_id: 'ctx-1',
    context_version: 'planner_context_v2',
    generator_version: 'mf_context_v2_regrid_typology_v1',
  };
  it('true only for matching id + v2 version + context-aware generator', () => {
    expect(planUsedActiveContext(v2plan, 'ctx-1')).toBe(true);
  });
  it('false when the plan context id differs from the active one', () => {
    expect(planUsedActiveContext(v2plan, 'ctx-OTHER')).toBe(false);
  });
  it('false for v1 context versions and legacy generators', () => {
    expect(planUsedActiveContext({ ...v2plan, context_version: 'planner_context_v1' }, 'ctx-1')).toBe(false);
    expect(planUsedActiveContext({ ...v2plan, generator_version: 'garden_v1' }, 'ctx-1')).toBe(false);
  });
  it('false when no active context exists at all', () => {
    expect(planUsedActiveContext(v2plan, null)).toBe(false);
  });
  it('recognizes the current server lineage vocabulary', () => {
    expect(isContextAwareGeneratorVersion('mf_context_v2_regrid_typology_v1')).toBe(true);
    expect(isContextAwareGeneratorVersion('mf_context_v2')).toBe(true);
    expect(isContextAwareGeneratorVersion('garden_v1')).toBe(false);
    expect(isContextAwareGeneratorVersion(null)).toBe(false);
  });
});

describe('flag translation', () => {
  it('translates the documented technical flags into sentences', () => {
    expect(describeContextFlag('regrid_typology_selection_exact_same_zoning'))
      .toBe('Matched the selected use and zoning subtype.');
    expect(describeContextFlag('regrid_zoning_filter_relaxed'))
      .toBe("Expanded beyond the parcel's zoning subtype due to limited local examples.");
    expect(describeContextFlag('regrid_compatible_use_classes_used'))
      .toBe('Included compatible building uses due to limited exact matches.');
    expect(describeContextFlag('regrid_sample_capped_100'))
      .toBe('Analyzed the 100 closest and most lot-comparable precedents.');
    expect(describeContextFlag('bar_depth_from_regrid_geometry_p50'))
      .toBe('Building depth initialized from the local median.');
    expect(describeContextFlag('bar_length_target_from_regrid_geometry_p75'))
      .toBe('Building length initialized from the local 75th percentile.');
    expect(describeContextFlag('stories_from_precedent_p50_p75'))
      .toBe('Story count initialized from the local built-form range.');
    expect(describeContextFlag('frontage_geometry_is_placeholder_until_road_edge_upgrade'))
      .toBe('Access remains based on a frontage heuristic, not a verified road edge.');
  });
  it('humanizes unknown flags instead of leaking snake_case', () => {
    expect(describeContextFlag('some_new_backend_flag')).toBe('some new backend flag');
  });
});
