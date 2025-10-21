import type { Element, SitePlanConfig, SiteMetrics, PlannerConfig, PlannerOutput } from '../engine/types';
import { generateSitePlan } from '../engine/planner';

/**
 * Web Worker for heavy site planning calculations
 */
class SiteEngineWorker {
  /**
   * Generate site plan
   */
  async generateSitePlan(parcelGeoJSON: any, config: PlannerConfig): Promise<PlannerOutput> {
    console.log('🏗️ Generating site plan in worker...');
    const startTime = performance.now();
    
    try {
      const result = await generateSitePlan(parcelGeoJSON, config);
      
      const endTime = performance.now();
      console.log(`✅ Site plan generated in ${(endTime - startTime).toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      console.error('Error generating site plan:', error);
      throw error;
    }
  }

}

// Create worker instance
const worker = new SiteEngineWorker();

// Handle messages from main thread
self.onmessage = async (event) => {
  const { id, method, args } = event.data;

  try {
    let result;
    
    switch (method) {
      case 'generateSitePlan':
        result = await worker.generateSitePlan(args[0], args[1]);
        break;
      default:
        throw new Error(`Unknown method: ${method}`);
    }
    
    self.postMessage({ id, result });
  } catch (error: any) {
    self.postMessage({ id, error: error.message });
  }
};

// Handle worker termination
self.addEventListener('beforeunload', () => {
  console.log('🔄 Site engine worker terminating...');
});
