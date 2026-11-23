import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchitecture } from '../ui/architecture';
import { pickFrontWall } from '../ui/architecture/fittedHouse';
import { frontOf, ringWalls } from '../ui/architecture/kit';
import { buildingHeight } from '../scene/heights';
import { buildDrawingScene } from '../scene/buildScene';
import { sfV1ToElements, type SfV1Response } from '../api/sfV1Plan';
import {
  ABHP_4848_00368,
  DELK_COTTAGE_1754_00010,
  DELK_COTTAGE_ID,
  DELK_PARCEL_ID,
  HOUSING_CATALOGUE,
  allowSfStockPlans,
  applyHousingDesign,
  buildableStockPlans,
  clearHousingChoices,
  designsForParcel,
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

describe('buildable stock catalogue', () => {
  it('lists multiple ABHP plans with footprints and publisher URLs', () => {
    const stock = buildableStockPlans();
    expect(stock.length).toBeGreaterThanOrEqual(5);
    expect(HOUSING_CATALOGUE.every(d => d.source.rights === 'citation-only')).toBe(true);
    for (const d of stock) {
      expect(d.heatedSf).toBeGreaterThan(0);
      expect(d.footprint.widthFt).toBeGreaterThan(0);
      expect(d.footprintsByFloor.length).toBeGreaterThan(0);
      expect(d.source.url).toMatch(/houseplans\.net/);
      expect(d.attachedGarage).toBe(false);
      expect(d.parking).toBe('pad');
    }
  });

  it('offers the full stock list on SF parcels, Delk cottage first on Delk', () => {
    const delk = designsForParcel(DELK_PARCEL_ID, { zoningBase: 'RS5' });
    expect(delk[0]?.id).toBe(DELK_COTTAGE_ID);
    expect(delk.length).toBe(buildableStockPlans().length);
    expect(designsForParcel('999999', { zoningBase: 'R8' }).map(d => d.id)).toEqual(
      buildableStockPlans().map(d => d.id),
    );
    // Legacy callers without zoning still see the catalogue (gate is at the session).
    expect(designsForParcel('999999').map(d => d.id)).toEqual(buildableStockPlans().map(d => d.id));
  });

  it('withholds SF stock on MF/CS unless labeled rezone', () => {
    expect(allowSfStockPlans('RM20')).toBe(false);
    expect(allowSfStockPlans('CS')).toBe(false);
    expect(allowSfStockPlans('RS5')).toBe(true);
    expect(allowSfStockPlans('RM20', { rezoneLabeled: true })).toBe(true);
    expect(designsForParcel(DELK_PARCEL_ID, { zoningBase: 'RM20' })).toEqual([]);
    expect(designsForParcel('999999', { zoningBase: 'CS' })).toEqual([]);
    expect(designsForParcel('999999', { zoningBase: 'RM40-A', rezoneLabeled: true }).length).toBe(
      buildableStockPlans().length,
    );
  });

  it('cites listing-overall Width×Depth on provisional ABHP pads', () => {
    expect(ABHP_4848_00368.source.citation).toMatch(/listing overall/);
    expect(ABHP_4848_00368.notes.some(n => /listing.*overall|may include porch/i.test(n))).toBe(true);
  });

  it('resolves each catalogue plan by id and plan number', () => {
    for (const d of HOUSING_CATALOGUE) {
      expect(housingDesignById(d.id)?.planNumber).toBe(d.planNumber);
      expect(housingDesignById(d.planNumber)?.id).toBe(d.id);
    }
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

  it('places provisional 31×56 cottage on a narrow deep non-Delk lot', () => {
    // Buildable ~32 × 80 after 5/20/20 setbacks — width clears 31′, depth clears 56′.
    const narrowDeep = fitDesignToLot(ABHP_4848_00368, rectLot(42, 120, 0));
    expect(narrowDeep.status).toBe('placed');
    expect(narrowDeep.placement?.designId).toBe(ABHP_4848_00368.id);
    expect(narrowDeep.reason).toMatch(/porch to frontage|short-face|90/i);
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
    // With a designId, unknown garage + driveway must also refuse to invent one.
    const unknown = buildArchitecture(
      'delk-h1', 'Cottage', rings, 'house', buildingHeight('house', 1),
      [], 1, 'farmhouse', [], [], { ...access, garage: null, parking: 'unknown' },
    );
    expect(unknown.slabs.some(s => s.approach?.kind === 'apron')).toBe(false);
  });

  it('legacy pads without designId still draw a garage when garage is unknown and a drive meets', () => {
    const w = 40 * 0.3048, d = (34 + 2 / 12) * 0.3048;
    const rings = [[[0, 0], [w, 0], [w, d], [0, d], [0, 0]]];
    const drive = [[[2, -7], [6, -7], [6, 0.2], [2, 0.2], [2, -7]]] as Array<Array<[number, number]>>;
    const legacy = buildArchitecture(
      'legacy-h1', 'House', rings, 'house', buildingHeight('house', 1),
      [], 1, 'farmhouse', [], [], {
        driveways: drive,
        garage: null,
        catalogued: false,
      },
    );
    expect(legacy.slabs.some(s => s.approach?.kind === 'apron')).toBe(true);
  });

  it('porch-face pick prefers pavement/meeting wall when both long walls match (rear listed first)', () => {
    const w = 40 * 0.3048, d = (34 + 2 / 12) * 0.3048;
    // Clockwise ring starting on the rear 40-ft face so length-first would pick backyard.
    const ring = [[0, d], [w, d], [w, 0], [0, 0], [0, d]];
    const walls = ringWalls(ring);
    expect(walls[0]!.len).toBeCloseTo(w, 5);
    const midY0 = (walls[0]!.a[1] + (walls[0]!.a[1] + walls[0]!.t[1] * walls[0]!.len)) / 2;
    expect(midY0).toBeCloseTo(d, 5);

    const pavement: Array<[number, number]> = [[w / 2, -2]];
    const facing = walls[frontOf(walls, pavement).index]!;
    const front = pickFrontWall(
      walls,
      pavement,
      { driveways: [], garage: false, catalogued: true, porchFaceLenM: w },
      null,
    );
    expect(front).toBe(facing);
    expect(front).not.toBe(walls[0]);
    const midFront = (front.a[1] + (front.a[1] + front.t[1] * front.len)) / 2;
    expect(midFront).toBeCloseTo(0, 5);
  });

  it('apply + scene carry housingDesignId through pad properties', () => {
    const { elements } = sfV1ToElements(FIX.deep);
    const applied = applyHousingDesign({
      parcelId: DELK_PARCEL_ID,
      schemeKey: `${DELK_PARCEL_ID}|deep`,
      designId: DELK_COTTAGE_ID,
      elements,
      setbacks: (FIX.deep.setbacks as { front: number; side: number; rear: number }) ?? undefined,
    });
    expect(applied).not.toBeNull();
    expect(applied!.fits.filter(f => f.status === 'placed')).toHaveLength(3);
    expect(applied!.unplaced.length).toBeGreaterThanOrEqual(2);
    // Lot 5 is pie on the Delk fixture — unresolved reason must name the constraint.
    const lot5 = applied!.fits[4] ?? applied!.unplaced.find(u => u.lotIndex === 4);
    const lot5Reason = (lot5 && 'reason' in lot5 ? lot5.reason : null) ?? applied!.unplaced.find(u => u.lotIndex === 4)?.reason;
    expect(lot5Reason).toMatch(/pie lot|frontage|resolve/i);
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
