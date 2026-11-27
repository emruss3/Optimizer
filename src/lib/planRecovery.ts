// A copy of the open plan kept in this browser before the tab moves to a newer release (audit
// cf4f0e8, R3). Kept only here, only for one parcel, and only for a day: it is a way back to
// unsaved work across a reload, not a save. The planner offers it when that parcel opens again,
// and it is dropped once restored or discarded.
const KEY = 'pp.recovery';
const OPEN_KEY = 'pp.recovery-open';
const MAX_AGE_MS = 24 * 3600 * 1000;

export interface PlanRecovery<E = unknown, M = unknown, A = unknown> {
  ogcFid: string;
  address: string | null;
  /** The plan's elements and metrics as they stood. */
  elements: E[];
  metrics: M | null;
  /** The home choices remembered for re-solves. */
  assignments: A[];
  /** The plan revision the copy was taken from, and the release it ran on. */
  revision: string | null;
  release: string | null;
  at: number;
}

export function saveRecovery<E, M, A>(copy: Omit<PlanRecovery<E, M, A>, 'at'>, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(KEY, JSON.stringify({ ...copy, at: Date.now() }));
    return true;
  } catch {
    // too big for storage, or storage blocked: the caller says the copy could not be kept
    return false;
  }
}

/** The kept copy for this parcel, if there is one from the last day. */
export function loadRecovery<E = unknown, M = unknown, A = unknown>(ogcFid: string | number, storage: Storage = localStorage, now = Date.now()): PlanRecovery<E, M, A> | null {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as PlanRecovery<E, M, A> | null;
    if (!raw || typeof raw !== 'object' || raw.ogcFid !== String(ogcFid) || !Array.isArray(raw.elements)) return null;
    if (!(now - raw.at < MAX_AGE_MS)) { storage.removeItem(KEY); return null; }
    return raw;
  } catch {
    return null;
  }
}

export function clearRecovery(storage: Storage = localStorage): void {
  try { storage.removeItem(KEY); } catch { /* nothing kept */ }
}

/** Open this parcel's plan straight away on the next load (the tab is moving to the new release). */
export function openOnNextLoad(ogcFid: string | number, storage: Storage = localStorage): void {
  try { storage.setItem(OPEN_KEY, String(ogcFid)); } catch { /* the start page offers Resume last plan */ }
}

/** The parcel to open on this load, read once. */
export function takeOpenOnLoad(storage: Storage = localStorage): string | null {
  try {
    const v = storage.getItem(OPEN_KEY);
    storage.removeItem(OPEN_KEY);
    return v;
  } catch {
    return null;
  }
}
