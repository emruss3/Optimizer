import { useCallback, useMemo, useState } from 'react';
import type { Element, PlannerConfig, PlannerOutput, SiteMetrics } from '../../../engine/types';
import type { SelectedParcel } from '../../../types/parcel';
import { toPolygon } from '../../../engine/geometry/normalize';

const defaultConfig = (parcelId: string, geometry: GeoJSON.Polygon): PlannerConfig => ({
  parcelId,
  buildableArea: geometry,
  zoning: {
    frontSetbackFt: 20,
    sideSetbackFt: 10,
    rearSetbackFt: 20,
    maxFar: 2.0,
    maxCoveragePct: 60,
    minParkingRatio: 1.0,
    maxHeightFt: 65,
    maxDensityDuPerAcre: 40,
    maxImperviousPct: 80,
    minOpenSpacePct: 15,
  },
  designParameters: {
    targetFAR: 1.5,
    targetCoveragePct: 50,
    parking: {
      targetRatio: 1.5,
      stallWidthFt: 9,
      stallDepthFt: 18,
      aisleWidthFt: 24,
      adaPct: 5,
      evPct: 10,
      layoutAngle: 0
    },
    buildingTypology: 'bar',
    numBuildings: undefined
  }
});

const isNonEmptyPolygon = (geometry: unknown): geometry is GeoJSON.Polygon => {
  return (
    typeof geometry === 'object' &&
    geometry !== null &&
    (geometry as GeoJSON.Polygon).type === 'Polygon' &&
    Array.isArray((geometry as GeoJSON.Polygon).coordinates) &&
    (geometry as GeoJSON.Polygon).coordinates.length > 0 &&
    (geometry as GeoJSON.Polygon).coordinates[0].length >= 4
  );
};

const coerceParcelId = (ogc_fid: unknown): string | null => {
  if (typeof ogc_fid === 'number') return String(ogc_fid);
  if (typeof ogc_fid === 'string' && ogc_fid.trim() !== '' && ogc_fid !== 'unknown') {
    return ogc_fid;
  }
  return null;
};

export const useSitePlanState = (parcel?: SelectedParcel | null) => {
  const normalizedParcelId = useMemo(() => coerceParcelId(parcel?.ogc_fid) || 'unknown', [parcel?.ogc_fid]);
  const normalizedGeometry = useMemo(() => {
    if (!parcel?.geometry) return null;
    try {
      const polygon = toPolygon(parcel.geometry);
      return isNonEmptyPolygon(polygon) ? polygon : null;
    } catch {
      return null;
    }
  }, [parcel?.geometry]);

  const [config, setConfig] = useState<PlannerConfig>(() =>
    defaultConfig(normalizedParcelId, normalizedGeometry || { type: 'Polygon', coordinates: [] })
  );
  const [elements, setElements] = useState<Element[]>([]);
  const [metrics, setMetrics] = useState<SiteMetrics | null>(null);
  const [alternatives, setAlternatives] = useState<PlannerOutput[]>([]);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState<number | null>(null);

  const selectedSolve = useMemo(
    () => (selectedSolveIndex != null ? alternatives[selectedSolveIndex] : null),
    [alternatives, selectedSolveIndex]
  );

  const updateConfig = useCallback((updates: Partial<PlannerConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  const setPlanOutput = useCallback((nextElements: Element[], nextMetrics: SiteMetrics | null) => {
    setElements(nextElements);
    setMetrics(nextMetrics);
  }, []);

  /**
   * Populate the alternatives table from optimizer output.
   * The SA optimizer (src/engine/optimizer.ts) already returns the best layout
   * plus ranked top-3 alternatives, so we surface those directly rather than
   * re-running the deprecated legacy planner. Index 0 is always the best plan.
   */
  const applyAlternatives = useCallback((plans: PlannerOutput[]) => {
    setAlternatives(plans);
    setSelectedSolveIndex(plans.length > 0 ? 0 : null);
  }, []);

  const selectSolve = useCallback(
    (index: number) => {
      setSelectedSolveIndex(index);
      const solve = alternatives[index];
      if (solve) {
        setPlanOutput(solve.elements, solve.metrics);
      }
    },
    [alternatives, setPlanOutput]
  );

  const isValidParcel = Boolean(normalizedParcelId && normalizedGeometry);

  return {
    config,
    updateConfig,
    elements,
    metrics,
    setPlanOutput,
    alternatives,
    selectedSolveIndex,
    selectedSolve,
    selectSolve,
    applyAlternatives,
    normalizedGeometry,
    normalizedParcelId,
    isValidParcel
  };
};
