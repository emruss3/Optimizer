import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  describeContextFlag,
  planUsedActiveContext,
  CONTEXT_VERSION_V2,
  type PlannerContextResponse,
} from '../api/plannerContext';

/**
 * What the LAST generated plan reported about its own basis. Captured from
 * the generator response (server) or stamped by the workspace (worker
 * fallback) — never inferred from the active context, so the "Context
 * applied" claim below stays honest.
 */
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
  /** Generated-result summary (from the plan's own metrics) */
  buildings?: number | null;
  floors?: number | null;
  footprintSqft?: number | null;
  /** True when the worker solve actually carried the active context's brief */
  workerUsedActiveContext?: boolean;
}

export type ContextApplicationState =
  | 'compiling'
  | 'applied'
  | 'applied-fallback'
  | 'unavailable'
  | 'blocked'
  | 'stale';

/**
 * Decide the honest state for the "Context applied to this plan" strip.
 * "Applied" is only claimed when the plan's own lineage matches the ACTIVE
 * snapshot — a plan generated without (or with another) context must say so.
 */
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

  // Applied — but did the evidence itself fall back? Relaxed Regrid selection
  // or an insufficient sample is still context, just weaker context.
  const sel = activeContext.solver_brief.precedent_priors.selection;
  const conf = sel?.confidence ?? activeContext.solver_brief.precedent_priors.confidence;
  const fallbackEvidence =
    (sel && sel.mode !== 'exact_same_zoning') ||
    conf === 'low' ||
    conf === 'insufficient' ||
    (lineage.flags ?? []).some(f => f.includes('relaxed') || f.includes('insufficient'));
  return fallbackEvidence ? 'applied-fallback' : 'applied';
}

const fmt = (v: number | null | undefined, digits = 0): string | null =>
  typeof v === 'number' && Number.isFinite(v)
    ? digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString()
    : null;

/** "N exact multifamily precedents informed: depth · length · stories" */
function priorsSummary(ctx: PlannerContextResponse): string | null {
  const pri = ctx.solver_brief.precedent_priors;
  const n = pri.selection?.sample_size ?? pri.sample_size;
  if (n == null || n <= 0) return null;
  const exactness = pri.selection
    ? pri.selection.match_mode === 'exact' ? 'exact ' : `${pri.selection.match_mode} `
    : '';
  const use = (pri.selection?.requested_typology ?? ctx.context.typology ?? 'local').replace(/_/g, ' ');
  const parts: string[] = [];
  const depth = pri.underwrite_target?.depth_ft_p50 ?? pri.depth_ft?.p50;
  const length = pri.underwrite_target?.length_ft_p75 ?? pri.length_ft?.p75;
  const stories = pri.stories?.p50;
  if (depth != null) parts.push(`${Math.round(depth)} ft target depth`);
  if (length != null) parts.push(`${Math.round(length)} ft target length`);
  if (stories != null) parts.push(`${Math.round(stories)}-story prior`);
  if (parts.length === 0) return `${n} ${exactness}${use} precedents informed this plan`;
  return `${n} ${exactness}${use} precedents informed: ${parts.join(' · ')}`;
}

const STATE_STYLE: Record<ContextApplicationState, { label: string; cls: string }> = {
  compiling: { label: 'Compiling local context…', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  applied: { label: 'Context applied', cls: 'bg-green-50 text-green-700 border-green-200' },
  'applied-fallback': { label: 'Context applied with fallback evidence', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  unavailable: { label: 'Context unavailable — using standard defaults', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  blocked: { label: 'Generation blocked by legal or physical constraints', cls: 'bg-red-50 text-red-700 border-red-200' },
  stale: { label: 'Plan is stale — selected use or context has changed', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
};

/**
 * "Context applied to this plan" — the decision-explanation strip next to
 * Plan Basis. Says which local evidence informed the plan, what came out,
 * and (in details) the full context/generator lineage. Local evidence,
 * program evidence, legal constraints, and user priorities — compiled into a
 * versioned planning basis, not "AI magic".
 */
const ContextLineage: React.FC<{
  state: ContextApplicationState;
  activeContext: PlannerContextResponse | null;
  lineage: PlanLineage | null;
  /** Extra sentence for the blocked state (which use, why) */
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
            onClick={() => setOpen(v => !v)}
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
              {(lineage.flags ?? []).map(f => (
                <div key={f} title={f}>· {describeContextFlag(f)}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContextLineage;
