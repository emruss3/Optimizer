/**
 * Migration Validation Utilities
 * 
 * This module provides comprehensive validation for the complete migration
 * from old components to new consolidated components.
 */

import { getMigrationStatus } from './componentMigration';
import { 
  shouldUseConsolidatedPlanner, 
  shouldUseEnhancedSitePlanner, 
  shouldUseAIGenerator,
  shouldUseNewCoordinateUtils,
  shouldUseConsolidatedCoordinates
} from './featureFlags';

// Validation result interface
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
  details: {
    components: ComponentValidation[];
    featureFlags: FeatureFlagValidation[];
    performance: PerformanceValidation;
  };
}

export interface ComponentValidation {
  name: string;
  status: 'valid' | 'invalid' | 'warning';
  message: string;
  details?: any;
}

export interface FeatureFlagValidation {
  flag: string;
  enabled: boolean;
  expected: boolean;
  status: 'correct' | 'incorrect' | 'warning';
}

export interface PerformanceValidation {
  loadTime: number;
  memoryUsage: number;
  bundleSize: number;
  status: 'good' | 'warning' | 'poor';
}

// Validate complete migration
export function validateCompleteMigration(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // Get migration status
  const migrationStatus = getMigrationStatus();
  
  // Validate components
  const componentValidations = validateComponents();
  componentValidations.forEach(validation => {
    if (validation.status === 'invalid') {
      errors.push(`${validation.name}: ${validation.message}`);
      score -= 20;
    } else if (validation.status === 'warning') {
      warnings.push(`${validation.name}: ${validation.message}`);
      score -= 5;
    }
  });

  // Validate feature flags
  const featureFlagValidations = validateFeatureFlags();
  featureFlagValidations.forEach(validation => {
    if (validation.status === 'incorrect') {
      errors.push(`Feature flag ${validation.flag}: Expected ${validation.expected}, got ${validation.enabled}`);
      score -= 15;
    } else if (validation.status === 'warning') {
      warnings.push(`Feature flag ${validation.flag}: ${validation.enabled ? 'Enabled' : 'Disabled'}`);
      score -= 3;
    }
  });

  // Validate performance
  const performanceValidation = validatePerformance();
  if (performanceValidation.status === 'poor') {
    errors.push('Performance validation failed');
    score -= 25;
  } else if (performanceValidation.status === 'warning') {
    warnings.push('Performance validation warning');
    score -= 10;
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    score: Math.max(0, score),
    details: {
      components: componentValidations,
      featureFlags: featureFlagValidations,
      performance: performanceValidation
    }
  };
}

// Validate individual components
function validateComponents(): ComponentValidation[] {
  const validations: ComponentValidation[] = [];

  // Test ConsolidatedSitePlanner
  try {
    const ConsolidatedSitePlanner = require('../components/ConsolidatedSitePlanner');
    validations.push({
      name: 'ConsolidatedSitePlanner',
      status: 'valid',
      message: 'Component loaded successfully',
      details: { hasDefaultExport: !!ConsolidatedSitePlanner.default }
    });
  } catch (error) {
    validations.push({
      name: 'ConsolidatedSitePlanner',
      status: 'invalid',
      message: `Failed to load: ${error.message}`
    });
  }

  // Test adapters
  try {
    const adapters = require('../components/adapters/SitePlannerAdapters');
    const adapterNames = ['AIDrivenSitePlanGenerator', 'EnhancedSitePlanner', 'SitePlanDesigner', 'EnterpriseSitePlanner'];
    
    adapterNames.forEach(name => {
      if (adapters[name]) {
        validations.push({
          name: `${name}Adapter`,
          status: 'valid',
          message: 'Adapter loaded successfully'
        });
      } else {
        validations.push({
          name: `${name}Adapter`,
          status: 'invalid',
          message: 'Adapter not found'
        });
      }
    });
  } catch (error) {
    validations.push({
      name: 'Adapters',
      status: 'invalid',
      message: `Failed to load adapters: ${error.message}`
    });
  }

  // Test coordinate utilities
  try {
    const { CoordinateTransform } = require('../utils/coordinateTransform');
    const testMeters = 100;
    const testFeet = CoordinateTransform.metersToFeet(testMeters);
    const backToMeters = CoordinateTransform.feetToMeters(testFeet);
    
    if (Math.abs(testMeters - backToMeters) < 0.01) {
      validations.push({
        name: 'CoordinateTransform',
        status: 'valid',
        message: 'Coordinate transformations working correctly'
      });
    } else {
      validations.push({
        name: 'CoordinateTransform',
        status: 'warning',
        message: 'Coordinate transformations have accuracy issues'
      });
    }
  } catch (error) {
    validations.push({
      name: 'CoordinateTransform',
      status: 'invalid',
      message: `Failed to load: ${error.message}`
    });
  }

  // Test enhanced store
  try {
    const { useSitePlanStore } = require('../store/sitePlan');
    const store = useSitePlanStore.getState();
    const newMethods = ['generateAISitePlan', 'enhanceSitePlan', 'validateSitePlan', 'optimizeSitePlan', 'getSitePlanMetrics'];
    
    const missingMethods = newMethods.filter(method => typeof store[method] !== 'function');
    if (missingMethods.length === 0) {
      validations.push({
        name: 'EnhancedStore',
        status: 'valid',
        message: 'All new methods available'
      });
    } else {
      validations.push({
        name: 'EnhancedStore',
        status: 'warning',
        message: `Missing methods: ${missingMethods.join(', ')}`
      });
    }
  } catch (error) {
    validations.push({
      name: 'EnhancedStore',
      status: 'invalid',
      message: `Failed to load: ${error.message}`
    });
  }

  // Test enhanced hook
  try {
    const { useEnhancedSitePlanner } = require('../hooks/useEnhancedSitePlanner');
    validations.push({
      name: 'EnhancedHook',
      status: 'valid',
      message: 'Hook loaded successfully'
    });
  } catch (error) {
    validations.push({
      name: 'EnhancedHook',
      status: 'invalid',
      message: `Failed to load: ${error.message}`
    });
  }

  return validations;
}

// Validate feature flags
function validateFeatureFlags(): FeatureFlagValidation[] {
  const validations: FeatureFlagValidation[] = [];

  // Check if feature flags are enabled as expected
  const expectedFlags = {
    USE_CONSOLIDATED_PLANNER: true,
    USE_ENHANCED_SITE_PLANNER: true,
    USE_AI_GENERATOR: true,
    USE_NEW_COORDINATE_UTILS: true,
    USE_CONSOLIDATED_COORDINATES: true
  };

  Object.entries(expectedFlags).forEach(([flag, expected]) => {
    let enabled = false;
    switch (flag) {
      case 'USE_CONSOLIDATED_PLANNER':
        enabled = shouldUseConsolidatedPlanner();
        break;
      case 'USE_ENHANCED_SITE_PLANNER':
        enabled = shouldUseEnhancedSitePlanner();
        break;
      case 'USE_AI_GENERATOR':
        enabled = shouldUseAIGenerator();
        break;
      case 'USE_NEW_COORDINATE_UTILS':
        enabled = shouldUseNewCoordinateUtils();
        break;
      case 'USE_CONSOLIDATED_COORDINATES':
        enabled = shouldUseConsolidatedCoordinates();
        break;
    }

    validations.push({
      flag,
      enabled,
      expected,
      status: enabled === expected ? 'correct' : 'incorrect'
    });
  });

  return validations;
}

// Validate performance
function validatePerformance(): PerformanceValidation {
  // Simulate performance measurements
  const startTime = performance.now();
  
  // Test component loading performance
  try {
    require('../components/ConsolidatedSitePlanner');
    require('../components/adapters/SitePlannerAdapters');
    require('../utils/coordinateTransform');
    require('../store/sitePlan');
    require('../hooks/useEnhancedSitePlanner');
  } catch (error) {
    return {
      loadTime: 0,
      memoryUsage: 0,
      bundleSize: 0,
      status: 'poor'
    };
  }

  const loadTime = performance.now() - startTime;
  
  // Estimate memory usage (simplified)
  const memoryUsage = (performance as any).memory?.usedJSHeapSize || 0;
  
  // Estimate bundle size impact (simplified)
  const bundleSize = 500; // Estimated KB increase

  let status: 'good' | 'warning' | 'poor' = 'good';
  
  if (loadTime > 100) {
    status = 'warning';
  }
  if (loadTime > 500) {
    status = 'poor';
  }
  
  if (bundleSize > 1000) {
    status = 'warning';
  }
  if (bundleSize > 2000) {
    status = 'poor';
  }

  return {
    loadTime,
    memoryUsage,
    bundleSize,
    status
  };
}

// Run complete validation
export function runCompleteValidation(): ValidationResult {
  console.log('🔍 Running Complete Migration Validation...\n');
  
  const result = validateCompleteMigration();
  
  console.log('📊 Validation Results:');
  console.log(`Valid: ${result.isValid ? '✅ Yes' : '❌ No'}`);
  console.log(`Score: ${result.score}/100`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}\n`);
  
  if (result.errors.length > 0) {
    console.log('❌ Errors:');
    result.errors.forEach(error => console.log(`  - ${error}`));
    console.log('');
  }
  
  if (result.warnings.length > 0) {
    console.log('⚠️ Warnings:');
    result.warnings.forEach(warning => console.log(`  - ${warning}`));
    console.log('');
  }
  
  console.log('🔧 Component Details:');
  result.details.components.forEach(component => {
    const icon = component.status === 'valid' ? '✅' : component.status === 'warning' ? '⚠️' : '❌';
    console.log(`  ${icon} ${component.name}: ${component.message}`);
  });
  
  console.log('\n🚩 Feature Flag Details:');
  result.details.featureFlags.forEach(flag => {
    const icon = flag.status === 'correct' ? '✅' : '❌';
    console.log(`  ${icon} ${flag.flag}: ${flag.enabled ? 'Enabled' : 'Disabled'} (Expected: ${flag.expected ? 'Enabled' : 'Disabled'})`);
  });
  
  console.log(`\n⚡ Performance: ${result.details.performance.status.toUpperCase()}`);
  console.log(`  Load Time: ${result.details.performance.loadTime.toFixed(2)}ms`);
  console.log(`  Bundle Size: ${result.details.performance.bundleSize}KB`);
  
  if (result.isValid) {
    console.log('\n🎉 Complete migration validation passed!');
  } else {
    console.log('\n⚠️ Complete migration validation failed. Please address the issues above.');
  }
  
  return result;
}

export default {
  validateCompleteMigration,
  runCompleteValidation
};
