import React, { useState, useEffect, useCallback } from 'react';
import { 
  Save, 
  Download, 
  Upload, 
  RotateCcw, 
  RotateCw,
  Trash2,
  Plus,
  Settings,
  CheckCircle,
  AlertTriangle,
  X,
  Building2,
  Car,
  Trees,
  Zap
} from 'lucide-react';
import { useSitePlanStore, SitePlanDesign, SitePlanElement } from '../store/sitePlan';
import { useHBUAnalysis } from '../hooks/useHBUAnalysis';
import { useActiveProject } from '../store/project';
import EnterpriseSitePlanner from './EnterpriseSitePlanner';
import { SelectedParcel } from '../types/parcel';

interface EnhancedSitePlannerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedParcel: SelectedParcel | null;
  hbuAnalysis?: any;
  onSitePlanSaved?: (sitePlan: SitePlanDesign) => void;
  onContinueToUnderwriting?: (sitePlan: SitePlanDesign) => void;
}

export function EnhancedSitePlanner({ 
  isOpen, 
  onClose, 
  selectedParcel, 
  hbuAnalysis,
  onSitePlanSaved,
  onContinueToUnderwriting
}: EnhancedSitePlannerProps) {
  const [showSitePlanner, setShowSitePlanner] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [sitePlanName, setSitePlanName] = useState('');
  
  const { 
    activeSitePlan, 
    isEditing, 
    hasUnsavedChanges,
    createSitePlan,
    saveSitePlan,
    generateFromAI,
    markAsUnsaved,
    markAsSaved,
    setActiveSitePlan
  } = useSitePlanStore();
  
  const { activeProjectId } = useActiveProject();
  const { analysis } = useHBUAnalysis();

  // Auto-generate site plan from AI analysis
  useEffect(() => {
    if (selectedParcel && (hbuAnalysis || analysis) && !activeSitePlan) {
      handleGenerateFromAI();
    }
  }, [selectedParcel, hbuAnalysis, analysis, activeSitePlan]);

  const handleGenerateFromAI = useCallback(async () => {
    if (!selectedParcel || (!hbuAnalysis && !analysis)) return;
    
    setIsGenerating(true);
    try {
      const aiData = hbuAnalysis || analysis;
      const sitePlan = generateFromAI(aiData, selectedParcel);
      setSitePlanName(sitePlan.name);
      setShowSitePlanner(true);
    } catch (error) {
      console.error('Failed to generate site plan from AI:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [selectedParcel, hbuAnalysis, analysis, generateFromAI]);

  const handleSaveSitePlan = useCallback(() => {
    if (!activeSitePlan) return;
    
    const updatedPlan = {
      ...activeSitePlan,
      name: sitePlanName || activeSitePlan.name
    };
    
    saveSitePlan(updatedPlan);
    markAsSaved();
    setShowSaveDialog(false);
    
    if (onSitePlanSaved) {
      onSitePlanSaved(updatedPlan);
    }
  }, [activeSitePlan, sitePlanName, saveSitePlan, markAsSaved, onSitePlanSaved]);

  const handleContinueToUnderwriting = useCallback(() => {
    if (!activeSitePlan) return;
    
    // Save if there are unsaved changes
    if (hasUnsavedChanges) {
      handleSaveSitePlan();
    }
    
    if (onContinueToUnderwriting) {
      onContinueToUnderwriting(activeSitePlan);
    }
  }, [activeSitePlan, hasUnsavedChanges, handleSaveSitePlan, onContinueToUnderwriting]);

  const handleOpenSitePlanner = () => {
    setShowSitePlanner(true);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-lg bg-purple-100">
              <Building2 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg lg:text-xl font-semibold text-gray-900">
                Enhanced Site Planner
              </h2>
              <p className="text-sm text-gray-600">
                {selectedParcel ? `${selectedParcel.address}` : 'Design your development'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          {!activeSitePlan ? (
            <div className="text-center py-12">
              <Building2 className="w-16 h-16 text-purple-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Create Site Plan
              </h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                Generate an AI-optimized site plan or start with a blank design.
              </p>
              
              <div className="space-y-4 max-w-md mx-auto">
                <button
                  onClick={handleGenerateFromAI}
                  disabled={!selectedParcel || isGenerating}
                  className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="flex items-center space-x-3">
                    <Zap className="w-8 h-8 text-purple-600" />
                    <div>
                      <div className="font-medium">Generate from AI Analysis</div>
                      <div className="text-sm text-gray-600">
                        {isGenerating ? 'Generating...' : 'AI creates optimized site plan from HBU analysis'}
                      </div>
                    </div>
                  </div>
                </button>
                
                <button
                  onClick={handleOpenSitePlanner}
                  className="w-full p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center space-x-3">
                    <Plus className="w-8 h-8 text-purple-600" />
                    <div>
                      <div className="font-medium">Start Blank Design</div>
                      <div className="text-sm text-gray-600">Create site plan from scratch</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Site Plan Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Site Plan Summary</h3>
                  <div className="flex items-center space-x-2">
                    {activeSitePlan.metadata.aiGenerated && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        <Zap className="w-3 h-3 mr-1" />
                        AI Generated
                      </span>
                    )}
                    {hasUnsavedChanges && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        Unsaved Changes
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{activeSitePlan.elements.length}</div>
                    <div className="text-sm text-gray-600">Elements</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{activeSitePlan.financial.totalUnits}</div>
                    <div className="text-sm text-gray-600">Units</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{activeSitePlan.financial.parkingSpaces}</div>
                    <div className="text-sm text-gray-600">Parking</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{activeSitePlan.compliance.score}%</div>
                    <div className="text-sm text-gray-600">Compliance</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleOpenSitePlanner}
                  className="flex items-center space-x-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Open Site Planner</span>
                </button>
                
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    hasUnsavedChanges 
                      ? 'bg-orange-600 text-white hover:bg-orange-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{hasUnsavedChanges ? 'Save Changes' : 'Save Design'}</span>
                  {hasUnsavedChanges && <AlertTriangle className="w-4 h-4" />}
                </button>
                
                <button
                  onClick={handleContinueToUnderwriting}
                  className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Continue to Underwriting</span>
                </button>
              </div>

              {/* Site Plan Elements */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h4 className="font-semibold text-gray-900 mb-4">Design Elements</h4>
                <div className="space-y-3">
                  {activeSitePlan.elements.map((element) => (
                    <div key={element.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        {element.type === 'building' && <Building2 className="w-5 h-5 text-purple-600" />}
                        {element.type === 'parking' && <Car className="w-5 h-5 text-blue-600" />}
                        {element.type === 'landscaping' && <Trees className="w-5 h-5 text-green-600" />}
                        <div>
                          <div className="font-medium">{element.name}</div>
                          <div className="text-sm text-gray-600">
                            {element.type} • {element.properties.area ? `${element.properties.area.toLocaleString()} sqft` : 'No area'}
                          </div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">
                        {element.metadata.source === 'ai-generated' ? 'AI' : 'Manual'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 lg:p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {activeSitePlan ? (
                <span>Project: <strong>{activeSitePlan.name}</strong> ({activeSitePlan.elements.length} elements)</span>
              ) : (
                <span>No active site plan</span>
              )}
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              
              {activeSitePlan && (
                <button
                  onClick={handleSaveSitePlan}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save & Close
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Site Planner Modal */}
      {showSitePlanner && selectedParcel && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl w-[95vw] h-[95vh] max-w-7xl flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-semibold">Site Plan Designer</h2>
              <button
                onClick={() => setShowSitePlanner(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="h-[80vh] relative">
              {/* Save Button Overlay */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg shadow-lg transition-colors ${
                    hasUnsavedChanges 
                      ? 'bg-orange-600 text-white hover:bg-orange-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{hasUnsavedChanges ? 'Save Changes' : 'Save Design'}</span>
                  {hasUnsavedChanges && <AlertTriangle className="w-4 h-4" />}
                </button>
              </div>
              
              <EnterpriseSitePlanner
                parcel={selectedParcel}
                marketData={{
                  avgPricePerSqFt: 300,
                  avgRentPerSqFt: 2.50,
                  capRate: 0.06,
                  constructionCostPerSqFt: 200
                }}
                onInvestmentAnalysis={(analysis) => {
                  console.log('Investment analysis:', analysis);
                  markAsUnsaved();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Save Dialog */}
      {showSaveDialog && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Save Site Plan</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Site Plan Name
                </label>
                <input
                  type="text"
                  value={sitePlanName}
                  onChange={(e) => setSitePlanName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter site plan name"
                />
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="flex-1 px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSitePlan}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
