import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HOME_DESIGNS } from './originalDesigns';
import { wallsFor, doorAnchors, floorArea, program, roofHeight } from './drawings';
import { drawHome } from './architecture';
import { Kit } from '../ui/architecture/kit';
import { placeHome, residentialHomes } from './placement';
import { sfV1ToElements } from '../api/sfV1Plan';
import fixture from '../api/__fixtures__/delk-675423.json';
import type { SfV1Response } from '../api/sfV1Plan';
import { buildDrawingScene } from '../scene/buildScene';
import { buildMassingData } from '../ui/massingData';

for (const h of HOME_DESIGNS)
  it(h.name + ' has connected room drawings, fixed dimensions and matching exterior openings', () => {
    expect(doorAnchors(h)).toHaveLength(h.doors.length);
    expect(h.doors.filter((d) => d.kind === 'entry')).toHaveLength(1);
    expect(program(h).heated).toBeGreaterThan(900);
    expect(roofHeight(h)).toBeGreaterThan(h.heights[0]!);
    h.levels.forEach((l, i) => {
      const walls = wallsFor(h, i);
      for (const link of l.links) {
        const [a, b] = link.split(/[~|]/);
        expect(
          walls.some((w) => ((w.room === a && w.other === b) || (w.room === b && w.other === a)) && w.cuts.length),
          link,
        ).toBe(true);
      }
      const remaining = new Set(l.rooms.map((r) => r.name));
      const visit = (name: string) => {
        if (!remaining.delete(name)) return;
        for (const w of walls)
          if (w.other && w.cuts.length) {
            if (w.room === name) visit(w.other);
            if (w.other === name) visit(w.room);
          }
      };
      visit(i === 0 ? h.doors[0]!.room : 'Stair hall');
      // A detached carriage house is intentionally reached through its exterior door.
      if (h.id === 'tn-garden-infill-v1' && i === 0) remaining.delete('Garage');
      expect([...remaining]).toEqual([]);
      const vol = h.volumes.filter((v) => v.first <= i && i < v.first + v.count);
      expect(floorArea(h, i)).toBeCloseTo(vol.reduce((sum, v) => sum + v.rect[2] * v.rect[3], 0), 6);
      for (const r of l.rooms) {
        for (const q of l.rooms)
          if (q !== r) {
            const [x, y, w, d] = r.rect,
              [x2, y2, w2, d2] = q.rect;
            expect(
              Math.min(x + w, x2 + w2) <= Math.max(x, x2) + 1e-8 || Math.min(y + d, y2 + d2) <= Math.max(y, y2) + 1e-8,
              r.name + ' / ' + q.name,
            ).toBe(true);
          }
      }
      // West Heiman's stairs change runs and landings across levels, as shown on the sheets.
      if (i > 0 && !h.rearLoadPrecedent)
        expect(l.rooms.find((r) => r.name === 'Stair hall')?.rect).toEqual(
          h.levels[0]!.rooms.find((r) => r.name === 'Stair hall')?.rect,
        );
    });
    const built = drawHome(new Kit(h.id, h.name), h);
    expect(built.glass.length).toBeGreaterThan(3);
    expect(built.slabs.some((s) => s.approach?.kind === 'walk')).toBe(true);
    expect(built.slabs.filter((s) => s.approach?.kind === 'apron')).toHaveLength(
      h.doors.filter((d) => d.kind === 'garage').length,
    );
  });
it('places a full-size cottage on the real Delk five-lot layout and keeps the accepted plan intact', () => {
  const elements = sfV1ToElements(fixture.deep as unknown as SfV1Response).elements;
  const homes = residentialHomes(elements);
  const fits = homes.map((e) => placeHome(HOME_DESIGNS[0]!, e, elements));
  expect(fits.map((f) => Boolean(f.placement))).toEqual([true, true, true, false, false]);
  const cottage = fits[0]!.placement!;
  expect(cottage.elements.some((e) => e.name === 'Parking pad · 9 × 18 ft')).toBe(true);
  expect(cottage.elements.find((e) => e.id === cottage.house)?.properties.houseGarage).toBe(false);
  expect(homes.map((el) => placeHome(HOME_DESIGNS[1]!, el, elements).placement)).toEqual(Array(5).fill(undefined));
  expect(elements.some((e) => e.properties.housingDesignId)).toBe(false);
}, 30000);

it('places the same three-story Lantern plan, garage and entrance in the Union Hill sheet and 3D model', () => {
  const recordings = JSON.parse(readFileSync('scripts/visual-battery/fixtures/mock_store.json', 'utf8'));
  const elements = sfV1ToElements(recordings['rpc:fn_sf_v1_plan_app:680001:'] as SfV1Response).elements;
  const lantern = HOME_DESIGNS.find((h) => h.name === 'Lantern House')!;
  const lots = residentialHomes(elements);
  expect(lots).toHaveLength(3);
  const fits = lots.map((el) => placeHome(lantern, el, elements));
  expect(fits.every((f) => f.placement)).toBe(true);
  const preview = fits[0]!.placement!;
  const house = preview.elements.find((el) => el.id === preview.house)!;
  const scene = buildDrawingScene({ parcelId: 680001, schemeId: 'test', elements: preview.elements })!;
  const sheet = scene.buildings.find((b) => b.id === house.id)!;
  expect(sheet.floors.value).toBe(lantern.levels.length);
  expect(sheet.housing?.designId).toBe(lantern.id);
  expect(sheet.housing?.vehicleAnchorFt).toEqual(scene.frame.toFeet(house.properties.homeVehicle3857 as number[]));
  expect(sheet.housing?.entryAnchorFt).toEqual(scene.frame.toFeet(house.properties.homeEntry3857 as number[]));
  expect(sheet.housing?.entryAnchorFt).not.toEqual(sheet.housing?.vehicleAnchorFt);
  const model = buildMassingData(preview.elements);
  const doors = model.slabs.filter((s) => s.id === house.id && s.approach);
  expect(doors.map((d) => d.approach?.kind).sort()).toEqual(['apron', 'walk']);
  expect(model.windows.some((w) => w.id === house.id)).toBe(true);
  expect(model.roofs.some((r) => r.id === house.id)).toBe(true);
});
