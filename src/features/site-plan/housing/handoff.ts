/**
 * Selection → drawing handoff.
 *
 * Choosing a housing design must not invent a garage or a wrong front.
 * Porch / entry / parking anchors flow into HouseAccess and element properties
 * so massing, A-01, section, Three.js and Cycles share one placement identity.
 *
 * Legacy CubiCasa schemes without a recovered design stay schematic: status
 * `schematic` is visible when the design is unrecovered.
 */
import type { HouseAccess } from '../ui/architecture/fittedHouse';
import type { HousingDesignRecord, HousingPlacement, ParkingArrangement } from './types';
import { housingDesignById } from './catalogue';

export type V2 = [number, number];

/** Extended access the exterior builder reads — design identity, not a boolean. */
export interface DesignHouseAccess extends HouseAccess {
  designId: string | null;
  assetVersion: string | null;
  elevation: string | null;
  mirror: 'none' | 'left-right' | null;
  rotationDeg: number | null;
  parking: ParkingArrangement;
  /** Porch / entry wall preference: which wall length (metres) the porch wants. */
  porchFaceLenM: number | null;
  entryAlongM: number | null;
  entryWidthM: number | null;
  vehicleAlongM: number | null;
  vehicleWidthM: number | null;
  placementStatus: 'placed' | 'unplaced' | 'schematic';
  fitReason: string | null;
}

const FT_TO_M = 0.3048;

/**
 * Attached-garage flag for a catalogue design / pad properties.
 * `null` means unknown: fittedHouse refuses to invent a garage only when a
 * `designId` is present; legacy schemes without one keep the prior meeting rule.
 */
export function garageFlagForDrawing(
  attachedGarage: boolean | null | undefined,
  parking: ParkingArrangement | null | undefined,
): boolean | null {
  if (parking === 'pad' || parking === 'street' || parking === 'alley' || parking === 'none' || parking === 'detached-garage') {
    return false;
  }
  if (attachedGarage === true) return true;
  if (attachedGarage === false) return false;
  return null; // unknown — catalogue designs must not invent; legacy may still meet
}

export function designToHouseAccess(
  design: HousingDesignRecord,
  placement: HousingPlacement | null,
  driveways: V2[][] = [],
): DesignHouseAccess {
  const garage = garageFlagForDrawing(design.attachedGarage, design.parking);
  const porchLenFt =
    design.porchFace === 'width' ? design.footprint.widthFt : design.footprint.depthFt;
  return {
    driveways,
    garage,
    catalogued: true,
    designId: design.id,
    assetVersion: design.assetVersion,
    elevation: placement?.elevation ?? design.elevations[0] ?? 'front',
    mirror: placement?.mirror ?? 'none',
    rotationDeg: placement?.rotationDeg ?? 0,
    parking: design.parking,
    porchFaceLenM: porchLenFt > 0 ? porchLenFt * FT_TO_M : null,
    entryAlongM: design.entry.widthFt > 0 ? design.entry.alongFt * FT_TO_M : null,
    entryWidthM: design.entry.widthFt > 0 ? design.entry.widthFt * FT_TO_M : null,
    vehicleAlongM: design.vehicle ? design.vehicle.alongFt * FT_TO_M : null,
    vehicleWidthM: design.vehicle ? design.vehicle.widthFt * FT_TO_M : null,
    placementStatus: placement?.status ?? 'placed',
    fitReason: placement?.reason ?? null,
  };
}

/**
 * Element properties every view can read for one placed (or schematic) house.
 * Persist on the pad element; scene / massing / sheets pick these up.
 */
export function placementToElementProps(
  design: HousingDesignRecord,
  placement: HousingPlacement | null,
  opts?: { schematic?: boolean; unrecoveredReason?: string },
): Record<string, unknown> {
  const schematic = opts?.schematic === true || !placement || placement.status === 'schematic';
  const status = schematic ? 'schematic' : placement!.status;
  return {
    housingDesignId: design.id,
    housingAssetVersion: design.assetVersion,
    housingElevation: placement?.elevation ?? design.elevations[0] ?? 'front',
    housingMirror: placement?.mirror ?? 'none',
    housingRotationDeg: placement?.rotationDeg ?? 0,
    housingParking: design.parking,
    housingBeds: design.beds,
    housingBaths: design.baths, // may be null
    housingHeatedSf: design.heatedSf,
    housingStories: design.stories,
    housingAttachedGarage: design.attachedGarage, // may be null
    housingPorchFace: design.porchFace,
    housingSource: design.source.citation,
    housingVerification: design.verification,
    housingPlacementStatus: status,
    housingFitReason: placement?.reason ?? opts?.unrecoveredReason ?? null,
    housingEntryAnchorFt: placement?.entryAnchorFt ?? null,
    housingVehicleAnchorFt: placement?.vehicleAnchorFt ?? null,
    // Keep legacy CubiCasa keys aligned when we know the product.
    housePlan: design.planNumber,
    houseGarage: garageFlagForDrawing(design.attachedGarage, design.parking),
    houseBeds: design.beds,
    houseBaths: design.baths ?? undefined,
    houseFootprintSf: design.heatedSf,
    floors: design.stories,
    stories: design.stories,
  };
}

/** Build HouseAccess from pad element properties (massing path). */
export function houseAccessFromProperties(
  properties: Record<string, unknown> | null | undefined,
  driveways: V2[][],
): DesignHouseAccess | undefined {
  if (!properties) return undefined;
  const designId =
    typeof properties.housingDesignId === 'string'
      ? properties.housingDesignId
      : typeof properties.housePlan === 'string'
        ? properties.housePlan
        : null;
  const design = designId ? housingDesignById(designId) : undefined;

  const engineGarage =
    typeof properties.houseGarage === 'boolean'
      ? properties.houseGarage
      : typeof properties.housingAttachedGarage === 'boolean'
        ? properties.housingAttachedGarage
        : null;
  const parking = (typeof properties.housingParking === 'string'
    ? properties.housingParking
    : design?.parking ?? 'unknown') as ParkingArrangement;

  const garage = garageFlagForDrawing(
    design?.attachedGarage ?? engineGarage,
    parking,
  );

  const catalogued =
    typeof properties.floorplanId === 'string' ||
    typeof properties.housePlan === 'string' ||
    typeof properties.housingDesignId === 'string';

  if (!catalogued && driveways.length === 0 && garage !== false) return undefined;

  const porchFt =
    design
      ? design.porchFace === 'width'
        ? design.footprint.widthFt
        : design.footprint.depthFt
      : null;

  return {
    driveways,
    garage,
    catalogued,
    designId: design?.id ?? (typeof properties.housingDesignId === 'string' ? properties.housingDesignId : null),
    assetVersion: design?.assetVersion ?? (typeof properties.housingAssetVersion === 'string' ? properties.housingAssetVersion : null),
    elevation: typeof properties.housingElevation === 'string' ? properties.housingElevation : design?.elevations[0] ?? null,
    mirror: properties.housingMirror === 'left-right' ? 'left-right' : properties.housingMirror === 'none' ? 'none' : design ? 'none' : null,
    rotationDeg: typeof properties.housingRotationDeg === 'number' ? properties.housingRotationDeg : null,
    parking,
    porchFaceLenM: porchFt != null && porchFt > 0 ? porchFt * FT_TO_M : null,
    entryAlongM: design ? design.entry.alongFt * FT_TO_M : null,
    entryWidthM: design ? design.entry.widthFt * FT_TO_M : null,
    vehicleAlongM: design?.vehicle ? design.vehicle.alongFt * FT_TO_M : null,
    vehicleWidthM: design?.vehicle ? design.vehicle.widthFt * FT_TO_M : null,
    placementStatus:
      properties.housingPlacementStatus === 'unplaced' ||
      properties.housingPlacementStatus === 'schematic' ||
      properties.housingPlacementStatus === 'placed'
        ? properties.housingPlacementStatus
        : design
          ? 'placed'
          : 'schematic',
    fitReason: typeof properties.housingFitReason === 'string' ? properties.housingFitReason : null,
  };
}

/** Session-scoped chosen design id per scheme key (`parcel|scheme`). Save path gap documented in index. */
const sessionChoices = new Map<string, string>();

export function rememberHousingChoice(schemeKey: string, designId: string): void {
  sessionChoices.set(schemeKey, designId);
}

export function recalledHousingChoice(schemeKey: string): string | null {
  return sessionChoices.get(schemeKey) ?? null;
}

export function clearHousingChoices(): void {
  sessionChoices.clear();
}
