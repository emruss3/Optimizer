import { useState, useCallback, useMemo } from 'react';
import { HBUAnalyzer, HBUAnalysis, HBUAlternative } from '../services/hbuAnalysis';
import { SelectedParcel } from '../types/parcel';

export function useHBUAnalysis() {
  const [analyzer] = useState(() => new HBUAnalyzer());
  const [analysis, setAnalysis] = useState<HBUAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeParcel = useCallback(async (parcel: SelectedParcel) => {
    setLoading(true);
    setError(null);
    
    try {
      const result = await analyzer.analyzeHBU(parcel);
      setAnalysis(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [analyzer]);

  const clearAnalysis = useCallback(() => {
    setAnalysis(null);
    setError(null);
  }, []);

  const getTopAlternatives = useCallback((limit: number = 3): HBUAlternative[] => {
    if (!analysis) return [];
    return analysis.alternatives.slice(0, limit);
  }, [analysis]);

  const getRecommendedAlternative = useCallback((): HBUAlternative | null => {
    if (!analysis || analysis.alternatives.length === 0) return null;
    return analysis.alternatives[0];
  }, [analysis]);

  const getConfidenceLevel = useCallback((): 'high' | 'medium' | 'low' => {
    if (!analysis) return 'low';
    if (analysis.confidence >= 80) return 'high';
    if (analysis.confidence >= 60) return 'medium';
    return 'low';
  }, [analysis]);

  const getRiskFactors = useCallback((): string[] => {
    if (!analysis) return [];
    
    const risks: string[] = [];
    
    if (analysis.confidence < 70) {
      risks.push('Low confidence in analysis');
    }
    
    if (analysis.constraints.some(c => c.impact === 'limiting')) {
      risks.push('Significant zoning constraints');
    }
    
    if (analysis.alternatives.length < 2) {
      risks.push('Limited development options');
    }
    
    const negativeMarketFactors = analysis.marketFactors.filter(f => f.impact === 'negative');
    if (negativeMarketFactors.length > 0) {
      risks.push('Negative market factors present');
    }
    
    return risks;
  }, [analysis]);

  const getOpportunities = useCallback((): string[] => {
    if (!analysis) return [];
    
    const opportunities: string[] = [];
    
    if (analysis.confidence >= 80) {
      opportunities.push('High confidence in recommended use');
    }
    
    if (analysis.alternatives.length >= 3) {
      opportunities.push('Multiple viable development options');
    }
    
    const positiveMarketFactors = analysis.marketFactors.filter(f => f.impact === 'positive');
    if (positiveMarketFactors.length > 0) {
      opportunities.push('Favorable market conditions');
    }
    
    if (analysis.recommendedUse === 'mixed-use') {
      opportunities.push('Mixed-use development potential');
    }
    
    return opportunities;
  }, [analysis]);

  const getFinancialSummary = useCallback(() => {
    if (!analysis) return null;
    
    const recommended = getRecommendedAlternative();
    if (!recommended) return null;
    
    return {
      estimatedValue: recommended.estimatedValue,
      developmentCost: recommended.developmentCost,
      netPresentValue: recommended.netPresentValue,
      internalRateOfReturn: recommended.internalRateOfReturn,
      paybackPeriod: recommended.paybackPeriod,
      confidence: recommended.confidence
    };
  }, [analysis, getRecommendedAlternative]);

  const getConstraintSummary = useCallback(() => {
    if (!analysis) return null;
    
    const limiting = analysis.constraints.filter(c => c.impact === 'limiting');
    const moderate = analysis.constraints.filter(c => c.impact === 'moderate');
    const minimal = analysis.constraints.filter(c => c.impact === 'minimal');
    
    return {
      limiting: limiting.length,
      moderate: moderate.length,
      minimal: minimal.length,
      total: analysis.constraints.length,
      constraints: analysis.constraints
    };
  }, [analysis]);

  const getMarketSummary = useCallback(() => {
    if (!analysis) return null;
    
    const positive = analysis.marketFactors.filter(f => f.impact === 'positive');
    const negative = analysis.marketFactors.filter(f => f.impact === 'negative');
    const neutral = analysis.marketFactors.filter(f => f.impact === 'neutral');
    
    return {
      positive: positive.length,
      negative: negative.length,
      neutral: neutral.length,
      total: analysis.marketFactors.length,
      factors: analysis.marketFactors
    };
  }, [analysis]);

  const isAnalysisComplete = useMemo(() => {
    return analysis !== null && !loading && !error;
  }, [analysis, loading, error]);

  const hasHighConfidence = useMemo(() => {
    return analysis !== null && analysis.confidence >= 80;
  }, [analysis]);

  const hasMultipleAlternatives = useMemo(() => {
    return analysis !== null && analysis.alternatives.length >= 2;
  }, [analysis]);

  return {
    // State
    analysis,
    loading,
    error,
    
    // Actions
    analyzeParcel,
    clearAnalysis,
    
    // Computed values
    getTopAlternatives,
    getRecommendedAlternative,
    getConfidenceLevel,
    getRiskFactors,
    getOpportunities,
    getFinancialSummary,
    getConstraintSummary,
    getMarketSummary,
    
    // Status flags
    isAnalysisComplete,
    hasHighConfidence,
    hasMultipleAlternatives
  };
}
