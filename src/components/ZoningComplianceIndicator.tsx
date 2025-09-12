import React from 'react';
import { 
  AlertTriangle, CheckCircle, AlertCircle, Info, 
  Ruler, Building, Home, Car, Users, MapPin 
} from 'lucide-react';
import { ZoningCompliance, ZoningViolation } from '../types/zoning';

interface ZoningComplianceIndicatorProps {
  compliance: ZoningCompliance;
  compact?: boolean;
}

export default function ZoningComplianceIndicator({ compliance, compact = false }: ZoningComplianceIndicatorProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'violation':
        return <AlertTriangle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      default:
        return <Info className="w-4 h-4 text-gray-600" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'setback':
        return <Ruler className="w-4 h-4" />;
      case 'height':
        return <Building className="w-4 h-4" />;
      case 'coverage':
      case 'far':
        return <Home className="w-4 h-4" />;
      case 'parking':
        return <Car className="w-4 h-4" />;
      case 'density':
        return <Users className="w-4 h-4" />;
      default:
        return <MapPin className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'violation':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center space-x-1 min-w-0">
        {getStatusIcon(compliance.isCompliant ? 'compliant' : 'violation')}
        <span className={`text-xs font-medium truncate ${
          compliance.isCompliant ? 'text-green-600' : 'text-red-600'
        }`}>
          {compliance.isCompliant ? 'Compliant' : `${compliance.violations.length} Issue${compliance.violations.length !== 1 ? 's' : ''}`}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className={`p-4 rounded-lg border-2 ${getStatusColor(compliance.isCompliant ? 'compliant' : 'violation')}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon(compliance.isCompliant ? 'compliant' : 'violation')}
            <h3 className="font-semibold">
              {compliance.isCompliant ? 'Zoning Compliant' : 'Zoning Violations Detected'}
            </h3>
          </div>
          <div className="text-sm">
            {compliance.violations.length > 0 && (
              <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full">
                {compliance.violations.length} violations
              </span>
            )}
            {compliance.warnings.length > 0 && (
              <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-2">
                {compliance.warnings.length} warnings
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Compliance Categories */}
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(compliance.compliance).map(([category, status]) => (
          <div key={category} className={`p-3 rounded-lg border ${getStatusColor(status.status)}`}>
            <div className="flex items-center justify-between min-w-0">
              <div className="flex items-center space-x-2">
                {getCategoryIcon(category)}
                <span className="font-medium capitalize truncate">{category}</span>
              </div>
              <div className="flex items-center space-x-2 flex-shrink-0">
                {getStatusIcon(status.status)}
                <span className="text-sm">
                  {status.utilizationPercentage.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="mt-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${
                    status.status === 'violation' ? 'bg-red-500' :
                    status.status === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(status.utilizationPercentage, 100)}%` }}
                ></div>
              </div>
              <p className="text-xs mt-1">{status.message}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Violations */}
      {compliance.violations.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-semibold text-red-800 mb-3 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4" />
            <span>Zoning Violations</span>
          </h4>
          <div className="space-y-2">
            {compliance.violations.map((violation) => (
              <ViolationItem key={violation.id} violation={violation} />
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {compliance.warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-semibold text-yellow-800 mb-3 flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>Warnings</span>
          </h4>
          <div className="space-y-2">
            {compliance.warnings.map((warning) => (
              <ViolationItem key={warning.id} violation={warning} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ViolationItem({ violation }: { violation: ZoningViolation }) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'setback':
        return <Ruler className="w-3 h-3" />;
      case 'height':
        return <Building className="w-3 h-3" />;
      case 'coverage':
      case 'far':
        return <Home className="w-3 h-3" />;
      case 'parking':
        return <Car className="w-3 h-3" />;
      case 'density':
        return <Users className="w-3 h-3" />;
      default:
        return <MapPin className="w-3 h-3" />;
    }
  };

  return (
    <div className="flex items-start space-x-2 text-sm">
      {getCategoryIcon(violation.category)}
      <div className="flex-1">
        <p className="font-medium">{violation.message}</p>
        <p className="text-xs text-gray-600 mt-1">
          Current: {violation.currentValue}{violation.unit} | 
          Required: {violation.requiredValue}{violation.unit}
        </p>
      </div>
    </div>
  );
}