import { describe, it, expect, beforeEach } from 'vitest';
import { initialLook, RENDERING_DEFAULT } from './RenderView';

describe('the look 3D opens on (handoff 11-27)', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  it('keeps Review until the Rendering gates pass, and remembers an explicit choice for the session', () => {
    expect(RENDERING_DEFAULT).toBe(false);
    expect(initialLook()).toBe('review');
    localStorage.setItem('pp.lookDefault', 'rendering');
    expect(initialLook()).toBe('rendering');
    sessionStorage.setItem('pp.look', 'review');
    expect(initialLook()).toBe('review');
  });
});
