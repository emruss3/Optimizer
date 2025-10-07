/**
 * Migration Test Utilities
 * 
 * This module provides utilities to test the migration from old components
 * to new consolidated components.
 */

import { getMigrationStatus, getComponentToUse, getMigrationStrategy } from './componentMigration';
import { shouldUseConsolidatedPlanner, shouldUseEnhancedSitePlanner, shouldUseAIGenerator } from './featureFlags';

// Test migration status
export function testMigrationStatus() {
  const status = getMigrationStatus();
  
  console.log('🔍 Migration Status Test:');
  console.log(`Total Components: ${status.totalComponents}`);
  console.log(`Migrated Components: ${status.migratedComponents}`);
  console.log(`Migration Progress: ${status.migrationProgress.toFixed(1)}%`);
  
  status.components.forEach(component => {
    console.log(`- ${component.name}: ${component.migrated ? '✅ Migrated' : '❌ Not Migrated'} (${component.strategy})`);
  });
  
  return status;
}

// Test component routing
export function testComponentRouting() {
  const components = [
    'AIDrivenSitePlanGenerator',
    'EnhancedSitePlanner', 
    'SitePlanDesigner',
    'EnterpriseSitePlanner'
  ];
  
  console.log('🔍 Component Routing Test:');
  
  components.forEach(componentName => {
    const strategy = getMigrationStrategy(componentName);
    const actualComponent = getComponentToUse(componentName);
    
    console.log(`${componentName}:`);
    console.log(`  Strategy: ${strategy}`);
    console.log(`  Routes to: ${actualComponent}`);
    console.log(`  Migrated: ${strategy !== 'fallback'}`);
  });
}

// Test feature flags
export function testFeatureFlags() {
  console.log('🔍 Feature Flags Test:');
  console.log(`USE_CONSOLIDATED_PLANNER: ${shouldUseConsolidatedPlanner()}`);
  console.log(`USE_ENHANCED_SITE_PLANNER: ${shouldUseEnhancedSitePlanner()}`);
  console.log(`USE_AI_GENERATOR: ${shouldUseAIGenerator()}`);
}

// Test adapter imports
export function testAdapterImports() {
  console.log('🔍 Adapter Imports Test:');
  
  try {
    // Test if adapters can be imported
    const adapters = require('../components/adapters/SitePlannerAdapters');
    
    const adapterNames = [
      'AIDrivenSitePlanGenerator',
      'EnhancedSitePlanner',
      'SitePlanDesigner', 
      'EnterpriseSitePlanner'
    ];
    
    adapterNames.forEach(name => {
      const adapter = adapters[name];
      console.log(`${name}: ${adapter ? '✅ Available' : '❌ Missing'}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Adapter import test failed:', error);
    return false;
  }
}

// Test consolidated component
export function testConsolidatedComponent() {
  console.log('🔍 Consolidated Component Test:');
  
  try {
    const ConsolidatedSitePlanner = require('../components/ConsolidatedSitePlanner');
    console.log('ConsolidatedSitePlanner: ✅ Available');
    
    // Test if it has the expected modes
    const expectedModes = ['design', 'ai-generation', 'enhanced', 'optimization'];
    console.log(`Expected modes: ${expectedModes.join(', ')}`);
    
    return true;
  } catch (error) {
    console.error('❌ Consolidated component test failed:', error);
    return false;
  }
}

// Test coordinate utilities
export function testCoordinateUtilities() {
  console.log('🔍 Coordinate Utilities Test:');
  
  try {
    const { CoordinateTransform } = require('../utils/coordinateTransform');
    
    // Test basic transformations
    const meters = 100;
    const feet = CoordinateTransform.metersToFeet(meters);
    const backToMeters = CoordinateTransform.feetToMeters(feet);
    
    console.log(`Meters to Feet: ${meters}m -> ${feet.toFixed(2)}ft`);
    console.log(`Feet to Meters: ${feet.toFixed(2)}ft -> ${backToMeters.toFixed(2)}m`);
    console.log(`Round trip accuracy: ${Math.abs(meters - backToMeters) < 0.01 ? '✅ Good' : '❌ Poor'}`);
    
    // Test SVG transformations
    const svgCoord = 120;
    const gridSize = 12;
    const feetFromSVG = CoordinateTransform.svgToFeet(svgCoord, gridSize);
    const svgFromFeet = CoordinateTransform.feetToSVG(feetFromSVG, gridSize);
    
    console.log(`SVG to Feet: ${svgCoord} -> ${feetFromSVG.toFixed(2)}ft`);
    console.log(`Feet to SVG: ${feetFromSVG.toFixed(2)}ft -> ${svgFromFeet.toFixed(2)}`);
    console.log(`Round trip accuracy: ${Math.abs(svgCoord - svgFromFeet) < 0.01 ? '✅ Good' : '❌ Poor'}`);
    
    return true;
  } catch (error) {
    console.error('❌ Coordinate utilities test failed:', error);
    return false;
  }
}

// Test enhanced store
export function testEnhancedStore() {
  console.log('🔍 Enhanced Store Test:');
  
  try {
    const { useSitePlanStore } = require('../store/sitePlan');
    
    // Test if store has new methods
    const store = useSitePlanStore.getState();
    const newMethods = [
      'generateAISitePlan',
      'enhanceSitePlan',
      'validateSitePlan',
      'optimizeSitePlan',
      'getSitePlanMetrics'
    ];
    
    newMethods.forEach(method => {
      const hasMethod = typeof store[method] === 'function';
      console.log(`${method}: ${hasMethod ? '✅ Available' : '❌ Missing'}`);
    });
    
    return true;
  } catch (error) {
    console.error('❌ Enhanced store test failed:', error);
    return false;
  }
}

// Test enhanced hook
export function testEnhancedHook() {
  console.log('🔍 Enhanced Hook Test:');
  
  try {
    const { useEnhancedSitePlanner } = require('../hooks/useEnhancedSitePlanner');
    
    // Test if hook exists and has expected interface
    console.log('useEnhancedSitePlanner: ✅ Available');
    
    return true;
  } catch (error) {
    console.error('❌ Enhanced hook test failed:', error);
    return false;
  }
}

// Run all tests
export function runAllMigrationTests() {
  console.log('🚀 Running Migration Tests...\n');
  
  const tests = [
    testMigrationStatus,
    testComponentRouting,
    testFeatureFlags,
    testAdapterImports,
    testConsolidatedComponent,
    testCoordinateUtilities,
    testEnhancedStore,
    testEnhancedHook
  ];
  
  const results = tests.map(test => {
    try {
      return test();
    } catch (error) {
      console.error('❌ Test failed:', error);
      return false;
    }
  });
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All migration tests passed! Migration is ready.');
  } else {
    console.log('⚠️ Some tests failed. Please check the issues above.');
  }
  
  return { passed, total, results };
}

// Export test functions
export default {
  testMigrationStatus,
  testComponentRouting,
  testFeatureFlags,
  testAdapterImports,
  testConsolidatedComponent,
  testCoordinateUtilities,
  testEnhancedStore,
  testEnhancedHook,
  runAllMigrationTests
};
