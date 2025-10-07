// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { CoordinateTransform } from '../utils/coordinateTransform';

// Types
export interface BuildingBar {
  id: string;
  type: 'bar' | 'tower';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  center: [number, number];
  width: number;
  depth: number;
  height: number;
  floors: number;
  floorArea: number;
  totalArea: number;
  orientation: number; // degrees
}

export interface MassingConfiguration {
  barDepth: number; // feet
  minCourt: number; // feet
  maxBarLength: number; // feet
  faceToFace: number; // feet
  heightCap: number; // feet
  maxFAR: number;
  maxCoverage: number; // 0-1
  orientation: 'north-south' | 'east-west' | 'optimal';
  buildingType: 'residential' | 'commercial' | 'mixed-use';
}

export interface MassingResult {
  bars: BuildingBar[];
  kpis: {
    totalNRSF: number; // Net Rentable Square Feet
    totalGSF: number;  // Gross Square Feet
    far: number;       // Floor Area Ratio
    coverage: number;  // Building coverage ratio
    averageHeight: number;
    totalFloors: number;
    efficiency: number; // NRSF/GSF ratio
    courtCompliance: boolean;
    setbackCompliance: boolean;
  };
  geometry: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: {
        type: 'bar' | 'tower';
        barId: string;
        floors: number;
        height: number;
        floorArea: number;
        totalArea: number;
      };
      geometry: {
        type: 'Polygon';
        coordinates: number[][][];
      };
    }>;
  };
}

export interface MassingInputs {
  buildablePolygon: number[][];
  configuration: MassingConfiguration;
  constraints?: {
    minBarWidth?: number;
    maxBarWidth?: number;
    minCourtSize?: number;
    requiredSetbacks?: {
      front: number;
      side: number;
      rear: number;
    };
  };
}

/**
 * Massing generation engine
 * Creates building layouts with bars and towers
 */
export class MassingGenerator {
  // Standard dimensions (in feet)
  private static readonly STANDARD_FLOOR_HEIGHT = 10;
  private static readonly MIN_BAR_WIDTH = 20;
  private static readonly MAX_BAR_WIDTH = 80;
  private static readonly MIN_COURT_SIZE = 20;
  private static readonly TYPICAL_FLOOR_HEIGHT = 10;

  /**
   * Generate massing layout for a buildable area
   */
  static generateMassing(inputs: MassingInputs): MassingResult {
    console.log('🏗️ Generating massing layout...', inputs.configuration);

    const { buildablePolygon, configuration, constraints } = inputs;
    
    // Validate inputs
    const validation = this.validateInputs(inputs);
    if (!validation.isValid) {
      throw new Error(`Invalid massing inputs: ${validation.errors.join(', ')}`);
    }

    // Calculate available area
    const totalArea = CoordinateTransform.calculatePolygonArea(buildablePolygon, 'feet');
    const maxBuildingArea = totalArea * configuration.maxCoverage;
    const maxGSF = totalArea * configuration.maxFAR;

    // Generate building bars
    const bars = this.generateBuildingBars(
      buildablePolygon,
      configuration,
      maxBuildingArea,
      maxGSF,
      constraints
    );

    // Calculate KPIs
    const kpis = this.calculateKPIs(bars, buildablePolygon, configuration);

    // Generate GeoJSON geometry
    const geometry = this.generateGeoJSON(bars);

    console.log('✅ Massing layout generated:', {
      totalBars: bars.length,
      totalNRSF: kpis.totalNRSF.toLocaleString(),
      far: kpis.far.toFixed(2),
      coverage: (kpis.coverage * 100).toFixed(1) + '%'
    });

    return { bars, kpis, geometry };
  }

  /**
   * Generate building bars within the buildable area
   */
  private static generateBuildingBars(
    polygon: number[][],
    config: MassingConfiguration,
    maxBuildingArea: number,
    maxGSF: number,
    constraints?: any
  ): BuildingBar[] {
    const bounds = CoordinateTransform.calculateBounds(polygon);
    const bars: BuildingBar[] = [];

    // Calculate optimal bar dimensions
    const barDepth = config.barDepth;
    const barWidth = Math.min(config.maxBarLength, bounds.maxX - bounds.minX - config.minCourt);
    const floorHeight = this.TYPICAL_FLOOR_HEIGHT;

    // Calculate how many floors we can build
    const maxFloors = Math.floor(config.heightCap / floorHeight);
    const floorsPerBar = Math.min(maxFloors, Math.floor(maxGSF / (barWidth * barDepth)));

    if (floorsPerBar < 1) {
      console.warn('⚠️ Cannot fit any floors with current constraints');
      return bars;
    }

    // Generate bars based on orientation
    let barId = 0;
    let currentArea = 0;

    switch (config.orientation) {
      case 'north-south':
        bars.push(...this.generateNorthSouthBars(bounds, barWidth, barDepth, floorsPerBar, barId, currentArea, maxBuildingArea));
        break;
      case 'east-west':
        bars.push(...this.generateEastWestBars(bounds, barWidth, barDepth, floorsPerBar, barId, currentArea, maxBuildingArea));
        break;
      case 'optimal':
        bars.push(...this.generateOptimalBars(bounds, barWidth, barDepth, floorsPerBar, barId, currentArea, maxBuildingArea, config));
        break;
    }

    return bars;
  }

  /**
   * Generate north-south oriented bars
   */
  private static generateNorthSouthBars(
    bounds: any,
    barWidth: number,
    barDepth: number,
    floors: number,
    startId: number,
    startArea: number,
    maxArea: number
  ): BuildingBar[] {
    const bars: BuildingBar[] = [];
    let barId = startId;
    let currentArea = startArea;

    // Calculate how many bars fit
    const usableWidth = bounds.maxX - bounds.minX;
    const usableDepth = bounds.maxY - bounds.minY;
    const barsPerRow = Math.floor(usableWidth / barWidth);
    const rows = Math.floor(usableDepth / barDepth);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < barsPerRow; col++) {
        if (currentArea >= maxArea) break;

        const x1 = bounds.minX + (col * barWidth);
        const y1 = bounds.minY + (row * barDepth);
        const x2 = x1 + barWidth;
        const y2 = y1 + barDepth;

        const bar = this.createBuildingBar(
          barId++,
          x1, y1, x2, y2,
          floors,
          'bar',
          0 // north-south orientation
        );

        bars.push(bar);
        currentArea += bar.floorArea;
      }
      if (currentArea >= maxArea) break;
    }

    return bars;
  }

  /**
   * Generate east-west oriented bars
   */
  private static generateEastWestBars(
    bounds: any,
    barWidth: number,
    barDepth: number,
    floors: number,
    startId: number,
    startArea: number,
    maxArea: number
  ): BuildingBar[] {
    const bars: BuildingBar[] = [];
    let barId = startId;
    let currentArea = startArea;

    // Swap dimensions for east-west orientation
    const usableWidth = bounds.maxX - bounds.minX;
    const usableDepth = bounds.maxY - bounds.minY;
    const barsPerRow = Math.floor(usableDepth / barWidth);
    const rows = Math.floor(usableWidth / barDepth);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < barsPerRow; col++) {
        if (currentArea >= maxArea) break;

        const x1 = bounds.minX + (row * barDepth);
        const y1 = bounds.minY + (col * barWidth);
        const x2 = x1 + barDepth;
        const y2 = y1 + barWidth;

        const bar = this.createBuildingBar(
          barId++,
          x1, y1, x2, y2,
          floors,
          'bar',
          90 // east-west orientation
        );

        bars.push(bar);
        currentArea += bar.floorArea;
      }
      if (currentArea >= maxArea) break;
    }

    return bars;
  }

  /**
   * Generate optimally oriented bars
   */
  private static generateOptimalBars(
    bounds: any,
    barWidth: number,
    barDepth: number,
    floors: number,
    startId: number,
    startArea: number,
    maxArea: number,
    config: MassingConfiguration
  ): BuildingBar[] {
    // Try both orientations and pick the one that fits more bars
    const northSouthBars = this.generateNorthSouthBars(bounds, barWidth, barDepth, floors, startId, startArea, maxArea);
    const eastWestBars = this.generateEastWestBars(bounds, barWidth, barDepth, floors, startId, startArea, maxArea);

    return northSouthBars.length >= eastWestBars.length ? northSouthBars : eastWestBars;
  }

  /**
   * Create a building bar
   */
  private static createBuildingBar(
    id: number,
    x1: number, y1: number, x2: number, y2: number,
    floors: number,
    type: 'bar' | 'tower',
    orientation: number
  ): BuildingBar {
    const width = x2 - x1;
    const depth = y2 - y1;
    const height = floors * this.TYPICAL_FLOOR_HEIGHT;
    const floorArea = width * depth;
    const totalArea = floorArea * floors;

    const coordinates = [[
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1]
    ]];

    return {
      id: `bar_${id}`,
      type,
      geometry: {
        type: 'Polygon',
        coordinates
      },
      center: [(x1 + x2) / 2, (y1 + y2) / 2],
      width,
      depth,
      height,
      floors,
      floorArea,
      totalArea,
      orientation
    };
  }

  /**
   * Calculate KPIs for the massing layout
   */
  private static calculateKPIs(
    bars: BuildingBar[],
    polygon: number[][],
    config: MassingConfiguration
  ): MassingResult['kpis'] {
    const totalArea = CoordinateTransform.calculatePolygonArea(polygon, 'feet');
    const totalNRSF = bars.reduce((sum, bar) => sum + bar.totalArea, 0);
    const totalGSF = totalNRSF; // Assuming no common areas for simplicity
    const far = totalGSF / totalArea;
    const coverage = bars.reduce((sum, bar) => sum + bar.floorArea, 0) / totalArea;

    const averageHeight = bars.length > 0 ? bars.reduce((sum, bar) => sum + bar.height, 0) / bars.length : 0;
    const totalFloors = bars.reduce((sum, bar) => sum + bar.floors, 0);
    const efficiency = totalNRSF / totalGSF; // Assuming 100% efficiency for simplicity

    // Check court compliance (simplified)
    const courtCompliance = this.checkCourtCompliance(bars, config);

    // Check setback compliance (simplified)
    const setbackCompliance = this.checkSetbackCompliance(bars, polygon, config);

    return {
      totalNRSF,
      totalGSF,
      far,
      coverage,
      averageHeight,
      totalFloors,
      efficiency,
      courtCompliance,
      setbackCompliance
    };
  }

  /**
   * Check court compliance
   */
  private static checkCourtCompliance(bars: BuildingBar[], config: MassingConfiguration): boolean {
    // Simplified check - ensure minimum court size between bars
    if (bars.length < 2) return true;

    // Check if bars are properly spaced
    for (let i = 0; i < bars.length - 1; i++) {
      for (let j = i + 1; j < bars.length; j++) {
        const distance = this.calculateBarDistance(bars[i], bars[j]);
        if (distance < config.minCourt) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check setback compliance
   */
  private static checkSetbackCompliance(
    bars: BuildingBar[],
    polygon: number[][],
    config: MassingConfiguration
  ): boolean {
    // Simplified check - ensure bars are within buildable area
    const bounds = CoordinateTransform.calculateBounds(polygon);
    
    for (const bar of bars) {
      const barBounds = CoordinateTransform.calculateBounds(bar.geometry.coordinates[0]);
      
      if (barBounds.minX < bounds.minX || barBounds.maxX > bounds.maxX ||
          barBounds.minY < bounds.minY || barBounds.maxY > bounds.maxY) {
        return false;
      }
    }

    return true;
  }

  /**
   * Calculate distance between two bars
   */
  private static calculateBarDistance(bar1: BuildingBar, bar2: BuildingBar): number {
    const dx = bar1.center[0] - bar2.center[0];
    const dy = bar1.center[1] - bar2.center[1];
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Generate GeoJSON geometry for the massing layout
   */
  private static generateGeoJSON(bars: BuildingBar[]): MassingResult['geometry'] {
    const features = bars.map(bar => ({
      type: 'Feature' as const,
      properties: {
        type: bar.type,
        barId: bar.id,
        floors: bar.floors,
        height: bar.height,
        floorArea: bar.floorArea,
        totalArea: bar.totalArea
      },
      geometry: bar.geometry
    }));

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Validate massing inputs
   */
  private static validateInputs(inputs: MassingInputs): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!inputs.buildablePolygon || inputs.buildablePolygon.length < 3) {
      errors.push('Invalid buildable polygon');
    }

    if (inputs.configuration.barDepth < 20 || inputs.configuration.barDepth > 100) {
      errors.push('Invalid bar depth');
    }

    if (inputs.configuration.minCourt < 10) {
      errors.push('Minimum court size too small');
    }

    if (inputs.configuration.maxBarLength < 50) {
      errors.push('Maximum bar length too small');
    }

    if (inputs.configuration.heightCap < 20) {
      errors.push('Height cap too low');
    }

    if (inputs.configuration.maxFAR < 0.1 || inputs.configuration.maxFAR > 10) {
      errors.push('Invalid FAR range');
    }

    if (inputs.configuration.maxCoverage < 0.1 || inputs.configuration.maxCoverage > 1) {
      errors.push('Invalid coverage range');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Optimize massing layout for maximum efficiency
   */
  static optimizeMassing(inputs: MassingInputs): MassingResult {
    const orientations: MassingConfiguration['orientation'][] = ['north-south', 'east-west', 'optimal'];
    let bestResult: MassingResult | null = null;
    let bestEfficiency = 0;

    for (const orientation of orientations) {
      const config = { ...inputs.configuration, orientation };
      try {
        const result = this.generateMassing({ ...inputs, configuration: config });
        if (result.kpis.efficiency > bestEfficiency) {
          bestEfficiency = result.kpis.efficiency;
          bestResult = result;
        }
      } catch (error) {
        console.warn(`Failed to generate massing for orientation ${orientation}:`, error);
      }
    }

    if (!bestResult) {
      throw new Error('Failed to generate any valid massing layout');
    }

    return bestResult;
  }
}

// Export convenience functions
export const generateMassing = (inputs: MassingInputs) => MassingGenerator.generateMassing(inputs);
export const optimizeMassing = (inputs: MassingInputs) => MassingGenerator.optimizeMassing(inputs);
