import { describe, it, expect } from 'vitest';
import { safeInsets } from './safeInsets';

const canvas = { left: 0, top: 0, right: 1000, bottom: 600 };

describe('the part of the canvas a fit can use (navigation audit 11-27)', () => {
  it('charges a corner button stack to one side, and a top bar to the top', () => {
    const zoomCluster = { left: 950, top: 300, right: 990, bottom: 590 }; // bottom-right stack
    const actionsBar = { left: 10, top: 8, right: 600, bottom: 56 };
    const ins = safeInsets(canvas, [zoomCluster, actionsBar]);
    expect(ins.right).toBe(50);
    expect(ins.bottom).toBe(0);
    expect(ins.top).toBe(56);
  });

  it('ignores what is not over the canvas, a whole-canvas sheet, and floating panels', () => {
    expect(safeInsets(canvas, [{ left: 1100, top: 0, right: 1200, bottom: 50 }])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(safeInsets(canvas, [{ left: 0, top: 0, right: 1000, bottom: 600 }])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(safeInsets(canvas, [{ left: 400, top: 250, right: 600, bottom: 350 }])).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('never gives up more than 30% of the canvas to one edge', () => {
    expect(safeInsets(canvas, [{ left: 0, top: 0, right: 600, bottom: 300 }]).top).toBe(180);
  });
});
