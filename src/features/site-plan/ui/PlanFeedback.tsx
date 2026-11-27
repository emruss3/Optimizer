// The site planner's feedback box (owner, 2026-11-27): "Claude should take the feedback into account and update the
// site. It should use that guidance on future sites, not just that specific one. This is the generative feedback loop."
//
// Write what is wrong with the plan. Claude reads it with the plan on screen (and a picture of the view) and the
// settings the engine takes, and answers with what to change; the plan is redrawn with it at once (Undo returns to the
// plan before). The note is stored with how widely it applies: this parcel, plans in its zoning district, this kind
// of housing, or every plan. Each new site's first plan starts from the guidance that reaches it (SiteWorkspace).
import { useCallback, useEffect, useState } from 'react';
import {
  describeChanges, fetchFeedbackContext, fetchFeedbackLevers, feedbackSession, requestPlanFeedback, saveFeedback, setFeedbackScope, setFeedbackStatus,
  type FeedbackChanges, type FeedbackContext, type FeedbackLevers, type FeedbackReading,
} from '../api/planFeedback';

type Scope = FeedbackReading['scope'];

export interface PlanFeedbackProps {
  ogcFid: number | null;
  zoning: string | null;
  product: string;
  generator: string | null;
  revision: string | null;
  view: '2d' | '3d';
  selection: { id: string; label: string | null; type: string } | null;
  /** The plan as the model reads it, built when the note is sent. */
  plan: () => Record<string, unknown>;
  /** A picture of the view, or null. */
  capture: () => string | null;
  /** The engine on screen takes settings from feedback (the by-right subdivision). */
  canApply: boolean;
  /** Redraw this plan with the changes; returns what to go back to. */
  onApply: (changes: FeedbackChanges) => unknown;
  /** Go back to the plan before a change. */
  onRevert: (before: unknown) => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'read'; reading: FeedbackReading; id: string | null; status: string; scope: Scope; before: unknown }
  | { kind: 'error'; message: string };

const statusFor = (scope: Scope): 'kept' | 'applied' => (scope === 'parcel' ? 'kept' : 'applied');

export function PlanFeedback(props: PlanFeedbackProps) {
  const { ogcFid, zoning, product, generator, revision, view, selection, plan, capture, canApply, onApply, onRevert } = props;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [levers, setLevers] = useState<FeedbackLevers | null>(null);
  const [context, setContext] = useState<FeedbackContext | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const scopeWords: Record<Scope, string> = {
    parcel: 'this parcel only',
    district: zoning ? `every ${zoning} site` : 'every site in this zoning district',
    product: product === 'single_family' ? 'every single-family site' : product === 'townhome' ? 'every townhome site' : product === 'multifamily' ? 'every apartment site' : 'this kind of housing',
    all: 'every site',
  };

  // on opening: who is signed in, what the engine accepts, and what has been said before
  useEffect(() => {
    if (!open) return;
    let live = true;
    void (async () => {
      const token = await feedbackSession();
      if (!live) return;
      setSignedIn(!!token);
      if (!token || ogcFid == null) return;
      const [l, c] = await Promise.all([fetchFeedbackLevers(canApply ? product : 'other'), fetchFeedbackContext(ogcFid, zoning, product)]);
      if (!live) return;
      setLevers(l);
      setContext(c);
    })();
    return () => { live = false; };
  }, [open, ogcFid, zoning, product, canApply]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async () => {
    const text = note.trim();
    if (text.length < 3 || ogcFid == null) return;
    setPhase({ kind: 'sending' });
    const lv = levers ?? { product, patterns: [], settings: [] };
    try {
      const reading = await requestPlanFeedback({ note: text, plan: plan(), levers: canApply ? lv : { ...lv, patterns: [], settings: [] }, prior: context ?? {}, image: capture() });
      const id = await saveFeedback({
        note: text, ogc_fid: ogcFid, zoning, product, generator, plan_revision: revision, view, selection,
        reading: { reading: reading.reading, reply: reading.reply, why_not: reading.whyNot, engine_can_change: reading.engineCanChange },
        scope: reading.scope, category: reading.category, lesson: reading.lesson, changes: reading.changes, model: reading.model,
      });
      // Claude's changes take effect at once: the plan is redrawn with them, and the note becomes guidance
      let before: unknown = null, status = 'open';
      if (reading.engineCanChange && canApply && reading.changes) {
        before = onApply(reading.changes);
        status = statusFor(reading.scope);
        if (id) await setFeedbackStatus(id, statusFor(reading.scope), revision);
      }
      setPhase({ kind: 'read', reading, id, status, scope: reading.scope, before });
      setNote('');
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'The note could not be sent.' });
    }
  }, [note, ogcFid, levers, product, plan, canApply, context, capture, zoning, generator, revision, view, selection, onApply]);

  const undo = useCallback(async () => {
    if (phase.kind !== 'read') return;
    onRevert(phase.before);
    if (phase.id) await setFeedbackStatus(phase.id, 'dismissed');
    setPhase({ ...phase, status: 'dismissed' });
  }, [phase, onRevert]);

  const rescope = useCallback(async (scope: Scope) => {
    if (phase.kind !== 'read') return;
    const applied = phase.status === 'kept' || phase.status === 'applied';
    setPhase({ ...phase, scope, status: applied ? statusFor(scope) : phase.status });
    if (!phase.id) return;
    await setFeedbackScope(phase.id, scope);
    if (applied) await setFeedbackStatus(phase.id, statusFor(scope));
  }, [phase]);

  const reading = phase.kind === 'read' ? phase.reading : null;
  const lines = reading && levers ? describeChanges(reading.changes, levers) : [];
  const guidanceHere = context?.guidance?.length ?? 0;
  const repeated = (context?.lessons ?? []).filter(l => l.times > 1).slice(0, 3);
  const changed = phase.kind === 'read' && (phase.status === 'applied' || phase.status === 'kept');

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="plan-feedback"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        title="Tell Claude what to change: it updates this plan and carries the guidance to later sites"
        className={`px-3 py-1.5 rounded-lg border text-sm ${open ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
      >
        Feedback
      </button>
      {open && (
        <div role="dialog" aria-label="Plan feedback" data-testid="plan-feedback-panel" className="absolute right-0 top-10 z-50 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-3 shadow-xl text-sm text-gray-800">
          <div className="flex items-center justify-between mb-2">
            <strong className="text-[13px]">What should change on this plan?</strong>
            <button type="button" className="text-gray-500 hover:text-gray-800" aria-label="Close" onClick={() => setOpen(false)}>×</button>
          </div>
          {signedIn === false ? (
            <p className="text-gray-600" data-testid="plan-feedback-signin">Sign in to send feedback. Notes are kept with your account so they carry into later plans.</p>
          ) : (
            <>
              <p className="text-[11.5px] text-gray-500 mb-1.5">
                Claude reads your note with {selection ? `${selection.label ?? selection.type} selected on ` : ''}this plan and a picture of the {view === '3d' ? '3D view' : 'plan view'},
                then updates the plan. The engine redraws and checks everything it changes.{canApply && guidanceHere > 0 ? ` ${guidanceHere} earlier note${guidanceHere === 1 ? '' : 's'} already guide${guidanceHere === 1 ? 's' : ''} sites like this one.` : ''}
              </p>
              <textarea
                data-testid="plan-feedback-note"
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="e.g. The street serves only two lots on the north side; lots should face the street on both sides."
                className="w-full rounded-lg border border-gray-300 p-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="mt-1.5 flex items-center justify-end">
                <button
                  type="button"
                  data-testid="plan-feedback-send"
                  disabled={note.trim().length < 3 || phase.kind === 'sending' || ogcFid == null}
                  onClick={() => void send()}
                  className="rounded-lg bg-slate-800 px-3 py-1.5 text-white disabled:opacity-40"
                >
                  {phase.kind === 'sending' ? 'Claude is reading…' : 'Update the plan'}
                </button>
              </div>
              {!canApply && !(phase.kind === 'read' && phase.before !== null) && (
                <p className="mt-1.5 text-[11px] text-gray-500">Apartment plans take no settings from feedback yet: the note is recorded for the engine and carried into later notes, and Claude says what would need to change.</p>
              )}
              {phase.kind === 'error' && <p className="mt-2 text-red-700" data-testid="plan-feedback-error">{phase.message}</p>}
              {reading && phase.kind === 'read' && (
                <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-2.5" data-testid="plan-feedback-reading" data-status={phase.status}>
                  <p className="font-medium">{reading.reading}</p>
                  <p className="mt-1.5">{reading.reply}</p>
                  {lines.length > 0 && (
                    <>
                      <p className="mt-1.5 text-[12px] font-medium text-gray-700">{changed ? 'Redrawn with' : phase.status === 'dismissed' ? 'Undone' : 'Proposed'}</p>
                      <ul className="list-disc pl-5 text-[12.5px]" data-testid="plan-feedback-changes">
                        {lines.map(l => <li key={l}>{l}</li>)}
                      </ul>
                    </>
                  )}
                  {!reading.engineCanChange && reading.whyNot && <p className="mt-1.5 text-[12px] text-gray-600">{reading.whyNot}</p>}
                  {phase.status !== 'dismissed' && (
                    <label className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-700">
                      {changed ? 'Use this on' : 'Recorded for'}
                      <select data-testid="plan-feedback-scope" value={phase.scope} onChange={e => void rescope(e.target.value as Scope)} className="rounded border border-gray-300 bg-white px-1 py-0.5">
                        {(['parcel', 'district', 'product', 'all'] as Scope[]).map(s => <option key={s} value={s}>{scopeWords[s]}</option>)}
                      </select>
                    </label>
                  )}
                  {reading.lesson && phase.status !== 'dismissed' && <p className="mt-1 text-[11.5px] text-gray-500">Lesson: {reading.lesson}</p>}
                  {!phase.id && <p className="mt-1 text-[11.5px] text-amber-800">Not saved: the store did not answer, so later sites will not see this note.</p>}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {changed && <button type="button" data-testid="plan-feedback-undo" className="rounded-lg border border-slate-300 bg-white px-2.5 py-1" onClick={() => void undo()}>Undo this change</button>}
                    {changed && (
                      <span className="text-[11.5px] text-emerald-800" data-testid="plan-feedback-carries">
                        {phase.scope === 'parcel' ? 'Later plans of this parcel start from these settings.' : `From now on, ${scopeWords[phase.scope]} starts from these settings when that keeps every home.`}
                      </span>
                    )}
                    {phase.status === 'dismissed' && <span className="text-[12px] text-gray-600">Undone. The note stays on record but guides no other site.</span>}
                  </div>
                </div>
              )}
              {repeated.length > 0 && (
                <div className="mt-3 text-[11.5px] text-gray-600" data-testid="plan-feedback-repeated">
                  <p className="font-medium text-gray-700">Raised more than once</p>
                  <ul className="list-disc pl-5">
                    {repeated.map(l => <li key={`${l.scope}|${l.lesson}`}>{l.lesson} ({l.times} times, {l.parcels} parcel{l.parcels === 1 ? '' : 's'})</li>)}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default PlanFeedback;
