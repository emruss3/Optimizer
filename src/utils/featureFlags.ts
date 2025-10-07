/**
 * Feature Flags for Site Planner Migration
 * 
 * This module provides feature flags to control the gradual rollout
 * of the new consolidated site planner components.
 */

// Import configuration
import { FEATURE_FLAG_CONFIG } from '../config/featureFlags.config';

// Feature flag configuration
export const FEATURE_FLAGS = {
  // Coordinate transformation flags
  USE_NEW_COORDINATE_UTILS: process.env.REACT_APP_USE_NEW_COORDINATES === 'true' || FEATURE_FLAG_CONFIG.USE_NEW_COORDINATE_UTILS,
  USE_CONSOLIDATED_COORDINATES: process.env.REACT_APP_USE_CONSOLIDATED_COORDINATES === 'true' || FEATURE_FLAG_CONFIG.USE_CONSOLIDATED_COORDINATES,
  
  // Component flags
  USE_CONSOLIDATED_PLANNER: process.env.REACT_APP_USE_CONSOLIDATED_PLANNER === 'true' || FEATURE_FLAG_CONFIG.USE_CONSOLIDATED_PLANNER,
  USE_ENHANCED_SITE_PLANNER: process.env.REACT_APP_USE_ENHANCED_SITE_PLANNER === 'true' || FEATURE_FLAG_CONFIG.USE_ENHANCED_SITE_PLANNER,
  USE_AI_GENERATOR: process.env.REACT_APP_USE_AI_GENERATOR === 'true' || FEATURE_FLAG_CONFIG.USE_AI_GENERATOR,
  
  // Migration flags
  ENABLE_ADAPTERS: process.env.REACT_APP_ENABLE_ADAPTERS === 'true' || FEATURE_FLAG_CONFIG.ENABLE_ADAPTERS,
  ENABLE_GRADUAL_MIGRATION: process.env.REACT_APP_ENABLE_GRADUAL_MIGRATION === 'true' || FEATURE_FLAG_CONFIG.ENABLE_GRADUAL_MIGRATION,
  
  // Development flags
  SHOW_DEBUG_INFO: process.env.REACT_APP_SHOW_DEBUG_INFO === 'true' || FEATURE_FLAG_CONFIG.SHOW_DEBUG_INFO,
  ENABLE_PERFORMANCE_MONITORING: process.env.REACT_APP_ENABLE_PERFORMANCE_MONITORING === 'true' || FEATURE_FLAG_CONFIG.ENABLE_PERFORMANCE_MONITORING
} as const;

// Feature flag types
export type FeatureFlag = keyof typeof FEATURE_FLAGS;

// Feature flag checker
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURE_FLAGS[flag];
}

// Coordinate transformation feature flags
export function shouldUseNewCoordinateUtils(): boolean {
  return isFeatureEnabled('USE_NEW_COORDINATE_UTILS');
}

export function shouldUseConsolidatedCoordinates(): boolean {
  return isFeatureEnabled('USE_CONSOLIDATED_COORDINATES');
}

// Component feature flags
export function shouldUseConsolidatedPlanner(): boolean {
  return isFeatureEnabled('USE_CONSOLIDATED_PLANNER');
}

export function shouldUseEnhancedSitePlanner(): boolean {
  return isFeatureEnabled('USE_ENHANCED_SITE_PLANNER');
}

export function shouldUseAIGenerator(): boolean {
  return isFeatureEnabled('USE_AI_GENERATOR');
}

// Migration feature flags
export function shouldEnableAdapters(): boolean {
  return isFeatureEnabled('ENABLE_ADAPTERS');
}

export function shouldEnableGradualMigration(): boolean {
  return isFeatureEnabled('ENABLE_GRADUAL_MIGRATION');
}

// Development feature flags
export function shouldShowDebugInfo(): boolean {
  return isFeatureEnabled('SHOW_DEBUG_INFO');
}

export function shouldEnablePerformanceMonitoring(): boolean {
  return isFeatureEnabled('ENABLE_PERFORMANCE_MONITORING');
}

// Feature flag configuration for different environments
export const ENVIRONMENT_CONFIGS = {
  development: {
    USE_NEW_COORDINATE_UTILS: true,
    USE_CONSOLIDATED_COORDINATES: true,
    USE_CONSOLIDATED_PLANNER: true,
    USE_ENHANCED_SITE_PLANNER: true,
    USE_AI_GENERATOR: true,
    ENABLE_ADAPTERS: true,
    ENABLE_GRADUAL_MIGRATION: true,
    SHOW_DEBUG_INFO: true,
    ENABLE_PERFORMANCE_MONITORING: true
  },
  staging: {
    USE_NEW_COORDINATE_UTILS: true,
    USE_CONSOLIDATED_COORDINATES: true,
    USE_CONSOLIDATED_PLANNER: true,
    USE_ENHANCED_SITE_PLANNER: true,
    USE_AI_GENERATOR: true,
    ENABLE_ADAPTERS: true,
    ENABLE_GRADUAL_MIGRATION: true,
    SHOW_DEBUG_INFO: false,
    ENABLE_PERFORMANCE_MONITORING: true
  },
  production: {
    USE_NEW_COORDINATE_UTILS: false,
    USE_CONSOLIDATED_COORDINATES: false,
    USE_CONSOLIDATED_PLANNER: false,
    USE_ENHANCED_SITE_PLANNER: false,
    USE_AI_GENERATOR: false,
    ENABLE_ADAPTERS: false,
    ENABLE_GRADUAL_MIGRATION: false,
    SHOW_DEBUG_INFO: false,
    ENABLE_PERFORMANCE_MONITORING: false
  }
} as const;

// Get current environment configuration
export function getEnvironmentConfig() {
  const env = process.env.NODE_ENV as keyof typeof ENVIRONMENT_CONFIGS;
  return ENVIRONMENT_CONFIGS[env] || ENVIRONMENT_CONFIGS.development;
}

// Override feature flags based on environment
export function overrideFeatureFlags() {
  const config = getEnvironmentConfig();
  
  Object.keys(config).forEach((key) => {
    const flagKey = key as FeatureFlag;
    const value = config[flagKey];
    
    // Override environment variables if not explicitly set
    if (process.env[`REACT_APP_${flagKey}`] === undefined) {
      process.env[`REACT_APP_${flagKey}`] = value.toString();
    }
  });
}

// Initialize feature flags
overrideFeatureFlags();

export default FEATURE_FLAGS;
