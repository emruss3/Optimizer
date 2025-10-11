// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';

interface ZoningReferenceProps {
  zoning: {
    municipality_name?: string;
    zoning_data_date?: string;
    zoning_code_link?: string;
    zone?: string;
    description?: string;
  };
}

export const ZoningReference: React.FC<ZoningReferenceProps> = ({ zoning }) => {
  if (!zoning.municipality_name && !zoning.zone) {
    return null;
  }

  return (
    <div className="zoning-reference bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Zoning Information</h3>
      
      <div className="space-y-3">
        {zoning.municipality_name && (
          <div>
            <label className="text-sm font-medium text-gray-700">Municipality</label>
            <div className="text-sm text-gray-900">{zoning.municipality_name}</div>
          </div>
        )}
        
        {zoning.zone && (
          <div>
            <label className="text-sm font-medium text-gray-700">Zone</label>
            <div className="text-sm text-gray-900">{zoning.zone}</div>
          </div>
        )}
        
        {zoning.description && (
          <div>
            <label className="text-sm font-medium text-gray-700">Description</label>
            <div className="text-sm text-gray-900">{zoning.description}</div>
          </div>
        )}
        
        {zoning.zoning_data_date && (
          <div>
            <label className="text-sm font-medium text-gray-700">Data Date</label>
            <div className="text-sm text-gray-900">
              {new Date(zoning.zoning_data_date).toLocaleDateString()}
            </div>
          </div>
        )}
        
        {zoning.zoning_code_link && (
          <div>
            <label className="text-sm font-medium text-gray-700">Zoning Code</label>
            <a
              href={zoning.zoning_code_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              Open Code
            </a>
          </div>
        )}
      </div>
    </div>
  );
};
