// "How to organize this site" — the plan-pattern layer made visible. The
// pattern and its principles come from fn_plan_pattern; the exemplars are the
// real plans in site_plan_exemplar; the alignment chip is the honesty:
// green when our generator draws this pattern, amber when it does not yet.
import React from 'react';
import { patternLabel, type PlanPattern } from '../api/planPattern';

export const PlanPatternPanel: React.FC<{ plan: PlanPattern }> = ({ plan }) => {
  const align = plan.generator_alignment;
  const aligned = align?.aligned === true;
  return (
    <div data-testid="plan-pattern-panel" className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-500">How to organize this site</div>
          <div data-testid="plan-pattern-name" className="text-sm font-semibold text-gray-900 mt-0.5">
            {patternLabel(plan.pattern)}
          </div>
        </div>
        <span
          data-testid="plan-pattern-alignment"
          title={align?.note ?? ''}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
            aligned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {aligned ? 'generator follows this' : 'generator: not yet'}
        </span>
      </div>
      {plan.principles && plan.principles.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-gray-700 list-disc pl-4">
          {plan.principles.map(p => <li key={p}>{p}</li>)}
        </ul>
      )}
      {!aligned && align?.note && (
        <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {align.note}
        </div>
      )}
      {plan.alternates && plan.alternates.length > 0 && (
        <div className="mt-2 text-[11px] text-gray-500">
          Alternate: {plan.alternates.map(patternLabel).join(' · ')}
        </div>
      )}
      {plan.exemplars && plan.exemplars.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">Precedent plans</div>
          <ul className="mt-0.5 space-y-0.5 text-[11px] text-gray-700">
            {plan.exemplars.map(e => (
              <li key={e.name} title={e.source}>
                <span className="font-medium">{e.name}</span>
                {e.pattern !== plan.pattern ? ` · ${patternLabel(e.pattern)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
