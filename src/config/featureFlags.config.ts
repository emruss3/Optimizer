/**
 * Feature Flags Configuration
 * 
 * This file contains the feature flag configuration for the site planner migration.
 * Update these values to control the migration process.
 */

export const FEATURE_FLAG_CONFIG = {
  // Coordinate transformation flags
  USE_NEW_COORDINATE_UTILS: true,
  USE_CONSOLIDATED_COORDINATES: true,
  
  // Component flags
  USE_CONSOLIDATED_PLANNER: true,
  USE_ENHANCED_SITE_PLANNER: true,
  USE_AI_GENERATOR: true,
  
  // Migration flags
  ENABLE_ADAPTERS: true,
  ENABLE_GRADUAL_MIGRATION: true,
  
  // Development flags
  SHOW_DEBUG_INFO: true,
  ENABLE_PERFORMANCE_MONITORING: true
} as const;

// Override environment variables with config values
Object.keys(FEATURE_FLAG_CONFIG).forEach(key => {
  const envKey = `REACT_APP_${key}`;
  if (process.env[envKey] === undefined) {
    process.env[envKey] = FEATURE_FLAG_CONFIG[key as keyof typeof FEATURE_FLAG_CONFIG].toString();
  }
});

export default FEATURE_FLAG_CONFIG;
