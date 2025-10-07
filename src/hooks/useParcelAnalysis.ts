// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { useState, useCallback, useEffect } from 'react';
import { 
  parcelAnalysisService, 
  ParcelAnalysisResult, 
  PlannerJoinData, 
  PadScore,
  GeoJSONGeometry 
} from '../services/parcelAnalysis';

export interface UseParcelAnalysisState {
  // Data
  parcel: PlannerJoinData | null;
  envelope: GeoJSONGeometry | null;
  score: PadScore | null;
  analysisResult: ParcelAnalysisResult | null;
  
  // Loading states
  isLoadingParcel: boolean;
  isLoadingEnvelope: boolean;
  isLoadingScore: boolean;
  isAnalyzing: boolean;
  
  // Error states
  error: string | null;
  parcelError: string | null;
  envelopeError: string | null;
  scoreError: string | null;
  
  // Validation
  isValidParcelId: boolean;
  isValidatingParcelId: boolean;
}

export interface UseParcelAnalysisActions {
  // Core analysis functions
  fetchParcel: (parcelId: string) => Promise<void>;
  calculateEnvelope: (parcelId: string) => Promise<void>;
  scorePad: (parcelId: string, padGeometry: GeoJSONGeometry, parkingGeometry?: GeoJSONGeometry | null) => Promise<void>;
  analyzeParcel: (parcelId: string, padGeometry?: GeoJSONGeometry, parkingGeometry?: GeoJSONGeometry | null) => Promise<void>;
  
  // Validation
  validateParcelId: (parcelId: string) => Promise<void>;
  
  // Utility functions
  clearData: () => void;
  clearErrors: () => void;
  reset: () => void;
}

export interface UseParcelAnalysisReturn extends UseParcelAnalysisState, UseParcelAnalysisActions {}

/**
 * React hook for parcel analysis workflow
 * Provides state management and actions for parcel data fetching, envelope calculation, and scoring
 */
export function useParcelAnalysis(): UseParcelAnalysisReturn {
  // State
  const [parcel, setParcel] = useState<PlannerJoinData | null>(null);
  const [envelope, setEnvelope] = useState<GeoJSONGeometry | null>(null);
  const [score, setScore] = useState<PadScore | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ParcelAnalysisResult | null>(null);
  
  // Loading states
  const [isLoadingParcel, setIsLoadingParcel] = useState(false);
  const [isLoadingEnvelope, setIsLoadingEnvelope] = useState(false);
  const [isLoadingScore, setIsLoadingScore] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Error states
  const [error, setError] = useState<string | null>(null);
  const [parcelError, setParcelError] = useState<string | null>(null);
  const [envelopeError, setEnvelopeError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  
  // Validation
  const [isValidParcelId, setIsValidParcelId] = useState(false);
  const [isValidatingParcelId, setIsValidatingParcelId] = useState(false);

  // Actions
  const fetchParcel = useCallback(async (parcelId: string) => {
    if (!parcelId) {
      setParcelError('Parcel ID is required');
      return;
    }

    setIsLoadingParcel(true);
    setParcelError(null);
    setError(null);

    try {
      console.log('🔍 Fetching parcel data for:', parcelId);
      const parcelData = await parcelAnalysisService.fetchParcelData(parcelId);
      
      if (parcelData) {
        setParcel(parcelData);
        setIsValidParcelId(true);
        console.log('✅ Parcel data fetched successfully');
      } else {
        setParcelError('Failed to fetch parcel data');
        setIsValidParcelId(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setParcelError(errorMessage);
      setError(errorMessage);
      setIsValidParcelId(false);
      console.error('❌ Error fetching parcel:', err);
    } finally {
      setIsLoadingParcel(false);
    }
  }, []);

  const calculateEnvelope = useCallback(async (parcelId: string) => {
    if (!parcelId) {
      setEnvelopeError('Parcel ID is required');
      return;
    }

    setIsLoadingEnvelope(true);
    setEnvelopeError(null);
    setError(null);

    try {
      console.log('🏗️ Calculating buildable envelope for:', parcelId);
      const envelopeData = await parcelAnalysisService.getBuildableEnvelope(parcelId);
      
      if (envelopeData) {
        setEnvelope(envelopeData);
        console.log('✅ Buildable envelope calculated successfully');
      } else {
        setEnvelopeError('Failed to calculate buildable envelope');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setEnvelopeError(errorMessage);
      setError(errorMessage);
      console.error('❌ Error calculating envelope:', err);
    } finally {
      setIsLoadingEnvelope(false);
    }
  }, []);

  const scorePad = useCallback(async (
    parcelId: string, 
    padGeometry: GeoJSONGeometry, 
    parkingGeometry?: GeoJSONGeometry | null
  ) => {
    if (!parcelId) {
      setScoreError('Parcel ID is required');
      return;
    }

    if (!padGeometry) {
      setScoreError('Pad geometry is required');
      return;
    }

    setIsLoadingScore(true);
    setScoreError(null);
    setError(null);

    try {
      console.log('📊 Scoring pad for parcel:', parcelId);
      const scoreData = await parcelAnalysisService.scorePad(parcelId, padGeometry, parkingGeometry);
      
      if (scoreData) {
        setScore(scoreData);
        console.log('✅ Pad scored successfully');
      } else {
        setScoreError('Failed to score pad');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setScoreError(errorMessage);
      setError(errorMessage);
      console.error('❌ Error scoring pad:', err);
    } finally {
      setIsLoadingScore(false);
    }
  }, []);

  const analyzeParcel = useCallback(async (
    parcelId: string, 
    padGeometry?: GeoJSONGeometry, 
    parkingGeometry?: GeoJSONGeometry | null
  ) => {
    if (!parcelId) {
      setError('Parcel ID is required');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setParcelError(null);
    setEnvelopeError(null);
    setScoreError(null);

    try {
      console.log('🚀 Starting complete parcel analysis for:', parcelId);
      const result = await parcelAnalysisService.analyzeParcel(parcelId, padGeometry, parkingGeometry);
      
      if (result) {
        setAnalysisResult(result);
        setParcel(result.parcel);
        setEnvelope(result.envelope);
        setScore(result.score);
        setIsValidParcelId(true);
        console.log('✅ Complete parcel analysis finished successfully');
      } else {
        setError('Failed to complete parcel analysis');
        setIsValidParcelId(false);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setIsValidParcelId(false);
      console.error('❌ Error in parcel analysis:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const validateParcelId = useCallback(async (parcelId: string) => {
    if (!parcelId) {
      setIsValidParcelId(false);
      return;
    }

    setIsValidatingParcelId(true);

    try {
      console.log('✅ Validating parcel ID:', parcelId);
      const isValid = await parcelAnalysisService.validateParcelId(parcelId);
      setIsValidParcelId(isValid);
      console.log('✅ Parcel ID validation result:', isValid);
    } catch (err) {
      console.error('❌ Error validating parcel ID:', err);
      setIsValidParcelId(false);
    } finally {
      setIsValidatingParcelId(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setParcel(null);
    setEnvelope(null);
    setScore(null);
    setAnalysisResult(null);
  }, []);

  const clearErrors = useCallback(() => {
    setError(null);
    setParcelError(null);
    setEnvelopeError(null);
    setScoreError(null);
  }, []);

  const reset = useCallback(() => {
    clearData();
    clearErrors();
    setIsValidParcelId(false);
  }, [clearData, clearErrors]);

  // Computed state
  const hasData = parcel || envelope || score || analysisResult;
  const hasErrors = error || parcelError || envelopeError || scoreError;
  const isLoading = isLoadingParcel || isLoadingEnvelope || isLoadingScore || isAnalyzing;

  return {
    // State
    parcel,
    envelope,
    score,
    analysisResult,
    isLoadingParcel,
    isLoadingEnvelope,
    isLoadingScore,
    isAnalyzing,
    error,
    parcelError,
    envelopeError,
    scoreError,
    isValidParcelId,
    isValidatingParcelId,
    
    // Actions
    fetchParcel,
    calculateEnvelope,
    scorePad,
    analyzeParcel,
    validateParcelId,
    clearData,
    clearErrors,
    reset,
    
    // Computed
    hasData,
    hasErrors,
    isLoading
  } as UseParcelAnalysisReturn;
}

/**
 * Hook for batch parcel analysis
 */
export function useBatchParcelAnalysis() {
  const [results, setResults] = useState<ParcelAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const analyzeMultipleParcels = useCallback(async (parcelIds: string[]) => {
    if (!parcelIds || parcelIds.length === 0) {
      setError('No parcel IDs provided');
      return;
    }

    setIsLoading(true);
    setError(null);
    setProgress({ current: 0, total: parcelIds.length });
    setResults([]);

    try {
      console.log('🔄 Starting batch analysis for', parcelIds.length, 'parcels');
      const batchResults = await parcelAnalysisService.analyzeMultipleParcels(parcelIds);
      setResults(batchResults);
      setProgress({ current: parcelIds.length, total: parcelIds.length });
      console.log('✅ Batch analysis complete:', batchResults.length, 'results');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error in batch analysis:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
    setProgress({ current: 0, total: 0 });
  }, []);

  return {
    results,
    isLoading,
    error,
    progress,
    analyzeMultipleParcels,
    clearResults
  };
}
