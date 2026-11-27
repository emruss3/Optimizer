import { describe, expect, it } from 'vitest';
import { courtBoundary, courtElements, courtScene, courtViews, withReferenceCourt } from './court';
import { buildMassingData } from '../../src/features/site-plan/ui/massingData';

describe('The Lanes clubhouse visual reference', () => {
  it('retains the three fitted houses and adds physical scene pieces without changing the source plan', () => {
    const identity = courtScene?.identity.revision;
    const snapshot = JSON.stringify(courtElements);
    const data = buildMassingData(courtElements, {parcelRing: courtBoundary});
    const detail = withReferenceCourt(data);
    expect(courtScene?.buildings).toHaveLength(3);
    expect(courtScene?.identity.revision).toBe(identity);
    expect(JSON.stringify(courtElements)).toBe(snapshot);
    expect(detail.slabs.slice(0, data.slabs.length)).toEqual(data.slabs);
    expect(detail.slabs.filter(s => s.id === 'pergola')).toHaveLength(32);
    expect(detail.roofs.filter(s => s.id === 'study-amenity-house')).toHaveLength(6);
    expect(detail.roofs.find(s => s.id === 'pool-water')?.surface).toBe('water');
    expect(detail.windows.filter(w => w.id === 'study-amenity-house')).toHaveLength(5);
    expect(detail.shrubs.length).toBeGreaterThan(data.shrubs.length);
    for (const view of courtViews) {
      expect(data.toLocal(view.position).every(Number.isFinite)).toBe(true);
      expect(data.toLocal(view.target).every(Number.isFinite)).toBe(true);
    }
  });
});
