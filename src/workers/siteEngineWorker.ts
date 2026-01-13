import type { Element, PlannerConfig, PlannerOutput } from '../engine/types';
import { generateSitePlan } from '../engine/planner';

/**
 * Web Worker for heavy site planning calculations.
 *
 * Supports:
 *  - INIT_SITE / UPDATE_BUILDING => returns PLAN_UPDATED (placeholder solver for now)
 *  - generate (legacy) => returns generated
 */
class SiteEngineWorker {
  private siteState: any | null = null;

  /**
   * Generate site plan (legacy + direct call).
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

  /**
   * Initialize worker state for solver-style interactions.
   * v1: placeholder state container.
   */
  async initSite(envelope3857: any, zoning: any, initialBuildingSpec?: any): Promise<void> {
    this.siteState = {
      envelope3857,
      zoning,
      initialBuildingSpec,
      buildings: [],
      lastUpdate: null,
    };
  }

  /**
   * Update a building in the current plan.
   * v1: placeholder that just stores the latest update.
   */
  async updateBuilding(buildingId: string, patch: any): Promise<void> {
    if (!this.siteState) {
      // If UPDATE_BUILDING arrives before INIT_SITE, initialize minimal state
      this.siteState = { buildings: [], lastUpdate: null };
    }
    this.siteState.lastUpdate = { buildingId, patch };
  }

  /**
   * Solve current plan state and return updated elements, metrics, violations
   * v1: placeholder - will be implemented with parking solver and metrics
   */
  async solvePlan(): Promise<{
    elements: Element[];
    metrics: PlannerOutput['metrics'];
    violations: Array<{ type: string; message: string; delta?: number }>;
  }> {
    // v1: no-op solver. If site isn't initialized, just return placeholder outputs.
    // This avoids hard-crashing callers while the real solver is wired.
    if (!this.siteState) {
      return {
        elements: [],
        metrics: {
          totalBuiltSF: 0,
          siteCoveragePct: 0,
          achievedFAR: 0,
          parkingRatio: 0,
          openSpacePct: 0,
          zoningCompliant: true,
          violations: [],
          warnings: [],
        },
        violations: [],
      };
    }

    // v1: Return placeholder - will be implemented in next steps
    return {
      elements: [],
      metrics: {
        totalBuiltSF: 0,
        siteCoveragePct: 0,
        achievedFAR: 0,
        parkingRatio: 0,
        openSpacePct: 0,
        zoningCompliant: true,
        violations: [],
        warnings: [],
      },
      violations: [],
    };
  }
}

// Create worker instance
const worker = new SiteEngineWorker();

// Handle messages from main thread
self.onmessage = async (e) => {
  const { type, id, reqId, ...data } = e.data || {};
  const requestId = id || reqId; // Support both id and reqId for compatibility

  try {
    if (type === 'INIT_SITE') {
      const { envelope3857, zoning, initialBuildingSpec } = data;
      await worker.initSite(envelope3857, zoning, initialBuildingSpec);
      const result = await worker.solvePlan();
      (self as any).postMessage({
        type: 'PLAN_UPDATED',
        id: requestId,
        reqId: requestId,
        ...result,
      });
    } else if (type === 'UPDATE_BUILDING') {
      const { buildingId, anchorX, anchorY, rotationRad, widthM, depthM, floors } = data;
      await worker.updateBuilding(buildingId, {
        anchor:
          anchorX !== undefined && anchorY !== undefined ? { x: anchorX, y: anchorY } : undefined,
        rotationRad,
        widthM,
        depthM,
        floors,
      });
      const result = await worker.solvePlan();
      (self as any).postMessage({
        type: 'PLAN_UPDATED',
        id: requestId,
        reqId: requestId,
        ...result,
      });
    } else if (type === 'generate') {
      // Legacy support
      const { parcel, config } = data;
      const out = await worker.generateSitePlan(parcel, config);
      (self as any).postMessage({
        type: 'generated',
        id: requestId,
        reqId: requestId,
        payload: out,
      });
    } else {
      console.warn(`[Worker] Unknown message type: ${type}`);
    }
  } catch (err: any) {
    (self as any).postMessage({
      type: type === 'generate' ? 'generated' : 'PLAN_UPDATED',
      id: requestId,
      reqId: requestId,
      error: err?.message ?? String(err),
    });
  }
};

// Handle worker termination
self.addEventListener('beforeunload', () => {
  console.log('🔄 Site engine worker terminating...');
});
