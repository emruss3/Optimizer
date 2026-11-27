import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Element } from '../../../engine/types';
import { createGroundFrame } from '../scene/frame';
import { buildDrawingScene } from '../scene/buildScene';
import { buildMassingData } from '../ui/massingData';
import HomeStudio from './HomeStudio';
import { assignmentsFromElements, carryAssignments, commitConcept } from './carry';
import { designBounds, doorAnchors, floorArea, roofHeight, wallsFor } from './drawings';
import { designsFittingHouse } from './homeDesignsGate';
import { placeHome } from './placement';
import { homesSchedule } from './schedule';
import { WEST_HEIMAN_DESIGNS, WEST_HEIMAN_IDS } from './westHeimanDesigns';

const SB = { front: 12, rear: 12, side: 3 };
const frame = createGroundFrame(-9679825, 4334090);
function polygon(x1: number, y1: number, x2: number, y2: number): Element['geometry'] {
  return { type: 'Polygon', coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]].map(p => frame.fromFeet(p))] };
}
function element(id: string, name: string, type: Element['type'], geometry: Element['geometry'], properties: Element['properties'] = {}): Element {
  return { id, name, type, geometry, properties } as Element;
}
function plan() {
  const homes = [0, 1, 2].flatMap(i => {
    const n = i + 1, x = i * 38;
    return [
      element('test-lot-' + n, 'Lot ' + n, 'other', polygon(x, 0, x + 38, 86), { homeSetbacksFt: SB }),
      element('test-pad-' + n, 'House ' + n, 'building', polygon(x + 8, 22, x + 30, 65),
        { house: true, lotId: 'test-lot-' + n, heightFt: 30 }),
    ];
  });
  return [...homes,
    element('street', 'Front street', 'road', polygon(-10, -18, 124, 0)),
    element('alley', 'Rear alley', 'road', polygon(-10, 86, 124, 101), { kind: 'alley' }),
    element('link', 'Paved link', 'circulation', polygon(-16, -3, -5, 89)),
  ];
}

describe('West Heiman per-lot placement', () => {
  it('applies all three, preserves neighboring houses, and keeps 2D, 3D, schedule and reload in sync', () => {
    const original = plan();
    let elements = original;
    WEST_HEIMAN_IDS.forEach((id, i) => {
      const houseId = 'test-pad-' + (i + 1);
      const existing = elements.find(e => e.id === houseId)!;
      expect(designsFittingHouse(WEST_HEIMAN_DESIGNS, existing, elements).map(d => d.id)).toEqual(WEST_HEIMAN_IDS);
      const before = elements;
      const applied = commitConcept(id, houseId, elements, undefined, 45);
      if (!applied.ok) throw new Error(applied.reason);
      elements = applied.elements;
      for (const other of before.filter(e => e.type === 'building' && e.id !== houseId))
        expect(elements.find(e => e.id === other.id)).toBe(other);
      const house = elements.find(e => e.id === houseId)!;
      expect(house.properties.housingDesignId).toBe(id);
      const door = frame.toFeet(house.properties.homeEntry3857 as number[]);
      const garage = frame.toFeet(house.properties.homeVehicle3857 as number[]);
      expect(garage[1]! - door[1]!).toBeCloseTo(WEST_HEIMAN_DESIGNS[i]!.volumes[0]!.rect[3], 2);
      for (const name of ['Walk', 'Driveway']) {
        expect(elements.some(e => e.id.startsWith(houseId + '-home-') && e.name === name)).toBe(true);
      }
    });
    const scene = buildDrawingScene({ parcelId: 'west-heiman-test', schemeId: 'rear-load', elements });
    expect(scene?.buildings.map(b => b.housing?.designId)).toEqual(WEST_HEIMAN_IDS);
    const schedule = homesSchedule(elements);
    expect(schedule.rows.map(row => row.kind)).toEqual(['concept', 'concept', 'concept']);
    expect(schedule.rows.map(row => row.heatedSf)).toEqual(WEST_HEIMAN_DESIGNS.map(design =>
      Math.round(design.levels.reduce((sum, _, i) => sum + floorArea(design, i, true), 0))));
    expect(scene?.buildings[0]?.grossSqFt?.value).toBeGreaterThan(schedule.rows[0]?.heatedSf ?? 0);
    const model = buildMassingData(elements);
    expect(model.slabs.filter(s => s.approach?.kind === 'apron')).toHaveLength(3);
    const reopened = JSON.parse(JSON.stringify(elements)) as Element[];
    const restored = carryAssignments(assignmentsFromElements(reopened), original, SB, 45);
    expect(restored.lost).toEqual([]);
    expect(restored.kept.map(a => a.designId)).toEqual(WEST_HEIMAN_IDS);
  });

  it.each(WEST_HEIMAN_DESIGNS)('rejects missing alley, disconnected alley, short pad and attached pads for $name', design => {
    const base = plan(), home = base.find(e => e.id === 'test-pad-1')!;
    const without = (id: string) => base.filter(e => e.id !== id);
    expect(placeHome(design, home, without('alley')).reason).toMatch(/mapped alley/);
    expect(placeHome(design, home, without('link')).reason).toMatch(/alley connects/);
    expect(placeHome(design, { ...home, properties: { ...home.properties, townhome: true } }, base).placement).toBeUndefined();
    const small = { ...home, geometry: polygon(8, 21, 28, 61) };
    const legacy = base.map(e => e.id === home.id ? small : e.id === 'test-lot-1' ? { ...e, properties: {} } : e);
    expect(placeHome(design, small, legacy).placement).toBeUndefined();
    expect(placeHome(design, home, base, undefined, roofHeight(design) - 1).reason).toMatch(/height/);
  });

  it('enforces F2 bulkhead height in browse, apply and re-solve', () => {
    const elements = plan(), house = elements.find(e => e.id === 'test-pad-1')!;
    const limit = (roofHeight(WEST_HEIMAN_DESIGNS[1]!) + roofHeight(WEST_HEIMAN_DESIGNS[2]!)) / 2;
    expect(designsFittingHouse(WEST_HEIMAN_DESIGNS, house, elements, undefined, limit).map(d => d.id))
      .toEqual(WEST_HEIMAN_IDS.slice(0, 2));
    expect(commitConcept(WEST_HEIMAN_IDS[2], house.id, elements, undefined, limit)).toMatchObject({ ok: false, reason: expect.stringMatching(/height/) });
    const applied = commitConcept(WEST_HEIMAN_IDS[2], house.id, elements);
    if (!applied.ok) throw new Error(applied.reason);
    const rejected = carryAssignments(assignmentsFromElements(applied.elements), elements, SB, limit);
    expect(rejected.lost).toEqual([expect.objectContaining({ designId: WEST_HEIMAN_IDS[2], reason: expect.stringMatching(/height/) })]);
  });

  it('preserves the narrow level widths, B2 balcony and E2 asymmetrical side windows', () => {
    for (const design of WEST_HEIMAN_DESIGNS) {
      expect(designBounds(design)[2]).toBeCloseTo(19 + 9.25 / 12, 6);
      expect(designBounds(design)[3]).toBeGreaterThan(44);
      expect(doorAnchors(design).find(a => a.kind === 'garage')).toMatchObject({ width: 16, face: 'back' });
    }
    const [b, e] = WEST_HEIMAN_DESIGNS;
    const balcony = b!.levels[2]!.rooms.find(r => r.name === 'Covered balcony')!;
    expect(floorArea(b!, 2) - floorArea(b!, 2, true)).toBeCloseTo(balcony.rect[2] * balcony.rect[3]);
    const counts = (side: 'left' | 'right') => e!.levels.map((_, i) => wallsFor(e!, i)
      .filter(w => w.face === side && !w.other).flatMap(w => w.cuts.filter(c => c.kind === 'window')).length);
    expect(counts('right')).toEqual([0, 3, 2]);
    expect(counts('left')).toEqual([0, 2, 2]);
  });

  it('routes the selected lot and authored design through Home Studio Apply, with interior views', async () => {
    const elements = plan();
    const onApply = vi.fn((id: string, lot: string) => commitConcept(id, lot, elements));
    const onPreview = vi.fn();
    const onClose = vi.fn();
    render(<HomeStudio elements={elements} selected="test-pad-2" designs={[WEST_HEIMAN_DESIGNS[1]!]} stockPlans={[]}
      onPreview={onPreview} onClose={onClose} onApplyConcept={onApply} />);
    fireEvent.click(screen.getByRole('tab', { name: /Authored catalog/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Interiors' }));
    expect(screen.getAllByRole('img', { name: /West Heiman E2, illustrative/i })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Preview on site' }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ house: 'test-pad-2', name: 'West Heiman E2' }));
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Apply to Lot 2' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onApply).toHaveBeenCalledWith(WEST_HEIMAN_IDS[1], 'test-pad-2');
    expect(onApply.mock.results[0]?.value).toMatchObject({ ok: true, name: 'West Heiman E2' });
  });
});

describe('Buildable plans: the whole catalogue, fit per lot, one target (handoff 11-27)', () => {
  it('lists every authored design for the target lot, fits first, the others with their reason', async () => {
    const { HOME_DESIGNS } = await import('./originalDesigns');
    const { catalogFitRows } = await import('./catalogFit');
    const elements = plan();
    const house = elements.find(e => e.id === 'test-pad-2')!;
    const rows = catalogFitRows(HOME_DESIGNS, house, elements);
    expect(rows).toHaveLength(HOME_DESIGNS.length);
    const firstMiss = rows.findIndex(r => r.status !== 'fits');
    expect(rows.slice(0, firstMiss).every(r => r.status === 'fits')).toBe(true);
    for (const id of WEST_HEIMAN_IDS) expect(rows.find(r => r.design.id === id)?.status).toBe('fits');
    // an attached design on a detached lot is listed with that reason, not dropped
    const attached = rows.find(r => r.design.attached);
    expect(attached?.status).toBe('other-typology');
    // the same result drives Apply: a design that fits carries its placement
    expect(rows.find(r => r.design.id === WEST_HEIMAN_IDS[0])?.result?.placement).toBeTruthy();
  });

  it('keeps a design that does not fit in the list with its reason, and finds the lots it fits', async () => {
    const { catalogFitRows, compatibleLots } = await import('./catalogFit');
    // no rear alley: the rear-load studies cannot reach their garages
    const elements = plan().filter(e => e.id !== 'alley' && e.id !== 'link');
    const house = elements.find(e => e.id === 'test-pad-1')!;
    const rows = catalogFitRows(WEST_HEIMAN_DESIGNS, house, elements);
    expect(rows.every(r => r.status === 'no-fit' && !!r.result?.reason)).toBe(true);
    expect(compatibleLots(WEST_HEIMAN_DESIGNS[0]!, elements.filter(e => e.properties?.house), elements)).toEqual([]);
  });

  it('opens on the authored catalogue with one target lot, and My plans says when none are linked', () => {
    const elements = plan();
    render(<HomeStudio elements={elements} selected="test-pad-2" stockPlans={[]} onPreview={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('tab', { name: /Authored catalog/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByLabelText('Target house lot')).toHaveLength(1);
    expect((screen.getByTestId('home-target-lot') as HTMLSelectElement).value).toBe('test-pad-2');
    expect(screen.getByTestId('home-design-tn-west-heiman-b2-study-v1').getAttribute('data-fit')).toBe('fits');
    expect(screen.getByTestId('home-design-source').textContent).toContain('Authored concept · schematic');
    fireEvent.click(screen.getByTestId('home-tab-mine'));
    expect(screen.getByTestId('home-mine-empty').textContent).toContain('No project plans linked');
  });

  it('opens on My plans when the parcel\'s project links designs', () => {
    const elements = plan();
    render(<HomeStudio elements={elements} selected="test-pad-1" stockPlans={[]} projectDesignIds={WEST_HEIMAN_IDS} projectName="QA fixture"
      onPreview={() => undefined} onClose={() => undefined} />);
    expect(screen.getByRole('tab', { name: /My plans · 3/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('home-target-fits').textContent).toBe('3 of 3 project plans fit this lot');
  });
});

describe('project plan links', () => {
  it('links no parcel to The Lanes until its parent and phase parcels are mapped', async () => {
    const { projectPlansFor, PROJECT_PLAN_LINKS } = await import('./projectPlans');
    expect(PROJECT_PLAN_LINKS.find(l => l.projectId === 'the-lanes-2500-w-heiman')?.missing).toBeTruthy();
    expect(projectPlansFor('675423')).toBeNull();
    expect(projectPlansFor('1', [{ projectId: 'p', name: 'P', parcels: ['1'], designIds: ['x'], missing: null }])?.designIds).toEqual(['x']);
  });
});

it('applies photo-informed frontage detail without changing glazing, door anchors or roof height', async () => {
  const { drawHome } = await import('./architecture');
  const { Kit } = await import('../ui/architecture/kit');
  for (const design of WEST_HEIMAN_DESIGNS) {
    const before = { ...design };
    delete before.frontFinishStudy;
    const prior = drawHome(new Kit('same', 'before'), before);
    const updated = drawHome(new Kit('same', 'before'), design);
    expect(updated.glass).toEqual(prior.glass);
    expect(updated.slabs.filter(s => s.approach)).toEqual(prior.slabs.filter(s => s.approach));
    expect(updated.slabs.length).toBeGreaterThan(prior.slabs.length);
    expect(updated.flats.length).toBeGreaterThan(prior.flats.length);
    expect(roofHeight(design)).toBe(roofHeight(before));
    expect(designBounds(design)).toEqual(designBounds(before));
  }
});
