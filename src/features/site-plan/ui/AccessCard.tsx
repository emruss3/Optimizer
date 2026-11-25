import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import type { AccessFinding } from '../api/accessFinding';

/**
 * The street-access finding on the plan: the reason it is open, the frontage
 * it concerns (shown on the drawing on request), and what clears it.
 */
const AccessCard: React.FC<{
  finding: AccessFinding;
  highlighted: boolean;
  onHighlight: (on: boolean) => void;
}> = ({ finding, highlighted, onHighlight }) => {
  const [open, setOpen] = useState(false);
  const open_ = finding.state === 'needs_verification';
  return (
    <div
      data-testid="access-card"
      data-access-state={finding.state}
      className={`rounded-md border shadow-sm text-xs max-w-md ${open_ ? 'bg-orange-50 border-orange-300 text-orange-900' : 'bg-white/95 border-gray-200 text-gray-700'}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        {open_ ? <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} data-testid="access-card-toggle" className="font-medium text-left hover:underline">
          {finding.headline}
        </button>
        {finding.frontageLine && (
          <button
            type="button"
            onClick={() => onHighlight(!highlighted)}
            aria-pressed={highlighted}
            data-testid="access-show-frontage"
            className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-current/30 hover:bg-white/60"
          >
            {highlighted ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {highlighted ? 'Hide frontage' : 'Show frontage'}
          </button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-2 space-y-1.5" data-testid="access-card-detail">
          <p>{finding.why}</p>
          {finding.clears.length > 0 && (
            <div>
              <div className="font-semibold">What clears this</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {finding.clears.map(c => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AccessCard;
