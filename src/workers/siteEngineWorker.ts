import * as Comlink from 'comlink';
import type { Element, SitePlanConfig, SiteMetrics } from '../engine/types';
import { createSitePlanner } from '../engine/planner';

/**
 * Web Worker for heavy site planning calculations
 */
class SiteEngineWorker {
  private planner: any = null;

  /**
   * Initialize the site planner
   */
  async initialize(config: SitePlanConfig): Promise<void> {
    console.log('🔧 Initializing site engine worker...');
    
    // Import the planner dynamically to avoid bundling issues
    const { createSitePlanner } = await import('../engine/planner');
    this.planner = createSitePlanner(config);
    
    console.log('✅ Site engine worker initialized');
  }

  /**
   * Generate site plan
   */
  async generateSitePlan(forceRegenerate = false): Promise<{
    elements: Element[];
    metrics: SiteMetrics;
    report: any;
  }> {
    if (!this.planner) {
      throw new Error('Site planner not initialized');
    }

    console.log('🏗️ Generating site plan in worker...');
    const startTime = performance.now();
    
    const result = await this.planner.generateSitePlan(forceRegenerate);
    
    const endTime = performance.now();
    console.log(`✅ Site plan generated in ${(endTime - startTime).toFixed(2)}ms`);
    
    return result;
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<SitePlanConfig>): Promise<void> {
    if (!this.planner) {
      throw new Error('Site planner not initialized');
    }

    this.planner.updateConfig(newConfig);
  }

  /**
   * Get current results
   */
  async getCurrentResults(): Promise<{
    elements: Element[];
    metrics: SiteMetrics;
    report: any;
  }> {
    if (!this.planner) {
      throw new Error('Site planner not initialized');
    }

    return this.planner.getCurrentResults();
  }

  /**
   * Check if generating
   */
  async isGenerating(): Promise<boolean> {
    if (!this.planner) {
      return false;
    }

    return this.planner.isGeneratingPlan();
  }

  /**
   * Calculate geometry operations
   */
  async calculateGeometry(operation: string, data: any): Promise<any> {
    console.log(`🧮 Performing geometry operation: ${operation}`);
    
    // Import geometry functions dynamically
    const geometry = await import('../engine/geometry');
    
    switch (operation) {
      case 'calculateArea':
        return geometry.calculatePolygonArea(data.vertices);
      
      case 'calculateBounds':
        return geometry.calculatePolygonBounds(data.vertices);
      
      case 'calculateCentroid':
        return geometry.calculatePolygonCentroid(data.vertices);
      
      case 'isPointInPolygon':
        return geometry.isPointInPolygon(data.point, data.vertices);
      
      case 'doPolygonsOverlap':
        return geometry.doPolygonsOverlap(data.vertices1, data.vertices2);
      
      case 'analyzeGeometry':
        return geometry.analyzeGeometry(data.vertices);
      
      default:
        throw new Error(`Unknown geometry operation: ${operation}`);
    }
  }

  /**
   * Generate parking layout
   */
  async generateParking(data: {
    buildableArea: Element;
    config: any;
    existingElements: Element[];
  }): Promise<any> {
    console.log('🚗 Generating parking in worker...');
    
    const { generateIntelligentParking } = await import('../engine/parking');
    return generateIntelligentParking(data.buildableArea, data.config, data.existingElements);
  }

  /**
   * Generate buildings
   */
  async generateBuildings(data: {
    buildableArea: Element;
    config: SitePlanConfig;
  }): Promise<any> {
    console.log('🏢 Generating buildings in worker...');
    
    const { generateBuildingFootprints } = await import('../engine/building');
    return generateBuildingFootprints(data.buildableArea, data.config);
  }

  /**
   * Calculate site analysis
   */
  async calculateAnalysis(data: {
    elements: Element[];
    config: SitePlanConfig;
    marketData?: any;
  }): Promise<any> {
    console.log('📊 Calculating site analysis in worker...');
    
    const { generateSiteAnalysisReport } = await import('../engine/analysis');
    return generateSiteAnalysisReport(data.elements, data.config, data.marketData);
  }

  /**
   * Optimize site plan
   */
  async optimizeSitePlan(data: {
    elements: Element[];
    config: SitePlanConfig;
    criteria: 'density' | 'parking' | 'greenspace' | 'financial';
  }): Promise<any> {
    console.log(`🔧 Optimizing site plan for ${data.criteria}...`);
    
    const { optimizeSitePlan } = await import('../engine/planner');
    return optimizeSitePlan(data.elements, data.config, data.criteria);
  }

  /**
   * Batch process multiple operations
   */
  async batchProcess(operations: Array<{
    type: string;
    data: any;
  }>): Promise<any[]> {
    console.log(`🔄 Processing ${operations.length} operations in batch...`);
    
    const results = [];
    
    for (const operation of operations) {
      try {
        let result;
        
        switch (operation.type) {
          case 'geometry':
            result = await this.calculateGeometry(operation.data.operation, operation.data);
            break;
          case 'parking':
            result = await this.generateParking(operation.data);
            break;
          case 'buildings':
            result = await this.generateBuildings(operation.data);
            break;
          case 'analysis':
            result = await this.calculateAnalysis(operation.data);
            break;
          default:
            throw new Error(`Unknown operation type: ${operation.type}`);
        }
        
        results.push({ success: true, result });
      } catch (error) {
        console.error(`Error processing operation ${operation.type}:`, error);
        results.push({ success: false, error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Get worker performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    memoryUsage: number;
    processingTime: number;
    operationsCount: number;
  }> {
    // This would be implemented with actual performance monitoring
    return {
      memoryUsage: 0,
      processingTime: 0,
      operationsCount: 0
    };
  }
}

// Create worker instance
const worker = new SiteEngineWorker();

// Expose worker to main thread
Comlink.expose(worker);

// Handle worker termination
self.addEventListener('beforeunload', () => {
  console.log('🔄 Site engine worker terminating...');
});
