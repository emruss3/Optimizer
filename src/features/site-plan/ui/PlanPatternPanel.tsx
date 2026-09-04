// "How to organize this site" — the plan-pattern layer made visible. The
// pattern and its principles come from fn_plan_pattern; the exemplars are the
// real plans in site_plan_exemplar; the alignment chip is the honesty:
// green when our generator draws this pattern, amber when it does not yet.
//
// Collapsed to one line by default (Eric, 2026-09-04: "We don't need this
// detail taking up space"): the pattern's name and the chip. "details" opens
// the principles, the alternates, the calibration and the precedent plans.
import React, { useState } from 'react';
import { patternLabel, type PlanPattern } from '../api/planPattern';

export const PlanPatternPanel: React.FC<{ plan: PlanPattern; defaultOpen?: boolean }> = ({ plan, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const align = plan.generator_alignment;
  const aligned = align?.aligned === true;
  return (
    <div data-testid="plan-pattern-panel" className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide text-gray-500">How to organize this site</div>
          <div data-testid="plan-pattern-name" className="text-sm font-semibold text-gray-900 leading-snug">
            {patternLabel(plan.pattern)}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 pt-3">
          <span
            data-testid="plan-pattern-alignment"
            title={align?.note ?? ''}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
              aligned ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {aligned ? 'generator follows this' : 'generator: not yet'}
          </span>
          <button
            type="button"
            data-testid="plan-pattern-toggle"
            aria-expanded={open}
            onClick={() => setOpen(v => !v)}
            className="text-[11px] text-gray-500 underline decoration-dotted hover:text-gray-700"
          >
            {open ? 'hide' : 'details'}
          </button>
        </div>
      </div>
      {open && (
        <div data-testid="plan-pattern-details">
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
          {plan.calibration && plan.calibration.n > 0 && (
            <div className="mt-2" data-testid="plan-pattern-calibration">
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Calibration · parcels like this one</div>
              <div className="mt-0.5 text-[11px] text-gray-700">
                {plan.calibration.n} parcels
                {plan.calibration.band?.zoning ? ` zoned ${plan.calibration.band.zoning}` : ''}
                {plan.calibration.band?.acres_lo != null && plan.calibration.band?.acres_hi != null
                  ? `, ${plan.calibration.band.acres_lo}–${plan.calibration.band.acres_hi} ac` : ''}
                {plan.calibration.median_du_ac != null
                  ? ` · median ${plan.calibration.median_du_ac} lots/ac` +
                    (plan.calibration.p25_du_ac != null && plan.calibration.p75_du_ac != null
                      ? ` (${plan.calibration.p25_du_ac}–${plan.calibration.p75_du_ac})` : '')
                  : ''}
                {plan.calibration.median_pct_row != null ? ` · ROW ${plan.calibration.median_pct_row}%` : ''}
                {plan.calibration.median_pct_lots != null ? ` · lots ${plan.calibration.median_pct_lots}%` : ''}
                {plan.calibration.median_pct_hazard != null ? ` · held out ${plan.calibration.median_pct_hazard}%` : ''}
                {plan.calibration.refused_pct != null ? ` · ${plan.calibration.refused_pct}% refused` : ''}
              </div>
              {plan.calibration.basis && (
                <div className="text-[10px] text-gray-500" title={plan.calibration.generator_version ?? ''}>{plan.calibration.basis}</div>
              )}
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
      )}
    </div>
  );
};
