import React, { useState } from 'react';
import { RefreshCw, CopyPlus, Save, Lock, Unlock, X, Check } from 'lucide-react';

/** The engine's own figures for a plan, kept to say what a change did. */
export interface PlanSummary {
  units: number | null;
  stalls: number | null;
  gsf: number | null;
  buildings: number;
  locked: number;
}

export interface PlanChange {
  /** What the user did: "Recalculated", "New option", "Undo". */
  action: string;
  before: PlanSummary;
  after: PlanSummary;
}

const delta = (label: string, a: number | null, b: number | null, unit = ''): string | null => {
  if (a == null || b == null) return null;
  if (a === b) return null;
  const d = b - a;
  return `${label} ${Math.round(a).toLocaleString()} → ${Math.round(b).toLocaleString()}${unit} (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d)).toLocaleString()})`;
};

/** What changed, in the engine's figures. "Nothing changed" is an answer too. */
export function describeChange(c: PlanChange): string[] {
  const parts = [
    delta('Units', c.before.units, c.after.units),
    delta('Stalls', c.before.stalls, c.after.stalls),
    delta('Building area', c.before.gsf, c.after.gsf, ' GSF'),
    delta('Buildings', c.before.buildings, c.after.buildings),
  ].filter((p): p is string => p != null);
  if (parts.length === 0) parts.push('Units, stalls and building area are unchanged');
  if (c.after.locked > 0) parts.push(`${c.after.locked} locked building${c.after.locked === 1 ? '' : 's'} kept in place`);
  return parts;
}

/**
 * The three things a user does to a plan, kept apart: run the same design
 * again, ask for a different one, and keep this one. With them: what is
 * locked, what the planner is free to move, and what the last action changed.
 */
const PlanActions: React.FC<{
  busy: boolean;
  onRecalculate: () => void;
  onAnotherOption: () => void;
  onSaveVersion: () => void;
  /** The name of the saved option on the sheet; null when the sheet is not a saved option. */
  savedAs: string | null;
  /** Set after Save version: the name it was saved under. */
  justSaved: string | null;
  /** Set when Save version did not go through: the reason. */
  saveFailed?: string | null;
  /** A way to sign in, shown beside a save that failed for want of an account. The plan stays on the sheet. */
  signIn?: React.ReactNode;
  locked: number;
  free: number;
  onUnlockAll: () => void;
  change: PlanChange | null;
  onDismissChange: () => void;
}> = ({ busy, onRecalculate, onAnotherOption, onSaveVersion, savedAs, justSaved, saveFailed, signIn, locked, free, onUnlockAll, change, onDismissChange }) => {
  const [locksOpen, setLocksOpen] = useState(false);
  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-col items-start gap-1.5" data-testid="plan-actions">
      <div className="flex flex-wrap items-center gap-1.5 bg-white/95 border border-gray-200 rounded-lg shadow-sm p-1 max-w-full">
        <button
          type="button" onClick={onRecalculate} disabled={busy} data-testid="plan-recalculate"
          title="Run this design again: same option, same locked buildings. Nothing new is added to the saved options."
          className={`${btn} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
          Recalculate<span className="hidden sm:inline">&nbsp;this design</span>
        </button>
        <button
          type="button" onClick={onAnotherOption} disabled={busy} data-testid="plan-another-option"
          title="Ask the planner for a different layout. Locked buildings stay where they are. The result is saved as a new option; this one stays in Schemes."
          className={`${btn} border-blue-600 bg-blue-600 text-white hover:bg-blue-700`}
        >
          <CopyPlus className="w-3.5 h-3.5" />
          <span className="sm:hidden">New option</span><span className="hidden sm:inline">Create another option</span>
        </button>
        <button
          type="button" onClick={onSaveVersion} disabled={busy} data-testid="plan-save-version"
          title="Keep the plan on the sheet as a named version you can reopen."
          className={`${btn} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`}
        >
          <Save className="w-3.5 h-3.5" />
          Save<span className="hidden sm:inline">&nbsp;version</span>
        </button>
        <span className="px-1.5 text-[11px] text-gray-500" data-testid="plan-saved-state">
          {saveFailed ? <span className="inline-flex items-center gap-2 text-red-700" role="alert"><span>Not saved. {saveFailed}</span>{signIn && <span className="text-gray-700" data-testid="plan-sign-in">{signIn}</span>}</span> : justSaved ? <span className="inline-flex items-center gap-1 text-green-700"><Check className="w-3 h-3" />Saved as {justSaved}</span> : <span className="hidden md:inline">{savedAs ? `On the sheet: ${savedAs}` : 'Not a saved option'}</span>}
        </span>
        <button
          type="button" onClick={() => setLocksOpen(o => !o)} aria-expanded={locksOpen} data-testid="plan-locks"
          className={`${btn} ${locked > 0 ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'} hover:bg-blue-100`}
        >
          <Lock className="w-3.5 h-3.5" />
          {locked} locked · {free} free
        </button>
      </div>
      {locksOpen && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs text-gray-700 max-w-sm space-y-1.5" data-testid="plan-locks-detail">
          <p>
            <span className="font-semibold">Locked: {locked} building{locked === 1 ? '' : 's'}.</span>{' '}
            {locked > 0
              ? 'These are the buildings you placed or moved. They are drawn in the darker blue. The planner keeps them exactly where they are.'
              : 'Drag a building to place it. It locks where you drop it, and the planner works around it.'}
          </p>
          <p>
            <span className="font-semibold">Free: {free} building{free === 1 ? '' : 's'}, plus parking, drives and open space.</span>{' '}
            Recalculate and Create another option may move any of these.
          </p>
          {locked > 0 && (
            <button type="button" onClick={() => { setLocksOpen(false); onUnlockAll(); }} disabled={busy} data-testid="plan-unlock-all" className={`${btn} border-gray-200 bg-white text-gray-800 hover:bg-gray-50`}>
              <Unlock className="w-3.5 h-3.5" />
              Unlock all (saves a new option)
            </button>
          )}
        </div>
      )}
      {change && (
        <div className="flex items-start gap-2 bg-slate-900/90 text-white rounded-lg px-3 py-1.5 text-xs max-w-xl" data-testid="plan-change" role="status">
          <span className="font-semibold whitespace-nowrap">{change.action}</span>
          <span>{describeChange(change).join(' · ')}</span>
          <button type="button" onClick={onDismissChange} aria-label="Dismiss" className="ml-1 text-white/70 hover:text-white"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
    </div>
  );
};

export default PlanActions;
