import { describe, it, expect } from 'vitest';
import { constraintSourceOf, hazardKindOf, sfV1ToElements, type SfV1Response } from './sfV1Plan';

// Audit 2026-11-22: a hillside came out as hazardKind=wetland, a deep-fill
// hold as floodplain with no identity of its own, and the 3D model planted
// wetland vegetation on whatever carried the wetland hatch.
const SQ = (x: number, y: number) => `POLYGON((${x} ${y},${x + 100} ${y},${x + 100} ${y + 100},${x} ${y + 100},${x} ${y}))`;
const BASE: SfV1Response = { status: 'done', basis: 'by_right', lots: 0 };
const piece = (kind: string) => sfV1ToElements({ ...BASE, open_wkt: `MULTIPOLYGON(${SQ(1740000, 660000).replace('POLYGON', '')})`, open_pieces: [{ kind, acres: 0.23 }] })
  .elements.find(e => e.id.startsWith('sfv1-open-'));

describe('constraint identity: what held land is, apart from how it is drawn', () => {
  it('a natural hillside is slope, not wetland', () => {
    const el = piece('natural: hillside over 25%');
    expect(el?.properties?.constraintSource).toBe('slope');
    expect(el?.properties?.hazardKind).toBe('slope');
  });

  it('a named wetland buffer is a wetland buffer', () => {
    const el = piece('natural: wetland / water buffer');
    expect(el?.properties?.constraintSource).toBe('wetland_buffer');
    expect(el?.properties?.hazardKind).toBe('wetland');
  });

  it('natural land with no named source is not drawn or planted as wetland', () => {
    for (const kind of ['natural: woods', 'natural: open space beside wetland / buffer']) {
      const el = piece(kind);
      expect(el?.properties?.constraintSource).toBe('natural_unspecified');
      expect(el?.properties?.hazardKind).toBe('natural');
    }
  });

  it('a deep-fill hold keeps its own identity under the floodplain hatch', () => {
    const el = sfV1ToElements({ ...BASE, deep_fill_hold_wkt: SQ(1740000, 660000) }).elements.find(e => e.id.startsWith('sfv1-deep-fill-hold-'));
    expect(el?.properties?.constraintSource).toBe('deep_fill_hold');
    expect(el?.properties?.label).toBe('Deep-fill hold (fill over the cap)');
  });

  it('the flood hold says floodway when the hold is the floodway', () => {
    const way = sfV1ToElements({ ...BASE, flood_hold: 'floodway' }, { holdWkt: SQ(1740000, 660000) }).elements.find(e => e.id.startsWith('sfv1-hold-'));
    expect(way?.properties?.constraintSource).toBe('floodway');
    const plain = sfV1ToElements({ ...BASE, flood_hold: 'sfha' }, { holdWkt: SQ(1740000, 660000) }).elements.find(e => e.id.startsWith('sfv1-hold-'));
    expect(plain?.properties?.constraintSource).toBe('floodplain');
  });

  it('amenities and unassigned land carry no hazard', () => {
    expect(piece('amenity: neighborhood park')?.properties?.hazardKind).toBeUndefined();
    expect(piece('unassigned: buildable land without a street or a lot')?.properties?.constraintSource).toBeUndefined();
    expect(piece('amenity: pond and its edge')?.properties?.hazardKind).toBeUndefined();
  });

  it('maps every source to one hatch', () => {
    expect(hazardKindOf(constraintSourceOf('natural: floodway fringe'))).toBe('floodway');
    expect(hazardKindOf('pond')).toBeUndefined();
  });
});
