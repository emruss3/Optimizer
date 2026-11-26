/**
 * Milestones of one session, for checks and audits (PR 221 audit: "log search exact match, initial
 * shell, context solve outcome, settled generated revision, interactive 3D, requested and effective
 * camera"). Each mark is milliseconds since the page started, with a small detail object. Read from
 * the page as `window.__ppTimeline`; nothing leaves the browser.
 */
export interface TimelineMark { name: string; atMs: number; detail?: Record<string, unknown> }

const MAX = 400;

function store(): TimelineMark[] {
  const w = globalThis as unknown as { __ppTimeline?: TimelineMark[] };
  if (!w.__ppTimeline) w.__ppTimeline = [];
  return w.__ppTimeline;
}

export function mark(name: string, detail?: Record<string, unknown>): void {
  try {
    const list = store();
    list.push({ name, atMs: Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()), ...(detail ? { detail } : {}) });
    if (list.length > MAX) list.splice(0, list.length - MAX);
  } catch { /* timing is never worth an error */ }
}

/** Mark once per key (a plan revision, a camera request) so re-renders do not repeat it. */
const seen = new Set<string>();
export function markOnce(key: string, name: string, detail?: Record<string, unknown>): void {
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > MAX) seen.clear();
  mark(name, detail);
}
