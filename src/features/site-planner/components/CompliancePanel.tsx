// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { ComplianceResult } from '../engine/compliance';

interface CompliancePanelProps {
  compliance: ComplianceResult;
  className?: string;
}

export function CompliancePanel({ compliance, className = '' }: CompliancePanelProps) {
  const getStatusIcon = (compliant: boolean) => {
    if (compliant) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    } else {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getStatusColor = (compliant: boolean) => {
    return compliant ? 'text-green-700' : 'text-red-700';
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Compliance Check</h3>
        <div className="flex items-center space-x-2">
          {compliance.overall_compliant ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          )}
          <span className={`text-sm font-medium ${getStatusColor(compliance.overall_compliant)}`}>
            {compliance.overall_compliant ? 'Compliant' : 'Issues Found'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* FAR Compliance */}
        <div className="flex items-start space-x-3">
          {getStatusIcon(compliance.far.compliant)}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Floor Area Ratio (FAR)</span>
              <span className={`text-sm ${getStatusColor(compliance.far.compliant)}`}>
                {(compliance.far.actual * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{compliance.far.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full ${compliance.far.compliant ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(compliance.far.actual / compliance.far.required * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Parking Compliance */}
        <div className="flex items-start space-x-3">
          {getStatusIcon(compliance.parking.compliant)}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Parking Ratio</span>
              <span className={`text-sm ${getStatusColor(compliance.parking.compliant)}`}>
                {(compliance.parking.actual * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{compliance.parking.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full ${compliance.parking.compliant ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(compliance.parking.actual / compliance.parking.required * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Setback Compliance */}
        <div className="flex items-start space-x-3">
          {getStatusIcon(compliance.setbacks.compliant)}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Setbacks</span>
              <div className="flex space-x-2 text-xs">
                <span className={compliance.setbacks.front ? 'text-green-600' : 'text-red-600'}>Front</span>
                <span className={compliance.setbacks.side ? 'text-green-600' : 'text-red-600'}>Side</span>
                <span className={compliance.setbacks.rear ? 'text-green-600' : 'text-red-600'}>Rear</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-1">{compliance.setbacks.message}</p>
          </div>
        </div>

        {/* Coverage Compliance */}
        <div className="flex items-start space-x-3">
          {getStatusIcon(compliance.coverage.compliant)}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900">Site Coverage</span>
              <span className={`text-sm ${getStatusColor(compliance.coverage.compliant)}`}>
                {(compliance.coverage.actual * 100).toFixed(1)}%
              </span>
            </div>
            <p className="text-sm text-gray-600 mt-1">{compliance.coverage.message}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className={`h-2 rounded-full ${compliance.coverage.compliant ? 'bg-green-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(compliance.coverage.actual / compliance.coverage.required * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Overall Score */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-900">Overall Score</span>
          <span className={`text-lg font-bold ${compliance.overall_compliant ? 'text-green-600' : 'text-yellow-600'}`}>
            {compliance.score}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
          <div 
            className={`h-3 rounded-full ${compliance.overall_compliant ? 'bg-green-500' : 'bg-yellow-500'}`}
            style={{ width: `${compliance.score}%` }}
          />
        </div>
      </div>
    </div>
  );
}
