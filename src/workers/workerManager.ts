import type { Polygon } from 'geojson';
import type { PlannerConfig, PlannerOutput } from '../engine/types';
import type { WorkerMessage, WorkerResponse } from './planner.worker';

export class PlannerWorkerManager {
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
        new URL('./planner.worker.ts', import.meta.url),
        { type: 'module' }
      );
      
      this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };
      
      this.worker.onerror = (error) => {
        console.error('Worker error:', error);
        this.rejectAllPending(new Error('Worker error'));
      };
    } catch (error) {
      console.error('Failed to initialize worker:', error);
      // Fallback to synchronous execution
    }
  }

  private handleWorkerMessage(response: WorkerResponse) {
    const messageId = this.messageId;
    const pending = this.pendingMessages.get(messageId);
    
    if (!pending) return;
    
    this.pendingMessages.delete(messageId);
    
    if (response.type === 'SITE_PLAN_GENERATED') {
      pending.resolve(response.payload as PlannerOutput);
    } else if (response.type === 'ERROR') {
      pending.reject(new Error((response.payload as any).error));
    }
  }

  private rejectAllPending(error: Error) {
    for (const [id, pending] of this.pendingMessages) {
      pending.reject(error);
    }
    this.pendingMessages.clear();
  }

  async generateSitePlan(
    parcelGeoJSON: Polygon,
    config: PlannerConfig
  ): Promise<PlannerOutput> {
    if (!this.worker) {
      // Fallback to synchronous execution
      const { generateSitePlan } = await import('../engine/planner');
      return generateSitePlan(parcelGeoJSON, config);
    }

    return new Promise((resolve, reject) => {
      const messageId = ++this.messageId;
      
      this.pendingMessages.set(messageId, { resolve, reject });
      
      const message: WorkerMessage = {
        type: 'GENERATE_SITE_PLAN',
        payload: { parcelGeoJSON, config }
      };
      
      this.worker!.postMessage(message);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingMessages.has(messageId)) {
          this.pendingMessages.delete(messageId);
          reject(new Error('Worker timeout'));
        }
      }, 5000);
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

// Singleton instance
let workerManager: PlannerWorkerManager | null = null;

export function getPlannerWorker(): PlannerWorkerManager {
  if (!workerManager) {
    workerManager = new PlannerWorkerManager();
  }
  return workerManager;
}

export function terminatePlannerWorker() {
  if (workerManager) {
    workerManager.terminate();
    workerManager = null;
  }
}
