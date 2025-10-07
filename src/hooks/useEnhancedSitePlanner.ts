/**
 * Enhanced Site Planner Hook
 * 
 * This hook combines functionality from multiple site planner components
 * into a single, unified interface while maintaining backward compatibility.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSitePlanStore, SitePlanDesign, ValidationResult, SitePlanMetrics } from '../store/sitePlan';
import { useHBUAnalysis } from './useHBUAnalysis';
import { SelectedParcel } from '../types/parcel';
import { HBUAnalysis } from '../services/hbuAnalysis';

export interface EnhancedSitePlannerState {
  // Current state
  activeSitePlan: SitePlanDesign | null;
  isGenerating: boolean;
  isOptimizing: boolean;
  validation: ValidationResult | null;
  metrics: SitePlanMetrics | null;
  
  // UI state
  showAIGenerator: boolean;
  showOptimizer: boolean;
  showValidator: boolean;
}

export interface EnhancedSitePlannerActions {
  // AI Generation
  generateAISitePlan: (parcel: SelectedParcel, analysis?: HBUAnalysis) => Promise<SitePlanDesign>;
  
  // Site Plan Management
  createSitePlan: (parcelId: string, projectId?: string) => SitePlanDesign;
  updateSitePlan: (updates: Partial<SitePlanDesign>) => void;
  saveSitePlan: (sitePlan: SitePlanDesign) => void;
  loadSitePlan: (sitePlanId: string) => SitePlanDesign | null;
  
  // Optimization
  optimizeSitePlan: () => Promise<SitePlanDesign>;
  
  // Validation
  validateSitePlan: () => ValidationResult;
  
  // Metrics
  calculateMetrics: () => SitePlanMetrics;
  
  // UI Controls
  toggleAIGenerator: () => void;
  toggleOptimizer: () => void;
  toggleValidator: () => void;
  
  // Element Management
  addElement: (element: any) => void;
  updateElement: (elementId: string, updates: any) => void;
  removeElement: (elementId: string) => void;
}

export function useEnhancedSitePlanner() {
  // Zustand store
  const {
    activeSitePlan,
    isEditing,
    hasUnsavedChanges,
    createSitePlan: storeCreateSitePlan,
    updateSitePlan: storeUpdateSitePlan,
    saveSitePlan: storeSaveSitePlan,
    loadSitePlan: storeLoadSitePlan,
    generateAISitePlan: storeGenerateAISitePlan,
    enhanceSitePlan: storeEnhanceSitePlan,
    validateSitePlan: storeValidateSitePlan,
    optimizeSitePlan: storeOptimizeSitePlan,
    getSitePlanMetrics: storeGetSitePlanMetrics,
    addElement: storeAddElement,
    updateElement: storeUpdateElement,
    removeElement: storeRemoveElement
  } = useSitePlanStore();

  // HBU Analysis hook
  const { analysis, loading: hbuLoading, analyzeParcel } = useHBUAnalysis();

  // Local state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [showValidator, setShowValidator] = useState(false);

  // Computed state
  const validation = useMemo(() => {
    if (!activeSitePlan) return null;
    return storeValidateSitePlan(activeSitePlan);
  }, [activeSitePlan, storeValidateSitePlan]);

  const metrics = useMemo(() => {
    if (!activeSitePlan) return null;
    return storeGetSitePlanMetrics(activeSitePlan);
  }, [activeSitePlan, storeGetSitePlanMetrics]);

  // AI Generation
  const generateAISitePlan = useCallback(async (parcel: SelectedParcel, analysis?: HBUAnalysis) => {
    setIsGenerating(true);
    try {
      // Use provided analysis or run new analysis
      const hbuAnalysis = analysis || await analyzeParcel(parcel);
      
      if (!hbuAnalysis) {
        throw new Error('Failed to generate HBU analysis');
      }

      // Generate AI site plan
      const aiSitePlan = await storeGenerateAISitePlan(parcel, hbuAnalysis);
      
      return aiSitePlan;
    } catch (error) {
      console.error('AI site plan generation failed:', error);
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, [analyzeParcel, storeGenerateAISitePlan]);

  // Site Plan Management
  const createSitePlan = useCallback((parcelId: string, projectId?: string) => {
    return storeCreateSitePlan(parcelId, projectId);
  }, [storeCreateSitePlan]);

  const updateSitePlan = useCallback((updates: Partial<SitePlanDesign>) => {
    if (!activeSitePlan) return;
    storeUpdateSitePlan(activeSitePlan.id, updates);
  }, [activeSitePlan, storeUpdateSitePlan]);

  const saveSitePlan = useCallback((sitePlan: SitePlanDesign) => {
    storeSaveSitePlan(sitePlan);
  }, [storeSaveSitePlan]);

  const loadSitePlan = useCallback((sitePlanId: string) => {
    return storeLoadSitePlan(sitePlanId);
  }, [storeLoadSitePlan]);

  // Optimization
  const optimizeSitePlan = useCallback(async () => {
    if (!activeSitePlan) return null;
    
    setIsOptimizing(true);
    try {
      const optimized = storeOptimizeSitePlan(activeSitePlan);
      return optimized;
    } catch (error) {
      console.error('Site plan optimization failed:', error);
      throw error;
    } finally {
      setIsOptimizing(false);
    }
  }, [activeSitePlan, storeOptimizeSitePlan]);

  // Validation
  const validateSitePlan = useCallback(() => {
    if (!activeSitePlan) {
      return {
        isValid: false,
        errors: ['No active site plan'],
        warnings: [],
        score: 0
      };
    }
    return storeValidateSitePlan(activeSitePlan);
  }, [activeSitePlan, storeValidateSitePlan]);

  // Metrics
  const calculateMetrics = useCallback(() => {
    if (!activeSitePlan) {
      return {
        totalArea: 0,
        buildingArea: 0,
        parkingArea: 0,
        landscapingArea: 0,
        buildingCoverage: 0,
        parkingRatio: 0,
        unitDensity: 0,
        efficiency: 0
      };
    }
    return storeGetSitePlanMetrics(activeSitePlan);
  }, [activeSitePlan, storeGetSitePlanMetrics]);

  // UI Controls
  const toggleAIGenerator = useCallback(() => {
    setShowAIGenerator(prev => !prev);
  }, []);

  const toggleOptimizer = useCallback(() => {
    setShowOptimizer(prev => !prev);
  }, []);

  const toggleValidator = useCallback(() => {
    setShowValidator(prev => !prev);
  }, []);

  // Element Management
  const addElement = useCallback((element: any) => {
    storeAddElement(element);
  }, [storeAddElement]);

  const updateElement = useCallback((elementId: string, updates: any) => {
    storeUpdateElement(elementId, updates);
  }, [storeUpdateElement]);

  const removeElement = useCallback((elementId: string) => {
    storeRemoveElement(elementId);
  }, [storeRemoveElement]);

  // Return state and actions
  const state: EnhancedSitePlannerState = {
    activeSitePlan,
    isGenerating,
    isOptimizing,
    validation,
    metrics,
    showAIGenerator,
    showOptimizer,
    showValidator
  };

  const actions: EnhancedSitePlannerActions = {
    generateAISitePlan,
    createSitePlan,
    updateSitePlan,
    saveSitePlan,
    loadSitePlan,
    optimizeSitePlan,
    validateSitePlan,
    calculateMetrics,
    toggleAIGenerator,
    toggleOptimizer,
    toggleValidator,
    addElement,
    updateElement,
    removeElement
  };

  return {
    ...state,
    ...actions,
    // Additional computed properties
    isEditing,
    hasUnsavedChanges,
    hbuAnalysis: analysis,
    hbuLoading
  };
}

export default useEnhancedSitePlanner;
