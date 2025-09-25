// Regrid Standardized Zoning Schema Interface
import { SelectedParcel } from './parcel';
export interface RegridZoningData {
  // Core Zoning Identification & Description
  zoning_id?: number;
  zoning: string;
  zoning_description?: string;
  zoning_type?: string;
  zoning_subtype?: string;
  zoning_objective?: string;
  zoning_code_link?: string;

  // Permitted Land Uses
  permitted_land_uses?: Record<string, string[]>; // JSON object
  permitted_land_uses_as_of_right?: string; // Comma-separated flags
  permitted_land_uses_conditional?: string; // Comma-separated flags

  // Lot & Building Dimensions/Regulations
  min_lot_area_sq_ft?: number;
  min_lot_width_ft?: number;
  max_building_height_ft?: number;
  max_far?: number;
  min_front_setback_ft?: number;
  min_rear_setback_ft?: number;
  min_side_setback_ft?: number;

  // Coverage & Density Regulations
  max_coverage_pct?: number;
  max_impervious_coverage_pct?: number;
  min_landscaped_space_pct?: number;
  min_open_space_pct?: number;
  max_density_du_per_acre?: number;

  // Administrative & Geographic Information
  zoning_data_date?: string;
  municipality_id?: number;
  municipality_name?: string;
  geoid?: string;
}

export interface ZoningRule {
  id: string;
  name: string;
  description: string;
  category: 'setback' | 'height' | 'coverage' | 'far' | 'parking' | 'density' | 'lot_size' | 'land_use';
  value: number;
  unit: string;
  enforced: boolean;
}

export interface ZoningViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  category: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  currentValue: number;
  requiredValue: number;
  unit: string;
  affectedArea?: string;
  coordinates?: number[][];
}

export interface ZoningCompliance {
  isCompliant: boolean;
  violations: ZoningViolation[];
  warnings: ZoningViolation[];
  compliance: {
    setbacks: ComplianceStatus;
    height: ComplianceStatus;
    coverage: ComplianceStatus;
    far: ComplianceStatus;
    parking: ComplianceStatus;
    density: ComplianceStatus;
  };
}

export interface ComplianceStatus {
  status: 'compliant' | 'violation' | 'warning' | 'unknown';
  currentValue: number;
  requiredValue: number;
  utilizationPercentage: number;
  message: string;
}

export interface SpatialFeature {
  id: string;
  type: 'building' | 'setback' | 'easement' | 'utility' | 'access' | 'open-space' | 'parking';
  coordinates: number[][];
  properties: {
    name: string;
    description?: string;
    dimensions?: {
      length: number;
      width: number;
      area: number;
      perimeter: number;
    };
    constraints?: string[];
  };
}

export interface SitePlanData {
  id: string;
  parcels: SelectedParcel[];
  features: SpatialFeature[];
  compliance: ZoningCompliance;
  metadata: {
    scale: number;
    orientation: number;
    coordinateSystem: string;
    accuracy: string;
    generatedAt: Date;
    version: string;
  };
}

export interface ProfessionalSitePlan {
  title: string;
  projectInfo: {
    name: string;
    address: string;
    parcelNumbers: string[];
    developer: string;
    architect?: string;
    engineer?: string;
  };
  sitePlan: SitePlanData;
  complianceReport: ZoningCompliance;
  sheets: {
    coverSheet: boolean;
    sitePlan: boolean;
    zoningCompliance: boolean;
    details: boolean;
  };
}