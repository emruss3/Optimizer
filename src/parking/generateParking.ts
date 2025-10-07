// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { CoordinateTransform } from '../utils/coordinateTransform';

// Types
export interface ParkingStall {
  id: string;
  type: 'standard' | 'compact' | 'ada' | 'motorcycle';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  center: [number, number];
  angle: number;
  width: number;
  length: number;
}

export interface ParkingAisle {
  id: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  width: number;
  angle: number;
  stalls: string[]; // stall IDs
}

export interface ParkingConfiguration {
  angle: number; // 90, 60, 45, or 0 (parallel)
  stallWidth: number; // feet
  stallLength: number; // feet
  aisleWidth: number; // feet
  adaPercentage: number; // 0-1
  compactPercentage: number; // 0-1
  curbCuts: boolean;
  driveContinuity: boolean;
}

export interface ParkingResult {
  stalls: ParkingStall[];
  aisles: ParkingAisle[];
  kpis: {
    totalStalls: number;
    standardStalls: number;
    compactStalls: number;
    adaStalls: number;
    motorcycleStalls: number;
    totalArea: number; // sq ft
    efficiency: number; // stalls per 1000 sq ft
    adaCompliance: boolean;
    driveContinuity: boolean;
  };
  geometry: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      properties: {
        type: 'stall' | 'aisle';
        stallType?: string;
        aisleId?: string;
      };
      geometry: {
        type: 'Polygon';
        coordinates: number[][][];
      };
    }>;
  };
}

export interface ParkingInputs {
  buildablePolygon: number[][];
  configuration: ParkingConfiguration;
  constraints?: {
    minStallWidth?: number;
    maxStallWidth?: number;
    minAisleWidth?: number;
    maxAisleWidth?: number;
    requiredAdaStalls?: number;
  };
}

/**
 * Parking generation engine
 * Creates parking layouts with various angles and configurations
 */
export class ParkingGenerator {
  // Standard dimensions (in feet)
  private static readonly STANDARD_STALL_WIDTH = 9;
  private static readonly STANDARD_STALL_LENGTH = 18;
  private static readonly COMPACT_STALL_WIDTH = 8;
  private static readonly COMPACT_STALL_LENGTH = 16;
  private static readonly ADA_STALL_WIDTH = 9;
  private static readonly ADA_STALL_LENGTH = 18;
  private static readonly MOTORCYCLE_STALL_WIDTH = 4;
  private static readonly MOTORCYCLE_STALL_LENGTH = 8;
  private static readonly MIN_AISLE_WIDTH = 20;
  private static readonly ADA_AISLE_WIDTH = 5;

  /**
   * Generate parking layout for a buildable area
   */
  static generateParking(inputs: ParkingInputs): ParkingResult {
    console.log('🅿️ Generating parking layout...', inputs.configuration);

    const { buildablePolygon, configuration, constraints } = inputs;
    
    // Validate inputs
    const validation = this.validateInputs(inputs);
    if (!validation.isValid) {
      throw new Error(`Invalid parking inputs: ${validation.errors.join(', ')}`);
    }

    // Calculate parking layout based on angle
    let result: ParkingResult;
    
    switch (configuration.angle) {
      case 90:
        result = this.generate90DegreeParking(buildablePolygon, configuration, constraints);
        break;
      case 60:
        result = this.generate60DegreeParking(buildablePolygon, configuration, constraints);
        break;
      case 45:
        result = this.generate45DegreeParking(buildablePolygon, configuration, constraints);
        break;
      case 0:
        result = this.generateParallelParking(buildablePolygon, configuration, constraints);
        break;
      default:
        throw new Error(`Unsupported parking angle: ${configuration.angle}`);
    }

    // Calculate KPIs
    result.kpis = this.calculateKPIs(result, buildablePolygon, configuration);

    // Generate GeoJSON geometry
    result.geometry = this.generateGeoJSON(result);

    console.log('✅ Parking layout generated:', {
      totalStalls: result.kpis.totalStalls,
      efficiency: result.kpis.efficiency.toFixed(2),
      adaCompliance: result.kpis.adaCompliance
    });

    return result;
  }

  /**
   * Generate 90-degree parking layout
   */
  private static generate90DegreeParking(
    polygon: number[][],
    config: ParkingConfiguration,
    constraints?: any
  ): ParkingResult {
    const bounds = CoordinateTransform.calculateBounds(polygon);
    const stalls: ParkingStall[] = [];
    const aisles: ParkingAisle[] = [];

    // Calculate grid dimensions
    const stallWidth = config.stallWidth;
    const stallLength = config.stallLength;
    const aisleWidth = Math.max(config.aisleWidth, this.MIN_AISLE_WIDTH);

    // Calculate how many stalls fit in width and depth
    const usableWidth = bounds.maxX - bounds.minX;
    const usableDepth = bounds.maxY - bounds.minY;

    const stallsPerRow = Math.floor(usableWidth / stallWidth);
    const rows = Math.floor(usableDepth / (stallLength + aisleWidth));

    let stallId = 0;
    let aisleId = 0;

    // Generate stalls and aisles
    for (let row = 0; row < rows; row++) {
      const yStart = bounds.minY + (row * (stallLength + aisleWidth));
      const yEnd = yStart + stallLength;

      // Create aisle if not first row
      if (row > 0) {
        const aisleGeometry = this.createAisleGeometry(
          bounds.minX, yStart - aisleWidth,
          bounds.maxX, yStart,
          aisleWidth
        );
        
        aisles.push({
          id: `aisle_${aisleId++}`,
          geometry: aisleGeometry,
          width: aisleWidth,
          angle: 0,
          stalls: []
        });
      }

      // Create stalls for this row
      for (let col = 0; col < stallsPerRow; col++) {
        const xStart = bounds.minX + (col * stallWidth);
        const xEnd = xStart + stallWidth;

        const stallType = this.determineStallType(stallId, config);
        const stallGeometry = this.createStallGeometry(xStart, yStart, xEnd, yEnd, stallType);

        stalls.push({
          id: `stall_${stallId++}`,
          type: stallType,
          geometry: stallGeometry,
          center: [(xStart + xEnd) / 2, (yStart + yEnd) / 2],
          angle: 0,
          width: stallWidth,
          length: stallLength
        });
      }
    }

    return { stalls, aisles, kpis: {} as any, geometry: {} as any };
  }

  /**
   * Generate 60-degree parking layout
   */
  private static generate60DegreeParking(
    polygon: number[][],
    config: ParkingConfiguration,
    constraints?: any
  ): ParkingResult {
    // Simplified 60-degree implementation
    // In practice, this would use more complex geometric calculations
    return this.generate90DegreeParking(polygon, config, constraints);
  }

  /**
   * Generate 45-degree parking layout
   */
  private static generate45DegreeParking(
    polygon: number[][],
    config: ParkingConfiguration,
    constraints?: any
  ): ParkingResult {
    // Simplified 45-degree implementation
    return this.generate90DegreeParking(polygon, config, constraints);
  }

  /**
   * Generate parallel parking layout
   */
  private static generateParallelParking(
    polygon: number[][],
    config: ParkingConfiguration,
    constraints?: any
  ): ParkingResult {
    const bounds = CoordinateTransform.calculateBounds(polygon);
    const stalls: ParkingStall[] = [];
    const aisles: ParkingAisle[] = [];

    const stallWidth = config.stallWidth;
    const stallLength = config.stallLength;
    const aisleWidth = Math.max(config.aisleWidth, this.MIN_AISLE_WIDTH);

    // For parallel parking, stalls are arranged along the perimeter
    const usableWidth = bounds.maxX - bounds.minX;
    const usableDepth = bounds.maxY - bounds.minY;

    // Calculate how many parallel stalls fit
    const stallsPerSide = Math.floor(usableWidth / stallLength);
    const sides = Math.floor(usableDepth / (stallWidth + aisleWidth));

    let stallId = 0;

    // Generate parallel stalls
    for (let side = 0; side < sides; side++) {
      const xStart = bounds.minX + (side * (stallWidth + aisleWidth));
      const xEnd = xStart + stallWidth;

      for (let col = 0; col < stallsPerSide; col++) {
        const yStart = bounds.minY + (col * stallLength);
        const yEnd = yStart + stallLength;

        const stallType = this.determineStallType(stallId, config);
        const stallGeometry = this.createStallGeometry(xStart, yStart, xEnd, yEnd, stallType);

        stalls.push({
          id: `stall_${stallId++}`,
          type: stallType,
          geometry: stallGeometry,
          center: [(xStart + xEnd) / 2, (yStart + yEnd) / 2],
          angle: 90, // Parallel to edge
          width: stallWidth,
          length: stallLength
        });
      }
    }

    return { stalls, aisles, kpis: {} as any, geometry: {} as any };
  }

  /**
   * Determine stall type based on configuration and position
   */
  private static determineStallType(stallIndex: number, config: ParkingConfiguration): ParkingStall['type'] {
    const totalStalls = 100; // This would be calculated based on actual layout
    const adaStalls = Math.ceil(totalStalls * config.adaPercentage);
    const compactStalls = Math.ceil(totalStalls * config.compactPercentage);

    if (stallIndex < adaStalls) return 'ada';
    if (stallIndex < adaStalls + compactStalls) return 'compact';
    if (stallIndex < adaStalls + compactStalls + 5) return 'motorcycle'; // 5 motorcycle stalls
    return 'standard';
  }

  /**
   * Create stall geometry
   */
  private static createStallGeometry(
    x1: number, y1: number, x2: number, y2: number, 
    stallType: ParkingStall['type']
  ): ParkingStall['geometry'] {
    const coordinates = [[
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1]
    ]];

    return {
      type: 'Polygon',
      coordinates
    };
  }

  /**
   * Create aisle geometry
   */
  private static createAisleGeometry(
    x1: number, y1: number, x2: number, y2: number,
    width: number
  ): ParkingAisle['geometry'] {
    const coordinates = [[
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
      [x1, y1]
    ]];

    return {
      type: 'Polygon',
      coordinates
    };
  }

  /**
   * Calculate KPIs for the parking layout
   */
  private static calculateKPIs(
    result: ParkingResult,
    polygon: number[][],
    config: ParkingConfiguration
  ): ParkingResult['kpis'] {
    const totalStalls = result.stalls.length;
    const standardStalls = result.stalls.filter(s => s.type === 'standard').length;
    const compactStalls = result.stalls.filter(s => s.type === 'compact').length;
    const adaStalls = result.stalls.filter(s => s.type === 'ada').length;
    const motorcycleStalls = result.stalls.filter(s => s.type === 'motorcycle').length;

    // Calculate total area
    const totalArea = CoordinateTransform.calculatePolygonArea(polygon, 'feet');
    const efficiency = totalStalls / (totalArea / 1000); // stalls per 1000 sq ft

    // Check ADA compliance (minimum 2% or 1 stall, whichever is greater)
    const requiredAdaStalls = Math.max(1, Math.ceil(totalStalls * 0.02));
    const adaCompliance = adaStalls >= requiredAdaStalls;

    // Check drive continuity (simplified - assumes true if aisles exist)
    const driveContinuity = result.aisles.length > 0;

    return {
      totalStalls,
      standardStalls,
      compactStalls,
      adaStalls,
      motorcycleStalls,
      totalArea,
      efficiency,
      adaCompliance,
      driveContinuity
    };
  }

  /**
   * Generate GeoJSON geometry for the parking layout
   */
  private static generateGeoJSON(result: ParkingResult): ParkingResult['geometry'] {
    const features = [];

    // Add stall features
    for (const stall of result.stalls) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'stall',
          stallType: stall.type
        },
        geometry: stall.geometry
      });
    }

    // Add aisle features
    for (const aisle of result.aisles) {
      features.push({
        type: 'Feature',
        properties: {
          type: 'aisle',
          aisleId: aisle.id
        },
        geometry: aisle.geometry
      });
    }

    return {
      type: 'FeatureCollection',
      features
    };
  }

  /**
   * Validate parking inputs
   */
  private static validateInputs(inputs: ParkingInputs): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!inputs.buildablePolygon || inputs.buildablePolygon.length < 3) {
      errors.push('Invalid buildable polygon');
    }

    if (![90, 60, 45, 0].includes(inputs.configuration.angle)) {
      errors.push('Invalid parking angle');
    }

    if (inputs.configuration.stallWidth < 7 || inputs.configuration.stallWidth > 12) {
      errors.push('Invalid stall width');
    }

    if (inputs.configuration.stallLength < 15 || inputs.configuration.stallLength > 25) {
      errors.push('Invalid stall length');
    }

    if (inputs.configuration.aisleWidth < 18) {
      errors.push('Aisle width too narrow');
    }

    if (inputs.configuration.adaPercentage < 0 || inputs.configuration.adaPercentage > 0.1) {
      errors.push('Invalid ADA percentage');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Optimize parking layout for maximum efficiency
   */
  static optimizeParking(inputs: ParkingInputs): ParkingResult {
    const angles = [90, 60, 45, 0];
    let bestResult: ParkingResult | null = null;
    let bestEfficiency = 0;

    for (const angle of angles) {
      const config = { ...inputs.configuration, angle };
      try {
        const result = this.generateParking({ ...inputs, configuration: config });
        if (result.kpis.efficiency > bestEfficiency) {
          bestEfficiency = result.kpis.efficiency;
          bestResult = result;
        }
      } catch (error) {
        console.warn(`Failed to generate parking for angle ${angle}:`, error);
      }
    }

    if (!bestResult) {
      throw new Error('Failed to generate any valid parking layout');
    }

    return bestResult;
  }
}

// Export convenience functions
export const generateParking = (inputs: ParkingInputs) => ParkingGenerator.generateParking(inputs);
export const optimizeParking = (inputs: ParkingInputs) => ParkingGenerator.optimizeParking(inputs);
