import { describe, it, expect } from 'vitest';
import type { Element } from '../../../engine/types';
import { mfAccessSummary, ringDistance } from './mfAccess';

const meta = { createdAt: 't', updatedAt: 't', source: 'ai-generated' as const };
const rect = (x1: number, y1: number, x2: number, y2: number) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
const el = (id: string, type: Element['type'], ring: number[][], props: Record<string, unknown> = {}): Element =>
  ({ id, type, name: id, geometry: { type: 'Polygon', coordinates: [ring] }, properties: props, metadata: meta }) as Element;

const parcel = rect(0, 0, 100, 100);

describe('mfAccessSummary — does the parking have a road?', () => {
  it('counts the curb and the bays a drive reaches', () => {
    const drive = el('drive', 'circulation', rect(0, 0, 8, 60)); // from the parcel line up the side
    const near = el('bay-a', 'parking', rect(10, 50, 30, 60)); // 2 m off the drive
    const far = el('bay-b', 'parking', rect(60, 20, 80, 40)); // nowhere near it
    const apron = el('apron', 'parking', rect(60, 80, 62, 84), { apron: true }); // a garage apron, not a bay
    const s = mfAccessSummary([drive, near, far, apron], parcel);
    expect(s).toEqual({ curb: true, bays: 2, served: 1, drives: 1 });
  });

  it('a drive that stops inside the site never reaches the curb', () => {
    const stub = el('drive', 'circulation', rect(40, 20, 48, 50));
    const bay = el('bay', 'parking', rect(60, 20, 80, 40));
    const s = mfAccessSummary([stub, bay], parcel);
    expect(s.curb).toBe(false);
    expect(s.served).toBe(0);
  });

  it('measures ring-to-ring distance edge to vertex both ways, zero when edges cross', () => {
    expect(ringDistance(rect(0, 0, 10, 10), rect(12, 4, 20, 6))).toBeCloseTo(2, 6);
    expect(ringDistance(rect(0, 0, 10, 10), rect(8, 8, 12, 12))).toBe(0);
    // a ring wholly inside another reads as the gap between the boundaries
    expect(ringDistance(rect(0, 0, 10, 10), rect(5, 5, 6, 6))).toBe(4);
  });
});
