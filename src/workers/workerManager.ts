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
      this.worker = new Worker(
        new URL('./siteEngineWorker.ts', import.meta.url),
        { type: 'module' }
      );

      console.log('✅ Worker initialized');
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      // Fallback to synchronous execution
    }
  }

  async generateSitePlan(
    parcel: Polygon | MultiPolygon,
    config: PlannerConfig
  ): Promise<PlannerOutput> {
    if (!this.worker) {
      // Fallback to synchronous execution
      const { generateSitePlan } = await import('../engine/planner');
      return generateSitePlan(parcel, config);
    }

    const id = ++nextId;
    this.worker.postMessage({ type: 'generate', id, parcel, config });

    return new Promise((resolve, reject) => {
      const onmessage = (e: MessageEvent) => {
        const { id: rid, type, payload, error } = e.data || {};
        if (type !== 'generated' || rid !== id) return;
        this.worker!.removeEventListener('message', onmessage);
        if (id < latest) return; // stale
        latest = id;
        if (error) return reject(new Error(error));
        resolve(payload as PlannerOutput);
      };
      this.worker!.addEventListener('message', onmessage);
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
