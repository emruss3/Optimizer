// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import React from 'react';
import { Element } from '../types/element';
import { ImperviousCalculator } from '../utils/imperviousCalculator';

interface KPIPanelProps {
  elements: Element[];
  totalSiteAreaSqft: number;
  zoning: {
    max_coverage_pct?: number;
    max_impervious_coverage_pct?: number;
    min_landscaped_space_pct?: number;
    min_open_space_pct?: number;
    max_far?: number;
    max_building_height_ft?: number;
  };
  parkingRatio?: number; // stalls per 1000 sq ft
}

export const KPIPanel: React.FC<KPIPanelProps> = ({
  elements,
  totalSiteAreaSqft,
  zoning,
  parkingRatio = 3.0
}) => {
  // Calculate all KPIs
  const buildingCoverage = ImperviousCalculator.calculateBuildingCoverage(elements, totalSiteAreaSqft);
  const impervious = ImperviousCalculator.calculateImpervious(elements, totalSiteAreaSqft);
  const landscaped = ImperviousCalculator.calculateLandscapedArea(elements, totalSiteAreaSqft);
  const openSpace = ImperviousCalculator.calculateOpenSpace(elements, totalSiteAreaSqft);
  const compliance = ImperviousCalculator.checkCompliance(elements, totalSiteAreaSqft, zoning);

  // Calculate FAR and height
  const totalNRSF = elements
    .filter(el => el.type === 'building')
    .reduce((sum, el) => sum + (el.properties?.area || 0), 0);
  
  const far = totalSiteAreaSqft > 0 ? totalNRSF / totalSiteAreaSqft : 0;
  const maxHeight = Math.max(...elements
    .filter(el => el.type === 'building')
    .map(el => (el.properties?.height || 0) * 12), 0); // Convert to feet

  // Calculate parking
  const parkingElements = elements.filter(el => el.type === 'parking');
  const totalStalls = parkingElements.length;
  const stallsNeeded = Math.ceil((totalNRSF / 1000) * parkingRatio);

  return (
    <div className="kpi-panel bg-white border border-gray-200 rounded-lg p-4 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Site KPIs</h3>
      
      {/* Coverage KPI */}
      <KPICard
        title="Building Coverage"
        value={`${buildingCoverage.coverage_percentage.toFixed(1)}%`}
        max={zoning.max_coverage_pct}
        compliant={compliance.coverage.compliant}
        details={`${buildingCoverage.building_footprint_sqft.toLocaleString()} sf / ${totalSiteAreaSqft.toLocaleString()} sf`}
      />

      {/* Impervious KPI */}
      <KPICard
        title="Impervious Coverage"
        value={`${impervious.impervious_percentage.toFixed(1)}%`}
        max={zoning.max_impervious_coverage_pct}
        compliant={compliance.impervious.compliant}
        details={`${impervious.total_impervious_sqft.toLocaleString()} sf`}
        breakdown={impervious.breakdown}
      />

      {/* FAR KPI */}
      <KPICard
        title="Floor Area Ratio (FAR)"
        value={far.toFixed(2)}
        max={zoning.max_far}
        compliant={!zoning.max_far || far <= zoning.max_far}
        details={`${totalNRSF.toLocaleString()} NRSF`}
      />

      {/* Height KPI */}
      <KPICard
        title="Building Height"
        value={`${maxHeight.toFixed(0)} ft`}
        max={zoning.max_building_height_ft}
        compliant={!zoning.max_building_height_ft || maxHeight <= zoning.max_building_height_ft}
        details={`${(maxHeight / 12).toFixed(1)} stories`}
      />

      {/* Parking KPI */}
      <KPICard
        title="Parking Ratio"
        value={`${totalStalls} / ${stallsNeeded}`}
        max={null}
        compliant={totalStalls >= stallsNeeded}
        details={`${parkingRatio} stalls per 1,000 sf`}
      />

      {/* Open Space KPI */}
      <KPICard
        title="Open Space"
        value={`${openSpace.open_space_percentage.toFixed(1)}%`}
        min={zoning.min_open_space_pct}
        compliant={compliance.open_space.compliant}
        details={`${openSpace.open_space_sqft.toLocaleString()} sf`}
      />

      {/* Landscaped KPI */}
      <KPICard
        title="Landscaped Area"
        value={`${landscaped.landscaped_percentage.toFixed(1)}%`}
        min={zoning.min_landscaped_space_pct}
        compliant={compliance.landscaped.compliant}
        details={`${landscaped.landscaped_sqft.toLocaleString()} sf`}
      />
    </div>
  );
};

interface KPICardProps {
  title: string;
  value: string;
  max?: number;
  min?: number;
  compliant: boolean;
  details: string;
  breakdown?: {
    buildings: number;
    parking: number;
    drives: number;
    other: number;
  };
}

const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  max,
  min,
  compliant,
  details,
  breakdown
}) => {
  const getStatusColor = () => {
    if (compliant) return 'text-green-600 bg-green-50 border-green-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getStatusIcon = () => {
    return compliant ? '✓' : '⚠';
  };

  return (
    <div className={`border rounded-lg p-3 ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className="text-lg font-bold">{value}</span>
      </div>
      
      <div className="text-xs opacity-75 mb-1">{details}</div>
      
      {(max || min) && (
        <div className="text-xs opacity-75">
          {max && `Max: ${max}%`}
          {min && `Min: ${min}%`}
        </div>
      )}
      
      {breakdown && (
        <div className="text-xs mt-2 space-y-1">
          <div>Buildings: {breakdown.buildings.toLocaleString()} sf</div>
          <div>Parking: {breakdown.parking.toLocaleString()} sf</div>
          <div>Drives: {breakdown.drives.toLocaleString()} sf</div>
          {breakdown.other > 0 && <div>Other: {breakdown.other.toLocaleString()} sf</div>}
        </div>
      )}
      
      <div className="flex items-center mt-2">
        <span className="text-xs font-medium">
          {getStatusIcon()} {compliant ? 'Compliant' : 'Non-compliant'}
        </span>
      </div>
    </div>
  );
};
