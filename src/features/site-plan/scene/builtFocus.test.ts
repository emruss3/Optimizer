import { describe, it, expect } from 'vitest';
import { builtFocus } from './builtFocus';

const house = (x: number, y: number): Array<[number, number]> => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];

describe('builtFocus', () => {
  it('frames the parcel when the plan fills it', () => {
    expect(builtFocus({ x: 0, y: 0, radius: 60 }, [house(-40, -40), house(30, 30)]).kind).toBe('parcel');
  });

  it('frames the buildings when they are a small part of a large parcel', () => {
    const f = builtFocus({ x: 0, y: 0, radius: 400 }, [house(100, 100), house(120, 100)]);
    expect(f.kind).toBe('built');
    expect(f.radius).toBeLessThan(60);
    expect(f.x).toBeCloseTo(115);
  });

  it('frames the densest group when homes are spread across a large parcel', () => {
    // twenty homes close together in the north-east, six strung out to the south-west
    const dense = Array.from({ length: 20 }, (_, i) => house(250 + (i % 5) * 18, 250 + Math.floor(i / 5) * 18));
    const strung = Array.from({ length: 6 }, (_, i) => house(-380 + i * 60, -380));
    const f = builtFocus({ x: 0, y: 0, radius: 500 }, [...strung, ...dense]);
    expect(f.kind).toBe('cluster');
    expect(f.x).toBeGreaterThan(240);
    expect(f.y).toBeGreaterThan(240);
    expect(f.radius).toBeLessThan(200);
  });

  it('keeps the whole parcel when no group stands out', () => {
    const ring = Array.from({ length: 14 }, (_, i) => house(Math.cos((i / 14) * 6.283) * 450, Math.sin((i / 14) * 6.283) * 450));
    expect(builtFocus({ x: 0, y: 0, radius: 500 }, ring).kind).toBe('parcel');
  });
});
