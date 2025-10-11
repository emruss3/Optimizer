// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';

interface PermittedUsesPresetsProps {
  permittedUses: string[];
  onPresetSelect: (preset: TypologyPreset) => void;
}

interface TypologyPreset {
  name: string;
  barDepthFt: number;
  targetFAR: number;
  parkingRatio: number;
  description: string;
}

const TYPOLOGY_PRESETS: Record<string, TypologyPreset> = {
  'Single Family': {
    name: 'Single Family',
    barDepthFt: 40,
    targetFAR: 0.3,
    parkingRatio: 2.0,
    description: 'Single family residential development'
  },
  'Townhouse': {
    name: 'Townhouse',
    barDepthFt: 25,
    targetFAR: 0.8,
    parkingRatio: 2.5,
    description: 'Townhouse residential development'
  },
  'Multifamily': {
    name: 'Multifamily',
    barDepthFt: 65,
    targetFAR: 1.5,
    parkingRatio: 3.0,
    description: 'Multifamily residential development'
  },
  'Office': {
    name: 'Office',
    barDepthFt: 80,
    targetFAR: 2.0,
    parkingRatio: 4.0,
    description: 'Office building development'
  },
  'Retail': {
    name: 'Retail',
    barDepthFt: 60,
    targetFAR: 1.2,
    parkingRatio: 5.0,
    description: 'Retail commercial development'
  },
  'Mixed Use': {
    name: 'Mixed Use',
    barDepthFt: 70,
    targetFAR: 1.8,
    parkingRatio: 3.5,
    description: 'Mixed-use development'
  },
  'Industrial': {
    name: 'Industrial',
    barDepthFt: 100,
    targetFAR: 0.8,
    parkingRatio: 2.0,
    description: 'Industrial development'
  },
  'Hospitality': {
    name: 'Hospitality',
    barDepthFt: 75,
    targetFAR: 1.5,
    parkingRatio: 4.5,
    description: 'Hotel/hospitality development'
  }
};

export const PermittedUsesPresets: React.FC<PermittedUsesPresetsProps> = ({
  permittedUses,
  onPresetSelect
}) => {
  // Filter presets based on permitted uses
  const availablePresets = Object.values(TYPOLOGY_PRESETS).filter(preset => {
    // Simple matching - can be enhanced with more sophisticated logic
    const presetName = preset.name.toLowerCase();
    return permittedUses.some(use => 
      use.toLowerCase().includes(presetName) ||
      presetName.includes(use.toLowerCase())
    );
  });

  if (availablePresets.length === 0) {
    return null;
  }

  return (
    <div className="permitted-uses-presets bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Permitted Uses</h3>
      
      <div className="space-y-2 mb-4">
        {permittedUses.map((use, index) => (
          <span
            key={index}
            className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full mr-2 mb-1"
          >
            {use}
          </span>
        ))}
      </div>

      <div className="border-t pt-3">
        <h4 className="text-sm font-medium text-gray-700 mb-2">Quick Presets</h4>
        <div className="grid grid-cols-2 gap-2">
          {availablePresets.map((preset) => (
            <button
              key={preset.name}
              onClick={() => onPresetSelect(preset)}
              className="text-left p-2 border border-gray-200 rounded hover:bg-gray-50 hover:border-blue-300 transition-colors"
            >
              <div className="font-medium text-sm text-gray-900">{preset.name}</div>
              <div className="text-xs text-gray-500 mt-1">{preset.description}</div>
              <div className="text-xs text-gray-400 mt-1">
                FAR: {preset.targetFAR} • Parking: {preset.parkingRatio}/1k sf
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Export presets for use in other components
export { TYPOLOGY_PRESETS };
export type { TypologyPreset };
