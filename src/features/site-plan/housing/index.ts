/**
 * Housing design catalogue — first vertical slice (Delk cottage).
 *
 * ## Gaps vs the Nov 22 Housing design brief (audit)
 *
 * CubiCasa catalogue (~4982 fits) still drives engine `houses[]`. Only ~211
 * rows carry a garage flag; `fn_sf_v1_house_fit` estimates size from doors;
 * baths can arrive as 0. The exterior builder previously reduced identity to
 * `catalogued: boolean` and treated unknown garage as “grow a garage if a
 * driveway meets the wall.” Front came from driveway / nearby pavement, so a
 * rear alley could drive the entry. This module fixes the selection→drawing
 * handoff for an explicit product record before expanding paint/roof menus.
 *
 * ## Save gap
 *
 * Chosen design id is kept on pad element properties (`housingDesignId`, …)
 * and in a session map (`rememberHousingChoice`). Persisting it on a saved
 * MF/SF candidate without a large scheme-schema refactor is not wired yet —
 * reopen a saved revision and the CubiCasa plan id returns unless the pad
 * properties were stored with the elements.
 *
 * ## Still schematic
 *
 * Materials, CubiCasa reuse, The Lanes Unit A assets, photographic acceptance,
 * and native 4K elevation packs are out of this slice.
 */
export type {
  DesignFitResult,
  DesignFootprintFloor,
  DesignRights,
  DesignThreshold,
  DesignVerificationStatus,
  HousingDesignRecord,
  HousingPlacement,
  LotFitInput,
  ParkingArrangement,
  PlacementStatus,
  PorchFace,
} from './types';

export {
  ABHP_110_00108,
  ABHP_110_00220,
  ABHP_340_00011,
  ABHP_4848_00368,
  ABHP_526_00030,
  ABHP_526_00035,
  ABHP_526_00051,
  ABHP_5633_00014,
  ABHP_5633_00022,
  ABHP_5633_00340,
  ABHP_5633_00358,
  ABHP_5633_00365,
  ABHP_5633_00366,
  DELK_BASELINE_REVISION,
  DELK_COTTAGE_1754_00010,
  DELK_COTTAGE_ID,
  DELK_PARCEL_ID,
  HOUSING_CATALOGUE,
  LANES_UNIT_A_STUB,
  allowSfStockPlans,
  buildableStockPlans,
  designsForParcel,
  housingDesignById,
} from './catalogue';

export { fitDelkCottage, fitDesignToLot, isDelkCottageCandidate } from './fit';

export type { DesignHouseAccess } from './handoff';
export {
  clearHousingChoices,
  designToHouseAccess,
  garageFlagForDrawing,
  houseAccessFromProperties,
  placementToElementProps,
  recalledHousingChoice,
  rememberHousingChoice,
} from './handoff';

export { applyHousingDesign, lotsFromElements, ring3857ToFeet, sfLotElements } from './apply';
export type { ApplyHousingResult } from './apply';
