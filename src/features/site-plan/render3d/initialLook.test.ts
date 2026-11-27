import { describe, it, expect, beforeEach } from 'vitest';
import { initialPlanLines } from './RenderView';

describe('one 3D view, the rendering, with the plan lines on request (owner, 11-27)', () => {
  beforeEach(() => { sessionStorage.clear(); });
  it('starts without plan lines and remembers the choice for the session', () => {
    expect(initialPlanLines()).toBe(false);
    sessionStorage.setItem('pp.planLines', '1');
    expect(initialPlanLines()).toBe(true);
  });
});
