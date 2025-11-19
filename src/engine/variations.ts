// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { PlannerConfig } from './types';

/**
 * Generate PlannerConfig variations for alternative site plans
 * @param baseConfig Base configuration to vary from
 * @param options Variation parameters
 * @returns Array of PlannerConfig variations
 */
export function generateConfigVariations(
  baseConfig: PlannerConfig,
  options: {
    targetFARRange?: { min: number; max: number; steps?: number };
    targetCoverageRange?: { min: number; max: number; steps?: number };
    parkingRatioRange?: { min: number; max: number; steps?: number };
    numBuildingsRange?: number[];
    buildingTypologies?: string[];
    count?: number; // Total number of variations to generate
  } = {}
): Partial<PlannerConfig>[] {
  const variations: Partial<PlannerConfig>[] = [];
  
  // Default ranges if not provided
  const targetFARRange = options.targetFARRange || { min: 0.8, max: 2.5, steps: 4 };
  const targetCoverageRange = options.targetCoverageRange || { min: 30, max: 70, steps: 3 };
  const parkingRatioRange = options.parkingRatioRange || { min: 1.0, max: 2.5, steps: 3 };
  const numBuildingsRange = options.numBuildingsRange || [1, 2, 3];
  const buildingTypologies = options.buildingTypologies || ['bar', 'L-shape'];
  
  const count = options.count || 12;
  
  // Generate systematic variations
  const farSteps = targetFARRange.steps || 4;
  const coverageSteps = targetCoverageRange.steps || 3;
  const parkingSteps = parkingRatioRange.steps || 3;
  
  const farValues: number[] = [];
  const coverageValues: number[] = [];
  const parkingValues: number[] = [];
  
  // Generate FAR values
  for (let i = 0; i < farSteps; i++) {
    const far = targetFARRange.min + (targetFARRange.max - targetFARRange.min) * (i / (farSteps - 1));
    farValues.push(Number(far.toFixed(2)));
  }
  
  // Generate coverage values
  for (let i = 0; i < coverageSteps; i++) {
    const coverage = targetCoverageRange.min + (targetCoverageRange.max - targetCoverageRange.min) * (i / (coverageSteps - 1));
    coverageValues.push(Number(coverage.toFixed(0)));
  }
  
  // Generate parking ratio values
  for (let i = 0; i < parkingSteps; i++) {
    const parking = parkingRatioRange.min + (parkingRatioRange.max - parkingRatioRange.min) * (i / (parkingSteps - 1));
    parkingValues.push(Number(parking.toFixed(1)));
  }
  
  // Generate combinations, but limit to count
  let generated = 0;
  
  for (const far of farValues) {
    if (generated >= count) break;
    for (const coverage of coverageValues) {
      if (generated >= count) break;
      for (const parking of parkingValues) {
        if (generated >= count) break;
        for (const numBuildings of numBuildingsRange) {
          if (generated >= count) break;
          for (const typology of buildingTypologies) {
            if (generated >= count) break;
            
            variations.push({
              designParameters: {
                ...baseConfig.designParameters,
                targetFAR: far,
                targetCoveragePct: coverage,
                parking: {
                  ...baseConfig.designParameters.parking,
                  targetRatio: parking
                },
                buildingTypology: typology,
                numBuildings: numBuildings
              }
            });
            
            generated++;
          }
        }
      }
    }
  }
  
  // If we need more variations, add some random ones
  while (variations.length < count) {
    const randomFar = targetFARRange.min + Math.random() * (targetFARRange.max - targetFARRange.min);
    const randomCoverage = targetCoverageRange.min + Math.random() * (targetCoverageRange.max - targetCoverageRange.min);
    const randomParking = parkingRatioRange.min + Math.random() * (parkingRatioRange.max - parkingRatioRange.min);
    const randomNumBuildings = numBuildingsRange[Math.floor(Math.random() * numBuildingsRange.length)];
    const randomTypology = buildingTypologies[Math.floor(Math.random() * buildingTypologies.length)];
    
    variations.push({
      designParameters: {
        ...baseConfig.designParameters,
        targetFAR: Number(randomFar.toFixed(2)),
        targetCoveragePct: Number(randomCoverage.toFixed(0)),
        parking: {
          ...baseConfig.designParameters.parking,
          targetRatio: Number(randomParking.toFixed(1))
        },
        buildingTypology: randomTypology,
        numBuildings: randomNumBuildings
      }
    });
  }
  
  // Trim to exact count
  return variations.slice(0, count);
}


