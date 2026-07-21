import { describe, it, expect } from 'vitest';
import type { Polygon } from 'geojson';
import { placeBarsAlongEdges } from './edgePlacement';

// A 200m (E-W) × 80m (N-S) rectangle: the LONGEST edges run east-west, the
// short edges north-south. Street-edge-first must be able to overrule that.
const rect: Polygon = {
  type: 'Polygon',
  coordinates: [[
    [0, 0], [200, 0], [200, 80], [0, 80], [0, 0],
  ]],
};

describe('WO-1b: street-edge-first bar placement', () => {
  it('defaults to longest-edge-first (bars run east-west)', () => {
    const bars = placeBarsAlongEdges(rect, { widthM: 60, depthM: 18, count: 1 });
    expect(bars).toHaveLength(1);
    // Rotation aligned with an E-W edge: angle ≈ 0 or π (mod π ≈ 0)
    const rot = Math.abs(Math.sin(bars[0].rotationRad ?? 0));
    expect(rot).toBeLessThan(0.05);
  });

  it('with a north-south frontage bearing, bars address the street instead', () => {
    // Compass bearing 0° = due north → the street runs north-south → edges
    // parallel to it are the SHORT west/east lot lines.
    const bars = placeBarsAlongEdges(rect, {
      widthM: 60, depthM: 18, count: 1, preferredBearingDeg: 0,
    });
    expect(bars).toHaveLength(1);
    // Rotation aligned with a N-S edge: |cos| ≈ 0
    const rot = Math.abs(Math.cos(bars[0].rotationRad ?? 0));
    expect(rot).toBeLessThan(0.05);
  });

  it('length still breaks ties among equally-aligned edges', () => {
    const bars = placeBarsAlongEdges(rect, {
      widthM: 60, depthM: 18, count: 1, preferredBearingDeg: 90,
    });
    // Bearing 90° = due east → E-W edges align; longest-first picks them
    const rot = Math.abs(Math.sin(bars[0].rotationRad ?? 0));
    expect(rot).toBeLessThan(0.05);
  });
});
