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
self.onmessage = async (e) => {
  const { type, id, parcel, config } = e.data || {};
  if (type !== 'generate') return;
  try {
    const out = await generateSitePlan(parcel, config);
    (self as any).postMessage({ type: 'generated', id, payload: out });
  } catch (err: any) {
    (self as any).postMessage({ type: 'generated', id, error: err?.message ?? String(err) });
  }
};

// Handle worker termination
self.addEventListener('beforeunload', () => {
  console.log('🔄 Site engine worker terminating...');
});
