import { useCallback, useMemo, useState } from 'react';
import type { Element, PlannerConfig, PlannerOutput, SiteMetrics } from '../../../engine/types';
import type { SelectedParcel } from '../../../types/parcel';
import { toPolygon } from '../../../engine/geometry/normalize';
import { generateAlternatives, validateSitePlan } from '../../../engine/planner';

type SolveScore = {
  score: number;
};

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
      aisleWidthFt: 12,
      adaPct: 5,
      evPct: 10,
      layoutAngle: 0
    },
    buildingTypology: 'bar',
    numBuildings: 2
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
  const [solveScores, setSolveScores] = useState<SolveScore[]>([]);
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

  const generateAlternativePlans = useCallback(() => {
    if (!normalizedGeometry) return;
    const variations: Partial<PlannerConfig>[] = [];
    const baseFAR = config.designParameters.targetFAR;
    const baseCoverage = config.designParameters.targetCoveragePct || 50;
    const baseParking = config.designParameters.parking.targetRatio;

    const farVariations = [baseFAR * 0.8, baseFAR * 0.9, baseFAR, baseFAR * 1.1, baseFAR * 1.2];
    const coverageVariations = [baseCoverage * 0.9, baseCoverage, baseCoverage * 1.1];
    const parkingVariations = [baseParking - 0.25, baseParking, baseParking + 0.25];

    for (const far of farVariations.slice(0, 3)) {
      for (const coverage of coverageVariations) {
        for (const parking of parkingVariations.slice(0, 1)) {
          if (variations.length >= 9) break;
          variations.push({
            designParameters: {
              ...config.designParameters,
              targetFAR: far,
              targetCoveragePct: coverage,
              parking: {
                ...config.designParameters.parking,
                targetRatio: parking
              }
            }
          });
        }
        if (variations.length >= 9) break;
      }
      if (variations.length >= 9) break;
    }

    const altPlans = generateAlternatives(normalizedGeometry, config, variations);
    const scores = altPlans.map(plan => ({ score: validateSitePlan(plan, config).score }));
    setAlternatives(altPlans);
    setSolveScores(scores);
    setSelectedSolveIndex(0);
    setPlanOutput(altPlans[0]?.elements || [], altPlans[0]?.metrics || null);
  }, [config, normalizedGeometry, setPlanOutput]);

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
    solveScores,
    selectedSolveIndex,
    selectedSolve,
    selectSolve,
    generateAlternativePlans,
    normalizedGeometry,
    normalizedParcelId,
    isValidParcel
  };
};
