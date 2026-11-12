import { describe, it, expect, beforeEach } from 'vitest';
import { listRecent, recordRecent, lastPlan, hasVisited, markVisited } from './recentWork';

describe('recentWork', () => {
  beforeEach(() => localStorage.clear());

  it('lists the newest first, one entry per parcel, and keeps what it knew', () => {
    recordRecent({ ogcFid: 1, address: '1 First St', zoning: 'RM20' });
    recordRecent({ ogcFid: 2, address: '2 Second St' });
    recordRecent({ ogcFid: 1 });
    const list = listRecent();
    expect(list.map(r => r.ogcFid)).toEqual(['1', '2']);
    expect(list[0]).toMatchObject({ address: '1 First St', zoning: 'RM20', planned: false });
  });

  it('resumes the parcel whose plan was opened, not merely the last parcel looked at', () => {
    recordRecent({ ogcFid: 1, address: '1 First St', planned: true });
    recordRecent({ ogcFid: 2, address: '2 Second St' });
    expect(lastPlan()?.ogcFid).toBe('1');
    // looking at the parcel again does not forget that it has a plan
    recordRecent({ ogcFid: 1 });
    expect(listRecent()[0]?.planned).toBe(true);
  });

  it('has no last plan and no visit on a fresh browser, and survives bad storage', () => {
    expect(lastPlan()).toBeNull();
    expect(hasVisited()).toBe(false);
    markVisited();
    expect(hasVisited()).toBe(true);
    localStorage.setItem('pp.recent', '{not json');
    expect(listRecent()).toEqual([]);
  });
});
