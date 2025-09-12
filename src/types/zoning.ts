export interface ZoningRule {
  id: string;
  name: string;
  description: string;
  category: 'setback' | 'height' | 'coverage' | 'far' | 'parking' | 'density';
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
  parcels: any[];
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