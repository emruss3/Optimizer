import React from 'react';
import type { FeasibilityViolation } from '../../../engine/types';
import { describeContextFlag } from '../api/plannerContext';

const SEVERITY_STYLE: Record<string, string> = {
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-slate-50 border-slate-200 text-slate-600',
};

/**
 * The docked Flags tab: every reason the current plan is constrained or
 * refused, in one place — solver violations, the generator's own clamp flags
 * (each explained via the context contract's flag descriptions, which cite
 * the governing constraint), and candidates the zero-overlap gate rejected.
 * An empty state is a statement, not an absence: the plan is clean.
 */
const FlagsPanel: React.FC<{
  violations: FeasibilityViolation[];
  /** Clamp/derivation flags reported by the generator for THIS plan */
  lineageFlags: string[];
  rejected?: { count: number; reasons: string[] } | null;
}> = ({ violations, lineageFlags, rejected }) => {
  const empty = violations.length === 0 && lineageFlags.length === 0 && !rejected;
  if (empty) {
    return (
      <div className="p-4 text-sm text-gray-500">
        No active flags — the plan satisfies every compiled constraint it was checked against.
      </div>
    );
  }
  return (
    <div className="p-3 space-y-2">
      {violations.map((v, i) => (
        <div
          key={`v-${i}`}
          className={`border rounded px-2.5 py-1.5 text-xs ${SEVERITY_STYLE[v.severity] ?? SEVERITY_STYLE.info}`}
        >
          <span className="font-mono font-semibold uppercase tracking-wide mr-2">{v.code}</span>
          {v.message}
        </div>
      ))}
      {lineageFlags.map(flag => (
        <div key={`f-${flag}`} className="border border-slate-200 bg-slate-50 rounded px-2.5 py-1.5 text-xs text-slate-700">
          <span className="font-mono font-semibold uppercase tracking-wide mr-2 text-slate-500">{flag}</span>
          {describeContextFlag(flag)}
        </div>
      ))}
      {rejected && rejected.count > 0 && (
        <div className="border border-red-200 bg-red-50 rounded px-2.5 py-1.5 text-xs text-red-800">
          <span className="font-semibold mr-1">
            {rejected.count} candidate{rejected.count === 1 ? '' : 's'} rejected by the zero-overlap gate
          </span>
          — {rejected.reasons.join('; ')}. Rejected candidates never rendered.
        </div>
      )}
    </div>
  );
};

export default FlagsPanel;
