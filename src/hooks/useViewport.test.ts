import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewport } from './useViewport';

// Screen transform used by the planner canvas:
//   screenX = worldX * zoom + panX
//   screenY = panY - worldY * zoom   (world Y is flipped)
const toScreen = (
  v: { zoom: number; panX: number; panY: number },
  wx: number,
  wy: number
) => ({ x: wx * v.zoom + v.panX, y: v.panY - wy * v.zoom });

// A parcel-sized bounds at real EPSG:3857 magnitudes (Nashville-ish).
// Zooming unanchored at these magnitudes slides content ~10^6 px off-screen —
// exactly the "press + and the plan vanishes" bug.
const BOUNDS = { minX: -9_662_000, minY: 4_320_000, maxX: -9_661_800, maxY: 4_320_100 };

describe('useViewport', () => {
  it('fitToBounds centres the bounds in the canvas', () => {
    const { result } = renderHook(() => useViewport());
    act(() => result.current.fitToBounds(BOUNDS, 1000, 800));

    const centerWorld = {
      x: (BOUNDS.minX + BOUNDS.maxX) / 2,
      y: (BOUNDS.minY + BOUNDS.maxY) / 2,
    };
    const screen = toScreen(result.current.viewport, centerWorld.x, centerWorld.y);
    expect(screen.x).toBeCloseTo(500, 6);
    expect(screen.y).toBeCloseTo(400, 6);
  });

  it('anchored zoomIn/zoomOut keeps the anchor world point fixed on screen', () => {
    const { result } = renderHook(() => useViewport());
    act(() => result.current.fitToBounds(BOUNDS, 1000, 800));

    // World point currently under the canvas centre
    const v0 = result.current.viewport;
    const anchorWorld = {
      x: (500 - v0.panX) / v0.zoom,
      y: (v0.panY - 400) / v0.zoom,
    };

    act(() => result.current.zoomIn(500, 400));
    const after = toScreen(result.current.viewport, anchorWorld.x, anchorWorld.y);
    expect(result.current.viewport.zoom).toBeCloseTo(v0.zoom * 1.1, 12);
    expect(after.x).toBeCloseTo(500, 6);
    expect(after.y).toBeCloseTo(400, 6);

    act(() => result.current.zoomOut(500, 400));
    const back = toScreen(result.current.viewport, anchorWorld.x, anchorWorld.y);
    expect(back.x).toBeCloseTo(500, 6);
    expect(back.y).toBeCloseTo(400, 6);
  });

  it('REGRESSION: anchored zoom at EPSG:3857 magnitudes never flings content off-screen', () => {
    const { result } = renderHook(() => useViewport());
    act(() => result.current.fitToBounds(BOUNDS, 1000, 800));

    const centerWorld = {
      x: (BOUNDS.minX + BOUNDS.maxX) / 2,
      y: (BOUNDS.minY + BOUNDS.maxY) / 2,
    };
    for (let i = 0; i < 5; i++) act(() => result.current.zoomIn(500, 400));
    const screen = toScreen(result.current.viewport, centerWorld.x, centerWorld.y);
    // Parcel centre stays within the canvas, not a million pixels away
    expect(Math.abs(screen.x - 500)).toBeLessThan(50);
    expect(Math.abs(screen.y - 400)).toBeLessThan(50);
  });

  it('zoomBy respects the [0.1, 10] zoom clamp', () => {
    const { result } = renderHook(() => useViewport());
    for (let i = 0; i < 60; i++) act(() => result.current.zoomBy(1.5, 10, 10));
    expect(result.current.viewport.zoom).toBe(10);
    for (let i = 0; i < 120; i++) act(() => result.current.zoomBy(0.5, 10, 10));
    expect(result.current.viewport.zoom).toBe(0.1);
  });
});
