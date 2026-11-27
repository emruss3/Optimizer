import { describe, it, expect, beforeEach } from 'vitest';
import { initialLook, RENDERING_DEFAULT } from './RenderView';

describe('the look 3D opens on (handoff 11-27)', () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
  it('uses Rendering for geometry-backed homes, otherwise Review, unless explicitly overridden', () => {
    expect(RENDERING_DEFAULT).toBe(false);
    expect(initialLook()).toBe('review');
    expect(initialLook(true)).toBe('rendering');
    localStorage.setItem('pp.lookDefault', 'rendering');
    expect(initialLook()).toBe('rendering');
    sessionStorage.setItem('pp.look', 'review');
    expect(initialLook(true)).toBe('review');
  });
});
