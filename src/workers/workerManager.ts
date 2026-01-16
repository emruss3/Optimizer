import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, WorkerAPI, Element, FeasibilityViolation } from '../engine/types';
import type { BuildingSpec } from '../engine/model';

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
      console.log('🔍 [WorkerManager] Initializing worker...');
      this.worker = new Worker(
        new URL('./siteEngineWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onerror = (error) => {
        console.error('❌ [WorkerManager] Worker error:', error);
      };

      this.worker.onmessageerror = (error) => {
        console.error('❌ [WorkerManager] Worker message error:', error);
      };

      console.log('✅ [WorkerManager] Worker initialized successfully');
    } catch (error) {
      console.error('❌ [WorkerManager] Failed to initialize worker:', error);
      // Fallback to synchronous execution
    }
  }

  async generateSitePlan(
    parcel: Polygon | MultiPolygon,
    config: PlannerConfig
  ): Promise<PlannerOutput> {
    console.log('🔍 [WorkerManager] generateSitePlan called:', {
      hasWorker: !!this.worker,
      parcelType: parcel.type,
      configParcelId: config.parcelId
    });

    if (!this.worker) {
      console.log('⚠️ [WorkerManager] No worker available, falling back to synchronous execution');
      // Fallback to synchronous execution
      const { generateSitePlan } = await import('../engine/planner');
      console.log('✅ [WorkerManager] Synchronous planner imported, generating...');
      const result = await generateSitePlan(parcel, config);
      console.log('✅ [WorkerManager] Synchronous generation complete:', {
        hasElements: !!result?.elements,
        elementsCount: result?.elements?.length
      });
      return result;
    }

    const id = ++nextId;
    console.log(`📤 [WorkerManager] Posting message to worker (id: ${id}):`, {
      type: 'generate',
      parcelType: parcel.type,
      configParcelId: config.parcelId
    });
    
    this.worker.postMessage({ type: 'generate', id, parcel, config });
    console.log(`📤 [WorkerManager] Message posted, waiting for response (id: ${id})...`);

    // Set a timeout to detect if worker is hanging
    const timeout = setTimeout(() => {
      console.error(`❌ [WorkerManager] Timeout waiting for worker response (id: ${id}) after 30 seconds`);
    }, 30000);

    return new Promise((resolve, reject) => {
      const onmessage = (e: MessageEvent) => {
        console.log(`📥 [WorkerManager] Received message (id: ${id}):`, {
          receivedId: e.data?.id,
          type: e.data?.type,
          hasPayload: !!e.data?.payload,
          hasError: !!e.data?.error
        });

        const { id: rid, type, payload, error } = e.data || {};
        if (type !== 'generated' || rid !== id) {
          console.log(`⏭️ [WorkerManager] Ignoring message (id mismatch or wrong type):`, {
            expectedId: id,
            receivedId: rid,
            type
          });
          return;
        }
        
        clearTimeout(timeout);
        this.worker!.removeEventListener('message', onmessage);
        
        if (id < latest) {
          console.log(`⏭️ [WorkerManager] Ignoring stale message (id: ${id}, latest: ${latest})`);
          return; // stale
        }
        
        latest = id;
        
        if (error) {
          console.error(`❌ [WorkerManager] Worker returned error (id: ${id}):`, error);
          return reject(new Error(error));
        }
        
        console.log(`✅ [WorkerManager] Worker completed successfully (id: ${id}):`, {
          hasElements: !!payload?.elements,
          elementsCount: payload?.elements?.length,
          hasMetrics: !!payload?.metrics
        });
        resolve(payload as PlannerOutput);
      };
      
      this.worker!.addEventListener('message', onmessage);
      
      // Also listen for any errors
      this.worker!.onerror = (error) => {
        clearTimeout(timeout);
        console.error(`❌ [WorkerManager] Worker error during generation (id: ${id}):`, error);
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
    }
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
          return; // Ignore other messages
        }

        clearTimeout(timeout);
        this.worker!.removeEventListener('message', onmessage);

        if (id < latest) {
          console.log(`ΓÅ¡∩╕Å [WorkerManager] Ignoring stale PLAN_UPDATED (id: ${id}, latest: ${latest})`);
          return;
        }

        latest = id;

        if (error) {
          console.error(`Γ¥î [WorkerManager] Worker returned error (id: ${id}):`, error);
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
