// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

export interface ComplianceResult {
  far: {
    compliant: boolean;
    actual: number;
    required: number;
    message: string;
  };
  parking: {
    compliant: boolean;
    actual: number;
    required: number;
    message: string;
  };
  setbacks: {
    compliant: boolean;
    front: boolean;
    side: boolean;
    rear: boolean;
    message: string;
  };
  coverage: {
    compliant: boolean;
    actual: number;
    required: number;
    message: string;
  };
  overall_compliant: boolean;
  score: number;
}

export interface ComplianceParams {
  parcel_area_sqft: number;
  building_area_sqft: number;
  parking_area_sqft: number;
  total_building_area_sqft: number;
  zoning_requirements: {
    max_far?: number;
    max_coverage?: number;
    min_parking_ratio?: number;
    front_setback_ft?: number;
    side_setback_ft?: number;
    rear_setback_ft?: number;
  };
  building_bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  parcel_bounds?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

/**
 * Check FAR (Floor Area Ratio) compliance
 */
function checkFARCompliance(
  building_area_sqft: number,
  parcel_area_sqft: number,
  max_far: number = 0.6
): { compliant: boolean; actual: number; required: number; message: string } {
  const actual_far = building_area_sqft / parcel_area_sqft;
  const compliant = actual_far <= max_far;
  
  return {
    compliant,
    actual: actual_far,
    required: max_far,
    message: compliant 
      ? `FAR compliant: ${(actual_far * 100).toFixed(1)}% (max ${(max_far * 100).toFixed(1)}%)`
      : `FAR violation: ${(actual_far * 100).toFixed(1)}% exceeds max ${(max_far * 100).toFixed(1)}%`
  };
}

/**
 * Check parking ratio compliance
 */
function checkParkingCompliance(
  parking_area_sqft: number,
  building_area_sqft: number,
  min_parking_ratio: number = 0.3
): { compliant: boolean; actual: number; required: number; message: string } {
  const actual_ratio = parking_area_sqft / building_area_sqft;
  const compliant = actual_ratio >= min_parking_ratio;
  
  return {
    compliant,
    actual: actual_ratio,
    required: min_parking_ratio,
    message: compliant
      ? `Parking compliant: ${(actual_ratio * 100).toFixed(1)}% (min ${(min_parking_ratio * 100).toFixed(1)}%)`
      : `Parking violation: ${(actual_ratio * 100).toFixed(1)}% below min ${(min_parking_ratio * 100).toFixed(1)}%`
  };
}

/**
 * Check setback compliance
 */
function checkSetbackCompliance(
  building_bounds: { minX: number; minY: number; maxX: number; maxY: number },
  parcel_bounds: { minX: number; minY: number; maxX: number; maxY: number },
  front_setback_ft: number = 20,
  side_setback_ft: number = 10,
  rear_setback_ft: number = 20
): { compliant: boolean; front: boolean; side: boolean; rear: boolean; message: string } {
  // Convert feet to SVG units (assuming 12 SVG units per foot)
  const front_setback_svg = front_setback_ft * 12;
  const side_setback_svg = side_setback_ft * 12;
  const rear_setback_svg = rear_setback_ft * 12;
  
  // Check front setback (distance from front of parcel to front of building)
  const front_distance = building_bounds.minY - parcel_bounds.minY;
  const front_compliant = front_distance >= front_setback_svg;
  
  // Check rear setback (distance from rear of building to rear of parcel)
  const rear_distance = parcel_bounds.maxY - building_bounds.maxY;
  const rear_compliant = rear_distance >= rear_setback_svg;
  
  // Check side setbacks (distance from sides of parcel to sides of building)
  const left_distance = building_bounds.minX - parcel_bounds.minX;
  const right_distance = parcel_bounds.maxX - building_bounds.maxX;
  const side_compliant = left_distance >= side_setback_svg && right_distance >= side_setback_svg;
  
  const compliant = front_compliant && rear_compliant && side_compliant;
  
  let message = '';
  if (compliant) {
    message = 'All setbacks compliant';
  } else {
    const violations = [];
    if (!front_compliant) violations.push('front');
    if (!rear_compliant) violations.push('rear');
    if (!side_compliant) violations.push('side');
    message = `Setback violations: ${violations.join(', ')}`;
  }
  
  return {
    compliant,
    front: front_compliant,
    side: side_compliant,
    rear: rear_compliant,
    message
  };
}

/**
 * Check coverage compliance
 */
function checkCoverageCompliance(
  total_building_area_sqft: number,
  parcel_area_sqft: number,
  max_coverage: number = 0.8
): { compliant: boolean; actual: number; required: number; message: string } {
  const actual_coverage = total_building_area_sqft / parcel_area_sqft;
  const compliant = actual_coverage <= max_coverage;
  
  return {
    compliant,
    actual: actual_coverage,
    required: max_coverage,
    message: compliant
      ? `Coverage compliant: ${(actual_coverage * 100).toFixed(1)}% (max ${(max_coverage * 100).toFixed(1)}%)`
      : `Coverage violation: ${(actual_coverage * 100).toFixed(1)}% exceeds max ${(max_coverage * 100).toFixed(1)}%`
  };
}

/**
 * Perform comprehensive compliance check
 */
export function checkCompliance(params: ComplianceParams): ComplianceResult {
  const {
    parcel_area_sqft,
    building_area_sqft,
    parking_area_sqft,
    total_building_area_sqft,
    zoning_requirements,
    building_bounds,
    parcel_bounds
  } = params;

  // Check FAR compliance
  const far = checkFARCompliance(
    building_area_sqft,
    parcel_area_sqft,
    zoning_requirements.max_far
  );

  // Check parking compliance
  const parking = checkParkingCompliance(
    parking_area_sqft,
    building_area_sqft,
    zoning_requirements.min_parking_ratio
  );

  // Check setback compliance
  const setbacks = building_bounds && parcel_bounds 
    ? checkSetbackCompliance(
        building_bounds,
        parcel_bounds,
        zoning_requirements.front_setback_ft,
        zoning_requirements.side_setback_ft,
        zoning_requirements.rear_setback_ft
      )
    : { compliant: true, front: true, side: true, rear: true, message: 'Setback check skipped - no bounds provided' };

  // Check coverage compliance
  const coverage = checkCoverageCompliance(
    total_building_area_sqft,
    parcel_area_sqft,
    zoning_requirements.max_coverage
  );

  // Calculate overall compliance
  const overall_compliant = far.compliant && parking.compliant && setbacks.compliant && coverage.compliant;

  // Calculate compliance score (0-100)
  let score = 0;
  if (far.compliant) score += 25;
  if (parking.compliant) score += 25;
  if (setbacks.compliant) score += 25;
  if (coverage.compliant) score += 25;

  return {
    far,
    parking,
    setbacks,
    coverage,
    overall_compliant,
    score
  };
}
