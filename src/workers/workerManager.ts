import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, WorkerAPI, Element, FeasibilityViolation } from '../engine/types';
import type { BuildingSpec, BuildingType } from '../engine/model';
import type { OptimizeResult } from '../engine/optimizer';

const DEV = typeof import.meta !== 'undefined' && import.meta.env?.DEV;

let nextId = 0;
let latest = 0;

export interface PlanUpdateResult {
  elements: Element[];
  metrics: PlannerOutput['metrics'];
  violations: FeasibilityViolation[];
}

export class PlannerWorkerManager implements WorkerAPI {
  private worker: Worker | null = null;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      if (DEV) console.log('[WorkerManager] Initializing worker…');
      this.worker = new Worker(
        new URL('./siteEngineWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onerror = (error) => {
        console.error('[WorkerManager] Worker error:', error);
      };

      this.worker.onmessageerror = (error) => {
        console.error('[WorkerManager] Worker message error:', error);
      };

      if (DEV) console.log('[WorkerManager] Worker initialized');
    } catch (error) {
      console.error('[WorkerManager] Failed to initialize worker:', error);
    }
  }

  async generateSitePlan(
    parcel: Polygon | MultiPolygon,
    config: PlannerConfig
  ): Promise<PlannerOutput> {
    if (!this.worker) {
      if (DEV) console.log('[WorkerManager] No worker, falling back to sync');
      const { generateSitePlan } = await import('../engine/planner');
      return generateSitePlan(parcel, config);
    }

    const id = ++nextId;
    if (DEV) console.log(`[WorkerManager] POST generate (id: ${id})`);
    this.worker.postMessage({ type: 'generate', id, parcel, config });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(`[WorkerManager] Timeout (id: ${id})`);
      }, 30000);

      const onmessage = (e: MessageEvent) => {
        const { id: rid, type, payload, error } = e.data || {};
        if (type !== 'generated' || rid !== id) return;

        clearTimeout(timeout);
        this.worker!.removeEventListener('message', onmessage);

        if (id < latest) return; // stale
        latest = id;

        if (error) {
          console.error(`[WorkerManager] Error (id: ${id}):`, error);
          return reject(new Error(error));
        }

        resolve(payload as PlannerOutput);
      };

      this.worker!.addEventListener('message', onmessage);

      this.worker!.onerror = (error) => {
        clearTimeout(timeout);
        console.error(`[WorkerManager] Worker error (id: ${id}):`, error);
        reject(error);
      };
    });
  }

  /**
   * Initialize site with envelope and initial building spec
   */
  async initSite(
    envelope3857: Polygon,
    zoning: PlannerConfig['zoning'],
    initialBuildingSpec?: BuildingSpec,
    parkingSpec?: {
      stallW: number;
      stallD: number;
      aisleW: number;
      anglesDeg: number[];
    },
    buildingType?: BuildingType
  ): Promise<PlanUpdateResult> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = ++nextId;
    this.worker.postMessage({
      type: 'INIT_SITE',
      id,
      envelope3857,
      zoning,
      initialBuildingSpec,
      parkingSpec,
      buildingType,
    });

    return this.waitForPlanUpdate(id);
  }

  /**
   * Update a building's position/rotation/size
   */
  async updateBuilding(
    buildingId: string,
    updates: {
      anchorX?: number;
      anchorY?: number;
      rotationRad?: number;
      widthM?: number;
      depthM?: number;
      floors?: number;
    }
  ): Promise<PlanUpdateResult> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = ++nextId;
    this.worker.postMessage({
      type: 'UPDATE_BUILDING',
      id,
      buildingId,
      ...updates,
    });

    return this.waitForPlanUpdate(id);
  }

  /**
   * Wait for PLAN_UPDATED response from worker
   */
  private waitForPlanUpdate(id: number): Promise<PlanUpdateResult> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const onmessage = (e: MessageEvent) => {
        const { id: rid, reqId, type, elements, metrics, violations, error } = e.data || {};
        const receivedId = rid || reqId;

        if (type !== 'PLAN_UPDATED' || receivedId !== id) {
          return;
        }

        clearTimeout(timeout);
        this.worker!.removeEventListener('message', onmessage);

        if (id < latest) return; // stale
        latest = id;

        if (error) {
          console.error(`[WorkerManager] Error (id: ${id}):`, error);
          return reject(new Error(error));
        }

        resolve({
          elements: elements || [],
          metrics: metrics || {
            totalBuiltSF: 0,
            siteCoveragePct: 0,
            achievedFAR: 0,
            parkingRatio: 0,
            openSpacePct: 0,
            zoningCompliant: true,
            violations: [],
            warnings: [],
          },
          violations: violations || [],
        });
      };

      const timeout = setTimeout(() => {
        this.worker!.removeEventListener('message', onmessage);
        reject(new Error(`Timeout waiting for PLAN_UPDATED (id: ${id})`));
      }, 30000);

      this.worker.addEventListener('message', onmessage);
    });
  }

  /**
   * Run the simulated-annealing optimizer on the given envelope.
   * Returns best layout + top 3 alternatives.
   */
  async optimizeSite(
    envelope3857: Polygon,
    zoning: PlannerConfig['zoning'],
    designParams: PlannerConfig['designParameters'],
    parkingSpec?: {
      stallW: number;
      stallD: number;
      aisleW: number;
      anglesDeg: number[];
    },
    maxIterations?: number,
    onProgress?: (iteration: number, score: number) => void
  ): Promise<OptimizeResult> {
    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = ++nextId;
    this.worker.postMessage({
      type: 'OPTIMIZE',
      id,
      envelope3857,
      zoning,
      designParams,
      parkingSpec,
      maxIterations,
    });

    return new Promise((resolve, reject) => {
      const onmessage = (e: MessageEvent) => {
        const { id: rid, reqId, type, ...rest } = e.data || {};
        const receivedId = rid || reqId;

        if (type === 'OPTIMIZE_PROGRESS' && receivedId === id) {
          onProgress?.(rest.iteration, rest.score);
          return;
        }

        if (type !== 'OPTIMIZE_RESULT' || receivedId !== id) {
          return;
        }

        clearTimeout(timeout);
        this.worker!.removeEventListener('message', onmessage);

        if (rest.error) {
          return reject(new Error(rest.error));
        }

        resolve({
          bestElements: rest.bestElements || [],
          bestMetrics: rest.bestMetrics || {
            totalBuiltSF: 0,
            siteCoveragePct: 0,
            achievedFAR: 0,
            parkingRatio: 0,
            openSpacePct: 0,
            zoningCompliant: true,
            violations: [],
            warnings: [],
          },
          bestViolations: rest.bestViolations || [],
          top3Alternatives: rest.top3Alternatives || [],
          iterations: rest.iterations || 0,
          finalScore: rest.finalScore || 0,
        });
      };

      const timeout = setTimeout(() => {
        this.worker!.removeEventListener('message', onmessage);
        reject(new Error(`Timeout waiting for OPTIMIZE_RESULT (id: ${id})`));
      }, 120000);

      this.worker.addEventListener('message', onmessage);
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Single instance satisfying WorkerAPI
export const workerManager = new PlannerWorkerManager();

export function terminatePlannerWorker() {
  workerManager.terminate();
}
