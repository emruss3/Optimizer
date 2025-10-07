/**
 * Component Migration Utilities
 * 
 * This module provides utilities for gradual migration from old components
 * to new consolidated components using feature flags.
 */

import { shouldUseConsolidatedPlanner, shouldUseEnhancedSitePlanner, shouldUseAIGenerator, shouldEnableAdapters } from './featureFlags';

// Component mapping for migration
export const COMPONENT_MAPPINGS = {
  // Old components -> New components
  'AIDrivenSitePlanGenerator': 'ConsolidatedSitePlanner',
  'EnhancedSitePlanner': 'ConsolidatedSitePlanner',
  'SitePlanDesigner': 'ConsolidatedSitePlanner',
  'EnterpriseSitePlanner': 'ConsolidatedSitePlanner'
} as const;

// Migration strategies
export type MigrationStrategy = 'immediate' | 'gradual' | 'adapter' | 'fallback';

// Component migration configuration
export interface ComponentMigrationConfig {
  oldComponent: string;
  newComponent: string;
  strategy: MigrationStrategy;
  featureFlag?: string;
  adapterComponent?: string;
}

// Migration configurations
export const MIGRATION_CONFIGS: ComponentMigrationConfig[] = [
  {
    oldComponent: 'AIDrivenSitePlanGenerator',
    newComponent: 'ConsolidatedSitePlanner',
    strategy: 'adapter',
    featureFlag: 'USE_AI_GENERATOR',
    adapterComponent: 'AIDrivenSitePlanGeneratorAdapter'
  },
  {
    oldComponent: 'EnhancedSitePlanner',
    newComponent: 'ConsolidatedSitePlanner',
    strategy: 'adapter',
    featureFlag: 'USE_ENHANCED_SITE_PLANNER',
    adapterComponent: 'EnhancedSitePlannerAdapter'
  },
  {
    oldComponent: 'SitePlanDesigner',
    newComponent: 'ConsolidatedSitePlanner',
    strategy: 'adapter',
    featureFlag: 'USE_CONSOLIDATED_PLANNER',
    adapterComponent: 'SitePlanDesignerAdapter'
  },
  {
    oldComponent: 'EnterpriseSitePlanner',
    newComponent: 'ConsolidatedSitePlanner',
    strategy: 'adapter',
    featureFlag: 'USE_CONSOLIDATED_PLANNER',
    adapterComponent: 'EnterpriseSitePlannerAdapter'
  }
];

// Get migration strategy for a component
export function getMigrationStrategy(componentName: string): MigrationStrategy {
  const config = MIGRATION_CONFIGS.find(c => c.oldComponent === componentName);
  
  if (!config) {
    return 'fallback'; // Use old component if no migration config
  }
  
  // Check feature flags
  if (shouldEnableAdapters() && config.strategy === 'adapter') {
    return 'adapter';
  }
  
  if (shouldUseConsolidatedPlanner() && config.featureFlag === 'USE_CONSOLIDATED_PLANNER') {
    return 'immediate';
  }
  
  if (shouldUseEnhancedSitePlanner() && config.featureFlag === 'USE_ENHANCED_SITE_PLANNER') {
    return 'immediate';
  }
  
  if (shouldUseAIGenerator() && config.featureFlag === 'USE_AI_GENERATOR') {
    return 'immediate';
  }
  
  return 'fallback';
}

// Get the appropriate component to use
export function getComponentToUse(componentName: string): string {
  const strategy = getMigrationStrategy(componentName);
  
  switch (strategy) {
    case 'immediate':
      return 'ConsolidatedSitePlanner';
    case 'adapter':
      return `${componentName}Adapter`;
    case 'gradual':
      return shouldUseConsolidatedPlanner() ? 'ConsolidatedSitePlanner' : componentName;
    case 'fallback':
    default:
      return componentName;
  }
}

// Check if component should be migrated
export function shouldMigrateComponent(componentName: string): boolean {
  const strategy = getMigrationStrategy(componentName);
  return strategy !== 'fallback';
}

// Get import path for component
export function getComponentImportPath(componentName: string): string {
  const strategy = getMigrationStrategy(componentName);
  
  switch (strategy) {
    case 'immediate':
      return './ConsolidatedSitePlanner';
    case 'adapter':
      return './adapters/SitePlannerAdapters';
    case 'gradual':
      return shouldUseConsolidatedPlanner() ? './ConsolidatedSitePlanner' : `./${componentName}`;
    case 'fallback':
    default:
      return `./${componentName}`;
  }
}

// Migration status checker
export function getMigrationStatus(): {
  totalComponents: number;
  migratedComponents: number;
  migrationProgress: number;
  components: Array<{
    name: string;
    strategy: MigrationStrategy;
    migrated: boolean;
  }>;
} {
  const components = MIGRATION_CONFIGS.map(config => ({
    name: config.oldComponent,
    strategy: getMigrationStrategy(config.oldComponent),
    migrated: getMigrationStrategy(config.oldComponent) !== 'fallback'
  }));
  
  const migratedComponents = components.filter(c => c.migrated).length;
  const totalComponents = components.length;
  const migrationProgress = (migratedComponents / totalComponents) * 100;
  
  return {
    totalComponents,
    migratedComponents,
    migrationProgress,
    components
  };
}

// Migration helper for dynamic imports
export async function loadComponent(componentName: string): Promise<any> {
  const importPath = getComponentImportPath(componentName);
  const actualComponentName = getComponentToUse(componentName);
  
  try {
    const module = await import(importPath);
    return module[actualComponentName] || module.default;
  } catch (error) {
    console.error(`Failed to load component ${componentName}:`, error);
    // Fallback to original component
    const fallbackModule = await import(`./${componentName}`);
    return fallbackModule.default;
  }
}

// Migration helper for static imports
export function getComponentImport(componentName: string): string {
  const importPath = getComponentImportPath(componentName);
  const actualComponentName = getComponentToUse(componentName);
  
  return `import ${actualComponentName} from '${importPath}';`;
}

// Migration status display
export function getMigrationStatusDisplay(): string {
  const status = getMigrationStatus();
  
  return `
Migration Status:
- Total Components: ${status.totalComponents}
- Migrated Components: ${status.migratedComponents}
- Progress: ${status.migrationProgress.toFixed(1)}%

Components:
${status.components.map(c => 
  `- ${c.name}: ${c.migrated ? '✅ Migrated' : '❌ Not Migrated'} (${c.strategy})`
).join('\n')}
  `;
}

export default {
  getMigrationStrategy,
  getComponentToUse,
  shouldMigrateComponent,
  getComponentImportPath,
  getMigrationStatus,
  loadComponent,
  getComponentImport,
  getMigrationStatusDisplay
};
