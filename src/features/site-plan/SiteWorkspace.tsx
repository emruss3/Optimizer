import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EnterpriseSitePlanner from '../../components/EnterpriseSitePlannerShell';
import { SitePlannerErrorBoundary } from '../../components/ErrorBoundary';
import type { InvestmentAnalysis, SelectedParcel } from '../../types/parcel';
import { createFallbackParcel, isValidParcel } from '../../types/parcel';
import { useBuildableEnvelope } from './api/useBuildableEnvelope';
import { useSitePlanState } from './state/useSitePlanState';
import { workerManager } from '../../workers/workerManager';
import type { Element, FeasibilityViolation } from '../../engine/types';
import type { EdgeClassification } from '../../engine/setbacks';
import { normalizeToPolygon, calculatePolygonCentroid, correctedAreaM2 } from '../../engine/geometry';
import { feature4326To3857 } from '../../utils/reproject';
import { feetToMeters } from '../../engine/units';
import { typologyToBuildingType, generateDefaultUnitMix } from '../../engine/model';
import { computeProForma } from '../../engine/proforma';
import type { Polygon, MultiPolygon } from 'geojson';
import ParametersPanel from './ui/ParametersPanel';
import ResultsPanel from './ui/ResultsPanel';
import { useSitePlans } from '../../hooks/useSitePlans';
import type { SavedSitePlan } from '../../lib/sitePlanStorage';

type SiteWorkspaceProps = {
  parcel: SelectedParcel;
};

const SiteWorkspace: React.FC<SiteWorkspaceProps> = ({ parcel }) => {
  const {
    config,
    updateConfig,
    elements,
    metrics,
    setPlanOutput,
    alternatives,
    selectedSolveIndex,
    selectedSolve,
    selectSolve,
    generateAlternativePlans,
    normalizedGeometry,
    isValidParcel: hasValidGeometry
  } = useSitePlanState(parcel);
  const { status, envelope, rpcMetrics, edgeClassifications, error: envelopeError } = useBuildableEnvelope(parcel);
  const [isGenerating, setIsGenerating] = useState(false);
  const [violations, setViolations] = useState<FeasibilityViolation[]>([]);
  const [investmentAnalysis, setInvestmentAnalysis] = useState<InvestmentAnalysis | null>(null);
  const [solverReady, setSolverReady] = useState(false);
  const [usingFallbackEnvelope, setUsingFallbackEnvelope] = useState(false);
  const generateTimerRef = useRef<number | null>(null);

  // Plan persistence
  const parcelIdStr = String(parcel.ogc_fid ?? parcel.id ?? 'unknown');
  const {
    plans: savedPlans,
    isLoading: savedPlansLoading,
    error: savedPlansError,
    save: savePlanToDb,
    remove: deletePlanFromDb,
    setFavorite: togglePlanFavorite,
  } = useSitePlans(parcelIdStr);

  const handleSavePlan = useCallback(
    (name: string) => {
      savePlanToDb({
        parcel_id: parcelIdStr,
        name,
        config,
        elements,
        metrics,
        violations,
        investment: investmentAnalysis,
      });
    },
    [savePlanToDb, parcelIdStr, config, elements, metrics, violations, investmentAnalysis]
  );

  const handleLoadPlan = useCallback(
    (plan: SavedSitePlan) => {
      setPlanOutput(plan.elements ?? [], plan.metrics ?? null);
      setViolations(plan.violations ?? []);
      setInvestmentAnalysis(plan.investment ?? null);
    },
    [setPlanOutput]
  );

  // Create fallback envelope from parcel geometry if RPC fails
  const fallbackEnvelopeMeters = useMemo(() => {
    // Only create fallback if we don't have a valid RPC envelope
    // Create fallback when status is 'invalid' OR when we have no envelope but have geometry
    if (!parcel?.geometry) return null;
    
    // If RPC succeeded and we have a valid envelope, no fallback needed
    if (status === 'ready' && envelope && (envelope.type === 'Polygon' || envelope.type === 'MultiPolygon')) {
      return null;
    }
    
    // Create fallback when RPC failed, returned null, or status is invalid
    
    try {
      // Reproject parcel geometry to 3857
      const geom = parcel.geometry as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      const normalized = normalizeToPolygon(reprojected);
      
      // Get bbox and apply default setbacks (20ft front, 5ft side, 20ft rear)
      const coords3857 = normalized.coordinates[0];
      const bounds = coords3857.reduce(
        (acc, [x, y]) => ({
          minX: Math.min(acc.minX, x),
          minY: Math.min(acc.minY, y),
          maxX: Math.max(acc.maxX, x),
          maxY: Math.max(acc.maxY, y)
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
      );
      
      // Convert setbacks to meters (20ft = 6.096m, 5ft = 1.524m)
      const frontSetbackM = feetToMeters(20);
      const sideSetbackM = feetToMeters(5);
      const rearSetbackM = feetToMeters(20);
      
      // Inset bbox by setbacks (assuming front is minY, rear is maxY, sides are minX/maxX)
      const insetBounds = {
        minX: bounds.minX + sideSetbackM,
        minY: bounds.minY + frontSetbackM,
        maxX: bounds.maxX - sideSetbackM,
        maxY: bounds.maxY - rearSetbackM
      };
      
      // Ensure valid bounds
      if (insetBounds.minX >= insetBounds.maxX || insetBounds.minY >= insetBounds.maxY) {
        return null;
      }
      
      // Create rectangle polygon from inset bounds
      const fallbackPoly: Polygon = {
        type: 'Polygon',
        coordinates: [[
          [insetBounds.minX, insetBounds.minY],
          [insetBounds.maxX, insetBounds.minY],
          [insetBounds.maxX, insetBounds.maxY],
          [insetBounds.minX, insetBounds.maxY],
          [insetBounds.minX, insetBounds.minY]
        ]]
      };
      
      return fallbackPoly;
    } catch (err) {
      console.error('Failed to create fallback envelope:', err);
      return null;
    }
  }, [parcel?.geometry, status, envelope]);

  const envelopeMeters = useMemo(() => {
    // Use RPC envelope if available and valid
    if (envelope && status === 'ready') {
      if (envelope.type !== 'Polygon' && envelope.type !== 'MultiPolygon') {
        // Invalid geometry type, use fallback
        return fallbackEnvelopeMeters;
      }
      const geom = envelope as Polygon | MultiPolygon;
      const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
      const is3857 = Math.abs(coords?.[0]?.[0] ?? 0) > 1000 || Math.abs(coords?.[0]?.[1] ?? 0) > 1000;
      const reprojected = is3857 ? geom : (feature4326To3857(geom) as Polygon | MultiPolygon);
      const normalized = normalizeToPolygon(reprojected);
      // Check if normalized polygon is valid (has coordinates)
      if (normalized.coordinates[0] && normalized.coordinates[0].length > 0) {
        return normalized;
      }
    }
    
    // Use fallback if RPC failed, returned null, or envelope is invalid
    return fallbackEnvelopeMeters;
  }, [envelope, status, fallbackEnvelopeMeters]);

  // Track whether we're using fallback envelope
  useEffect(() => {
    setUsingFallbackEnvelope(envelopeMeters === fallbackEnvelopeMeters && fallbackEnvelopeMeters !== null);
  }, [envelopeMeters, fallbackEnvelopeMeters]);

  // Elements and envelope stay in EPSG:3857 meters — no feet conversion.
  // The canvas viewport fits to processedGeometry (also EPSG:3857 meters).

  const handleGenerate = useCallback(async () => {
    if (!envelopeMeters) return;
    setIsGenerating(true);
    try {
      const parkingSpec = {
        stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
        stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
        aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
        anglesDeg: [0, 60, 90]
      };

      // Use the optimizer for "Generate Plan" — it runs simulated annealing
      const result = await workerManager.optimizeSite(
        envelopeMeters,
        config.zoning,
        config.designParameters,
        parkingSpec,
        200 // iterations
      );

      // Feed best result into the plan output (already in EPSG:3857 meters)
      setPlanOutput(
        result.bestElements || [],
        result.bestMetrics || null
      );
      setViolations(result.bestViolations || []);
      // Worker state is already synced with the optimizer's best buildings
      // (the OPTIMIZE handler sets siteState after optimize() returns)
      setSolverReady(true);
    } catch (error) {
      console.error('Failed to run optimizer:', error);
      // Fallback to basic initSite if optimizer fails
      try {
        const fallbackResult = await workerManager.initSite(envelopeMeters, config.zoning, undefined, {
          stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
          stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
          aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
          anglesDeg: [0, 60, 90]
        }, typologyToBuildingType(config.designParameters.buildingTypology));
        setPlanOutput(fallbackResult.elements || [], fallbackResult.metrics || null);
        setViolations(fallbackResult.violations || []);
        setSolverReady(true);
      } catch (fallbackErr) {
        setSolverReady(false);
        setViolations([{
          code: 'worker',
          message: `Failed to generate plan: ${String(error)}`,
          severity: 'error'
        }]);
      }
    } finally {
      setIsGenerating(false);
    }
  }, [config, envelopeMeters, setPlanOutput]);

  const handleBuildingUpdate = useCallback(
    (update: {
      id: string;
      anchor: { x: number; y: number };
      rotationRad: number;
      widthFt: number;
      depthFt: number;
      floors?: number;
    }, options?: { final?: boolean }) => {
      if (!envelopeMeters) return;
      const runUpdate = async () => {
        // Canvas coordinates are already in EPSG:3857 meters — pass directly to worker.
        // (The Shell field names say "Ft" but they're actually meters from the canvas.)
        const result = await workerManager.updateBuilding(update.id, {
          anchorX: update.anchor.x,
          anchorY: update.anchor.y,
          rotationRad: update.rotationRad,
          widthM: update.widthFt,
          depthM: update.depthFt,
          floors: update.floors
        });
        setPlanOutput(result.elements || [], result.metrics || null);
        setViolations(result.violations || []);
      };

      // No debounce here - Shell already debounces
      // Don't swallow errors - surface them to user
      runUpdate().catch(err => {
        console.error('Building update failed:', err);
        setViolations([{
          code: 'worker',
          message: String(err),
          severity: 'error'
        }]);
      });
    },
    [envelopeMeters, setPlanOutput]
  );

  const handleAddBuilding = useCallback(async () => {
    if (!envelopeMeters) {
      setViolations([{
        code: 'envelope',
        message: 'Buildable envelope not available. Please wait for envelope to load.',
        severity: 'error'
      }]);
      return;
    }

    // If solver not ready, initialize it first
    if (!solverReady) {
      try {
        const parkingSpec = {
          stallW: feetToMeters(config.designParameters.parking.stallWidthFt),
          stallD: feetToMeters(config.designParameters.parking.stallDepthFt),
          aisleW: feetToMeters(config.designParameters.parking.aisleWidthFt),
          anglesDeg: [0, 60, 90] as number[]
        };
        const init = await workerManager.initSite(envelopeMeters, config.zoning, undefined, parkingSpec);
        setPlanOutput(init.elements || [], init.metrics || null);
        setViolations(init.violations || []);
        setSolverReady(true);
      } catch (error) {
        console.error('Failed to initialize solver:', error);
        setViolations([{
          code: 'worker',
          message: `Failed to initialize solver: ${String(error)}`,
          severity: 'error'
        }]);
        setSolverReady(false);
        return;
      }
    }
    
    // Calculate envelope centroid in EPSG:3857 meters
    const coords = envelopeMeters.coordinates[0];
    const centroid = calculatePolygonCentroid(coords);
    const anchorX = centroid[0];
    const anchorY = centroid[1];
    
    // Find next available building ID
    const existingIds = elements.filter(e => e.type === 'building').map(e => e.id);
    let buildingNum = 1;
    while (existingIds.includes(`building-${buildingNum}`)) {
      buildingNum++;
    }
    const newId = `building-${buildingNum}`;
    
    // Default dimensions in meters (convert from design defaults in feet)
    const defaultWidthM = feetToMeters(100);
    const defaultDepthM = feetToMeters(50);
    const defaultFloors = 3;
    
    // handleBuildingUpdate now passes values directly to worker (already in meters)
    handleBuildingUpdate({
      id: newId,
      anchor: { x: anchorX, y: anchorY },
      rotationRad: 0,
      widthFt: defaultWidthM,   // actually meters — Shell field name is legacy
      depthFt: defaultDepthM,   // actually meters — Shell field name is legacy
      floors: defaultFloors
    }, { final: true });
  }, [envelopeMeters, elements, handleBuildingUpdate, solverReady, config, setPlanOutput]);

  const derivedInvestmentAnalysis = useMemo<InvestmentAnalysis | null>(() => {
    if (!metrics) return null;
    const gfa = metrics.totalBuiltSF;
    const units = Math.max(1, Math.floor(gfa * 0.85 / 750));
    const avgRentPerUnit = 1800;
    const grossRent = units * avgRentPerUnit * 12;
    const vacancy = grossRent * 0.05;
    const egi = grossRent - vacancy;
    const opex = egi * 0.35;
    const noi = egi - opex;
    const hardCosts = gfa * 165;
    const softCosts = hardCosts * 0.20;
    const totalDevCost = hardCosts + softCosts + (softCosts + hardCosts) * 0.05;
    const capRate = 0.055;
    const stabilizedValue = noi / capRate;
    const yieldOnCost = noi / totalDevCost;
    return {
      totalInvestment: totalDevCost,
      projectedRevenue: grossRent,
      operatingExpenses: opex,
      netOperatingIncome: noi,
      capRate,
      irr: yieldOnCost,
      paybackPeriod: totalDevCost / noi,
      riskAssessment: yieldOnCost > 0.07 ? 'low' : yieldOnCost > 0.05 ? 'medium' : 'high',
      // Required fields
      grossPotentialRent: grossRent,
      vacancyLoss: vacancy,
      effectiveGrossIncome: egi,
      totalDevelopmentCost: totalDevCost,
      totalHardCosts: hardCosts,
      softCosts: softCosts,
      contingency: (softCosts + hardCosts) * 0.05,
      financingCosts: 0,
      landCost: parcel.parval ?? 0,
      yieldOnCost: yieldOnCost,
      stabilizedValue: stabilizedValue,
      profit: stabilizedValue - totalDevCost,
      equityMultiple: 0,
      cashOnCash: 0,
      costPerUnit: totalDevCost / units,
      costPerSF: totalDevCost / gfa,
    };
  }, [metrics, parcel.parval]);

  useEffect(() => {
    setInvestmentAnalysis(derivedInvestmentAnalysis);
  }, [derivedInvestmentAnalysis]);

  useEffect(() => {
    // Run handleGenerate when we have ANY envelope (ready or fallback), not just when status === 'ready'
    if (!hasValidGeometry || !envelopeMeters) return;
    if (generateTimerRef.current) {
      window.clearTimeout(generateTimerRef.current);
    }
    generateTimerRef.current = window.setTimeout(() => {
      handleGenerate().catch(() => undefined);
    }, 200);
    return () => {
      if (generateTimerRef.current) {
        window.clearTimeout(generateTimerRef.current);
      }
    };
  }, [config, handleGenerate, hasValidGeometry, envelopeMeters]);

  const plannerParcel = isValidParcel(parcel)
    ? parcel
    : createFallbackParcel(parcel.ogc_fid || parcel.id || 'unknown', parcel.sqft || 4356);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Site Plan</h2>
        <div className="flex flex-col xl:flex-row gap-6 h-[800px]">
          <ParametersPanel
            parcel={parcel}
            config={config}
            onConfigChange={updateConfig}
            rpcMetrics={rpcMetrics}
            status={status}
            isGenerating={isGenerating}
            onGenerate={handleGenerate}
            onGenerateAlternatives={generateAlternativePlans}
            alternatives={alternatives}
            selectedSolveIndex={selectedSolveIndex}
            onSelectSolve={selectSolve}
            savedPlans={savedPlans}
            savedPlansLoading={savedPlansLoading}
            savedPlansError={savedPlansError}
            onSavePlan={handleSavePlan}
            onLoadPlan={handleLoadPlan}
            onDeletePlan={deletePlanFromDb}
            onToggleFavorite={togglePlanFavorite}
            currentElements={elements}
            currentMetrics={metrics}
            currentViolations={violations}
            currentInvestment={investmentAnalysis}
          />

          <div className="flex-1 min-w-0">
            <div className="h-full">
              <SitePlannerErrorBoundary>
                <EnterpriseSitePlanner
                  parcel={plannerParcel}
                  planElements={elements}
                  metrics={metrics || undefined}
                  selectedSolve={selectedSolve || undefined}
                  parkingViz={{
                    angleDeg: metrics?.parkingAngleDeg ?? 0,
                    stallWidthFt: config.designParameters.parking.stallWidthFt,
                    stallDepthFt: config.designParameters.parking.stallDepthFt
                  }}
                  buildableEnvelope={envelopeMeters || undefined}
                  onBuildingUpdate={handleBuildingUpdate}
                  onAddBuilding={handleAddBuilding}
                  envelopeStatus={status}
                  envelopeError={envelopeError}
                  usingFallbackEnvelope={usingFallbackEnvelope}
                  onRetryEnvelope={() => {
                    // Force re-fetch by clearing the ref and triggering useEffect
                    // The hook will re-fetch when parcel.ogc_fid changes or ref is cleared
                    window.location.reload();
                  }}
                />
              </SitePlannerErrorBoundary>
            </div>
          </div>

          <ResultsPanel
            metrics={metrics}
            investmentAnalysis={investmentAnalysis}
            isGenerating={isGenerating}
            violations={violations}
            edgeClassifications={edgeClassifications}
            setbacks={rpcMetrics?.setbacks}
          />
        </div>
      </div>
    </div>
  );
};

export default SiteWorkspace;
