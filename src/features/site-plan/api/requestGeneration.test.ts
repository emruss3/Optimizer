import { describe, it, expect } from 'vitest';
import { createRequestGeneration } from './requestGeneration';

describe('which plan request is the latest', () => {
  it('a late answer from A cannot replace B', () => {
    const g = createRequestGeneration();
    const a = g.begin(660125);
    const b = g.begin(660125);
    expect(g.isCurrent(a, 660125)).toBe(false);
    expect(g.isCurrent(b, 660125)).toBe(true);
  });

  it('an answer for another parcel is dropped, even if nothing was asked since', () => {
    const g = createRequestGeneration();
    const a = g.begin(675671);
    expect(g.isCurrent(a, 665979)).toBe(false);
  });

  it('a parcel change makes every outstanding request stale', () => {
    const g = createRequestGeneration();
    const a = g.begin(675671);
    g.invalidate();
    expect(g.isCurrent(a, 675671)).toBe(false);
    expect(g.isCurrent(g.begin(675671), 675671)).toBe(true);
  });
});
