// LEGACY / DEV-ONLY: Do not import into production flows. See docs/site_planner_live_vs_legacy.md.

/**
 * Site Planner Wrapper Component
 * 
 * This is a thin wrapper around the ConsolidatedSitePlanner that provides
 * different modes and maintains backward compatibility with existing components.
 */

import React, { useState, useCallback } from 'react';
import { SelectedParcel } from '../types/parcel';
import { HBUAnalysis } from '../services/hbuAnalysis';
import ConsolidatedSitePlanner, { SitePlannerMode } from './ConsolidatedSitePlanner';

interface SitePlannerWrapperProps {
  // Core props
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  
  // Mode configuration
  mode?: SitePlannerMode;
  
  // AI props
  hbuAnalysis?: HBUAnalysis | null;
  onAnalysisComplete?: (analysis: HBUAnalysis) => void;
  
  // Site plan props
  onSitePlanGenerated?: (sitePlan: any) => void;
  onSitePlanSaved?: (sitePlan: any) => void;
  onContinueToUnderwriting?: (sitePlan: any) => void;
  
  // UI state
  showAIGenerator?: boolean;
  showOptimizer?: boolean;
  showValidator?: boolean;
}

export function SitePlannerWrapper({
  isOpen,
  onClose,
  selectedParcel,
  mode = 'design',
  hbuAnalysis,
  onAnalysisComplete,
  onSitePlanGenerated,
  onSitePlanSaved,
  onContinueToUnderwriting,
  showAIGenerator = false,
  showOptimizer = false,
  showValidator = false
}: SitePlannerWrapperProps) {
  // Local state for UI controls
  const [internalShowAIGenerator, setInternalShowAIGenerator] = useState(showAIGenerator);
  const [internalShowOptimizer, setInternalShowOptimizer] = useState(showOptimizer);
  const [internalShowValidator, setInternalShowValidator] = useState(showValidator);

  // Handle AI generator toggle
  const handleToggleAIGenerator = useCallback(() => {
    setInternalShowAIGenerator(prev => !prev);
  }, []);

  // Handle optimizer toggle
  const handleToggleOptimizer = useCallback(() => {
    setInternalShowOptimizer(prev => !prev);
  }, []);

  // Handle validator toggle
  const handleToggleValidator = useCallback(() => {
    setInternalShowValidator(prev => !prev);
  }, []);

  // Handle site plan generation
  const handleSitePlanGenerated = useCallback((sitePlan: any) => {
    if (onSitePlanGenerated) {
      onSitePlanGenerated(sitePlan);
    }
  }, [onSitePlanGenerated]);

  // Handle site plan saving
  const handleSitePlanSaved = useCallback((sitePlan: any) => {
    if (onSitePlanSaved) {
      onSitePlanSaved(sitePlan);
    }
  }, [onSitePlanSaved]);

  // Handle continue to underwriting
  const handleContinueToUnderwriting = useCallback((sitePlan: any) => {
    if (onContinueToUnderwriting) {
      onContinueToUnderwriting(sitePlan);
    }
  }, [onContinueToUnderwriting]);

  // Handle analysis completion
  const handleAnalysisComplete = useCallback((analysis: HBUAnalysis) => {
    if (onAnalysisComplete) {
      onAnalysisComplete(analysis);
    }
  }, [onAnalysisComplete]);

  return (
    <ConsolidatedSitePlanner
      isOpen={isOpen}
      onClose={onClose}
      selectedParcel={selectedParcel}
      mode={mode}
      hbuAnalysis={hbuAnalysis}
      onAnalysisComplete={handleAnalysisComplete}
      onSitePlanGenerated={handleSitePlanGenerated}
      onSitePlanSaved={handleSitePlanSaved}
      onContinueToUnderwriting={handleContinueToUnderwriting}
      showAIGenerator={internalShowAIGenerator}
      showOptimizer={internalShowOptimizer}
      showValidator={internalShowValidator}
    />
  );
}

export default SitePlannerWrapper;
