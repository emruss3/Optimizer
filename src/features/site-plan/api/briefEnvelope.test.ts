import { describe, it, expect } from 'vitest';
import { briefEnvelopeTo3857 } from './useBuildableEnvelope';

// WGS84 squares near Nashville
const sq = (lng: number, lat: number, d: number) => [[[lng, lat], [lng + d, lat], [lng + d, lat + d], [lng, lat + d], [lng, lat]]];

describe('the compiled brief envelope in the canvas frame', () => {
  it('takes a Polygon', () => {
    const p = briefEnvelopeTo3857({ type: 'Polygon', coordinates: sq(-86.8, 36.1, 0.001) });
    expect(p?.type).toBe('Polygon');
    expect(Math.abs(p!.coordinates[0]![0]![0]!)).toBeGreaterThan(1000); // metres, not degrees
  });

  it('takes a MultiPolygon (1083 B Lakewalk Dr, 930 Morton Mill Rd) — the largest piece — instead of announcing "envelope unavailable"', () => {
    const p = briefEnvelopeTo3857({ type: 'MultiPolygon', coordinates: [sq(-86.8, 36.1, 0.0005), sq(-86.79, 36.1, 0.002)] });
    expect(p?.type).toBe('Polygon');
    const xs = p!.coordinates[0]!.map(c => c[0]!);
    // the larger square is the one kept (0.002° across, ≈ 220 m in the frame)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(150);
  });

  it('nothing usable is null', () => {
    expect(briefEnvelopeTo3857(null)).toBeNull();
    expect(briefEnvelopeTo3857({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toBeNull();
    expect(briefEnvelopeTo3857({ type: 'Point', coordinates: [0, 0] })).toBeNull();
  });
});
