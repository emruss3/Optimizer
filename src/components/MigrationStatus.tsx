/**
 * Migration Status Component
 * 
 * This component displays the current migration status and allows
 * administrators to monitor the gradual migration progress.
 */

import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Info, 
  RefreshCw,
  Settings,
  BarChart3,
  Zap,
  Building2
} from 'lucide-react';
import { getMigrationStatus } from '../utils/componentMigration';
import { 
  shouldUseConsolidatedPlanner, 
  shouldUseEnhancedSitePlanner, 
  shouldUseAIGenerator,
  shouldEnableAdapters
} from '../utils/featureFlags';

interface MigrationStatusProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MigrationStatus({ isOpen, onClose }: MigrationStatusProps) {
  const [status, setStatus] = useState(getMigrationStatus());
  const [featureFlags, setFeatureFlags] = useState({
    consolidatedPlanner: shouldUseConsolidatedPlanner(),
    enhancedSitePlanner: shouldUseEnhancedSitePlanner(),
    aiGenerator: shouldUseAIGenerator(),
    adapters: shouldEnableAdapters()
  });

  // Refresh status
  const refreshStatus = () => {
    setStatus(getMigrationStatus());
    setFeatureFlags({
      consolidatedPlanner: shouldUseConsolidatedPlanner(),
      enhancedSitePlanner: shouldUseEnhancedSitePlanner(),
      aiGenerator: shouldUseAIGenerator(),
      adapters: shouldEnableAdapters()
    });
  };

  // Auto-refresh every 5 seconds
  useEffect(() => {
    if (!isOpen) return;
    
    const interval = setInterval(refreshStatus, 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-semibold text-gray-900">
              Site Planner Migration Status
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={refreshStatus}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <RefreshCw className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            >
              <XCircle className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6">
          {/* Overall Progress */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Migration Progress</h2>
              <span className="text-2xl font-bold text-blue-600">
                {status.migrationProgress.toFixed(1)}%
              </span>
            </div>
            
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                style={{ width: `${status.migrationProgress}%` }}
              />
            </div>
            
            <div className="flex justify-between text-sm text-gray-600 mt-2">
              <span>{status.migratedComponents} migrated</span>
              <span>{status.totalComponents} total</span>
            </div>
          </div>

          {/* Feature Flags Status */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Feature Flags</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <span className="font-medium">Consolidated Planner</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${featureFlags.consolidatedPlanner ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Zap className="w-5 h-5 text-purple-600" />
                  <span className="font-medium">Enhanced Site Planner</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${featureFlags.enhancedSitePlanner ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Settings className="w-5 h-5 text-green-600" />
                  <span className="font-medium">AI Generator</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${featureFlags.aiGenerator ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>
              
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Info className="w-5 h-5 text-orange-600" />
                  <span className="font-medium">Adapters</span>
                </div>
                <div className={`w-3 h-3 rounded-full ${featureFlags.adapters ? 'bg-green-500' : 'bg-gray-400'}`} />
              </div>
            </div>
          </div>

          {/* Component Status */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Component Status</h2>
            <div className="space-y-3">
              {status.components.map((component, index) => (
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

          {/* Migration Recommendations */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Migration Recommendations</h2>
            <div className="space-y-3">
              {status.migrationProgress < 25 && (
                <div className="flex items-start space-x-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-blue-900">Start Migration</h3>
                    <p className="text-sm text-blue-700">
                      Enable adapters to begin gradual migration with zero risk.
                    </p>
                  </div>
                </div>
              )}
              
              {status.migrationProgress >= 25 && status.migrationProgress < 50 && (
                <div className="flex items-start space-x-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-yellow-900">Enable New Components</h3>
                    <p className="text-sm text-yellow-700">
                      Start enabling new components for a subset of users.
                    </p>
                  </div>
                </div>
              )}
              
              {status.migrationProgress >= 50 && status.migrationProgress < 75 && (
                <div className="flex items-start space-x-3 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-orange-900">Monitor Performance</h3>
                    <p className="text-sm text-orange-700">
                      Monitor performance and user feedback before full migration.
                    </p>
                  </div>
                </div>
              )}
              
              {status.migrationProgress >= 75 && (
                <div className="flex items-start space-x-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-green-900">Complete Migration</h3>
                    <p className="text-sm text-green-700">
                      Ready to complete migration and remove old components.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Environment Info */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Environment Information</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <div>Environment: {process.env.NODE_ENV}</div>
              <div>Build Time: {new Date().toLocaleString()}</div>
              <div>Migration Version: 2.0.0</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MigrationStatus;
