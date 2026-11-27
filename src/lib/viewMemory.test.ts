import { describe, it, expect, beforeEach } from 'vitest';
import { centerOf, forgetViews, panFor, recall2D, recall3D, remember2D, remember3D } from './viewMemory';

describe('where the user left each view (navigation audit 11-27)', () => {
  beforeEach(() => forgetViews());

  it('keeps the 2D world centre and zoom, so a canvas of another size centres on the same place', () => {
    const vp = { zoom: 7.36, panX: -1234, panY: 5678 };
    const c = centerOf(vp, 1000, 600);
    remember2D('675423', { ...c, zoom: vp.zoom, userMoved: true });
    const back = recall2D('675423')!;
    // same size: the same viewport
    const same = panFor(back, 1000, 600);
    expect(same.panX).toBeCloseTo(vp.panX, 6);
    expect(same.panY).toBeCloseTo(vp.panY, 6);
    // a narrower canvas (a panel opened): the same world point stays at the centre
    const narrower = panFor(back, 700, 600);
    const centre = centerOf(narrower, 700, 600);
    expect(centre.centerX).toBeCloseTo(c.centerX, 6);
    expect(centre.centerY).toBeCloseTo(c.centerY, 6);
    expect(back.userMoved).toBe(true);
  });

  it('keeps the 3D camera per parcel, and forgets the oldest past its bound', () => {
    remember3D('469303', { revision: 'r1', review: false, position: [1, 2, 3], target: [0, 0, 0], fov: 30, shot: 'custom', basis: 'Custom view · from Top · moved by hand' });
    expect(recall3D('469303')?.basis).toContain('Custom view');
    for (let i = 0; i < 30; i++) remember3D(`p${i}`, { revision: 'r', review: true, position: [0, 0, 0], target: [0, 0, 0], fov: 30 });
    expect(recall3D('469303')).toBeNull();
    expect(recall3D('p29')).not.toBeNull();
  });
});
