import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export type BasisTone = 'ok' | 'warn' | 'bad' | 'neutral';

const DOT: Record<BasisTone, string> = {
  ok: 'bg-green-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-gray-400',
};

/**
 * One row above the canvas instead of four stacked cards (Eric, 2622 W
 * Heiman, 2026-09-04: "the actual UX/UI of the page makes it difficult to see
 * the site planner, there is a ton of data"). The row says what the plan is
 * based on and how it stands against the upper bound; the receipts — the full
 * basis line, the context lineage, the highest-and-best comparator, the
 * buildout ladder — open on demand. A state that needs the user (blocked,
 * stale) opens the row itself.
 */
export const PlanBasisDisclosure: React.FC<{
  /** short segments, joined with ' · ' after "Plan basis" */
  summary: string[];
  tone?: BasisTone;
  defaultOpen?: boolean;
  /** open the row whenever this turns true (blocked / stale) */
  forceOpen?: boolean;
  children: React.ReactNode;
}> = ({ summary, tone = 'neutral', defaultOpen = false, forceOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div className="px-4 py-1 bg-white border-b border-gray-100 flex-shrink-0" data-testid="plan-basis-disclosure">
      <button
        type="button"
        data-testid="plan-basis-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 text-left text-xs text-gray-600 hover:text-gray-900"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${DOT[tone]}`} />
        <span className="truncate">
          <span className="font-medium text-gray-700">Plan basis</span>
          {summary.length > 0 && <span> · {summary.join(' · ')}</span>}
        </span>
        <span className="ml-auto flex-shrink-0 text-[11px] text-gray-400">{open ? 'hide' : 'details'}</span>
      </button>
      {open && <div className="pt-1.5 pb-1 space-y-2">{children}</div>}
    </div>
  );
};

export default PlanBasisDisclosure;
