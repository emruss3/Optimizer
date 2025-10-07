/**
 * Site Planner Adapter Components
 * 
 * These adapters maintain backward compatibility with existing components
 * while routing functionality to the new consolidated components.
 */

import React from 'react';
import { SelectedParcel } from '../../types/parcel';
import { HBUAnalysis } from '../../services/hbuAnalysis';
import ConsolidatedSitePlanner from '../ConsolidatedSitePlanner';

// Adapter for AIDrivenSitePlanGenerator
interface AIDrivenSitePlanGeneratorAdapterProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  hbuAnalysis?: HBUAnalysis | null;
  onAnalysisComplete?: (analysis: HBUAnalysis) => void;
  onSitePlanGenerated?: (sitePlan: any) => void;
}

export function AIDrivenSitePlanGeneratorAdapter({
  isOpen,
  onClose,
  selectedParcel,
  hbuAnalysis,
  onAnalysisComplete,
  onSitePlanGenerated
}: AIDrivenSitePlanGeneratorAdapterProps) {
  return (
    <ConsolidatedSitePlanner
      isOpen={isOpen}
      onClose={onClose}
      selectedParcel={selectedParcel}
      mode="ai-generation"
      hbuAnalysis={hbuAnalysis}
      onAnalysisComplete={onAnalysisComplete}
      onSitePlanGenerated={onSitePlanGenerated}
    />
  );
}

// Adapter for EnhancedSitePlanner
interface EnhancedSitePlannerAdapterProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  hbuAnalysis?: any;
  onSitePlanSaved?: (sitePlan: any) => void;
  onContinueToUnderwriting?: (sitePlan: any) => void;
}

export function EnhancedSitePlannerAdapter({
  isOpen,
  onClose,
  selectedParcel,
  hbuAnalysis,
  onSitePlanSaved,
  onContinueToUnderwriting
}: EnhancedSitePlannerAdapterProps) {
  return (
    <ConsolidatedSitePlanner
      isOpen={isOpen}
      onClose={onClose}
      selectedParcel={selectedParcel}
      mode="enhanced"
      hbuAnalysis={hbuAnalysis}
      onSitePlanSaved={onSitePlanSaved}
      onContinueToUnderwriting={onContinueToUnderwriting}
    />
  );
}

// Adapter for SitePlanDesigner
interface SitePlanDesignerAdapterProps {
  parcel: SelectedParcel;
  onUnderwritingUpdate?: (financialData: any) => void;
}

export function SitePlanDesignerAdapter({
  parcel,
  onUnderwritingUpdate
}: SitePlanDesignerAdapterProps) {
  return (
    <ConsolidatedSitePlanner
      isOpen={true}
      onClose={() => {}}
      selectedParcel={parcel}
      mode="design"
      onSitePlanGenerated={(sitePlan) => {
        if (onUnderwritingUpdate) {
          onUnderwritingUpdate(sitePlan.financial);
        }
      }}
    />
  );
}

// Adapter for EnterpriseSitePlanner
interface EnterpriseSitePlannerAdapterProps {
  parcel: SelectedParcel;
  onSitePlanUpdate?: (sitePlan: any) => void;
}

export function EnterpriseSitePlannerAdapter({
  parcel,
  onSitePlanUpdate
}: EnterpriseSitePlannerAdapterProps) {
  return (
    <ConsolidatedSitePlanner
      isOpen={true}
      onClose={() => {}}
      selectedParcel={parcel}
      mode="design"
      onSitePlanGenerated={onSitePlanUpdate}
    />
  );
}

// Export all adapters
export {
  AIDrivenSitePlanGeneratorAdapter as AIDrivenSitePlanGenerator,
  EnhancedSitePlannerAdapter as EnhancedSitePlanner,
  SitePlanDesignerAdapter as SitePlanDesigner,
  EnterpriseSitePlannerAdapter as EnterpriseSitePlanner
};
