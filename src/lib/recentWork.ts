import { useEffect, useState } from 'react';
// What this browser has worked on, so a returning user can pick up where they
// left off. Kept in this browser only: a parcel id, its address and zoning,
// when it was last opened and whether the planner was opened on it.
export interface RecentParcel {
  ogcFid: string;
  address: string;
  zoning: string | null;
  /** The site planner was opened on this parcel. */
  planned: boolean;
  at: number;
}

const RECENT_KEY = 'pp.recent';
const RECENT_EVENT = 'pp:recent-changed';
const VISITED_KEY = 'pp.visited';
const MAX = 8;

export function listRecent(): RecentParcel[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is RecentParcel => !!r && typeof r === 'object' && typeof (r as RecentParcel).ogcFid === 'string' && typeof (r as RecentParcel).address === 'string')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function recordRecent(entry: { ogcFid: string | number; address?: string | null; zoning?: string | null; planned?: boolean }): void {
  try {
    const ogcFid = String(entry.ogcFid);
    const before = listRecent();
    const prior = before.find(r => r.ogcFid === ogcFid);
    const next: RecentParcel = {
      ogcFid,
      address: entry.address || prior?.address || `Parcel ${ogcFid}`,
      zoning: entry.zoning ?? prior?.zoning ?? null,
      planned: !!entry.planned || !!prior?.planned,
      at: Date.now(),
    };
    localStorage.setItem(RECENT_KEY, JSON.stringify([next, ...before.filter(r => r.ogcFid !== ogcFid)].slice(0, MAX)));
    window.dispatchEvent(new Event(RECENT_EVENT));
  } catch {
    // storage is unavailable: nothing to remember
  }
}

/** The parcel whose plan was open most recently. */
export function lastPlan(): RecentParcel | null {
  return listRecent().find(r => r.planned) ?? null;
}

export function hasVisited(): boolean {
  try { return localStorage.getItem(VISITED_KEY) === '1'; } catch { return false; }
}

export function markVisited(): void {
  try { localStorage.setItem(VISITED_KEY, '1'); } catch { /* nothing to remember */ }
}

/** The recent list, kept current: it changes when a parcel is opened here or in another tab. */
export function useRecent(): RecentParcel[] {
  const [list, setList] = useState<RecentParcel[]>(() => listRecent());
  useEffect(() => {
    const refresh = () => setList(listRecent());
    window.addEventListener(RECENT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(RECENT_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  return list;
}
