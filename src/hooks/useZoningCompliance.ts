import { useState, useMemo, useCallback } from 'react';
import { useRef, useEffect } from 'react';
import { useRef, useEffect } from 'react';
import { ZoningCompliance, ZoningViolation, ComplianceStatus, ZoningRule } from '../types/zoning';
import { SelectedParcel, BuildingMassing, SiteplanConfig } from '../types/project';
import { supabase } from '../lib/supabase';

// Debounce utility with cleanup
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T & { cancel: () => void } {
  let timeout: NodeJS.Timeout | null = null;
  
  const debounced = ((...args: any[]) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T & { cancel: () => void };
  
  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };
  
  return debounced;
}

export function useZoningCompliance(
  parcels: SelectedParcel[],
  massing: BuildingMassing | null,
  config: SiteplanConfig
) {
  const [customRules, setCustomRules] = useState<Partial<ZoningRule>>({});
  const [debouncedCompliance, setDebouncedCompliance] = useState<ZoningCompliance | null>(null);
  const debounceRef = useRef<((compliance: ZoningCompliance | null) => void) & { cancel: () => void }>();

  // Calculate effective zoning rules from all parcels
  const effectiveZoningRules = useMemo(() => {
    if (parcels.length === 0) return null;

    // For multiple parcels, use most restrictive rules
    return {
      maxFAR: Math.min(...parcels.map(p => p.max_far || 3.0)),
      maxHeight: Math.min(...parcels.map(p => p.max_height_ft || 45)),
      maxCoverage: Math.min(...parcels.map(p => p.max_coverage_pct || 40)),
      frontSetback: Math.max(...parcels.map(p => p.min_front_setback_ft || 25)),
      rearSetback: Math.max(...parcels.map(p => p.min_rear_setback_ft || 20)),
      sideSetback: Math.max(...parcels.map(p => p.min_side_setback_ft || 10)),
      parkingRatio: getParkingRequirement(parcels[0]?.zoning),
      densityLimit: getDensityLimit(parcels[0]?.zoning)
    };
  }, [parcels]);

  // Real-time compliance checking (immediate calculation)
  const calculateCompliance = useCallback((): ZoningCompliance | null => {
    if (!parcels.length || !massing || !effectiveZoningRules) return null;

    const violations: ZoningViolation[] = [];
    const warnings: ZoningViolation[] = [];

    // Calculate total site area
    const totalSiteArea = parcels.reduce((sum, p) => sum + p.sqft, 0);
    const totalAcreage = totalSiteArea / 43560;

    // Check FAR compliance
    const currentFAR = massing.totalGSF / totalSiteArea;
    const farCompliance: ComplianceStatus = {
      status: currentFAR <= effectiveZoningRules.maxFAR ? 'compliant' : 'violation',
      currentValue: currentFAR,
      requiredValue: effectiveZoningRules.maxFAR,
      utilizationPercentage: (currentFAR / effectiveZoningRules.maxFAR) * 100,
      message: `Current FAR: ${currentFAR.toFixed(2)}, Maximum: ${effectiveZoningRules.maxFAR}`
    };

    if (farCompliance.status === 'violation') {
      violations.push({
        id: 'far-violation',
        ruleId: 'max-far',
        ruleName: 'Floor Area Ratio',
        category: 'far',
        severity: 'error',
        message: `FAR of ${currentFAR.toFixed(2)} exceeds maximum of ${effectiveZoningRules.maxFAR}`,
        currentValue: currentFAR,
        requiredValue: effectiveZoningRules.maxFAR,
        unit: 'ratio'
      });
    } else if (farCompliance.utilizationPercentage > 90) {
      warnings.push({
        id: 'far-warning',
        ruleId: 'max-far',
        ruleName: 'Floor Area Ratio',
        category: 'far',
        severity: 'warning',
        message: `FAR utilization at ${farCompliance.utilizationPercentage.toFixed(1)}% - approaching limit`,
        currentValue: currentFAR,
        requiredValue: effectiveZoningRules.maxFAR,
        unit: 'ratio'
      });
    }

    // Check height compliance
    const heightCompliance: ComplianceStatus = {
      status: massing.height <= effectiveZoningRules.maxHeight ? 'compliant' : 'violation',
      currentValue: massing.height,
      requiredValue: effectiveZoningRules.maxHeight,
      utilizationPercentage: (massing.height / effectiveZoningRules.maxHeight) * 100,
      message: `Current height: ${massing.height}ft, Maximum: ${effectiveZoningRules.maxHeight}ft`
    };

    if (heightCompliance.status === 'violation') {
      violations.push({
        id: 'height-violation',
        ruleId: 'max-height',
        ruleName: 'Building Height',
        category: 'height',
        severity: 'error',
        message: `Building height of ${massing.height}ft exceeds maximum of ${effectiveZoningRules.maxHeight}ft`,
        currentValue: massing.height,
        requiredValue: effectiveZoningRules.maxHeight,
        unit: 'feet'
      });
    }

    // Check coverage compliance
    const coverageCompliance: ComplianceStatus = {
      status: massing.coverage <= effectiveZoningRules.maxCoverage ? 'compliant' : 'violation',
      currentValue: massing.coverage,
      requiredValue: effectiveZoningRules.maxCoverage,
      utilizationPercentage: (massing.coverage / effectiveZoningRules.maxCoverage) * 100,
      message: `Current coverage: ${massing.coverage.toFixed(1)}%, Maximum: ${effectiveZoningRules.maxCoverage}%`
    };

    if (coverageCompliance.status === 'violation') {
      violations.push({
        id: 'coverage-violation',
        ruleId: 'max-coverage',
        ruleName: 'Site Coverage',
        category: 'coverage',
        severity: 'error',
        message: `Site coverage of ${massing.coverage.toFixed(1)}% exceeds maximum of ${effectiveZoningRules.maxCoverage}%`,
        currentValue: massing.coverage,
        requiredValue: effectiveZoningRules.maxCoverage,
        unit: 'percentage'
      });
    }

    // Check setback compliance
    const setbackCompliance = checkSetbackCompliance(config.buildingSetbacks, effectiveZoningRules, violations);

    // Check parking compliance
    const parkingCompliance = checkParkingCompliance(massing, effectiveZoningRules, violations);

    // Check density compliance
    const densityCompliance = checkDensityCompliance(massing, totalAcreage, effectiveZoningRules, violations);

    return {
      isCompliant: violations.length === 0,
      violations,
      warnings,
      compliance: {
        setbacks: setbackCompliance,
        height: heightCompliance,
        coverage: coverageCompliance,
        far: farCompliance,
        parking: parkingCompliance,
        density: densityCompliance
      }
    };
  }, [parcels, massing, config, effectiveZoningRules]);

  // Debounced compliance calculation
  useEffect(() => {
    if (!debounceRef.current) {
      debounceRef.current = debounce((compliance: ZoningCompliance | null) => {
        setDebouncedCompliance(compliance);
      }, 150);
    }
    
    const compliance = calculateCompliance();
    debounceRef.current(compliance);
    
    return () => {
      if (debounceRef.current) {
        debounceRef.current.cancel();
      }
    };
  }, [calculateCompliance]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        debounceRef.current.cancel();
      }
    };
  }, []);

  const validateChange = useCallback((changeType: string, newValue: number) => {
    if (!effectiveZoningRules) return { valid: true, message: '' };

    switch (changeType) {
      case 'height':
        return {
          valid: newValue <= effectiveZoningRules.maxHeight,
          message: newValue > effectiveZoningRules.maxHeight 
            ? `Height of ${newValue}ft exceeds maximum of ${effectiveZoningRules.maxHeight}ft`
            : ''
        };
      case 'far':
        return {
          valid: newValue <= effectiveZoningRules.maxFAR,
          message: newValue > effectiveZoningRules.maxFAR 
            ? `FAR of ${newValue} exceeds maximum of ${effectiveZoningRules.maxFAR}`
            : ''
        };
      case 'coverage':
        return {
          valid: newValue <= effectiveZoningRules.maxCoverage,
          message: newValue > effectiveZoningRules.maxCoverage 
            ? `Coverage of ${newValue}% exceeds maximum of ${effectiveZoningRules.maxCoverage}%`
            : ''
        };
      default:
        return { valid: true, message: '' };
    }
  }, [effectiveZoningRules]);

  return {
    compliance: debouncedCompliance,
    effectiveZoningRules,
    validateChange,
    customRules,
    setCustomRules
  };
}

// Helper functions
function checkSetbackCompliance(
  buildingSetbacks: any,
  rules: any,
  violations: ZoningViolation[]
): ComplianceStatus {
  const setbackViolations = [];

  if (buildingSetbacks.front < rules.frontSetback) {
    violations.push({
      id: 'front-setback-violation',
      ruleId: 'min-front-setback',
      ruleName: 'Front Setback',
      category: 'setback',
      severity: 'error',
      message: `Front setback of ${buildingSetbacks.front}ft is less than required ${rules.frontSetback}ft`,
      currentValue: buildingSetbacks.front,
      requiredValue: rules.frontSetback,
      unit: 'feet'
    });
    setbackViolations.push('front');
  }

  if (buildingSetbacks.rear < rules.rearSetback) {
    violations.push({
      id: 'rear-setback-violation',
      ruleId: 'min-rear-setback',
      ruleName: 'Rear Setback',
      category: 'setback',
      severity: 'error',
      message: `Rear setback of ${buildingSetbacks.rear}ft is less than required ${rules.rearSetback}ft`,
      currentValue: buildingSetbacks.rear,
      requiredValue: rules.rearSetback,
      unit: 'feet'
    });
    setbackViolations.push('rear');
  }

  if (buildingSetbacks.side < rules.sideSetback) {
    violations.push({
      id: 'side-setback-violation',
      ruleId: 'min-side-setback',
      ruleName: 'Side Setback',
      category: 'setback',
      severity: 'error',
      message: `Side setback of ${buildingSetbacks.side}ft is less than required ${rules.sideSetback}ft`,
      currentValue: buildingSetbacks.side,
      requiredValue: rules.sideSetback,
      unit: 'feet'
    });
    setbackViolations.push('side');
  }

  return {
    status: setbackViolations.length === 0 ? 'compliant' : 'violation',
    currentValue: Math.min(buildingSetbacks.front, buildingSetbacks.rear, buildingSetbacks.side),
    requiredValue: Math.min(rules.frontSetback, rules.rearSetback, rules.sideSetback),
    utilizationPercentage: 100,
    message: setbackViolations.length === 0 
      ? 'All setbacks meet requirements'
      : `Setback violations: ${setbackViolations.join(', ')}`
  };
}

function checkParkingCompliance(
  massing: BuildingMassing,
  rules: any,
  violations: ZoningViolation[]
): ComplianceStatus {
  const requiredSpaces = Math.ceil((massing.units || 0) * rules.parkingRatio);
  const providedSpaces = massing.parkingSpaces || 0;

  if (providedSpaces < requiredSpaces) {
    violations.push({
      id: 'parking-violation',
      ruleId: 'min-parking',
      ruleName: 'Parking Requirement',
      category: 'parking',
      severity: 'error',
      message: `${providedSpaces} parking spaces provided, ${requiredSpaces} required`,
      currentValue: providedSpaces,
      requiredValue: requiredSpaces,
      unit: 'spaces'
    });
  }

  return {
    status: providedSpaces >= requiredSpaces ? 'compliant' : 'violation',
    currentValue: providedSpaces,
    requiredValue: requiredSpaces,
    utilizationPercentage: requiredSpaces > 0 ? (providedSpaces / requiredSpaces) * 100 : 100,
    message: `${providedSpaces} spaces provided, ${requiredSpaces} required`
  };
}

function checkDensityCompliance(
  massing: BuildingMassing,
  totalAcreage: number,
  rules: any,
  violations: ZoningViolation[]
): ComplianceStatus {
  const currentDensity = (massing.units || 0) / totalAcreage;
  const maxDensity = rules.densityLimit;

  if (currentDensity > maxDensity) {
    violations.push({
      id: 'density-violation',
      ruleId: 'max-density',
      ruleName: 'Density Limit',
      category: 'density',
      severity: 'error',
      message: `Density of ${currentDensity.toFixed(1)} units/acre exceeds maximum of ${maxDensity} units/acre`,
      currentValue: currentDensity,
      requiredValue: maxDensity,
      unit: 'units/acre'
    });
  }

  return {
    status: currentDensity <= maxDensity ? 'compliant' : 'violation',
    currentValue: currentDensity,
    requiredValue: maxDensity,
    utilizationPercentage: (currentDensity / maxDensity) * 100,
    message: `${currentDensity.toFixed(1)} units/acre, max ${maxDensity} units/acre`
  };
}

function getParkingRequirement(zoning: string): number {
  // Nashville parking requirements by zoning
  const parkingRules: Record<string, number> = {
    'RS5': 2.0, 'RS7.5': 2.0, 'RS10': 2.0, 'RS15': 2.0, 'RS20': 2.0, 'RS30': 2.0, 'RS40': 2.0,
    'R6': 1.5, 'R8': 1.2, 'R10': 1.0, 'R15': 1.0, 'R20': 1.0, 'R30': 1.0,
    'RM2': 1.2, 'RM4': 1.0, 'RM6': 1.0, 'RM9': 0.8, 'RM15': 0.8, 'RM20': 0.5, 'RM40': 0.5, 'RM60': 0.5, 'RM80': 0.5
  };
  return parkingRules[zoning] || 1.2;
}

function getDensityLimit(zoning: string): number {
  // Nashville density limits by zoning
  const densityLimits: Record<string, number> = {
    'RS5': 8.7, 'RS7.5': 5.8, 'RS10': 4.4, 'RS15': 2.9, 'RS20': 2.2, 'RS30': 1.5, 'RS40': 1.1,
    'R6': 6.0, 'R8': 8.0, 'R10': 10.0, 'R15': 15.0, 'R20': 20.0, 'R30': 30.0,
    'RM2': 2.0, 'RM4': 4.0, 'RM6': 6.0, 'RM9': 9.0, 'RM15': 15.0, 'RM20': 20.0, 'RM40': 40.0, 'RM60': 60.0, 'RM80': 80.0
  };
  return densityLimits[zoning] || 20.0;
}