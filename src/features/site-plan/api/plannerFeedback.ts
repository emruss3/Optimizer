/**
 * Planner feedback events (fn_record_planner_feedback) — the clean preference
 * stream a learned ranker will eventually train on.
 *
 * Rules from the contract:
 *  - AUTHENTICATED sessions only (the RPC is revoked for anon); we check for
 *    a Supabase user first and silently no-op without one.
 *  - Idempotent via a stable client_event_id (retries never duplicate).
 *  - Payloads are deltas + ids, not full geometry dumps.
 *  - Never blocks or breaks an interaction: every failure is swallowed.
 */
import { supabase } from '../../../lib/supabase';

export type PlannerFeedbackEvent =
  | 'context_loaded'
  | 'candidate_generated'
  | 'candidate_viewed'
  | 'candidate_selected'
  | 'candidate_saved'
  | 'candidate_exported'
  | 'candidate_rejected'
  | 'building_moved'
  | 'building_resized'
  | 'building_rotated'
  | 'building_deleted'
  | 'parameter_changed';

let authKnownAbsent = false;
let authListenerArmed = false;

/** The absent-auth cache must not outlive a sign-in: the user starting
 *  anonymous and authenticating mid-session via the AuthChip is the NORMAL
 *  first-run path, and a latched cache silently dropped every event for the
 *  rest of the session (feedback_events stayed at zero). One listener,
 *  armed lazily on first use. */
function armAuthListener(): void {
  if (authListenerArmed || !supabase) return;
  authListenerArmed = true;
  try {
    supabase.auth.onAuthStateChange((_event: string, session: { user?: unknown } | null) => {
      if (session?.user) authKnownAbsent = false;
    });
  } catch {
    // Listener is an optimization; recordPlannerFeedback still re-checks
    // getUser() whenever the cache is clear.
  }
}

export async function recordPlannerFeedback(
  contextId: string | null | undefined,
  eventType: PlannerFeedbackEvent,
  candidateId?: string | null,
  payload: Record<string, unknown> = {},
  clientEventId?: string
): Promise<void> {
  try {
    if (!supabase || !contextId) return;
    armAuthListener();
    if (authKnownAbsent) return;
    const { data } = await supabase.auth.getUser();
    if (!data?.user) {
      // Anonymous session: the RPC would 401 — stay silent, remember cheaply.
      authKnownAbsent = true;
      return;
    }
    const eventId =
      clientEventId ??
      (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
    await supabase.rpc('fn_record_planner_feedback', {
      p_context_id: contextId,
      p_event_type: eventType,
      p_candidate_id: candidateId ?? null,
      p_payload: payload,
      ...(eventId ? { p_client_event_id: eventId } : {}),
    });
  } catch {
    // Feedback must never affect the interaction.
  }
}

/** Test hook. */
export function __resetPlannerFeedbackAuthCache(): void {
  authKnownAbsent = false;
}
