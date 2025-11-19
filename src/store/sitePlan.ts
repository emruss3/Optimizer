// LEGACY / DEV-ONLY: Do not import into production flows. See docs/site_planner_live_vs_legacy.md.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SelectedParcel } from '../types/parcel';
import { HBUAnalysis } from '../services/hbuAnalysis';

export interface SitePlanElement {
  id: string;
  type: 'building' | 'parking' | 'landscaping' | 'road' | 'utility';
  name: string;
  vertices: Array<{ x: number; y: number; id: string }>;
  properties: {
    area?: number;
    units?: number;
    parkingSpaces?: number;
    height?: number;
    stories?: number;
    use?: string;
    [key: string]: any;
  };
  metadata: {
    created: string;
    modified: string;
    source: 'ai-generated' | 'user-created' | 'imported';
  };
}

export interface SitePlanDesign {
  id: string;
  name: string;
  description: string;
  parcelId: string;
  projectId?: string;
  elements: SitePlanElement[];
  metadata: {
    created: string;
    modified: string;
    version: number;
    aiGenerated: boolean;
    hbuAnalysisId?: string;
  };
  compliance: {
    zoningCompliant: boolean;
    violations: string[];
    warnings: string[];
    score: number;
  };
  financial: {
    estimatedValue: number;
    developmentCost: number;
    irr: number;
    roi: number;
    totalUnits: number;
    totalGSF: number;
    parkingSpaces: number;
  };
}

interface SitePlanStore {
  // Current active site plan
  activeSitePlan: SitePlanDesign | null;
  
  // All saved site plans
  savedSitePlans: SitePlanDesign[];
  
  // Current editing state
  isEditing: boolean;
  hasUnsavedChanges: boolean;
  
  // Selected parcel for planning
  selectedParcel: SelectedParcel | null;
  
  // Actions
  setSelectedParcel: (parcel: SelectedParcel | null) => void;
  createSitePlan: (parcelId: string, projectId?: string, aiData?: any) => SitePlanDesign;
  updateSitePlan: (sitePlanId: string, updates: Partial<SitePlanDesign>) => void;
  saveSitePlan: (sitePlan: SitePlanDesign) => void;
  loadSitePlan: (sitePlanId: string) => SitePlanDesign | null;
  deleteSitePlan: (sitePlanId: string) => void;
  setActiveSitePlan: (sitePlan: SitePlanDesign | null) => void;
  addElement: (element: SitePlanElement) => void;
  updateElement: (elementId: string, updates: Partial<SitePlanElement>) => void;
  removeElement: (elementId: string) => void;
  markAsUnsaved: () => void;
  markAsSaved: () => void;
  generateFromAI: (hbuAnalysis: any, parcelData: any) => SitePlanDesign;
  exportSitePlan: (sitePlanId: string) => any;
  importSitePlan: (data: any) => SitePlanDesign;
  
  // Enhanced methods for AI generation and validation
  generateAISitePlan: (parcel: SelectedParcel, analysis: HBUAnalysis) => Promise<SitePlanDesign>;
  enhanceSitePlan: (sitePlan: SitePlanDesign) => SitePlanDesign;
  validateSitePlan: (sitePlan: SitePlanDesign) => ValidationResult;
  optimizeSitePlan: (sitePlan: SitePlanDesign) => SitePlanDesign;
  getSitePlanMetrics: (sitePlan: SitePlanDesign) => SitePlanMetrics;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}

export interface SitePlanMetrics {
  totalArea: number;
  buildingArea: number;
  parkingArea: number;
  landscapingArea: number;
  buildingCoverage: number;
  parkingRatio: number;
  unitDensity: number;
  efficiency: number;
}

export const useSitePlanStore = create<SitePlanStore>()(
  persist(
    (set, get) => ({
      activeSitePlan: null,
      savedSitePlans: [],
      isEditing: false,
      hasUnsavedChanges: false,
      selectedParcel: null,

      setSelectedParcel: (parcel: SelectedParcel | null) => {
        set({ selectedParcel: parcel });
      },

      createSitePlan: (parcelId: string, projectId?: string, aiData?: any) => {
        const now = new Date().toISOString();
        const sitePlan: SitePlanDesign = {
          id: `siteplan_${Date.now()}`,
          name: aiData?.name || 'New Site Plan',
          description: aiData?.description || 'Site plan design',
          parcelId,
          projectId,
          elements: aiData?.elements || [],
          metadata: {
            created: now,
            modified: now,
            version: 1,
            aiGenerated: !!aiData,
            hbuAnalysisId: aiData?.hbuAnalysisId
          },
          compliance: {
            zoningCompliant: true,
            violations: [],
            warnings: [],
            score: 85
          },
          financial: {
            estimatedValue: aiData?.financial?.estimatedValue || 0,
            developmentCost: aiData?.financial?.developmentCost || 0,
            irr: aiData?.financial?.irr || 0,
            roi: aiData?.financial?.roi || 0,
            totalUnits: aiData?.financial?.totalUnits || 0,
            totalGSF: aiData?.financial?.totalGSF || 0,
            parkingSpaces: aiData?.financial?.parkingSpaces || 0
          }
        };

        set({ activeSitePlan: sitePlan, isEditing: true });
        return sitePlan;
      },

      updateSitePlan: (sitePlanId: string, updates: Partial<SitePlanDesign>) => {
        const { activeSitePlan, savedSitePlans } = get();
        
        if (activeSitePlan?.id === sitePlanId) {
          const updated = { ...activeSitePlan, ...updates, metadata: { ...activeSitePlan.metadata, modified: new Date().toISOString() } };
          set({ activeSitePlan: updated, hasUnsavedChanges: true });
        }

        const updatedPlans = savedSitePlans.map(plan => 
          plan.id === sitePlanId 
            ? { ...plan, ...updates, metadata: { ...plan.metadata, modified: new Date().toISOString() } }
            : plan
        );
        set({ savedSitePlans: updatedPlans });
      },

      saveSitePlan: (sitePlan: SitePlanDesign) => {
        const { savedSitePlans } = get();
        const existingIndex = savedSitePlans.findIndex(plan => plan.id === sitePlan.id);
        
        const updatedPlan = {
          ...sitePlan,
          metadata: { ...sitePlan.metadata, modified: new Date().toISOString() }
        };

        if (existingIndex >= 0) {
          const updatedPlans = [...savedSitePlans];
          updatedPlans[existingIndex] = updatedPlan;
          set({ savedSitePlans: updatedPlans, hasUnsavedChanges: false });
        } else {
          set({ savedSitePlans: [...savedSitePlans, updatedPlan], hasUnsavedChanges: false });
        }
      },

      loadSitePlan: (sitePlanId: string) => {
        const { savedSitePlans } = get();
        const sitePlan = savedSitePlans.find(plan => plan.id === sitePlanId);
        if (sitePlan) {
          set({ activeSitePlan: sitePlan, isEditing: true });
        }
        return sitePlan || null;
      },

      deleteSitePlan: (sitePlanId: string) => {
        const { savedSitePlans, activeSitePlan } = get();
        const updatedPlans = savedSitePlans.filter(plan => plan.id !== sitePlanId);
        set({ savedSitePlans: updatedPlans });
        
        if (activeSitePlan?.id === sitePlanId) {
          set({ activeSitePlan: null, isEditing: false });
        }
      },

      setActiveSitePlan: (sitePlan: SitePlanDesign | null) => {
        set({ activeSitePlan: sitePlan, isEditing: !!sitePlan });
      },

      addElement: (element: SitePlanElement) => {
        const { activeSitePlan } = get();
        if (!activeSitePlan) return;

        const updatedPlan = {
          ...activeSitePlan,
          elements: [...activeSitePlan.elements, element],
          metadata: { ...activeSitePlan.metadata, modified: new Date().toISOString() }
        };

        set({ activeSitePlan: updatedPlan, hasUnsavedChanges: true });
      },

      updateElement: (elementId: string, updates: Partial<SitePlanElement>) => {
        const { activeSitePlan } = get();
        if (!activeSitePlan) return;

        const updatedElements = activeSitePlan.elements.map(element =>
          element.id === elementId ? { ...element, ...updates } : element
        );

        const updatedPlan = {
          ...activeSitePlan,
          elements: updatedElements,
          metadata: { ...activeSitePlan.metadata, modified: new Date().toISOString() }
        };

        set({ activeSitePlan: updatedPlan, hasUnsavedChanges: true });
      },

      removeElement: (elementId: string) => {
        const { activeSitePlan } = get();
        if (!activeSitePlan) return;

        const updatedElements = activeSitePlan.elements.filter(element => element.id !== elementId);
        const updatedPlan = {
          ...activeSitePlan,
          elements: updatedElements,
          metadata: { ...activeSitePlan.metadata, modified: new Date().toISOString() }
        };

        set({ activeSitePlan: updatedPlan, hasUnsavedChanges: true });
      },

      markAsUnsaved: () => {
        set({ hasUnsavedChanges: true });
      },

      markAsSaved: () => {
        set({ hasUnsavedChanges: false });
      },

      generateFromAI: (hbuAnalysis: any, parcelData: any) => {
        const now = new Date().toISOString();
        const recommended = hbuAnalysis.alternatives?.[0];
        
        if (!recommended) {
          throw new Error('No HBU analysis data available');
        }

        // Generate AI elements based on HBU analysis
        const elements: SitePlanElement[] = [
          {
            id: `building_${Date.now()}`,
            type: 'building',
            name: 'Main Building',
            vertices: [
              { x: 50, y: 50, id: 'v1' },
              { x: 150, y: 50, id: 'v2' },
              { x: 150, y: 100, id: 'v3' },
              { x: 50, y: 100, id: 'v4' }
            ],
            properties: {
              area: recommended.density * (parcelData.sqft || 4356),
              units: Math.floor(recommended.density * (parcelData.sqft || 4356) / 43560),
              height: recommended.height * 10,
              stories: recommended.height,
              use: recommended.use
            },
            metadata: {
              created: now,
              modified: now,
              source: 'ai-generated'
            }
          },
          {
            id: `parking_${Date.now()}`,
            type: 'parking',
            name: 'Parking Area',
            vertices: [
              { x: 20, y: 20, id: 'v1' },
              { x: 80, y: 20, id: 'v2' },
              { x: 80, y: 40, id: 'v3' },
              { x: 20, y: 40, id: 'v4' }
            ],
            properties: {
              parkingSpaces: Math.ceil(Math.floor(recommended.density * (parcelData.sqft || 4356) / 43560) * 1.5)
            },
            metadata: {
              created: now,
              modified: now,
              source: 'ai-generated'
            }
          }
        ];

        const sitePlan: SitePlanDesign = {
          id: `siteplan_${Date.now()}`,
          name: `${recommended.use} Development Plan`,
          description: `AI-generated site plan based on ${recommended.use} analysis`,
          parcelId: parcelData.ogc_fid || parcelData.id,
          projectId: undefined,
          elements,
          metadata: {
            created: now,
            modified: now,
            version: 1,
            aiGenerated: true,
            hbuAnalysisId: hbuAnalysis.id
          },
          compliance: {
            zoningCompliant: true,
            violations: [],
            warnings: [],
            score: 85
          },
          financial: {
            estimatedValue: recommended.estimatedValue,
            developmentCost: recommended.developmentCost,
            irr: recommended.internalRateOfReturn,
            roi: recommended.internalRateOfReturn * 0.8,
            totalUnits: Math.floor(recommended.density * (parcelData.sqft || 4356) / 43560),
            totalGSF: recommended.density * (parcelData.sqft || 4356),
            parkingSpaces: Math.ceil(Math.floor(recommended.density * (parcelData.sqft || 4356) / 43560) * 1.5)
          }
        };

        set({ activeSitePlan: sitePlan, isEditing: true });
        return sitePlan;
      },

      exportSitePlan: (sitePlanId: string) => {
        const { savedSitePlans } = get();
        const sitePlan = savedSitePlans.find(plan => plan.id === sitePlanId);
        return sitePlan || null;
      },

      importSitePlan: (data: any) => {
        const sitePlan: SitePlanDesign = {
          id: `siteplan_${Date.now()}`,
          name: data.name || 'Imported Site Plan',
          description: data.description || 'Imported site plan',
          parcelId: data.parcelId || '',
          projectId: data.projectId,
          elements: data.elements || [],
          metadata: {
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            version: 1,
            aiGenerated: false
          },
          compliance: data.compliance || {
            zoningCompliant: true,
            violations: [],
            warnings: [],
            score: 85
          },
          financial: data.financial || {
            estimatedValue: 0,
            developmentCost: 0,
            irr: 0,
            roi: 0,
            totalUnits: 0,
            totalGSF: 0,
            parkingSpaces: 0
          }
        };

        set({ activeSitePlan: sitePlan, isEditing: true });
        return sitePlan;
      },

      // Enhanced methods for AI generation and validation
      generateAISitePlan: async (parcel: SelectedParcel, analysis: HBUAnalysis) => {
        const now = new Date().toISOString();
        
        // Generate AI-optimized site plan based on HBU analysis
        const aiSitePlan: SitePlanDesign = {
          id: `ai_siteplan_${Date.now()}`,
          name: `${parcel.address} - AI Optimized Site Plan`,
          description: `AI-generated site plan based on ${analysis.recommendedUse} analysis`,
          parcelId: parcel.ogc_fid.toString(),
          elements: [], // Will be populated by AI generation logic
          metadata: {
            created: now,
            modified: now,
            version: 1,
            aiGenerated: true,
            hbuAnalysisId: `analysis_${Date.now()}`
          },
          compliance: {
            zoningCompliant: true,
            violations: [],
            warnings: [],
            score: analysis.confidence || 85
          },
          financial: {
            estimatedValue: analysis.alternatives?.[0]?.estimatedValue || 0,
            developmentCost: analysis.alternatives?.[0]?.developmentCost || 0,
            irr: analysis.alternatives?.[0]?.internalRateOfReturn || 0,
            roi: analysis.alternatives?.[0]?.netPresentValue || 0,
            totalUnits: 0, // Will be calculated
            totalGSF: 0, // Will be calculated
            parkingSpaces: 0 // Will be calculated
          }
        };

        set({ activeSitePlan: aiSitePlan, isEditing: true });
        return aiSitePlan;
      },

      enhanceSitePlan: (sitePlan: SitePlanDesign) => {
        // Enhance site plan with additional metadata and optimizations
        const enhanced = {
          ...sitePlan,
          metadata: {
            ...sitePlan.metadata,
            modified: new Date().toISOString(),
            version: sitePlan.metadata.version + 1
          }
        };

        set({ activeSitePlan: enhanced, isEditing: true });
        return enhanced;
      },

      validateSitePlan: (sitePlan: SitePlanDesign) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        let score = 100;

        // Basic validation
        if (!sitePlan.elements || sitePlan.elements.length === 0) {
          errors.push('Site plan must have at least one element');
          score -= 50;
        }

        // Check for overlapping elements
        const overlappingElements = checkForOverlaps(sitePlan.elements);
        if (overlappingElements.length > 0) {
          warnings.push(`Found ${overlappingElements.length} overlapping elements`);
          score -= 10;
        }

        // Check compliance
        if (!sitePlan.compliance.zoningCompliant) {
          errors.push('Site plan is not zoning compliant');
          score -= 30;
        }

        // Check financial viability
        if (sitePlan.financial.irr < 0.1) {
          warnings.push('Low IRR - consider optimizing design');
          score -= 5;
        }

        return {
          isValid: errors.length === 0,
          errors,
          warnings,
          score: Math.max(0, score)
        };
      },

      optimizeSitePlan: (sitePlan: SitePlanDesign) => {
        // Apply optimization algorithms to improve site plan
        const optimized = {
          ...sitePlan,
          elements: sitePlan.elements.map(element => ({
            ...element,
            // Apply optimization logic here
            properties: {
              ...element.properties,
              optimized: true
            }
          })),
          metadata: {
            ...sitePlan.metadata,
            modified: new Date().toISOString(),
            version: sitePlan.metadata.version + 1
          }
        };

        set({ activeSitePlan: optimized, isEditing: true });
        return optimized;
      },

      getSitePlanMetrics: (sitePlan: SitePlanDesign) => {
        const elements = sitePlan.elements;
        const totalArea = elements.reduce((sum, el) => sum + (el.properties.area || 0), 0);
        const buildingArea = elements
          .filter(el => el.type === 'building')
          .reduce((sum, el) => sum + (el.properties.area || 0), 0);
        const parkingArea = elements
          .filter(el => el.type === 'parking')
          .reduce((sum, el) => sum + (el.properties.area || 0), 0);
        const landscapingArea = elements
          .filter(el => el.type === 'landscaping')
          .reduce((sum, el) => sum + (el.properties.area || 0), 0);

        return {
          totalArea,
          buildingArea,
          parkingArea,
          landscapingArea,
          buildingCoverage: totalArea > 0 ? (buildingArea / totalArea) * 100 : 0,
          parkingRatio: buildingArea > 0 ? (parkingArea / buildingArea) * 100 : 0,
          unitDensity: sitePlan.financial.totalUnits / (totalArea / 43560), // units per acre
          efficiency: calculateEfficiency(sitePlan)
        };
      }
    }),
    {
      name: 'site-plan-storage',
      partialize: (state) => ({
        savedSitePlans: state.savedSitePlans,
        activeSitePlan: state.activeSitePlan
      })
    }
  )
);

// Helper functions for site plan validation and optimization
function checkForOverlaps(elements: SitePlanElement[]): string[] {
  const overlapping: string[] = [];
  
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      if (elementsOverlap(elements[i], elements[j])) {
        overlapping.push(`${elements[i].id} overlaps with ${elements[j].id}`);
      }
    }
  }
  
  return overlapping;
}

function elementsOverlap(element1: SitePlanElement, element2: SitePlanElement): boolean {
  // Simple bounding box overlap check
  const bounds1 = getElementBounds(element1);
  const bounds2 = getElementBounds(element2);
  
  return !(bounds1.maxX < bounds2.minX || 
           bounds1.minX > bounds2.maxX || 
           bounds1.maxY < bounds2.minY || 
           bounds1.minY > bounds2.maxY);
}

function getElementBounds(element: SitePlanElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  if (element.vertices.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  const xs = element.vertices.map(v => v.x);
  const ys = element.vertices.map(v => v.y);
  
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function calculateEfficiency(sitePlan: SitePlanDesign): number {
  const elements = sitePlan.elements;
  const totalArea = elements.reduce((sum, el) => sum + (el.properties.area || 0), 0);
  const buildingArea = elements
    .filter(el => el.type === 'building')
    .reduce((sum, el) => sum + (el.properties.area || 0), 0);
  
  if (totalArea === 0) return 0;
  
  // Efficiency based on building coverage and financial metrics
  const buildingCoverage = (buildingArea / totalArea) * 100;
  const financialScore = Math.min(100, (sitePlan.financial.irr * 1000));
  
  return (buildingCoverage + financialScore) / 2;
}

export default useSitePlanStore;
