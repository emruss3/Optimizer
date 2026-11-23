import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchitecture } from '../ui/architecture';
import { buildingHeight } from '../scene/heights';
import { buildDrawingScene } from '../scene/buildScene';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import {
  DELK_COTTAGE_1754_00010,
  DELK_COTTAGE_ID,
  DELK_PARCEL_ID,
  applyHousingDesign,
  clearHousingChoices,
  designToHouseAccess,
  fitDelkCottage,
  fitDesignToLot,
  garageFlagForDrawing,
  housingDesignById,
  placementToElementProps,
  recalledHousingChoice,
} from './index';
import type { LotFitInput } from './types';

const FIX = JSON.parse(
  readFileSync(join(__dirname, '../api/__fixtures__/delk-675423.json'), 'utf8'),
) as { deep: SfV1Response };

const rectLot = (w: number, d: number, index: number, kind = 'standard'): LotFitInput => ({
  ringFt: [
    [0, 0],
    [w, 0],
    [w, d],
    [0, d],
    [0, 0],
  ],
  frontage: { a: [0, 0], b: [w, 0] },
  setbacks: { front: 20, side: 5, rear: 20 },
  lotKind: kind,
  lotIndex: index,
});

describe('housing design record — Delk cottage 1754-00010', () => {
  it('states beds/baths, heated sf, footprint, porch face, no garage, parking pad, source', () => {
    const d = housingDesignById(DELK_COTTAGE_ID)!;
    expect(d).toBe(DELK_COTTAGE_1754_00010);
    expect(d.beds).toBe(3);
    expect(d.baths).toBe(2);
    expect(d.heatedSf).toBe(1141);
    expect(d.footprint.widthFt).toBe(40);
    expect(d.footprint.depthFt).toBeCloseTo(34 + 2 / 12, 5);
    expect(d.porchFace).toBe('width');
    expect(d.attachedGarage).toBe(false);
    expect(d.parking).toBe('pad');
    expect(d.vehicle).toBeNull();
    expect(d.source.citation).toMatch(/America's Best House Plans/);
    expect(d.verification).toBe('trial-cleared');
  });

  it('keeps unknown baths/garage as null on incomplete records', () => {
    expect(garageFlagForDrawing(null, 'unknown')).toBeNull();
    expect(garageFlagForDrawing(null, 'pad')).toBe(false);
    expect(garageFlagForDrawing(true, 'attached-garage')).toBe(true);
  });
});

describe('fit — Delk lots and Helen Street orientation', () => {
  it('places the cottage on lots 1–3 and rejects lots 4–5 with a reason', () => {
    const lots = [
      rectLot(65, 80, 0),
      rectLot(65, 80, 1),
      rectLot(65, 80, 2),
      { ...rectLot(50, 100, 3), lotKind: 'standard', ringFt: [[0, 0], [10, 0], [12, 5], [50, 5], [50, 100], [0, 100], [0, 0]] },
      { ...rectLot(55, 100, 4), lotKind: 'pie' },
    ];
    const fits = fitDelkCottage(DELK_COTTAGE_1754_00010, lots);
    expect(fits.slice(0, 3).every(f => f.status === 'placed')).toBe(true);
    expect(fits[0]?.placement?.designId).toBe(DELK_COTTAGE_ID);
    expect(fits[0]?.placement?.parking).toBe('pad');
    expect(fits[0]?.placement?.vehicleAnchorFt).toBeNull();
    expect(fits[3]?.status).toBe('unplaced');
    expect(fits[3]?.reason).toMatch(/frontage|irregular/i);
    expect(fits[4]?.status).toBe('unplaced');
    expect(fits[4]?.reason).toMatch(/pie lot/i);
  });

  it('fits a straight lot and rejects a pie lot in geometric mode', () => {
    const ok = fitDesignToLot(DELK_COTTAGE_1754_00010, rectLot(70, 100, 0));
    expect(ok.status).toBe('placed');
    expect(ok.reason).toMatch(/porch to frontage/);

    const pie = fitDesignToLot(DELK_COTTAGE_1754_00010, { ...rectLot(55, 100, 0), lotKind: 'pie' });
    expect(pie.status).toBe('unplaced');
    expect(pie.reason).toMatch(/pie lot/i);
  });

  it('Helen Street regression: porch on the short face when frontage is narrow', () => {
    // Buildable ~35 × 60 after setbacks: porch’s 40-ft face will not meet frontage
    // head-on, so the ranch turns 90° (porch on the short street face).
    const helen = fitDesignToLot(DELK_COTTAGE_1754_00010, rectLot(45, 100, 0));
    expect(helen.status).toBe('placed');
    expect(helen.placement?.rotationDeg).toBe(90);
    expect(helen.reason).toMatch(/short-face|90/i);
  });
});

describe('handoff — no invented garage; design id into scene', () => {
  beforeEach(() => clearHousingChoices());

  it('no-garage cottage does not grow a garage apron even when a driveway meets the wall', () => {
    const access = designToHouseAccess(DELK_COTTAGE_1754_00010, {
      designId: DELK_COTTAGE_ID,
      assetVersion: DELK_COTTAGE_1754_00010.assetVersion,
      elevation: 'front',
      mirror: 'none',
      rotationDeg: 0,
      originFt: [0, 0],
      entryAnchorFt: [20, 0],
      vehicleAnchorFt: null,
      parking: 'pad',
      status: 'placed',
      reason: 'test',
      lotIndex: 0,
    }, [[[2, -7], [6, -7], [6, 0], [2, 0], [2, -7]]]);

    expect(access.garage).toBe(false);
    expect(access.parking).toBe('pad');
    expect(access.designId).toBe(DELK_COTTAGE_ID);

    // Footprint ~40×34 ft in metres.
    const w = 40 * 0.3048, d = (34 + 2 / 12) * 0.3048;
    const rings = [[[0, 0], [w, 0], [w, d], [0, d], [0, 0]]];
    const a = buildArchitecture(
      'delk-h1', 'Cottage', rings, 'house', buildingHeight('house', 1),
      [], 1, 'farmhouse', [], [], access,
    );
    expect(a.slabs.some(s => s.approach?.kind === 'apron')).toBe(false);
    // Unknown garage + driveway must also refuse to invent one.
    const unknown = buildArchitecture(
      'delk-h1', 'Cottage', rings, 'house', buildingHeight('house', 1),
      [], 1, 'farmhouse', [], [], { ...access, garage: null, parking: 'unknown' },
    );
    expect(unknown.slabs.some(s => s.approach?.kind === 'apron')).toBe(false);
  });

  it('apply + scene carry housingDesignId through pad properties', () => {
    const { elements } = sfV1ToElements(FIX.deep);
    const applied = applyHousingDesign({
      parcelId: DELK_PARCEL_ID,
      schemeKey: `${DELK_PARCEL_ID}|deep`,
      designId: DELK_COTTAGE_ID,
      elements,
    });
    expect(applied).not.toBeNull();
    expect(applied!.fits.filter(f => f.status === 'placed')).toHaveLength(3);
    expect(applied!.unplaced.length).toBeGreaterThanOrEqual(2);
    expect(recalledHousingChoice(`${DELK_PARCEL_ID}|deep`)).toBe(DELK_COTTAGE_ID);

    const pad1 = applied!.elements.find(e => e.id.endsWith('pad-1'));
    expect(pad1?.properties?.housingDesignId).toBe(DELK_COTTAGE_ID);
    expect(pad1?.properties?.housingParking).toBe('pad');
    expect(pad1?.properties?.houseGarage).toBe(false);
    expect(pad1?.properties?.housingAssetVersion).toBe(DELK_COTTAGE_1754_00010.assetVersion);

    const scene = buildDrawingScene({
      parcelId: DELK_PARCEL_ID,
      schemeId: 'deep',
      elements: applied!.elements,
      housingDesignId: DELK_COTTAGE_ID,
    });
    expect(scene?.identity.housingDesignId).toBe(DELK_COTTAGE_ID);
    const house = scene?.buildings.find(b => b.housing?.designId === DELK_COTTAGE_ID);
    expect(house?.housing?.parking).toBe('pad');
    expect(house?.housing?.status).toBe('placed');
    expect(house?.housing?.assetVersion).toBe(DELK_COTTAGE_1754_00010.assetVersion);
  });

  it('legacy unrecovered catalogue plan is marked schematic on the scene', () => {
    const props = placementToElementProps(DELK_COTTAGE_1754_00010, null, {
      schematic: true,
      unrecoveredReason: 'legacy catalogue plan — design unrecovered; schematic massing',
    });
    expect(props.housingPlacementStatus).toBe('schematic');
  });
});
