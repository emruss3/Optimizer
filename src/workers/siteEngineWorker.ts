import type { Element, PlannerConfig, PlannerOutput } from '../engine/types';
import type { Polygon, MultiPolygon } from 'geojson';
import { normalizeToPolygon, areaM2 } from '../engine/geometry';
import { generateSitePlan } from '../engine/planner';
import { buildBuildingFootprint, clampBuildingToEnvelope } from '../engine/buildingGeometry';
import type { BuildingSpec } from '../engine/model';
import { createBuildingSpec } from '../engine/model';
import { solveParkingBayPacking } from '../engine/parkingBaySolver';
import { computeFeasibility } from '../engine/feasibility';

/**
 * Web Worker for heavy site planning calculations.
 *
 * Supports:
 *  - INIT_SITE / UPDATE_BUILDING => returns PLAN_UPDATED (placeholder solver for now)
 *  - generate (legacy) => returns generated
 */
type SiteEngineState = {
  envelope: Polygon;
  zoning: PlannerConfig['zoning'];
  buildings: BuildingSpec[];
  parkingSpec: {
    stallW: number;
    stallD: number;
    aisleW: number;
    anglesDeg: number[];
  };
};

class SiteEngineWorker {
  private siteState: SiteEngineState | null = null;

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
  async initSite(
    envelope3857: Polygon | MultiPolygon,
    zoning: PlannerConfig['zoning'],
    initialBuildingSpec?: BuildingSpec,
    parkingSpec?: SiteEngineState['parkingSpec']
  ): Promise<void> {
    const envelope = normalizeToPolygon(envelope3857);
    const bounds = envelope.coordinates[0].reduce(
      (acc, [x, y]) => ({
        minX: Math.min(acc.minX, x),
        minY: Math.min(acc.minY, y),
        maxX: Math.max(acc.maxX, x),
        maxY: Math.max(acc.maxY, y)
      }),
      { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    );

    const fallbackBuilding =
      initialBuildingSpec ??
      createBuildingSpec(
        'building-1',
        {
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2
        },
        Math.min(60, (bounds.maxX - bounds.minX) * 0.4),
        Math.min(30, (bounds.maxY - bounds.minY) * 0.25),
        3
      );

    this.siteState = {
      envelope,
      zoning,
      buildings: [fallbackBuilding],
      parkingSpec: parkingSpec ?? {
        stallW: 2.7432,
        stallD: 5.4864,
        aisleW: 7.3152,
        anglesDeg: [0, 60, 90]
      }
    };
  }

  /**
   * Update a building in the current plan.
   * v1: placeholder that just stores the latest update.
   */
  async updateBuilding(
    buildingId: string,
    patch: {
      anchor?: { x: number; y: number };
      rotationRad?: number;
      widthM?: number;
      depthM?: number;
      floors?: number;
    }
  ): Promise<void> {
    if (!this.siteState) {
      throw new Error('Site not initialized');
    }

    const idx = this.siteState.buildings.findIndex(b => b.id === buildingId);
    if (idx === -1) {
      this.siteState.buildings.push({
        ...createBuildingSpec(
          buildingId,
          patch.anchor ?? { x: 0, y: 0 },
          patch.widthM ?? 30,
          patch.depthM ?? 18,
          patch.floors ?? 3
        ),
        rotationRad: patch.rotationRad ?? 0
      });
      return;
    }

    const existing = this.siteState.buildings[idx];
    this.siteState.buildings[idx] = {
      ...existing,
      anchor: patch.anchor ?? existing.anchor,
      rotationRad: patch.rotationRad ?? existing.rotationRad,
      widthM: patch.widthM ?? existing.widthM,
      depthM: patch.depthM ?? existing.depthM,
      floors: patch.floors ?? existing.floors
    };
  }

  /**
   * Solve current plan state and return updated elements, metrics, violations
   * v1: placeholder - will be implemented with parking solver and metrics
   */
  async solvePlan(): Promise<{
    elements: Element[];
    metrics: PlannerOutput['metrics'];
    violations: Array<{ code: string; message: string; delta?: number; severity: 'error' | 'warning' }>;
  }> {
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

    const { envelope, zoning, parkingSpec } = this.siteState;
    const clampedBuildings: BuildingSpec[] = [];
    for (const spec of this.siteState.buildings) {
      clampedBuildings.push(clampBuildingToEnvelope(spec, envelope, clampedBuildings));
    }
    this.siteState.buildings = clampedBuildings;

    const buildingFootprints = clampedBuildings.map(spec => ({
      id: spec.id,
      footprint: buildBuildingFootprint(spec),
      floors: spec.floors
    }));

    const parkingSolution = solveParkingBayPacking(
      envelope,
      buildingFootprints.map(b => b.footprint),
      parkingSpec
    );

    const feasibility = computeFeasibility({
      envelope,
      buildings: buildingFootprints,
      parkingSolution,
      zoningLimits: {
        maxFar: zoning.maxFar,
        maxCoveragePct: zoning.maxCoveragePct,
        parkingRatio: zoning.minParkingRatio ?? 1.5
      }
    });

    const elements: Element[] = [];
    const now = new Date().toISOString();

    for (const building of buildingFootprints) {
      const footprint = normalizeToPolygon(building.footprint);
      elements.push({
        id: building.id,
        type: 'building',
        name: `Building ${building.id}`,
        geometry: footprint,
        properties: {
          areaSqFt: areaM2(footprint) * 10.7639,
          floors: building.floors
        },
        metadata: {
          createdAt: now,
          updatedAt: now,
          source: 'ai-generated'
        }
      });
    }

    parkingSolution.bays.forEach((bay, index) => {
      const footprint = normalizeToPolygon(bay);
      elements.push({
        id: `parking-bay-${index + 1}`,
        type: 'parking-bay',
        name: `Parking Bay ${index + 1}`,
        geometry: footprint,
        properties: {
          areaSqFt: areaM2(footprint) * 10.7639
        },
        metadata: {
          createdAt: now,
          updatedAt: now,
          source: 'ai-generated'
        }
      });
    });

    parkingSolution.aisles.forEach((aisle, index) => {
      const footprint = normalizeToPolygon(aisle);
      elements.push({
        id: `parking-aisle-${index + 1}`,
        type: 'parking-aisle',
        name: `Parking Aisle ${index + 1}`,
        geometry: footprint,
        properties: {
          areaSqFt: areaM2(footprint) * 10.7639
        },
        metadata: {
          createdAt: now,
          updatedAt: now,
          source: 'ai-generated'
        }
      });
    });

    const units = Math.max(1, Math.floor(feasibility.gfaSqft / 800));
    const parkingRatio = units > 0 ? feasibility.stallsProvided / units : 0;

    return {
      elements,
      metrics: {
        totalBuiltSF: feasibility.gfaSqft,
        siteCoveragePct: feasibility.coverage * 100,
        achievedFAR: feasibility.far,
        parkingRatio,
        openSpacePct: 0,
        stallsProvided: feasibility.stallsProvided,
        stallsRequired: feasibility.stallsRequired,
        zoningCompliant: feasibility.violations.filter(v => v.severity === 'error').length === 0,
        violations: feasibility.violations.map(v => v.message),
        warnings: feasibility.violations.filter(v => v.severity === 'warning').map(v => v.message)
      },
      violations: feasibility.violations
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
      const { envelope3857, zoning, initialBuildingSpec, parkingSpec } = data;
      await worker.initSite(envelope3857, zoning, initialBuildingSpec, parkingSpec);
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
