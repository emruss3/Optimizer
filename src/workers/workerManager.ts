import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, WorkerAPI } from '../engine/types';

let nextId = 0;
let latest = 0;

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
