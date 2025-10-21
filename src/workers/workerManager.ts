import type { Polygon, MultiPolygon } from 'geojson';
import type { PlannerConfig, PlannerOutput, WorkerAPI } from '../engine/types';

export class PlannerWorkerManager implements WorkerAPI {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingMessages = new Map<number, {
    resolve: (result: PlannerOutput) => void;
    reject: (error: Error) => void;
  }>();

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      this.worker = new Worker(
        new URL('./siteEngineWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      this.worker.onmessage = (event) => {
        this.handleWorkerMessage(event.data);
      };
      
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.rejectAllPending(new Error('Worker error'));
      };
      
      console.log('✅ Worker initialized');
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      // Fallback to synchronous execution
    }
  }

  private handleWorkerMessage(data: any) {
    const { id, result, error } = data;
    const pending = this.pendingMessages.get(id);
    
    if (!pending) return;
    
    this.pendingMessages.delete(id);
    
    if (result) {
      pending.resolve(result);
    } else if (error) {
      pending.reject(new Error(error));
    }
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(error);
    }
    this.pendingMessages.clear();
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

    return new Promise((resolve, reject) => {
      const messageId = ++this.messageId;
      
      this.pendingMessages.set(messageId, { resolve, reject });
      
      this.worker!.postMessage({
        id: messageId,
        method: 'generateSitePlan',
        args: [parcel, config]
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          this.pendingMessages.delete(messageId);
          reject(new Error('Worker timeout'));
        }
      }, 10000);
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.rejectAllPending(new Error('Worker terminated'));
  }
}

// Single instance satisfying WorkerAPI
export const workerManager = new PlannerWorkerManager();

export function terminatePlannerWorker() {
  workerManager.terminate();
}
