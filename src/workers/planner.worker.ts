import type { Polygon } from 'geojson';
import type { PlannerConfig, PlannerOutput } from '../engine/types';
import { generateSitePlan } from '../engine/planner';

// Worker message types
interface WorkerMessage {
  type: 'GENERATE_SITE_PLAN';
  payload: {
    parcelGeoJSON: Polygon;
    config: PlannerConfig;
  };
}

interface WorkerResponse {
  type: 'SITE_PLAN_GENERATED' | 'ERROR';
  payload: PlannerOutput | { error: string };
}

// Handle messages from main thread
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, payload } = event.data;
  
  try {
    switch (type) {
      case 'GENERATE_SITE_PLAN':
        const { parcelGeoJSON, config } = payload;
        const result = generateSitePlan(parcelGeoJSON, config);
        
        const response: WorkerResponse = {
          type: 'SITE_PLAN_GENERATED',
          payload: result
        };
        
        self.postMessage(response);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    const errorResponse: WorkerResponse = {
      type: 'ERROR',
      payload: { error: error instanceof Error ? error.message : 'Unknown error' }
    };
    
    self.postMessage(errorResponse);
  }
};

// Export for type checking
export type { WorkerMessage, WorkerResponse };
