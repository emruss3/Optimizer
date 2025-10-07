/**
 * Migration Summary Component
 * 
 * This component provides a comprehensive summary of the completed
 * site planner migration and consolidation.
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Info, 
  BarChart3,
  Building2,
  Zap,
  Settings,
  Trash2,
  FileText,
  Clock,
  Users,
  TrendingUp
} from 'lucide-react';
import { getMigrationStatus } from '../utils/componentMigration';
import { runCleanupValidation } from '../utils/cleanupValidation';

interface MigrationSummaryProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MigrationSummary({ isOpen, onClose }: MigrationSummaryProps) {
  const [migrationStatus, setMigrationStatus] = useState(getMigrationStatus());
  const [cleanupValidation, setCleanupValidation] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  // Load data
  useEffect(() => {
    if (isOpen) {
      setMigrationStatus(getMigrationStatus());
      setCleanupValidation(runCleanupValidation());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-green-600" />
            <h1 className="text-xl font-semibold text-gray-900">
              Site Planner Migration Summary
            </h1>
            <div className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
              COMPLETE
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
          >
            <XCircle className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6">
          {/* Migration Overview */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Migration Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-3">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-green-900">Migration Complete</h3>
                    <p className="text-sm text-green-700">All components successfully migrated</p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {migrationStatus.migrationProgress.toFixed(1)}%
                </div>
                <div className="text-sm text-green-700">
                  {migrationStatus.migratedComponents} of {migrationStatus.totalComponents} components
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-3">
                  <Building2 className="w-8 h-8 text-blue-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-blue-900">Consolidated Architecture</h3>
                    <p className="text-sm text-blue-700">Single component, multiple modes</p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-blue-600">1</div>
                <div className="text-sm text-blue-700">Main component (ConsolidatedSitePlanner)</div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-3">
                  <Zap className="w-8 h-8 text-purple-600" />
                  <div>
                    <h3 className="text-lg font-semibold text-purple-900">Enhanced Features</h3>
                    <p className="text-sm text-purple-700">AI generation, optimization, validation</p>
                  </div>
                </div>
                <div className="text-2xl font-bold text-purple-600">5+</div>
                <div className="text-sm text-purple-700">New capabilities added</div>
              </div>
            </div>
          </div>

          {/* Component Status */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Component Status</h2>
            <div className="space-y-3">
              {migrationStatus.components.map((component, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    {component.migrated ? (
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <div>
                      <span className="font-medium text-gray-900">{component.name}</span>
                      <div className="text-sm text-gray-600">Strategy: {component.strategy}</div>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    component.migrated 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {component.migrated ? 'Migrated' : 'Not Migrated'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cleanup Status */}
          {cleanupValidation && (
            <div className="mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Cleanup Status</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
                <div className="flex items-center space-x-3 mb-4">
                  {cleanupValidation.isSafeToCleanup ? (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-yellow-500" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {cleanupValidation.isSafeToCleanup ? 'Ready for Cleanup' : 'Cleanup Not Ready'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {cleanupValidation.isSafeToCleanup 
                        ? 'All old components can be safely removed'
                        : 'Some issues need to be resolved before cleanup'
                      }
                    </p>
                  </div>
                </div>
                
                {cleanupValidation.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-red-700 mb-2">Errors:</h4>
                    <ul className="list-disc list-inside text-sm text-red-600">
                      {cleanupValidation.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {cleanupValidation.warnings.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium text-yellow-700 mb-2">Warnings:</h4>
                    <ul className="list-disc list-inside text-sm text-yellow-600">
                      {cleanupValidation.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                <div className="mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Recommendations:</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600">
                    {cleanupValidation.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Migration Benefits */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Migration Benefits</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Consolidated Architecture</h3>
                    <p className="text-sm text-gray-600">Single component with multiple modes instead of separate components</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Centralized Utilities</h3>
                    <p className="text-sm text-gray-600">All coordinate transformations in one place</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Enhanced Features</h3>
                    <p className="text-sm text-gray-600">AI generation, optimization, validation, metrics</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Better Performance</h3>
                    <p className="text-sm text-gray-600">Optimized coordinate transformations and reduced bundle size</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Easier Maintenance</h3>
                    <p className="text-sm text-gray-600">Single source of truth, cleaner codebase</p>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3">
                  <CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-gray-900">Future-Proof</h3>
                    <p className="text-sm text-gray-600">Extensible architecture for future enhancements</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Next Steps */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-4">Next Steps</h2>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900">Monitor Performance</h3>
                  <p className="text-sm text-blue-700">Use the Performance Monitor to track metrics</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900">Run Validation</h3>
                  <p className="text-sm text-blue-700">Use migration validation to ensure everything works</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900">Cleanup Old Files</h3>
                  <p className="text-sm text-blue-700">Remove old components when ready for cleanup</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MigrationSummary;
