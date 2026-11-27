import { describe, it, expect, beforeEach } from 'vitest';
import { clearRecovery, loadRecovery, openOnNextLoad, saveRecovery, takeOpenOnLoad } from './planRecovery';

describe('a copy of the plan kept across a move to a new release', () => {
  beforeEach(() => localStorage.clear());

  it('keeps the plan for its parcel only, and only for a day', () => {
    expect(saveRecovery({ ogcFid: '675423', address: '0 Delk Ave', elements: [{ id: 'sfv1-pad-1' }], metrics: { totalUnits: 5 }, assignments: [{ designId: 'abhp:1754-00010' }], revision: 'abc12345', release: '/assets/index-OLD.js' })).toBe(true);
    const copy = loadRecovery('675423');
    expect(copy?.elements).toEqual([{ id: 'sfv1-pad-1' }]);
    expect(copy?.assignments).toEqual([{ designId: 'abhp:1754-00010' }]);
    expect(loadRecovery('469303')).toBeNull();
    expect(loadRecovery('675423', localStorage, Date.now() + 25 * 3600 * 1000)).toBeNull();
    // an expired copy is dropped
    expect(loadRecovery('675423')).toBeNull();
  });

  it('is dropped once restored or discarded', () => {
    saveRecovery({ ogcFid: '1', address: null, elements: [], metrics: null, assignments: [], revision: null, release: null });
    clearRecovery();
    expect(loadRecovery('1')).toBeNull();
  });

  it('opens the parcel once on the next load', () => {
    openOnNextLoad(675423);
    expect(takeOpenOnLoad()).toBe('675423');
    expect(takeOpenOnLoad()).toBeNull();
  });
});
