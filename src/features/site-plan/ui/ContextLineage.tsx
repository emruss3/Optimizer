import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  describeContextFlag,
  planUsedActiveContext,
  CONTEXT_VERSION_V2,
  type PlannerContextResponse,
} from '../api/plannerContext';

/** What the last generated plan reported about its own basis. */
export interface PlanLineage {
  solvedBy: 'server' | 'worker';
  contextId?: string | null;
  contextVersion?: string | null;
  contextHash?: string | null;
  generatorVersion?: string | null;
  scoreVersion?: string | null;
  programPriorVersion?: string | null;
  scoreTotal?: number | null;
  scoreComponents?: Record<string, number> | null;
  flags?: string[];
  buildings?: number | null;
  floors?: number | null;
  footprintSqft?: number | null;
  /** True when the worker solve actually carried the active context's brief */
  workerUsedActiveContext?: boolean;
  /** True when a server generator read the district standards straight from
   *  the ordinance resolver (fn_resolve_design_context) instead of consuming
   *  the compiled planner brief — the subdivision generator does this. */
  standardsDirect?: boolean;
}

export type ContextApplicationState =
  | 'compiling'
  | 'applied'
  | 'applied-fallback'
  | 'standards-direct'
  | 'unavailable'
  | 'blocked'
  | 'stale';

/** Decide the honest state for the context-to-plan lineage strip. */
export function resolveContextApplication(args: {
  compiling: boolean;
  blocked: boolean;
  planStale: boolean;
  activeContext: PlannerContextResponse | null;
  lineage: PlanLineage | null;
}): ContextApplicationState {
  const { compiling, blocked, planStale, activeContext, lineage } = args;
  if (blocked) return 'blocked';
  if (planStale) return 'stale';
  if (compiling && !activeContext) return 'compiling';
  // A server generator that took the district standards straight from the
  // ordinance resolver has an authoritative basis (the standards are the
  // same ones the brief compiles from) — it just never consumed the brief.
  if (lineage?.solvedBy === 'server' && lineage.standardsDirect === true) return 'standards-direct';
  if (!activeContext || !lineage) return 'unavailable';

  const applied =
    lineage.solvedBy === 'server'
      ? planUsedActiveContext(
          {
            context_id: lineage.contextId,
            context_version: lineage.contextVersion,
            generator_version: lineage.generatorVersion,
          },
          activeContext.context_id
        )
      : lineage.workerUsedActiveContext === true &&
        lineage.contextId === activeContext.context_id &&
        lineage.contextVersion === CONTEXT_VERSION_V2;
  if (!applied) return 'unavailable';

  const selection = activeContext.solver_brief.precedent_priors.selection;
  const confidence = selection?.confidence ?? activeContext.solver_brief.precedent_priors.confidence;
  const fallbackEvidence =
    (selection && selection.mode !== 'exact_same_zoning') ||
    confidence === 'low' ||
    confidence === 'insufficient' ||
    (lineage.flags ?? []).some(flag => flag.includes('relaxed') || flag.includes('insufficient'));
  return fallbackEvidence ? 'applied-fallback' : 'applied';
}

const fmt = (value: number | null | undefined, digits = 0): string | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? digits > 0 ? value.toFixed(digits) : Math.round(value).toLocaleString()
    : null;

/** "N exact precedents informed: length · local story norm" (form only). */
function priorsSummary(ctx: PlannerContextResponse): string | null {
  const priors = ctx.solver_brief.precedent_priors;
  const n = priors.selection?.sample_size ?? priors.sample_size;
  if (n == null || n <= 0) return null;
  const exactness = priors.selection
    ? priors.selection.match_mode === 'exact' ? 'exact ' : `${priors.selection.match_mode} `
    : '';
  const use = (priors.selection?.requested_typology ?? ctx.context.typology ?? 'local').replace(/_/g, ' ');
  const parts: string[] = [];
  const depthIsObb =
    priors.depth_semantics === 'whole_building_oriented_bounding_box_not_bar_depth' ||
    priors.bar_depth_source === 'typology_or_program_spec_only';
  const depth = priors.underwrite_target?.depth_ft_p50 ?? priors.depth_ft?.p50;
  const length = priors.underwrite_target?.length_ft_p75 ?? priors.length_ft?.p75;
  const stories = priors.stories?.p50;
  if (!depthIsObb && depth != null) parts.push(`${Math.round(depth)} ft form depth`);
  if (length != null) parts.push(`${Math.round(length)} ft local length`);
  if (stories != null) parts.push(`${Math.round(stories)}-story local form norm`);
  if (parts.length === 0) return `${n} ${exactness}${use} precedents supplied form evidence`;
  return `${n} ${exactness}${use} precedents supplied form evidence: ${parts.join(' · ')}`;
}

const STATE_STYLE: Record<ContextApplicationState, { label: string; cls: string }> = {
  compiling: { label: 'Compiling local context…', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  applied: { label: 'Context applied', cls: 'bg-green-50 text-green-700 border-green-200' },
  'applied-fallback': { label: 'Context applied with fallback evidence', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  'standards-direct': { label: 'District standards applied directly — ordinance resolver, not the compiled brief', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  unavailable: { label: 'Context not verified — no authoritative plan basis', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  blocked: { label: 'Generation blocked by legal or physical constraints', cls: 'bg-red-50 text-red-700 border-red-200' },
  stale: { label: 'Plan is stale — selected use or context has changed', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/** Visible evidence → decision → result lineage next to Plan Basis. */
const ContextLineage: React.FC<{
  state: ContextApplicationState;
  activeContext: PlannerContextResponse | null;
  lineage: PlanLineage | null;
  blockedReason?: string | null;
}> = ({ state, activeContext, lineage, blockedReason }) => {
  const [open, setOpen] = useState(false);
  const style = STATE_STYLE[state];
  const applied = state === 'applied' || state === 'applied-fallback';
  const priors = applied && activeContext ? priorsSummary(activeContext) : null;
  const precedentFit = lineage?.scoreComponents?.precedent_fit;

  const resultParts: string[] = [];
  if (applied && lineage) {
    if (lineage.buildings != null) resultParts.push(`${lineage.buildings} building${lineage.buildings === 1 ? '' : 's'}`);
    if (lineage.floors != null) resultParts.push(`${lineage.floors} stories`);
    if (lineage.footprintSqft != null) resultParts.push(`${fmt(lineage.footprintSqft)} SF footprint`);
  }

  return (
    <div className={`text-xs border rounded px-2.5 py-1.5 ${style.cls}`} data-testid="context-lineage">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{style.label}</span>
          {state === 'blocked' && blockedReason && (
            <span className="ml-1.5 font-normal">{blockedReason}</span>
          )}
          {priors && <div className="mt-0.5 font-normal leading-snug">{priors}</div>}
          {resultParts.length > 0 && (
            <div className="mt-0.5 font-normal leading-snug">
              Generated result: {resultParts.join(' · ')}
              {typeof precedentFit === 'number' && ` · Precedent fit: ${precedentFit.toFixed(3)}`}
              {precedentFit == null && typeof lineage?.scoreTotal === 'number' && ` · Score: ${lineage.scoreTotal}`}
            </div>
          )}
        </div>
        {applied && lineage && (
          <button
            onClick={() => setOpen(value => !value)}
            className="flex items-center gap-0.5 flex-shrink-0 font-medium opacity-70 hover:opacity-100"
            aria-expanded={open}
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Details
          </button>
        )}
      </div>

      {open && applied && lineage && (
        <div className="mt-1.5 pt-1.5 border-t border-current/20 space-y-0.5 font-mono text-[10px] leading-relaxed">
          <div>context_version: {lineage.contextVersion ?? '—'}</div>
          <div>context_hash: {lineage.contextHash ? `${lineage.contextHash.slice(0, 10)}…` : '—'}</div>
          <div>generator_version: {lineage.generatorVersion ?? (lineage.solvedBy === 'worker' ? 'client_worker_fallback' : '—')}</div>
          <div>score_version: {lineage.scoreVersion ?? '—'}</div>
          <div>program_prior_version: {lineage.programPriorVersion ?? '—'}</div>
          <div>
            regrid_precedents: {activeContext?.solver_brief.precedent_priors.selection?.sample_size
              ?? activeContext?.solver_brief.precedent_priors.sample_size ?? '—'}
          </div>
          <div>solved_by: {lineage.solvedBy}</div>
          {(lineage.flags ?? []).length > 0 && (
            <div className="font-sans">
              {(lineage.flags ?? []).map(flag => (
                <div key={flag} title={flag}>· {describeContextFlag(flag)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextLineage;
