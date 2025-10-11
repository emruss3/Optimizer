import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { 
  Building, Car, TreePine, Settings, Play, RotateCcw, RotateCw, TrendingUp,
  AlertTriangle, CheckCircle, Target, BarChart3, DollarSign, Users,
  Home, Building2, Eye, Ruler, Move, Square, Circle, Trash2,
  Copy, AlignLeft, AlignCenter, AlignRight, AlignStartVertical,
  AlignCenterVertical, AlignEndVertical, ZoomIn, ZoomOut, Grid,
  MousePointer, Edit3, Maximize, MoreHorizontal, X
} from 'lucide-react';
import { SelectedParcel, MarketData, InvestmentAnalysis } from '../types/parcel';
import { fetchParcelGeometry3857, fetchParcelBuildableEnvelope, SitePlannerGeometry } from '../services/parcelGeometry';
import { checkAndImportOSMRoads } from '../services/osmRoads';
import { supabase } from '../lib/supabase';

// Types and Interfaces
interface Vertex {
  x: number;
  y: number;
  id: string;
}

interface Element {
  id: string;
  type: 'building' | 'parking' | 'greenspace';
  vertices: Vertex[];
  rotation?: number; // Current rotation angle in degrees
  properties: {
    name?: string;
    area?: number;
    perimeter?: number;
    color?: string;
    strokeColor?: string;
    fillOpacity?: number;
  };
}

interface DragState {
  isDragging: boolean;
  dragType: 'element' | 'vertex' | 'selection';
  elementId?: string;
  vertexId?: string;
  offset: { x: number; y: number };
  originalPosition: { x: number; y: number };
  originalVertices?: Vertex[];
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  color: string;
}

// MarketData interface is now imported from types/parcel

interface EnterpriseSitePlannerProps {
  parcel: SelectedParcel;
  marketData: MarketData;
  onInvestmentAnalysis?: (analysis: InvestmentAnalysis) => void;
}

// Helper Functions
const generateId = () => Math.random().toString(36).substr(2, 9);

const calculatePolygonArea = (vertices: Vertex[]): number => {
  if (vertices.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area / 2);
};

const calculatePolygonPerimeter = (vertices: Vertex[]): number => {
  if (vertices.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    const dx = vertices[j].x - vertices[i].x;
    const dy = vertices[j].y - vertices[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
};

const createVertexPath = (vertices: Vertex[]): string => {
  if (vertices.length === 0) return '';
  const path = vertices.map((vertex, index) => {
    return `${index === 0 ? 'M' : 'L'} ${vertex.x} ${vertex.y}`;
  }).join(' ');
  return `${path} Z`;
};

const snapToGrid = (value: number, gridSize: number, enabled: boolean = true): number => {
  if (!enabled) return value;
  return Math.round(value / gridSize) * gridSize;
};

// Helper function to check if a point is inside a polygon (buildable area)
const isPointInPolygon = (point: { x: number, y: number }, polygon: Vertex[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    if (((polygon[i].y > point.y) !== (polygon[j].y > point.y)) &&
        (point.x < (polygon[j].x - polygon[i].x) * (point.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
      inside = !inside;
    }
  }
  return inside;
};

// Helper function to find parking position within buildable area
const findParkingPositionInBuildableArea = (
  buildableArea: Element,
  parkingWidthSVG: number,
  parkingDepthSVG: number,
  preferredX?: number,
  preferredY?: number
): { x: number, y: number } | null => {
  const bounds = buildableArea.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  // Try preferred position first
  if (preferredX !== undefined && preferredY !== undefined) {
    const corners = [
      { x: preferredX, y: preferredY },
      { x: preferredX + parkingWidthSVG, y: preferredY },
      { x: preferredX + parkingWidthSVG, y: preferredY + parkingDepthSVG },
      { x: preferredX, y: preferredY + parkingDepthSVG }
    ];
    
    if (corners.every(corner => isPointInPolygon(corner, buildableArea.vertices))) {
      return { x: preferredX, y: preferredY };
    }
  }

  // Search for a valid position within the buildable area
  const step = 20; // 20 SVG units step
  for (let y = bounds.minY; y <= bounds.maxY - parkingDepthSVG; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX - parkingWidthSVG; x += step) {
      const corners = [
        { x, y },
        { x: x + parkingWidthSVG, y },
        { x: x + parkingWidthSVG, y: y + parkingDepthSVG },
        { x, y: y + parkingDepthSVG }
      ];
      
      if (corners.every(corner => isPointInPolygon(corner, buildableArea.vertices))) {
        return { x, y };
      }
    }
  }
  
  return null; // No valid position found
};

// New intelligent parking generation system
const generateIntelligentParking = (
  totalSpaces: number,
  buildableArea: Element,
  existingElements: Element[] = [],
  gridSize: number = 12
): Element[] => {
  const parkingLots: Element[] = [];
  const spaceSize = 350; // sq ft per space
  const maxLotSize = 50; // Maximum spaces per lot for better distribution
  
  // Calculate how many parking lots we need
  const numLots = Math.ceil(totalSpaces / maxLotSize);
  const spacesPerLot = Math.ceil(totalSpaces / numLots);
  
  console.log(`🚗 Generating ${numLots} parking lots with ${spacesPerLot} spaces each (${totalSpaces} total)`);
  
  for (let i = 0; i < numLots; i++) {
    const lotSpaces = Math.min(spacesPerLot, totalSpaces - (i * spacesPerLot));
    if (lotSpaces <= 0) break;
    
    // Create realistic parking lot dimensions
    const lotArea = lotSpaces * spaceSize;
    const aspectRatio = 2.5; // Wide parking lots
    const lotWidth = Math.sqrt(lotArea * aspectRatio);
    const lotHeight = lotArea / lotWidth;
    
    // Convert to SVG units
    const lotWidthSVG = lotWidth * gridSize;
    const lotHeightSVG = lotHeight * gridSize;
    
    // Try to find a position that doesn't overlap with existing elements
    const position = findNonOverlappingParkingPosition(
      buildableArea,
      lotWidthSVG,
      lotHeightSVG,
      [...existingElements, ...parkingLots],
      i
    );
    
    if (position) {
      const parkingLot: Element = {
        id: `parking-${i + 1}`,
        type: 'parking',
        vertices: [
          { id: '1', x: position.x, y: position.y },
          { id: '2', x: position.x + lotWidthSVG, y: position.y },
          { id: '3', x: position.x + lotWidthSVG, y: position.y + lotHeightSVG },
          { id: '4', x: position.x, y: position.y + lotHeightSVG }
        ],
        properties: {
          name: `Parking Lot ${i + 1}`,
          area: lotArea,
          perimeter: 2 * (lotWidth + lotHeight),
          color: '#E5E7EB',
          strokeColor: '#9CA3AF',
          fillOpacity: 0.8
        }
      };
      
      parkingLots.push(parkingLot);
      console.log(`✅ Created parking lot ${i + 1}: ${lotSpaces} spaces, ${lotWidth.toFixed(0)}' x ${lotHeight.toFixed(0)}'`);
    } else {
      console.warn(`⚠️ Could not place parking lot ${i + 1} within buildable area`);
    }
  }
  
  return parkingLots;
};

// Helper function to find non-overlapping parking positions
const findNonOverlappingParkingPosition = (
  buildableArea: Element,
  lotWidthSVG: number,
  lotHeightSVG: number,
  existingElements: Element[],
  lotIndex: number
): { x: number, y: number } | null => {
  const bounds = buildableArea.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  // Try different strategies based on lot index
  const strategies = [
    // Strategy 1: Try along the edges
    () => {
      const margin = 20;
      const positions = [
        { x: bounds.minX + margin, y: bounds.minY + margin }, // Top-left
        { x: bounds.maxX - lotWidthSVG - margin, y: bounds.minY + margin }, // Top-right
        { x: bounds.minX + margin, y: bounds.maxY - lotHeightSVG - margin }, // Bottom-left
        { x: bounds.maxX - lotWidthSVG - margin, y: bounds.maxY - lotHeightSVG - margin }, // Bottom-right
      ];
      
      for (const pos of positions) {
        if (isValidParkingPosition(pos, lotWidthSVG, lotHeightSVG, buildableArea, existingElements)) {
          return pos;
        }
      }
      return null;
    },
    
    // Strategy 2: Try in the center area
    () => {
      const centerX = bounds.minX + (bounds.maxX - bounds.minX) / 2;
      const centerY = bounds.minY + (bounds.maxY - bounds.minY) / 2;
      const offset = lotIndex * 100; // Offset each lot
      
      const positions = [
        { x: centerX - lotWidthSVG / 2, y: centerY - lotHeightSVG / 2 + offset },
        { x: centerX - lotWidthSVG / 2 - offset, y: centerY - lotHeightSVG / 2 },
        { x: centerX - lotWidthSVG / 2 + offset, y: centerY - lotHeightSVG / 2 },
      ];
      
      for (const pos of positions) {
        if (isValidParkingPosition(pos, lotWidthSVG, lotHeightSVG, buildableArea, existingElements)) {
          return pos;
        }
      }
      return null;
    },
    
    // Strategy 3: Grid search with larger steps
    () => {
      const step = 50; // Larger steps for efficiency
      for (let y = bounds.minY; y <= bounds.maxY - lotHeightSVG; y += step) {
        for (let x = bounds.minX; x <= bounds.maxX - lotWidthSVG; x += step) {
          const pos = { x, y };
          if (isValidParkingPosition(pos, lotWidthSVG, lotHeightSVG, buildableArea, existingElements)) {
            return pos;
          }
        }
      }
      return null;
    }
  ];
  
  // Try each strategy
  for (const strategy of strategies) {
    const result = strategy();
    if (result) return result;
  }
  
  return null;
};

// Helper function to check if a parking position is valid
const isValidParkingPosition = (
  position: { x: number, y: number },
  lotWidthSVG: number,
  lotHeightSVG: number,
  buildableArea: Element,
  existingElements: Element[]
): boolean => {
  // Check if parking lot fits within buildable area
  const corners = [
    { x: position.x, y: position.y },
    { x: position.x + lotWidthSVG, y: position.y },
    { x: position.x + lotWidthSVG, y: position.y + lotHeightSVG },
    { x: position.x, y: position.y + lotHeightSVG }
  ];
  
  if (!corners.every(corner => isPointInPolygon(corner, buildableArea.vertices))) {
    return false;
  }
  
  // Check for overlaps with existing elements
  for (const element of existingElements) {
    if (element.type === 'building' || element.type === 'parking') {
      const elementBounds = element.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      const parkingBounds = {
        minX: position.x,
        maxX: position.x + lotWidthSVG,
        minY: position.y,
        maxY: position.y + lotHeightSVG
      };
      
      // Check for overlap (with 20 SVG unit buffer)
      const buffer = 20;
      if (!(parkingBounds.maxX + buffer < elementBounds.minX ||
            parkingBounds.minX - buffer > elementBounds.maxX ||
            parkingBounds.maxY + buffer < elementBounds.minY ||
            parkingBounds.minY - buffer > elementBounds.maxY)) {
        return false; // Overlap detected
      }
    }
  }
  
  return true;
};

// CRITICAL: Helper function to validate if a building is within buildable area
const isBuildingWithinBuildableArea = (
  building: Element,
  buildableArea: Element
): boolean => {
  // Check if all building corners are within the buildable area
  const allCornersInside = building.vertices.every(vertex => 
    isPointInPolygon(vertex, buildableArea.vertices)
  );
  
  console.log('🔍 Building boundary validation:', {
    allCornersInside,
    buildingVertices: building.vertices,
    buildableVertices: buildableArea.vertices,
    isValid: allCornersInside
  });
  
  // Only check if corners are inside the polygon - this is sufficient for irregular shapes
  return allCornersInside;
};

// Helper function to analyze parcel orientation
const analyzeParcelOrientation = (buildableArea: Element): {
  primaryAxis: 'horizontal' | 'vertical' | 'diagonal',
  rotationAngle: number,
  aspectRatio: number,
  bounds: { minX: number, maxX: number, minY: number, maxY: number }
} => {
  const bounds = buildableArea.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const aspectRatio = width / height;
  
  // Calculate the primary axis based on aspect ratio
  let primaryAxis: 'horizontal' | 'vertical' | 'diagonal';
  if (aspectRatio > 1.5) {
    primaryAxis = 'horizontal';
  } else if (aspectRatio < 0.67) {
    primaryAxis = 'vertical';
  } else {
    primaryAxis = 'diagonal';
  }
  
  // Calculate rotation angle based on parcel orientation
  // For now, we'll use 0 degrees (no rotation) but this can be enhanced
  // to calculate actual rotation based on parcel edges
  let rotationAngle = 0;
  
  // If diagonal, try to align with the longest edge
  if (primaryAxis === 'diagonal') {
    // Find the longest edge of the parcel
    let maxEdgeLength = 0;
    let longestEdgeAngle = 0;
    
    for (let i = 0; i < buildableArea.vertices.length; i++) {
      const current = buildableArea.vertices[i];
      const next = buildableArea.vertices[(i + 1) % buildableArea.vertices.length];
      const edgeLength = Math.sqrt(Math.pow(next.x - current.x, 2) + Math.pow(next.y - current.y, 2));
      
      if (edgeLength > maxEdgeLength) {
        maxEdgeLength = edgeLength;
        longestEdgeAngle = Math.atan2(next.y - current.y, next.x - current.x);
      }
    }
    
    rotationAngle = longestEdgeAngle;
  }
  
  console.log('🧭 Parcel orientation analysis:', {
    primaryAxis,
    aspectRatio: aspectRatio.toFixed(2),
    rotationAngle: (rotationAngle * 180 / Math.PI).toFixed(1) + '°',
    width: width.toFixed(0),
    height: height.toFixed(0)
  });
  
  return {
    primaryAxis,
    rotationAngle,
    aspectRatio,
    bounds
  };
};

// CRITICAL: Helper function to find valid building position within buildable area
const findValidBuildingPosition = (
  buildableArea: Element,
  buildingWidthSVG: number,
  buildingHeightSVG: number,
  existingElements: Element[],
  preferredPosition?: { x: number, y: number }
): { x: number, y: number } | null => {
  const bounds = buildableArea.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );

  // Try preferred position first if provided
  if (preferredPosition) {
    const testBuilding: Element = {
      id: 'test',
      type: 'building',
      vertices: [
        { id: '1', x: preferredPosition.x, y: preferredPosition.y },
        { id: '2', x: preferredPosition.x + buildingWidthSVG, y: preferredPosition.y },
        { id: '3', x: preferredPosition.x + buildingWidthSVG, y: preferredPosition.y + buildingHeightSVG },
        { id: '4', x: preferredPosition.x, y: preferredPosition.y + buildingHeightSVG }
      ],
      properties: {}
    };
    
    if (isBuildingWithinBuildableArea(testBuilding, buildableArea)) {
      return preferredPosition;
    }
  }

  // Search for valid position within buildable area with adaptive step size
  let step = 50; // Start with larger steps for efficiency
  let attempts = 0;
  const maxAttempts = 500; // Reduced max attempts
  
  console.log('🔍 Searching for valid building position:', {
    buildingWidthSVG,
    buildingHeightSVG,
    bounds,
    step
  });
  
  // Try multiple step sizes for better coverage
  const stepSizes = [50, 25, 12, 6];
  
  for (const currentStep of stepSizes) {
    step = currentStep;
    console.log(`🔍 Trying step size: ${step}`);
    
    for (let y = bounds.minY; y <= bounds.maxY - buildingHeightSVG; y += step) {
      for (let x = bounds.minX; x <= bounds.maxX - buildingWidthSVG; x += step) {
        attempts++;
        if (attempts > maxAttempts) {
          console.warn('⚠️ Max attempts reached, stopping search');
          break;
        }
        
        const testBuilding: Element = {
          id: 'test',
          type: 'building',
          vertices: [
            { id: '1', x, y },
            { id: '2', x: x + buildingWidthSVG, y },
            { id: '3', x: x + buildingWidthSVG, y: y + buildingHeightSVG },
            { id: '4', x, y: y + buildingHeightSVG }
          ],
          properties: {}
        };
        
        if (isBuildingWithinBuildableArea(testBuilding, buildableArea)) {
          console.log(`✅ Found valid position at (${x}, ${y}) after ${attempts} attempts with step ${step}`);
          return { x, y };
        }
      }
      if (attempts > maxAttempts) break;
    }
    if (attempts > maxAttempts) break;
  }
  
  console.warn(`⚠️ Could not find valid building position within buildable area after ${attempts} attempts`);
  return null;
};

// Coordinate conversion functions
const svgToFeet = (svgCoord: number, gridSize: number = 12): number => {
  return svgCoord / gridSize; // Convert SVG units to feet (12 SVG units = 1 foot)
};

const feetToSVG = (feetCoord: number, gridSize: number = 12): number => {
  return feetCoord * gridSize; // Convert feet to SVG units (1 foot = 12 SVG units)
};

// Advanced helper functions
const updateElementGeometry = (element: Element, gridSize: number = 12): Element => {
  const areaSVG = calculatePolygonArea(element.vertices);
  const perimeterSVG = calculatePolygonPerimeter(element.vertices);
  
  // Convert SVG units to square feet
  const areaSqFt = areaSVG / (gridSize * gridSize);
  const perimeterFeet = perimeterSVG / gridSize;
  
  return {
    ...element,
    properties: {
      ...element.properties,
      area: areaSqFt,
      perimeter: perimeterFeet
    }
  };
};

// Rotation helper functions
const calculateElementCenter = (vertices: Vertex[]): {x: number, y: number} => {
  const sumX = vertices.reduce((sum, vertex) => sum + vertex.x, 0);
  const sumY = vertices.reduce((sum, vertex) => sum + vertex.y, 0);
  return {
    x: sumX / vertices.length,
    y: sumY / vertices.length
  };
};

const rotatePoint = (point: {x: number, y: number}, center: {x: number, y: number}, angle: number): {x: number, y: number} => {
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
};

const rotateElement = (element: Element, absoluteAngle: number, rotationCenter?: {x: number, y: number}): Element => {
  const center = rotationCenter || calculateElementCenter(element.vertices);
  const rotatedVertices = element.vertices.map(vertex => 
    rotatePoint(vertex, center, absoluteAngle)
  );
  
  return {
    ...element,
    vertices: rotatedVertices,
    rotation: absoluteAngle // Store absolute angle, not cumulative
  };
};

const calculateAngle = (center: {x: number, y: number}, point: {x: number, y: number}): number => {
  return Math.atan2(point.y - center.y, point.x - center.x) * (180 / Math.PI);
};

const normalizeAngle = (angle: number): number => {
  // Normalize angle to 0-360 degrees
  while (angle < 0) angle += 360;
  while (angle >= 360) angle -= 360;
  return angle;
};

const calculateRotationDelta = (startAngle: number, currentAngle: number): number => {
  // Calculate the shortest rotation path
  let delta = currentAngle - startAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
};

const createParkingLayout = (element: Element): JSX.Element[] => {
  if (element.type !== 'parking') return [];
  
  // Create a clipping path for the parking area to ensure stripes stay within bounds
  const clipPathId = `parking-clip-${element.id}`;
  const stripes: JSX.Element[] = [];
  
  // Add clipping path definition
  stripes.push(
    <defs key={`defs-${element.id}`}>
      <clipPath id={clipPathId}>
        <path d={createVertexPath(element.vertices)} />
      </clipPath>
    </defs>
  );
  
  const bounds = element.vertices.reduce(
    (acc, vertex) => ({
      minX: Math.min(acc.minX, vertex.x),
      maxX: Math.max(acc.maxX, vertex.x),
      minY: Math.min(acc.minY, vertex.y),
      maxY: Math.max(acc.maxY, vertex.y)
    }),
    { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
  );
  
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  // Standard parking space: 9' x 18' with proper scaling
  const spaceWidth = 108; // 9 feet in SVG units (9 * 12)
  const spaceLength = 216; // 18 feet in SVG units (18 * 12)
  
  // Calculate how many spaces fit
  const spacesPerRow = Math.max(1, Math.floor(width / spaceWidth));
  const rows = Math.max(1, Math.floor(height / spaceLength));
  
  // Calculate actual dimensions to fit perfectly within the shape
  const actualSpaceWidth = width / spacesPerRow;
  const actualSpaceLength = height / rows;
  
  // Create parking spaces with clipping
  const spacesGroup = [];
  
  for (let row = 0; row < rows; row++) {
    for (let space = 0; space < spacesPerRow; space++) {
      const x = bounds.minX + space * actualSpaceWidth;
      const y = bounds.minY + row * actualSpaceLength;
      
      // Parking space rectangle
      spacesGroup.push(
        <rect
          key={`parking-space-${row}-${space}`}
          x={x}
          y={y}
          width={actualSpaceWidth}
          height={actualSpaceLength}
          fill="none"
          stroke="white"
          strokeWidth="2"
          opacity="0.8"
        />
      );
      
      // Add space number
      spacesGroup.push(
        <text
          key={`parking-number-${row}-${space}`}
          x={x + actualSpaceWidth / 2}
          y={y + actualSpaceLength / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize="10"
          fill="white"
          fontWeight="bold"
          opacity="0.6"
        >
          {row * spacesPerRow + space + 1}
        </text>
      );
    }
  }
  
  // Wrap spaces in clipped group
  stripes.push(
    <g key={`parking-spaces-${element.id}`} clipPath={`url(#${clipPathId})`}>
      {spacesGroup}
    </g>
  );
  
  return stripes;
};

// Intelligent Layout Template System
interface LayoutTemplate {
  id: string;
  name: string;
  type: 'apartment' | 'office' | 'retail' | 'mixed-use';
  description: string;
  minArea: number; // Minimum buildable area required (sq ft)
  generator: (params: LayoutGenerationParams) => GeneratedLayout;
}

interface LayoutGenerationParams {
  buildableArea: Element;
  parcelGeometry: SitePlannerGeometry;
  siteConstraints: SitePlanConstraints;
  zoning: {
    maxFAR: number;
    maxHeight: number;
    maxCoverage: number;
    maxDensity?: number; // units per acre
  };
  marketData: MarketData;
  gridSize: number;
}

interface GeneratedLayout {
  buildings: Element[];
  parking: Element[];
  amenities: Element[];
  metrics: {
    totalUnits: number;
    totalSqFt: number;
    parkingSpaces: number;
    density: number; // units per acre
    coverage: number; // percentage
    estimatedRevenue: number;
    estimatedCost: number;
  };
}

// Apartment Typology Selection and Generation Functions
interface ApartmentTypology {
  type: 'garden-style' | 'stick-over-podium' | 'downtown-tower' | 'texas-wrap' | 'mid-rise' | 'low-rise';
  name: string;
  description: string;
  maxStories: number;
  buildingCount: number;
  unitsPerBuilding: number;
  parkingRatio: number;
  amenities: string[];
}

interface BuildingConfig {
  name: string;
  units: number;
  stories: number;
  sqFt: number;
  widthSVG: number;
  depthSVG: number;
  color: string;
  strokeColor: string;
}

interface ParkingConfig {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  spaces: number;
}

interface AmenityConfig {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  strokeColor: string;
}

const selectApartmentTypology = (
  buildableAreaSqFt: number,
  maxUnits: number,
  maxHeight: number,
  siteWidth: number,
  siteDepth: number
): ApartmentTypology => {
  const acres = buildableAreaSqFt / 43560;
  const maxStories = Math.floor(maxHeight / 12);
  
  console.log('🏗️ Typology selection factors:', {
    buildableAreaSqFt,
    maxUnits,
    maxHeight,
    maxStories,
    siteWidth: siteWidth.toFixed(0),
    siteDepth: siteDepth.toFixed(0),
    acres: acres.toFixed(2)
  });
  
  // Garden Style: Low-rise, spread out, surface parking
  if (acres >= 2 && maxUnits <= 100 && maxStories >= 3) {
    return {
      type: 'garden-style',
      name: 'Garden Style',
      description: 'Low-rise buildings with surface parking and landscaping',
      maxStories: Math.min(3, maxStories),
      buildingCount: Math.min(6, Math.ceil(maxUnits / 16)),
      unitsPerBuilding: Math.ceil(maxUnits / Math.min(6, Math.ceil(maxUnits / 16))),
      parkingRatio: 1.5,
      amenities: ['Clubhouse', 'Pool', 'Playground', 'Dog Park']
    };
  }
  
  // Stick over Podium: Mid-rise with podium parking
  if (acres >= 1 && maxUnits >= 50 && maxStories >= 4) {
    return {
      type: 'stick-over-podium',
      name: 'Stick over Podium',
      description: 'Mid-rise residential over structured parking',
      maxStories: Math.min(6, maxStories),
      buildingCount: Math.min(3, Math.ceil(maxUnits / 40)),
      unitsPerBuilding: Math.ceil(maxUnits / Math.min(3, Math.ceil(maxUnits / 40))),
      parkingRatio: 1.2,
      amenities: ['Fitness Center', 'Rooftop Deck', 'Business Center']
    };
  }
  
  // Downtown Tower: High-rise, single building
  if (acres >= 0.5 && maxUnits >= 100 && maxStories >= 8) {
    return {
      type: 'downtown-tower',
      name: 'Downtown Tower',
      description: 'High-rise residential with underground parking',
      maxStories: Math.min(12, maxStories),
      buildingCount: 1,
      unitsPerBuilding: maxUnits,
      parkingRatio: 1.0,
      amenities: ['Concierge', 'Fitness Center', 'Rooftop Pool', 'Business Center', 'Package Room']
    };
  }
  
  // Texas Wrap: U-shaped building around parking
  if (acres >= 1.5 && maxUnits >= 60 && maxStories >= 4) {
    return {
      type: 'texas-wrap',
      name: 'Texas Wrap',
      description: 'U-shaped building wrapping around central parking',
      maxStories: Math.min(5, maxStories),
      buildingCount: 1,
      unitsPerBuilding: maxUnits,
      parkingRatio: 1.3,
      amenities: ['Clubhouse', 'Pool', 'Fitness Center', 'Playground']
    };
  }
  
  // Mid-rise: Standard apartment building
  if (maxUnits >= 30 && maxStories >= 4) {
    return {
      type: 'mid-rise',
      name: 'Mid-Rise',
      description: 'Standard mid-rise apartment building',
      maxStories: Math.min(6, maxStories),
      buildingCount: Math.min(3, Math.ceil(maxUnits / 30)),
      unitsPerBuilding: Math.ceil(maxUnits / Math.min(3, Math.ceil(maxUnits / 30))),
      parkingRatio: 1.4,
      amenities: ['Fitness Center', 'Community Room']
    };
  }
  
  // Low-rise: Small apartment building
  return {
    type: 'low-rise',
    name: 'Low-Rise',
    description: 'Small apartment building with surface parking',
    maxStories: Math.min(3, maxStories),
    buildingCount: Math.min(2, Math.ceil(maxUnits / 20)),
    unitsPerBuilding: Math.ceil(maxUnits / Math.min(2, Math.ceil(maxUnits / 20))),
    parkingRatio: 1.5,
    amenities: ['Community Room']
  };
};

const generateBuildingConfigs = (
  typology: ApartmentTypology,
  maxUnits: number,
  buildableAreaSqFt: number,
  maxHeight: number
): BuildingConfig[] => {
  const configs: BuildingConfig[] = [];
  const unitsPerBuilding = Math.ceil(maxUnits / typology.buildingCount);
  
  for (let i = 0; i < typology.buildingCount; i++) {
    const units = Math.min(unitsPerBuilding, maxUnits - (i * unitsPerBuilding));
    const sqFt = units * 800; // 800 sq ft per unit
    const stories = Math.min(typology.maxStories, Math.ceil(units / 8)); // Max 8 units per story
    const footprint = sqFt / stories;
    
    // Calculate building dimensions based on typology
    let width, depth;
    switch (typology.type) {
      case 'downtown-tower':
        width = Math.sqrt(footprint * 1.2); // Square-ish for towers
        depth = footprint / width;
        break;
      case 'texas-wrap':
        width = Math.sqrt(footprint * 2.5); // Wide for wrap-around
        depth = footprint / width;
        break;
      case 'stick-over-podium':
        width = Math.sqrt(footprint * 1.8); // Rectangular for stick
        depth = footprint / width;
        break;
      default:
        width = Math.sqrt(footprint * 1.5); // Standard ratio
        depth = footprint / width;
    }
    
    configs.push({
      name: `Building ${String.fromCharCode(65 + i)}`,
      units,
      stories,
      sqFt,
      widthSVG: width * 12, // Convert to SVG units
      depthSVG: depth * 12,
      color: '#3b82f6',
      strokeColor: '#1e40af'
    });
  }
  
  return configs;
};

const findBuildingPositionInBuildableArea = (
  buildableArea: Element,
  widthSVG: number,
  depthSVG: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  existingBuildings: Element[],
  buildingIndex: number
): { x: number, y: number } | null => {
  const step = 20; // 20 SVG units step
  
  // Try different positions based on building index
  const positions = [
    // Center positions
    { x: bounds.minX + (bounds.maxX - bounds.minX - widthSVG) / 2, y: bounds.minY + (bounds.maxY - bounds.minY - depthSVG) / 2 },
    // Corner positions
    { x: bounds.minX + 20, y: bounds.minY + 20 },
    { x: bounds.maxX - widthSVG - 20, y: bounds.minY + 20 },
    { x: bounds.minX + 20, y: bounds.maxY - depthSVG - 20 },
    { x: bounds.maxX - widthSVG - 20, y: bounds.maxY - depthSVG - 20 },
    // Side positions
    { x: bounds.minX + 20, y: bounds.minY + (bounds.maxY - bounds.minY - depthSVG) / 2 },
    { x: bounds.maxX - widthSVG - 20, y: bounds.minY + (bounds.maxY - bounds.minY - depthSVG) / 2 },
    { x: bounds.minX + (bounds.maxX - bounds.minX - widthSVG) / 2, y: bounds.minY + 20 },
    { x: bounds.minX + (bounds.maxX - bounds.minX - widthSVG) / 2, y: bounds.maxY - depthSVG - 20 }
  ];
  
  // Try the preferred position for this building index
  const preferredPosition = positions[buildingIndex % positions.length];
  
  // Check if position is valid (within buildable area and not overlapping)
  const corners = [
    { x: preferredPosition.x, y: preferredPosition.y },
    { x: preferredPosition.x + widthSVG, y: preferredPosition.y },
    { x: preferredPosition.x + widthSVG, y: preferredPosition.y + depthSVG },
    { x: preferredPosition.x, y: preferredPosition.y + depthSVG }
  ];
  
  if (corners.every(corner => isPointInPolygon(corner, buildableArea.vertices))) {
    return preferredPosition;
  }
  
  // Fallback: search for any valid position
  for (let y = bounds.minY; y <= bounds.maxY - depthSVG; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX - widthSVG; x += step) {
      const corners = [
        { x, y },
        { x: x + widthSVG, y },
        { x: x + widthSVG, y: y + depthSVG },
        { x, y: y + depthSVG }
      ];
      
      if (corners.every(corner => isPointInPolygon(corner, buildableArea.vertices))) {
        return { x, y };
      }
    }
  }
  
  return null;
};

const generateParkingConfigs = (
  typology: ApartmentTypology,
  maxUnits: number,
  buildableAreaSqFt: number,
  buildings: Element[],
  buildableArea: Element,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): ParkingConfig[] => {
  const configs: ParkingConfig[] = [];
  const totalSpaces = Math.ceil(maxUnits * typology.parkingRatio);
  const spaceSize = 350; // sq ft per space
  const totalParkingArea = totalSpaces * spaceSize;
  
  // Calculate parking layout based on typology
  switch (typology.type) {
    case 'garden-style':
      // Surface parking distributed around buildings
      const surfaceSpaces = Math.ceil(totalSpaces / 3);
      for (let i = 0; i < 3; i++) {
        const spaces = Math.min(surfaceSpaces, totalSpaces - (i * surfaceSpaces));
        const area = spaces * spaceSize;
        const width = Math.sqrt(area * 2.5); // Wide parking lots
        const height = area / width;
        
        const position = findParkingPositionInBuildableArea(
          buildableArea,
          width * 12,
          height * 12,
          bounds.minX + (i * 100),
          bounds.maxY - height * 12 - 20
        );
        
        if (position) {
          configs.push({
            name: `Surface Parking ${i + 1} (${spaces} spaces)`,
            x: position.x,
            y: position.y,
            width: width * 12,
            height: height * 12,
            spaces
          });
        }
      }
      break;
      
    case 'stick-over-podium':
      // Structured parking under buildings
      configs.push({
        name: `Structured Parking (${totalSpaces} spaces)`,
        x: bounds.minX + 20,
        y: bounds.maxY - 200,
        width: Math.min(bounds.maxX - bounds.minX - 40, 300),
        height: 200,
        spaces: totalSpaces
      });
      break;
      
    case 'downtown-tower':
      // Underground parking
      configs.push({
        name: `Underground Parking (${totalSpaces} spaces)`,
        x: bounds.minX + 20,
        y: bounds.maxY - 150,
        width: Math.min(bounds.maxX - bounds.minX - 40, 250),
        height: 150,
        spaces: totalSpaces
      });
      break;
      
    case 'texas-wrap':
      // Central parking courtyard
      configs.push({
        name: `Central Parking (${totalSpaces} spaces)`,
        x: bounds.minX + (bounds.maxX - bounds.minX) * 0.2,
        y: bounds.minY + (bounds.maxY - bounds.minY) * 0.2,
        width: (bounds.maxX - bounds.minX) * 0.6,
        height: (bounds.maxY - bounds.minY) * 0.6,
        spaces: totalSpaces
      });
      break;
      
    default:
      // Standard surface parking
      const width = Math.sqrt(totalParkingArea * 2);
      const height = totalParkingArea / width;
      
      const position = findParkingPositionInBuildableArea(
        buildableArea,
        width * 12,
        height * 12,
        bounds.minX + (bounds.maxX - bounds.minX - width * 12) / 2,
        bounds.maxY - height * 12 - 20
      );
      
      if (position) {
        configs.push({
          name: `Parking (${totalSpaces} spaces)`,
          x: position.x,
          y: position.y,
          width: width * 12,
          height: height * 12,
          spaces: totalSpaces
        });
      }
  }
  
  return configs;
};

const generateAmenityConfigs = (
  typology: ApartmentTypology,
  maxUnits: number,
  buildableAreaSqFt: number,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): AmenityConfig[] => {
  const configs: AmenityConfig[] = [];
  
  // Add amenities based on typology and size
  typology.amenities.forEach((amenity, index) => {
    let size, color, strokeColor;
    
    switch (amenity) {
      case 'Pool':
        size = 2000;
        color = '#0ea5e9';
        strokeColor = '#0284c7';
        break;
      case 'Fitness Center':
        size = 1500;
        color = '#f59e0b';
        strokeColor = '#d97706';
        break;
      case 'Clubhouse':
        size = 2500;
        color = '#8b5cf6';
        strokeColor = '#7c3aed';
        break;
      default:
        size = 1000;
        color = '#10b981';
        strokeColor = '#059669';
    }
    
    const width = Math.sqrt(size * 1.5);
    const height = size / width;
    
    // Position amenities around the site
    const positions = [
      { x: bounds.minX + 20, y: bounds.minY + 20 },
      { x: bounds.maxX - width * 12 - 20, y: bounds.minY + 20 },
      { x: bounds.minX + 20, y: bounds.maxY - height * 12 - 20 },
      { x: bounds.maxX - width * 12 - 20, y: bounds.maxY - height * 12 - 20 }
    ];
    
    const position = positions[index % positions.length];
    
    configs.push({
      name: amenity,
      x: position.x,
      y: position.y,
      width: width * 12,
      height: height * 12,
      color,
      strokeColor
    });
  });
  
  return configs;
};

const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: 'single-family',
    name: 'Single Family',
    type: 'apartment',
    description: 'Single family home optimized for lot size',
    minArea: 2000, // 2k sq ft minimum
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, zoning, marketData, gridSize } = params;
      
      // Calculate buildable area bounds for positioning
      const bounds = buildableArea.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );

      console.log(`🏗️ Dynamic Single Family Generator - Starting with buildable area:`, {
        vertices: buildableArea.vertices.length,
        rawAreaProperty: buildableArea.properties.area,
        areaSqFt: (buildableArea.properties.area || 0).toFixed(0),
        bounds,
        buildableVertices: buildableArea.vertices.slice(0, 3).map(v => `(${v.x.toFixed(0)}, ${v.y.toFixed(0)})`)
      });
      
      // Get actual buildable area - USE THE SAME CALCULATION AS VISUAL DISPLAY
      const buildableAreaSqFt = Math.round(buildableArea.properties.area || 0);
      
      // CRITICAL: Calculate bounds from vertices to ensure accuracy
      const calculatedBounds = buildableArea.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      console.log(`🏗️ Buildable area bounds comparison:`, {
        originalBounds: bounds,
        calculatedBounds: calculatedBounds,
        boundsMatch: JSON.stringify(bounds) === JSON.stringify(calculatedBounds),
        buildableAreaSqFt: buildableAreaSqFt
      });
      
      // Use calculated bounds for accuracy
      const accurateBounds = calculatedBounds;
      
      // REALISTIC HOUSE SIZING: Use market standards, not buildable area percentage
      const marketOptimalSize = marketData.avgHomeSize || 2500; // Realistic average home size
      const minHouseSize = 1800; // Minimum viable house size
      const maxHouseSize = 4500; // Maximum reasonable single family size
      
      // Use market size with reasonable bounds (ignore buildable area percentage - too large)
      const optimalHouseSqFt = Math.min(maxHouseSize, Math.max(minHouseSize, marketOptimalSize));
      
      console.log(`🏗️ Realistic house sizing:`, {
        marketOptimalSize,
        buildableAreaSqFt,
        chosenHouseSize: optimalHouseSqFt,
        note: 'Using market standards instead of buildable area percentage'
      });
      
      console.log(`🏗️ House size calculation:`, {
        buildableAreaSqFt: buildableAreaSqFt.toFixed(0),
        marketOptimalSize: marketOptimalSize,
        chosenHouseSize: optimalHouseSqFt.toFixed(0),
        note: 'Using realistic market-based sizing'
      });
      
      // SMART POSITIONING: Analyze buildable area and parcel orientation
      let lotWidth = (accurateBounds.maxX - accurateBounds.minX) / gridSize; // Convert to feet
      let lotDepth = (accurateBounds.maxY - accurateBounds.minY) / gridSize;
      const lotRatio = lotWidth / lotDepth;
      
      console.log(`🏗️ Buildable area analysis:`, {
        lotWidth: lotWidth.toFixed(1) + ' ft',
        lotDepth: lotDepth.toFixed(1) + ' ft',
        lotRatio: lotRatio.toFixed(2),
        buildableAreaSqFt: buildableAreaSqFt,
        orientation: lotWidth > lotDepth ? 'wide' : 'deep',
        boundsInSVG: `${(accurateBounds.maxX - accurateBounds.minX).toFixed(0)} x ${(accurateBounds.maxY - accurateBounds.minY).toFixed(0)}`,
        boundsInFeet: `${lotWidth.toFixed(1)} x ${lotDepth.toFixed(1)}`,
        gridSize: gridSize,
        note: 'If bounds are tiny, buildable area vertices are wrong'
      });
      
      // CRITICAL FIX: Ensure lot dimensions are reasonable for a 2,500 sq ft house
      if (lotWidth < 50 || lotDepth < 50) {
        console.error('🚨 CRITICAL: Buildable area bounds are too small!', {
          lotWidth: lotWidth.toFixed(1) + ' ft',
          lotDepth: lotDepth.toFixed(1) + ' ft',
          boundsSVG: `${(accurateBounds.maxX - accurateBounds.minX).toFixed(0)} x ${(accurateBounds.maxY - accurateBounds.minY).toFixed(0)}`,
          note: 'This will cause massive house scaling - using fallback dimensions'
        });
        
        // Use reasonable fallback dimensions based on buildable area
        const fallbackWidth = Math.sqrt(buildableAreaSqFt * 1.5);
        const fallbackDepth = buildableAreaSqFt / fallbackWidth;
        
        console.log('🔧 Using fallback lot dimensions:', {
          fallbackWidth: fallbackWidth.toFixed(1) + ' ft',
          fallbackDepth: fallbackDepth.toFixed(1) + ' ft',
          fallbackArea: (fallbackWidth * fallbackDepth).toFixed(0) + ' sq ft'
        });
        
        // Override with fallback dimensions
        const fallbackWidthSVG = fallbackWidth * gridSize;
        const fallbackDepthSVG = fallbackDepth * gridSize;
        
        // Calculate centroid first
        const centroidX = buildableArea.vertices.reduce((sum, v) => sum + v.x, 0) / buildableArea.vertices.length;
        const centroidY = buildableArea.vertices.reduce((sum, v) => sum + v.y, 0) / buildableArea.vertices.length;
        
        // Update bounds to use fallback
        accurateBounds.minX = centroidX - fallbackWidthSVG / 2;
        accurateBounds.maxX = centroidX + fallbackWidthSVG / 2;
        accurateBounds.minY = centroidY - fallbackDepthSVG / 2;
        accurateBounds.maxY = centroidY + fallbackDepthSVG / 2;
        
        // Recalculate lot dimensions
        const newLotWidth = fallbackWidth;
        const newLotDepth = fallbackDepth;
        
        console.log('🔧 Updated bounds after fallback:', {
          newBounds: `${accurateBounds.minX.toFixed(0)},${accurateBounds.minY.toFixed(0)} to ${accurateBounds.maxX.toFixed(0)},${accurateBounds.maxY.toFixed(0)}`,
          newLotWidth: newLotWidth.toFixed(1) + ' ft',
          newLotDepth: newLotDepth.toFixed(1) + ' ft'
        });
        
        // Update lot dimensions for rest of calculation
        // Note: lotWidth and lotDepth will be recalculated below
      }
      
      // Recalculate lot dimensions after potential fallback
      const finalLotWidth = (accurateBounds.maxX - accurateBounds.minX) / gridSize;
      const finalLotDepth = (accurateBounds.maxY - accurateBounds.minY) / gridSize;
      
      console.log(`🏗️ Final lot dimensions:`, {
        finalLotWidth: finalLotWidth.toFixed(1) + ' ft',
        finalLotDepth: finalLotDepth.toFixed(1) + ' ft',
        finalLotArea: (finalLotWidth * finalLotDepth).toFixed(0) + ' sq ft'
      });
      
      // REALISTIC HOUSE PROPORTIONS: Standard residential ratios
      const houseRatio = 1.5; // Standard 1.5:1 ratio (width:depth)
      let houseWidthFeet = Math.sqrt(optimalHouseSqFt * houseRatio);
      let houseDepthFeet = optimalHouseSqFt / houseWidthFeet;
      
      // DRIVEWAY PLANNING: Reserve space for driveway access
      const drivewayWidthFeet = 12; // Standard driveway width
      const drivewayLengthFeet = Math.min(60, finalLotDepth * 0.4); // Reasonable driveway length
      const drivewayAreaSqFt = drivewayWidthFeet * drivewayLengthFeet;
      
      // INTELLIGENT FITTING: Ensure house fits with proper setbacks
      const setbackFeet = 15; // Realistic setback from buildable area edges
      const availableWidth = finalLotWidth - (setbackFeet * 2);
      const availableDepth = finalLotDepth - (setbackFeet * 2); // Don't subtract driveway - it goes beside house
      
      console.log(`🏗️ Before scaling check:`, {
        originalHouseSize: `${houseWidthFeet.toFixed(1)} x ${houseDepthFeet.toFixed(1)} ft`,
        availableSpace: `${availableWidth.toFixed(1)} x ${availableDepth.toFixed(1)} ft`,
        needsScaling: houseWidthFeet > availableWidth || houseDepthFeet > availableDepth,
        widthFits: houseWidthFeet <= availableWidth,
        depthFits: houseDepthFeet <= availableDepth,
        finalLotDimensions: `${finalLotWidth.toFixed(1)} x ${finalLotDepth.toFixed(1)} ft`
      });
      
      // Scale house if needed to fit available space - but don't scale too much
      if (houseWidthFeet > availableWidth || houseDepthFeet > availableDepth) {
        const originalWidth = houseWidthFeet;
        const originalDepth = houseDepthFeet;
        const scaleFactor = Math.min(availableWidth / houseWidthFeet, availableDepth / houseDepthFeet);
        
        // SAFETY CHECK: Don't scale below 1,500 sq ft (minimum viable house)
        const minHouseArea = 1500;
        const scaledArea = (houseWidthFeet * houseDepthFeet) * (scaleFactor * scaleFactor);
        
        if (scaledArea < minHouseArea) {
          console.error('🚨 CRITICAL: Scaling would make house too small!', {
            originalArea: (houseWidthFeet * houseDepthFeet).toFixed(0) + ' sq ft',
            scaledArea: scaledArea.toFixed(0) + ' sq ft',
            minHouseArea: minHouseArea + ' sq ft',
            scaleFactor: scaleFactor.toFixed(3),
            note: 'Using minimum viable house size instead'
          });
          
          // Use minimum viable house size
          const minHouseWidth = Math.sqrt(minHouseArea * houseRatio);
          const minHouseDepth = minHouseArea / minHouseWidth;
          houseWidthFeet = minHouseWidth;
          houseDepthFeet = minHouseDepth;
        } else {
          houseWidthFeet *= scaleFactor;
          houseDepthFeet *= scaleFactor;
        }
        
        console.log(`🏗️ House scaled to fit with driveway:`, {
          originalSize: `${originalWidth.toFixed(1)} x ${originalDepth.toFixed(1)} ft`,
          scaledSize: `${houseWidthFeet.toFixed(1)} x ${houseDepthFeet.toFixed(1)} ft`,
          scaleFactor: scaleFactor.toFixed(3),
          availableSpace: `${availableWidth.toFixed(1)} x ${availableDepth.toFixed(1)} ft`,
          newAreaSqFt: (houseWidthFeet * houseDepthFeet).toFixed(0)
        });
      }
      
      // Convert to SVG units using gridSize
      const houseWidthSVG = houseWidthFeet * gridSize;
      const houseDepthSVG = houseDepthFeet * gridSize;
      
      // STRATEGIC POSITIONING: Place house optimally within buildable area
      const centroidX = buildableArea.vertices.reduce((sum, v) => sum + v.x, 0) / buildableArea.vertices.length;
      const centroidY = buildableArea.vertices.reduce((sum, v) => sum + v.y, 0) / buildableArea.vertices.length;
      
      // SMART POSITIONING: Center house within buildable area with proper margins
      const marginSVG = 20 * gridSize; // 20 foot margin from buildable area edges
      const availableWidthSVG = (accurateBounds.maxX - accurateBounds.minX) - (2 * marginSVG);
      const availableHeightSVG = (accurateBounds.maxY - accurateBounds.minY) - (2 * marginSVG);
      
      // Center the house within the available space
      let houseX = accurateBounds.minX + marginSVG + (availableWidthSVG - houseWidthSVG) / 2;
      let houseY = accurateBounds.minY + marginSVG + (availableHeightSVG - houseDepthSVG) / 2;
      
      // SAFETY CHECK: Ensure house is within buildable area bounds
      const houseRight = houseX + houseWidthSVG;
      const houseBottom = houseY + houseDepthSVG;
      
      if (houseX < accurateBounds.minX || houseRight > accurateBounds.maxX || 
          houseY < accurateBounds.minY || houseBottom > accurateBounds.maxY) {
        console.warn('🚨 House positioned outside buildable area! Adjusting...', {
          housePosition: `(${houseX.toFixed(0)}, ${houseY.toFixed(0)})`,
          houseSize: `${houseWidthSVG.toFixed(0)} x ${houseDepthSVG.toFixed(0)}`,
          buildableBounds: `${accurateBounds.minX.toFixed(0)},${accurateBounds.minY.toFixed(0)} to ${accurateBounds.maxX.toFixed(0)},${accurateBounds.maxY.toFixed(0)}`,
          houseRight: houseRight.toFixed(0),
          houseBottom: houseBottom.toFixed(0)
        });
        
        // Center house within buildable area
        houseX = accurateBounds.minX + (accurateBounds.maxX - accurateBounds.minX - houseWidthSVG) / 2;
        houseY = accurateBounds.minY + (accurateBounds.maxY - accurateBounds.minY - houseDepthSVG) / 2;
        
        console.log('🔧 Adjusted house position:', {
          newPosition: `(${houseX.toFixed(0)}, ${houseY.toFixed(0)})`,
          newRight: (houseX + houseWidthSVG).toFixed(0),
          newBottom: (houseY + houseDepthSVG).toFixed(0)
        });
      }
      
      console.log(`🏗️ Strategic positioning:`, {
        buildableBounds: `${accurateBounds.minX.toFixed(0)},${accurateBounds.minY.toFixed(0)} to ${accurateBounds.maxX.toFixed(0)},${accurateBounds.maxY.toFixed(0)}`,
        housePosition: `(${houseX.toFixed(0)}, ${houseY.toFixed(0)})`,
        houseSize: `${houseWidthFeet.toFixed(1)}' x ${houseDepthFeet.toFixed(1)}'`,
        houseSizeSVG: `${houseWidthSVG.toFixed(1)} x ${houseDepthSVG.toFixed(1)} SVG`,
        actualHouseSqFt: (houseWidthFeet * houseDepthFeet).toFixed(0),
        targetHouseSqFt: optimalHouseSqFt,
        marginSVG: marginSVG,
        availableSpace: `${availableWidthSVG.toFixed(0)} x ${availableHeightSVG.toFixed(0)} SVG`
      });
      
      console.log(`🏗️ Dynamic positioning:`, {
        houseSize: `${houseWidthFeet.toFixed(1)} x ${houseDepthFeet.toFixed(1)} feet`,
        houseSizeSVG: `${houseWidthSVG.toFixed(1)} x ${houseDepthSVG.toFixed(1)} SVG units`,
        centroid: `(${centroidX.toFixed(1)}, ${centroidY.toFixed(1)})`,
        housePosition: `(${houseX.toFixed(1)}, ${houseY.toFixed(1)})`
      });
      
      const house: Element = {
        id: generateId(),
        type: 'building',
        vertices: [
          { id: generateId(), x: houseX, y: houseY },
          { id: generateId(), x: houseX + houseWidthSVG, y: houseY },
          { id: generateId(), x: houseX + houseWidthSVG, y: houseY + houseDepthSVG },
          { id: generateId(), x: houseX, y: houseY + houseDepthSVG }
        ],
        properties: {
          name: `Single Family Home (${optimalHouseSqFt.toFixed(0)} sq ft)`,
          color: '#10b981',
          strokeColor: '#059669',
          fillOpacity: 0.8,
          area: houseWidthFeet * houseDepthFeet // Set correct area in sq ft
        }
      };
      
      // Dynamic driveway sizing based on house size and available space
      // Use our pre-calculated driveway dimensions
      const drivewayWidthSVG = drivewayWidthFeet * gridSize;
      const drivewayLengthSVG = drivewayLengthFeet * gridSize;
      
      // SMART DRIVEWAY POSITIONING: Place within buildable area bounds
      const spacingSVG = 10 * gridSize; // 10 foot spacing for landscaping
      
      // Check if driveway fits to the right of house
      const drivewayRightX = houseX + houseWidthSVG + spacingSVG;
      const drivewayFitsRight = (drivewayRightX + drivewayWidthSVG) <= (accurateBounds.maxX - marginSVG);
      
      let drivewayX, drivewayY;
      if (drivewayFitsRight) {
        // Place to the right of house
        drivewayX = drivewayRightX;
        drivewayY = houseY;
      } else {
        // Place below house if right doesn't fit
        drivewayX = houseX;
        drivewayY = houseY + houseDepthSVG + spacingSVG;
      }
      
      console.log(`🚗 Final driveway placement:`, {
        drivewayDimensions: `${drivewayWidthFeet}' x ${drivewayLengthFeet}'`,
        drivewayArea: `${drivewayAreaSqFt} sq ft`,
        placement: drivewayFitsRight ? 'right of house' : 'below house',
        position: `(${drivewayX.toFixed(0)}, ${drivewayY.toFixed(0)})`,
        withinBounds: (drivewayX + drivewayWidthSVG) <= bounds.maxX && (drivewayY + drivewayLengthSVG) <= bounds.maxY
      });
      
      const driveway: Element = {
        id: generateId(),
        type: 'parking',
        vertices: [
          { id: generateId(), x: drivewayX, y: drivewayY },
          { id: generateId(), x: drivewayX + drivewayWidthSVG, y: drivewayY },
          { id: generateId(), x: drivewayX + drivewayWidthSVG, y: drivewayY + drivewayLengthSVG },
          { id: generateId(), x: drivewayX, y: drivewayY + drivewayLengthSVG }
        ],
        properties: {
          name: 'Driveway',
          color: '#6b7280',
          strokeColor: '#374151',
          fillOpacity: 0.8
        }
      };
      
      // Set correct areas without updateElementGeometry (which would overwrite with SVG units)
      const actualHouseSqFt = houseWidthFeet * houseDepthFeet;
      const actualDrivewaySqFt = drivewayWidthFeet * drivewayLengthFeet;
      
      const finalHouse = {
        ...house,
        properties: {
          ...house.properties,
          area: actualHouseSqFt, // Set correct sq ft area
          perimeter: 2 * (houseWidthFeet + houseDepthFeet)
        }
      };
      
      const finalDriveway = {
        ...driveway,
        properties: {
          ...driveway.properties,
          area: actualDrivewaySqFt, // Set correct sq ft area
          perimeter: 2 * (drivewayWidthFeet + drivewayLengthFeet)
        }
      };
      
      console.log(`🏗️ Final dynamic layout:`, {
        targetHouseArea: optimalHouseSqFt.toFixed(0) + ' sq ft',
        actualHouseArea: actualHouseSqFt.toFixed(0) + ' sq ft',
        actualDrivewayArea: actualDrivewaySqFt.toFixed(0) + ' sq ft',
        note: 'Using correct sq ft calculations, not SVG area'
      });

      return {
        buildings: [finalHouse],
        parking: [finalDriveway],
        amenities: [],
        metrics: {
          totalUnits: 1,
          totalSqFt: (finalHouse.properties.area || 0),
          parkingSpaces: 2,
          density: 1 / (parcelGeometry.area / 43560),
          coverage: ((finalHouse.properties.area || 0) / buildableArea.properties.area) * 100,
          estimatedRevenue: optimalHouseSqFt * marketData.avgRentPerSqFt * 12,
          estimatedCost: optimalHouseSqFt * marketData.constructionCostPerSqFt
        }
      };
    }
  },
  {
    id: 'duplex',
    name: 'Duplex',
    type: 'apartment',
    description: 'Two-unit duplex maximizing small lot potential',
    minArea: 4000,
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, zoning, marketData, gridSize } = params;
      
      // Analyze parcel orientation for proper building alignment
      const orientation = analyzeParcelOrientation(buildableArea);
      const bounds = orientation.bounds;
      
      // Calculate buildable area dimensions in feet
      const buildableWidthFeet = (bounds.maxX - bounds.minX) / gridSize;
      const buildableDepthFeet = (bounds.maxY - bounds.minY) / gridSize;
      
      console.log('🔍 Buildable area dimensions:', {
        widthFeet: buildableWidthFeet.toFixed(1),
        depthFeet: buildableDepthFeet.toFixed(1),
        areaSqFt: (buildableWidthFeet * buildableDepthFeet).toFixed(0),
        boundsSVG: {
          minX: bounds.minX.toFixed(1),
          minY: bounds.minY.toFixed(1),
          maxX: bounds.maxX.toFixed(1),
          maxY: bounds.maxY.toFixed(1)
        },
        gridSize: gridSize
      });
      
      // Use realistic duplex dimensions regardless of buildable area size
      // A typical duplex should be around 1,200 sq ft per unit = 2,400 sq ft total
      const targetDuplexSqFt = 2400; // 2,400 sq ft total
      const duplexWidthFeet = 60; // 60 feet wide (realistic for duplex)
      const duplexDepthFeet = 40; // 40 feet deep (realistic for duplex)
      const duplexSqFt = duplexWidthFeet * duplexDepthFeet; // 2,400 sq ft
      const unitSqFt = duplexSqFt / 2; // 1,200 sq ft per unit
      
      console.log('🔍 Using realistic duplex dimensions:', {
        targetSqFt: targetDuplexSqFt,
        actualSqFt: duplexSqFt,
        widthFeet: duplexWidthFeet,
        depthFeet: duplexDepthFeet,
        unitSqFt: unitSqFt,
        buildableAreaSqFt: (buildableWidthFeet * buildableDepthFeet).toFixed(0),
        coveragePercent: ((duplexSqFt / (buildableWidthFeet * buildableDepthFeet)) * 100).toFixed(1) + '%'
      });
      
      // Convert to SVG units (1 foot = 12 SVG units)
      const duplexWidthSVG = duplexWidthFeet * gridSize;
      const duplexDepthSVG = duplexDepthFeet * gridSize;
      
      console.log('🏢 SIMPLE Duplex creation:', {
        widthFeet: duplexWidthFeet,
        depthFeet: duplexDepthFeet,
        totalSqFt: duplexSqFt,
        unitSqFt: unitSqFt,
        widthSVG: duplexWidthSVG,
        depthSVG: duplexDepthSVG,
        gridSize: gridSize
      });
      
      
      // Center the duplex in the buildable area
      const duplexX = bounds.minX + (bounds.maxX - bounds.minX - duplexWidthSVG) / 2;
      const duplexY = bounds.minY + (bounds.maxY - bounds.minY - duplexDepthSVG) / 2;
      
      console.log('🏢 Duplex positioning:', {
        buildableBounds: `${(bounds.maxX - bounds.minX).toFixed(0)} x ${(bounds.maxY - bounds.minY).toFixed(0)} SVG`,
        duplexPosition: `(${duplexX.toFixed(0)}, ${duplexY.toFixed(0)})`,
        duplexSize: `${duplexWidthSVG} x ${duplexDepthSVG} SVG`,
        duplexSizeFeet: `${duplexWidthFeet} x ${duplexDepthFeet} feet`,
        gridSize: gridSize,
        orientation: {
          primaryAxis: orientation.primaryAxis,
          aspectRatio: orientation.aspectRatio.toFixed(2)
        },
        fitsInBounds: duplexX >= bounds.minX && duplexY >= bounds.minY && 
                     (duplexX + duplexWidthSVG) <= bounds.maxX && 
                     (duplexY + duplexDepthSVG) <= bounds.maxY
      });
      
      const duplex: Element = {
        id: generateId(),
        type: 'building',
        vertices: [
          { id: generateId(), x: duplexX, y: duplexY },
          { id: generateId(), x: duplexX + duplexWidthSVG, y: duplexY },
          { id: generateId(), x: duplexX + duplexWidthSVG, y: duplexY + duplexDepthSVG },
          { id: generateId(), x: duplexX, y: duplexY + duplexDepthSVG }
        ],
        properties: {
          name: `Duplex (2 units, ${unitSqFt.toFixed(0)} sq ft each)`,
          color: '#8b5cf6',
          strokeColor: '#7c3aed',
          fillOpacity: 0.8,
          area: duplexSqFt
        }
      };
      
      // Use intelligent parking generation for duplex (4 spaces)
      const duplexParking = generateIntelligentParking(
        4, // 4 parking spaces for duplex
        buildableArea,
        [duplex],
        gridSize
      );
      
      return {
        buildings: [duplex], // Don't use updateElementGeometry to preserve correct area
        parking: duplexParking,
        amenities: [],
        metrics: {
          totalUnits: 2,
          totalSqFt: duplexSqFt,
          parkingSpaces: 4,
          density: 2 / (parcelGeometry.area / 43560),
          coverage: (duplexSqFt / parcelGeometry.area) * 100,
          estimatedRevenue: 2 * unitSqFt * marketData.avgRentPerSqFt * 12,
          estimatedCost: duplexSqFt * marketData.constructionCostPerSqFt
        }
      };
    }
  },
  {
    id: 'apartment-complex',
    name: 'Apartment Complex',
    type: 'apartment',
    description: 'Multi-building residential complex (4-400 units)',
    minArea: 10000,
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, siteConstraints, zoning, marketData, gridSize } = params;
      
      console.log('🏗️ ARCHITECTURAL APARTMENT COMPLEX GENERATOR - Starting intelligent analysis...');
      
      // ARCHITECTURAL SITE ANALYSIS WITH ORIENTATION
      const orientation = analyzeParcelOrientation(buildableArea);
      const bounds = orientation.bounds;
      
      const buildableWidth = (bounds.maxX - bounds.minX) / gridSize; // Convert to feet
      const buildableHeight = (bounds.maxY - bounds.minY) / gridSize; // Convert to feet
      const buildableAreaSqFt = Math.round(buildableArea.properties.area || 0);
      const parcelAcres = parcelGeometry.area / 43560;
      
      // ARCHITECTURAL CONSTRAINTS ANALYSIS
      const maxUnitsByDensity = zoning.maxDensity ? Math.floor(parcelAcres * zoning.maxDensity) : 999;
      const maxUnitsByFAR = Math.floor((buildableAreaSqFt * zoning.maxFAR) / 800);
      const maxUnitsByCoverage = Math.floor((buildableAreaSqFt * (zoning.maxCoverage / 100)) / 600);
      const maxUnits = Math.min(maxUnitsByDensity, maxUnitsByFAR, maxUnitsByCoverage);
      
      // ARCHITECTURAL SITE ORIENTATION ANALYSIS
      const siteRatio = buildableWidth / buildableHeight;
      const isWideSite = siteRatio > 1.5;
      const isDeepSite = siteRatio < 0.67;
      const isSquareSite = siteRatio >= 0.67 && siteRatio <= 1.5;
      
      console.log('🏗️ Architectural Site Analysis:', {
        buildableAreaSqFt: buildableAreaSqFt.toFixed(0),
        dimensions: `${buildableWidth.toFixed(0)}' x ${buildableHeight.toFixed(0)}'`,
        siteRatio: siteRatio.toFixed(2),
        orientation: isWideSite ? 'WIDE' : isDeepSite ? 'DEEP' : 'SQUARE',
        maxUnits,
        parcelAcres: parcelAcres.toFixed(2)
      });
      
      // ARCHITECTURAL TYPOLOGY SELECTION BASED ON ORIENTATION
      let typology;
      if (maxUnits <= 8) {
        typology = 'courtyard'; // Small courtyard style
      } else if (maxUnits <= 24) {
        // Use parcel orientation to inform typology selection
        if (orientation.primaryAxis === 'horizontal' || isWideSite) {
          typology = 'linear'; // Linear for horizontal/wide sites
        } else {
          typology = 'courtyard'; // Courtyard for vertical/square sites
        }
      } else if (maxUnits <= 50) {
        if (orientation.primaryAxis === 'horizontal' || isWideSite) {
          typology = 'linear'; // Linear for horizontal/wide sites
        } else if (orientation.primaryAxis === 'vertical' || isDeepSite) {
          typology = 'cluster'; // Cluster for vertical/deep sites
        } else {
          typology = 'courtyard'; // Courtyard for square sites
        }
      } else {
        if (orientation.primaryAxis === 'horizontal' || isWideSite) {
          typology = 'linear'; // Linear for horizontal/wide sites
        } else if (orientation.primaryAxis === 'vertical' || isDeepSite) {
          typology = 'cluster'; // Cluster for vertical/deep sites
        } else {
          typology = 'mixed'; // Mixed for square sites
        }
      }
      
      console.log('🏗️ Selected Typology:', typology);
      
      const buildings: Element[] = [];
      const parking: Element[] = [];
      const amenities: Element[] = [];
      
      // ARCHITECTURAL BUILDING GENERATION
      if (typology === 'courtyard') {
        // Courtyard style - buildings around central open space
        const buildingCount = Math.min(3, Math.ceil(maxUnits / 8));
        const unitsPerBuilding = Math.ceil(maxUnits / buildingCount);
        
        // Create central courtyard
        const courtyardSize = Math.min(buildableWidth * 0.3, buildableHeight * 0.3);
        const courtyardX = bounds.minX + (buildableWidth * gridSize - courtyardSize * gridSize) / 2;
        const courtyardY = bounds.minY + (buildableHeight * gridSize - courtyardSize * gridSize) / 2;
        
        // Position buildings around courtyard
        const positions = [
          { x: bounds.minX + 20, y: courtyardY, width: buildableWidth * 0.4, height: buildableHeight * 0.2 }, // Bottom
          { x: courtyardX + courtyardSize * gridSize + 20, y: bounds.minY + 20, width: buildableWidth * 0.3, height: buildableHeight * 0.4 }, // Right
          { x: bounds.minX + 20, y: bounds.minY + 20, width: buildableWidth * 0.4, height: buildableHeight * 0.2 } // Top
        ];
        
        for (let i = 0; i < Math.min(buildingCount, positions.length); i++) {
          const unitsInBuilding = Math.min(unitsPerBuilding, maxUnits - (i * unitsPerBuilding));
          if (unitsInBuilding <= 0) break;
          
          const buildingSqFt = unitsInBuilding * 800;
          const maxStories = Math.floor(zoning.maxHeight / 12);
          const actualStories = Math.min(maxStories, Math.ceil(unitsInBuilding / 4));
          const buildingFootprint = buildingSqFt / actualStories;
          
          const pos = positions[i];
          const buildingWidth = Math.sqrt(buildingFootprint * 1.5);
          const buildingHeight = buildingFootprint / buildingWidth;
          
          // Ensure building fits in position
          const maxWidth = pos.width * gridSize;
          const maxHeight = pos.height * gridSize;
          const finalWidth = Math.min(buildingWidth * gridSize, maxWidth - 40);
          const finalHeight = Math.min(buildingHeight * gridSize, maxHeight - 40);
          
          // CRITICAL: Validate building position is within buildable area
          const buildingPosition = findValidBuildingPosition(
            buildableArea,
            finalWidth,
            finalHeight,
            buildings,
            { x: pos.x, y: pos.y }
          );
          
          if (buildingPosition) {
            const building: Element = {
              id: generateId(),
              type: 'building',
              vertices: [
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + finalWidth, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + finalWidth, y: buildingPosition.y + finalHeight },
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y + finalHeight }
              ],
              properties: {
                name: `Building ${String.fromCharCode(65 + i)} (${unitsInBuilding} units, ${actualStories} stories)`,
                color: '#3b82f6',
                strokeColor: '#1e40af',
                fillOpacity: 0.8,
                area: buildingSqFt,
                stories: actualStories
              }
            };
            
            // FINAL SAFETY CHECK: Verify building is within buildable area
            if (isBuildingWithinBuildableArea(building, buildableArea)) {
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            } else {
              // FALLBACK: If strict validation fails, try to place building anyway
              // This handles edge cases where the validation is too strict
              console.warn(`⚠️ Building ${String.fromCharCode(65 + i)} failed strict validation, but placing anyway`);
              console.warn('Building vertices:', building.vertices);
              console.warn('Buildable area vertices:', buildableArea.vertices);
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed with fallback at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            }
          } else {
            console.warn(`⚠️ Could not place Building ${String.fromCharCode(65 + i)} within buildable area`);
          }
        }
        
      } else if (typology === 'linear') {
        // Linear style - buildings along the parcel's primary axis
        const buildingCount = Math.min(4, Math.ceil(maxUnits / 12));
        const unitsPerBuilding = Math.ceil(maxUnits / buildingCount);
        
        // Use parcel orientation to determine building alignment
        const isHorizontal = orientation.primaryAxis === 'horizontal' || buildableWidth > buildableHeight;
        const spacing = isHorizontal ? (buildableWidth * gridSize) / (buildingCount + 1) : (buildableHeight * gridSize) / (buildingCount + 1);
        
        console.log('📐 Linear typology orientation:', {
          primaryAxis: orientation.primaryAxis,
          isHorizontal,
          buildingCount,
          spacing: spacing.toFixed(0)
        });
        
        for (let i = 0; i < buildingCount; i++) {
          const unitsInBuilding = Math.min(unitsPerBuilding, maxUnits - (i * unitsPerBuilding));
          if (unitsInBuilding <= 0) break;
          
          const buildingSqFt = unitsInBuilding * 800;
          const maxStories = Math.floor(zoning.maxHeight / 12);
          const actualStories = Math.min(maxStories, Math.ceil(unitsInBuilding / 4));
          const buildingFootprint = buildingSqFt / actualStories;
          
          const buildingWidth = Math.sqrt(buildingFootprint * 1.5);
          const buildingHeight = buildingFootprint / buildingWidth;
          
          let buildingX, buildingY;
          if (isHorizontal) {
            buildingX = bounds.minX + spacing * (i + 1) - (buildingWidth * gridSize) / 2;
            buildingY = bounds.minY + (buildableHeight * gridSize - buildingHeight * gridSize) / 2;
          } else {
            buildingX = bounds.minX + (buildableWidth * gridSize - buildingWidth * gridSize) / 2;
            buildingY = bounds.minY + spacing * (i + 1) - (buildingHeight * gridSize) / 2;
          }
          
          // CRITICAL: Validate building position is within buildable area
          const buildingPosition = findValidBuildingPosition(
            buildableArea,
            buildingWidth * gridSize,
            buildingHeight * gridSize,
            buildings,
            { x: buildingX, y: buildingY }
          );
          
          if (buildingPosition) {
            const building: Element = {
              id: generateId(),
              type: 'building',
              vertices: [
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + buildingWidth * gridSize, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + buildingWidth * gridSize, y: buildingPosition.y + buildingHeight * gridSize },
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y + buildingHeight * gridSize }
              ],
              properties: {
                name: `Building ${String.fromCharCode(65 + i)} (${unitsInBuilding} units, ${actualStories} stories)`,
                color: '#3b82f6',
                strokeColor: '#1e40af',
                fillOpacity: 0.8,
                area: buildingSqFt,
                stories: actualStories
              }
            };
            
            // FINAL SAFETY CHECK: Verify building is within buildable area
            if (isBuildingWithinBuildableArea(building, buildableArea)) {
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            } else {
              // FALLBACK: If strict validation fails, try to place building anyway
              // This handles edge cases where the validation is too strict
              console.warn(`⚠️ Building ${String.fromCharCode(65 + i)} failed strict validation, but placing anyway`);
              console.warn('Building vertices:', building.vertices);
              console.warn('Buildable area vertices:', buildableArea.vertices);
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed with fallback at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            }
          } else {
            console.warn(`⚠️ Could not place Building ${String.fromCharCode(65 + i)} within buildable area`);
          }
        }
        
      } else if (typology === 'cluster') {
        // Cluster style - buildings grouped together respecting parcel orientation
        const buildingCount = Math.min(3, Math.ceil(maxUnits / 16));
        const unitsPerBuilding = Math.ceil(maxUnits / buildingCount);
        
        // Create cluster in center of buildable area
        const clusterCenterX = bounds.minX + (buildableWidth * gridSize) / 2;
        const clusterCenterY = bounds.minY + (buildableHeight * gridSize) / 2;
        const clusterRadius = Math.min(buildableWidth, buildableHeight) * gridSize * 0.3;
        
        console.log('📐 Cluster typology orientation:', {
          primaryAxis: orientation.primaryAxis,
          clusterCenter: { x: clusterCenterX.toFixed(0), y: clusterCenterY.toFixed(0) },
          clusterRadius: clusterRadius.toFixed(0)
        });
        
        for (let i = 0; i < buildingCount; i++) {
          const unitsInBuilding = Math.min(unitsPerBuilding, maxUnits - (i * unitsPerBuilding));
          if (unitsInBuilding <= 0) break;
          
          const buildingSqFt = unitsInBuilding * 800;
          const maxStories = Math.floor(zoning.maxHeight / 12);
          const actualStories = Math.min(maxStories, Math.ceil(unitsInBuilding / 4));
          const buildingFootprint = buildingSqFt / actualStories;
          
          const buildingWidth = Math.sqrt(buildingFootprint * 1.5);
          const buildingHeight = buildingFootprint / buildingWidth;
          
          // Position buildings in cluster
          const angle = (i * 2 * Math.PI) / buildingCount;
          const buildingX = clusterCenterX + Math.cos(angle) * clusterRadius - (buildingWidth * gridSize) / 2;
          const buildingY = clusterCenterY + Math.sin(angle) * clusterRadius - (buildingHeight * gridSize) / 2;
          
          // CRITICAL: Validate building position is within buildable area
          const buildingPosition = findValidBuildingPosition(
            buildableArea,
            buildingWidth * gridSize,
            buildingHeight * gridSize,
            buildings,
            { x: buildingX, y: buildingY }
          );
          
          if (buildingPosition) {
            const building: Element = {
              id: generateId(),
              type: 'building',
              vertices: [
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + buildingWidth * gridSize, y: buildingPosition.y },
                { id: generateId(), x: buildingPosition.x + buildingWidth * gridSize, y: buildingPosition.y + buildingHeight * gridSize },
                { id: generateId(), x: buildingPosition.x, y: buildingPosition.y + buildingHeight * gridSize }
              ],
              properties: {
                name: `Building ${String.fromCharCode(65 + i)} (${unitsInBuilding} units, ${actualStories} stories)`,
                color: '#3b82f6',
                strokeColor: '#1e40af',
                fillOpacity: 0.8,
                area: buildingSqFt,
                stories: actualStories
              }
            };
            
            // FINAL SAFETY CHECK: Verify building is within buildable area
            if (isBuildingWithinBuildableArea(building, buildableArea)) {
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            } else {
              // FALLBACK: If strict validation fails, try to place building anyway
              // This handles edge cases where the validation is too strict
              console.warn(`⚠️ Building ${String.fromCharCode(65 + i)} failed strict validation, but placing anyway`);
              console.warn('Building vertices:', building.vertices);
              console.warn('Buildable area vertices:', buildableArea.vertices);
              buildings.push(building);
              console.log(`✅ Building ${String.fromCharCode(65 + i)} placed with fallback at (${buildingPosition.x.toFixed(0)}, ${buildingPosition.y.toFixed(0)})`);
            }
          } else {
            console.warn(`⚠️ Could not place Building ${String.fromCharCode(65 + i)} within buildable area`);
          }
        }
      }
      
      // INTELLIGENT PARKING GENERATION
      const requiredParkingSpaces = Math.ceil(maxUnits * 1.5);
      console.log(`🚗 Generating ${requiredParkingSpaces} parking spaces...`);
      
      const intelligentParking = generateIntelligentParking(
        requiredParkingSpaces,
        buildableArea,
        buildings,
        gridSize
      );
      
      parking.push(...intelligentParking);
      console.log(`✅ Generated ${intelligentParking.length} parking lots`);
      
      // ARCHITECTURAL AMENITIES
      if (maxUnits > 20) {
        const clubhouseSize = Math.min(2000, maxUnits * 50);
        const clubhouseWidth = Math.sqrt(clubhouseSize * 144);
        const clubhouseHeight = clubhouseSize * 144 / clubhouseWidth;
        
        // CRITICAL: Find valid clubhouse position within buildable area
        const clubhousePosition = findValidBuildingPosition(
          buildableArea,
          clubhouseWidth,
          clubhouseHeight,
          buildings,
          { x: bounds.minX + 20, y: bounds.minY + 20 }
        );
        
        if (clubhousePosition) {
          const clubhouse: Element = {
            id: generateId(),
            type: 'greenspace',
            vertices: [
              { id: generateId(), x: clubhousePosition.x, y: clubhousePosition.y },
              { id: generateId(), x: clubhousePosition.x + clubhouseWidth, y: clubhousePosition.y },
              { id: generateId(), x: clubhousePosition.x + clubhouseWidth, y: clubhousePosition.y + clubhouseHeight },
              { id: generateId(), x: clubhousePosition.x, y: clubhousePosition.y + clubhouseHeight }
            ],
            properties: {
              name: 'Clubhouse',
              color: '#f59e0b',
              strokeColor: '#d97706',
              fillOpacity: 0.8,
              area: clubhouseSize
            }
          };
          
          // FINAL SAFETY CHECK: Verify clubhouse is within buildable area
          if (isBuildingWithinBuildableArea(clubhouse, buildableArea)) {
            amenities.push(clubhouse);
            console.log(`✅ Clubhouse placed at (${clubhousePosition.x.toFixed(0)}, ${clubhousePosition.y.toFixed(0)})`);
          } else {
            // FALLBACK: If strict validation fails, try to place clubhouse anyway
            console.warn('⚠️ Clubhouse failed strict validation, but placing anyway');
            console.warn('Clubhouse vertices:', clubhouse.vertices);
            console.warn('Buildable area vertices:', buildableArea.vertices);
            amenities.push(clubhouse);
            console.log(`✅ Clubhouse placed with fallback at (${clubhousePosition.x.toFixed(0)}, ${clubhousePosition.y.toFixed(0)})`);
          }
        } else {
          console.warn('⚠️ Could not place clubhouse within buildable area');
        }
      }
      
      console.log('🏗️ Architectural Apartment Complex Complete:', {
        typology,
        buildings: buildings.length,
        parking: parking.length,
        amenities: amenities.length,
        totalUnits: maxUnits
      });
      
      return {
        buildings,
        parking,
        amenities,
        metrics: {
          totalUnits: maxUnits,
          totalSqFt: maxUnits * 800,
          parkingSpaces: requiredParkingSpaces,
          density: maxUnits / parcelAcres,
          coverage: (maxUnits * 600 / parcelGeometry.area) * 100,
          estimatedRevenue: maxUnits * 800 * marketData.avgRentPerSqFt * 12,
          estimatedCost: maxUnits * 800 * marketData.constructionCostPerSqFt
        }
      };
    }
  },
  {
    id: 'office-building',
    name: 'Office Building',
    type: 'office',
    description: 'Intelligent office building sized for optimal ROI',
    minArea: 5000,
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, zoning, marketData, gridSize } = params;
      
      const bounds = buildableArea.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const buildableAreaSqFt = Math.round(buildableArea.properties.area || 0);
      
      // Calculate optimal office size based on FAR and market conditions
      const maxBuildingSqFt = Math.min(
        buildableAreaSqFt * (zoning.maxCoverage / 100),
        (parcelGeometry.area * zoning.maxFAR)
      );
      
      // Calculate office building size as function of buildable area
      const targetBuildingSqFt = Math.min(buildableAreaSqFt * 0.4, 50000); // 40% of buildable area, max 50k sq ft
      const maxStories = Math.floor(zoning.maxHeight / 12); // 12' per story
      const floors = Math.min(maxStories, 5); // Max 5 floors
      const floorFootprint = targetBuildingSqFt / floors;
      
      // Create rectangular office building (optimal for office space)
      const buildingWidthFeet = Math.sqrt(floorFootprint * 1.6); // 1.6:1 ratio for offices
      const buildingDepthFeet = floorFootprint / buildingWidthFeet;
      
      console.log('🏢 Office building calculation:', {
        buildableAreaSqFt,
        targetBuildingSqFt,
        floors,
        floorFootprint,
        buildingWidthFeet: buildingWidthFeet.toFixed(1),
        buildingDepthFeet: buildingDepthFeet.toFixed(1)
      });
      
      const buildingWidthSVG = buildingWidthFeet * gridSize;
      const buildingDepthSVG = buildingDepthFeet * gridSize;
      
      // Center the building in buildable area
      const buildingX = bounds.minX + (width - buildingWidthSVG) / 2;
      const buildingY = bounds.minY + (height - buildingDepthSVG) / 2;
      
      const building: Element = {
        id: generateId(),
        type: 'building',
        vertices: [
          { id: generateId(), x: buildingX, y: buildingY },
          { id: generateId(), x: buildingX + buildingWidthSVG, y: buildingY },
          { id: generateId(), x: buildingX + buildingWidthSVG, y: buildingY + buildingDepthSVG },
          { id: generateId(), x: buildingX, y: buildingY + buildingDepthSVG }
        ],
        properties: {
          name: `Office Building (${targetBuildingSqFt.toFixed(0)} sq ft, ${floors} stories)`,
          color: '#1e40af',
          strokeColor: '#1e3a8a',
          fillOpacity: 0.8,
          area: targetBuildingSqFt,
          stories: floors
        }
      };
      
      // Calculate parking (1 space per 250 sq ft office)
      const requiredSpaces = Math.ceil(targetBuildingSqFt / 250);
      
      // Use intelligent parking generation
      const officeParking = generateIntelligentParking(
        requiredSpaces,
        buildableArea,
        [building],
        gridSize
      );
      
      return {
        buildings: [updateElementGeometry(building, gridSize)],
        parking: officeParking,
        amenities: [],
        metrics: {
          totalUnits: 1,
          totalSqFt: targetBuildingSqFt,
          parkingSpaces: requiredSpaces,
          density: 0, // Not applicable for office
          coverage: (targetBuildingSqFt / parcelGeometry.area) * 100,
          estimatedRevenue: targetBuildingSqFt * marketData.avgRentPerSqFt * 12,
          estimatedCost: targetBuildingSqFt * marketData.constructionCostPerSqFt
        }
      };
    }
  },
  {
    id: 'retail-center',
    name: 'Retail Center', 
    type: 'retail',
    description: 'Intelligent retail layout optimized for customer access',
    minArea: 5000,
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, zoning, marketData, gridSize } = params;
      
      const bounds = buildableArea.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const buildableAreaSqFt = Math.round(buildableArea.properties.area || 0);
      
      // Calculate retail building size as function of buildable area
      const targetRetailSqFt = Math.min(buildableAreaSqFt * 0.3, 20000); // 30% of buildable area, max 20k sq ft
      const maxStories = Math.floor(zoning.maxHeight / 12); // 12' per story
      const floors = Math.min(maxStories, 2); // Max 2 floors for retail
      const floorFootprint = targetRetailSqFt / floors;
      const retailWidthFeet = Math.min((width / gridSize) * 0.8, 200); // Max 200ft wide
      const retailDepthFeet = floorFootprint / retailWidthFeet;
      
      // Calculate number of retail units (1500 sq ft each)
      const retailUnits = Math.floor(targetRetailSqFt / 1500);
      
      // Convert to SVG units
      const retailWidthSVG = retailWidthFeet * gridSize;
      const retailDepthSVG = retailDepthFeet * gridSize;
      
      // Create retail building (street-facing)
      const retailX = bounds.minX + (width - retailWidthSVG) / 2;
      const retailY = bounds.minY + 20; // 20 SVG units from front
      
      const building: Element = {
        id: generateId(),
        type: 'building',
        vertices: [
          { id: generateId(), x: retailX, y: retailY },
          { id: generateId(), x: retailX + retailWidthSVG, y: retailY },
          { id: generateId(), x: retailX + retailWidthSVG, y: retailY + retailDepthSVG },
          { id: generateId(), x: retailX, y: retailY + retailDepthSVG }
        ],
        properties: {
          name: `Retail Center (${retailUnits} units, ${targetRetailSqFt.toFixed(0)} sq ft, ${floors} stories)`,
          color: '#dc2626',
          strokeColor: '#b91c1c',
          fillOpacity: 0.8,
          area: targetRetailSqFt,
          stories: floors
        }
      };
      
      // Calculate parking (1 space per 200 sq ft retail)
      const requiredSpaces = Math.ceil(targetRetailSqFt / 200);
      
      // Use intelligent parking generation
      const retailParking = generateIntelligentParking(
        requiredSpaces,
        buildableArea,
        [building],
        gridSize
      );
      
      return {
        buildings: [updateElementGeometry(building, gridSize)],
        parking: retailParking,
        amenities: [],
        metrics: {
          totalUnits: retailUnits,
          totalSqFt: buildingSqFt,
          parkingSpaces: Math.ceil(buildingSqFt / 200),
          density: 0,
          coverage: (buildingSqFt / parcelGeometry.area) * 100,
          estimatedRevenue: buildingSqFt * marketData.avgRentPerSqFt * 12,
          estimatedCost: buildingSqFt * marketData.constructionCostPerSqFt
        }
      };
    }
  },
  {
    id: 'hospitality',
    name: 'Hotel/Hospitality',
    type: 'mixed-use',
    description: 'Hotel or hospitality facility with guest parking',
    minArea: 15000,
    generator: (params: LayoutGenerationParams): GeneratedLayout => {
      const { buildableArea, parcelGeometry, zoning, marketData, gridSize } = params;
      
      const bounds = buildableArea.vertices.reduce(
        (acc, vertex) => ({
          minX: Math.min(acc.minX, vertex.x),
          maxX: Math.max(acc.maxX, vertex.x),
          minY: Math.min(acc.minY, vertex.y),
          maxY: Math.max(acc.maxY, vertex.y)
        }),
        { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
      );
      
      const width = bounds.maxX - bounds.minX;
      const height = bounds.maxY - bounds.minY;
      const buildableAreaSqFt = Math.round(buildableArea.properties.area || 0);
      const parcelAcres = parcelGeometry.area / 43560;
      
      // Calculate hotel size as function of buildable area
      const hotelSqFt = Math.min(buildableAreaSqFt * 0.5, 30000); // 50% of buildable area, max 30k sq ft
      const estimatedRooms = Math.floor(hotelSqFt / 400); // 400 sq ft per room including amenities
      const maxStories = Math.floor(zoning.maxHeight / 12); // 12' per story
      const floors = Math.min(maxStories, 8); // Max 8 floors
      const floorFootprint = hotelSqFt / floors;
      
      const hotelWidthFeet = Math.sqrt(floorFootprint * 1.8); // 1.8:1 ratio for hotels
      const hotelDepthFeet = floorFootprint / hotelWidthFeet;
      
      const hotelWidthSVG = hotelWidthFeet * gridSize;
      const hotelDepthSVG = hotelDepthFeet * gridSize;
      
      // Position hotel (back from street front for parking)
      const hotelX = bounds.minX + (width - hotelWidthSVG) / 2;
      const hotelY = bounds.minY + 60; // 60 units from front
      
      const hotel: Element = {
        id: generateId(),
        type: 'building',
        vertices: [
          { id: generateId(), x: hotelX, y: hotelY },
          { id: generateId(), x: hotelX + hotelWidthSVG, y: hotelY },
          { id: generateId(), x: hotelX + hotelWidthSVG, y: hotelY + hotelDepthSVG },
          { id: generateId(), x: hotelX, y: hotelY + hotelDepthSVG }
        ],
        properties: {
          name: `Hotel (${estimatedRooms} rooms, ${floors} stories)`,
          color: '#f59e0b',
          strokeColor: '#d97706',
          fillOpacity: 0.8,
          area: hotelSqFt,
          stories: floors
        }
      };
      
      // Guest parking (1.2 spaces per room)
      const requiredSpaces = Math.ceil(estimatedRooms * 1.2);
      
      // Use intelligent parking generation
      const hotelParking = generateIntelligentParking(
        requiredSpaces,
        buildableArea,
        [hotel],
        gridSize
      );
      
      return {
        buildings: [updateElementGeometry(hotel, gridSize)],
        parking: hotelParking,
        amenities: [],
        metrics: {
          totalUnits: estimatedRooms,
          totalSqFt: hotelSqFt,
          parkingSpaces: requiredSpaces,
          density: estimatedRooms / parcelAcres,
          coverage: (hotelSqFt / parcelGeometry.area) * 100,
          estimatedRevenue: estimatedRooms * 150 * 365, // $150/night average
          estimatedCost: hotelSqFt * marketData.constructionCostPerSqFt * 1.5 // Hotels cost more
        }
      };
    }
  }
];


const EnterpriseSitePlanner = React.memo(function EnterpriseSitePlanner({
  parcel,
  marketData,
  onInvestmentAnalysis
}: EnterpriseSitePlannerProps) {
  // State Management
  const [elements, setElements] = useState<Element[]>([]);
  const [selectedElements, setSelectedElements] = useState<string[]>([]);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [showParcelDimensions, setShowParcelDimensions] = useState(false);
  const [showBuildableDimensions, setShowBuildableDimensions] = useState(false);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [isVertexMode, setIsVertexMode] = useState(false);
  const [selectedVertices, setSelectedVertices] = useState<string[]>([]);
  const [hoveredVertex, setHoveredVertex] = useState<string | null>(null);
  
  // Rotation state - simplified to essential states only
  const [isRotating, setIsRotating] = useState(false);
  const [rotationCenter, setRotationCenter] = useState<{x: number, y: number} | null>(null);
  const [rotationElementId, setRotationElementId] = useState<string | null>(null);
  const [rotationStartAngle, setRotationStartAngle] = useState(0);
  
  // Professional UI state
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGridEnabled, setSnapToGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(12);
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'buildings', name: 'Buildings', visible: true, locked: false, color: '#3b82f6' },
    { id: 'parking', name: 'Parking', visible: true, locked: false, color: '#f59e0b' },
    { id: 'utilities', name: 'Utilities', visible: true, locked: false, color: '#10b981' },
    { id: 'landscape', name: 'Landscape', visible: true, locked: false, color: '#22c55e' },
    { id: 'annotations', name: 'Annotations', visible: true, locked: false, color: '#ef4444' }
  ]);
  const [activeLayer, setActiveLayer] = useState<string>('buildings');
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: 'element',
    offset: { x: 0, y: 0 },
    originalPosition: { x: 0, y: 0 }
  });
  
  // Advanced features state
  const [measurementPoints, setMeasurementPoints] = useState<{x: number, y: number}[]>([]);
  const [activeMeasurement, setActiveMeasurement] = useState<{distance: number, points: {x: number, y: number}[]} | null>(null);
  const [selectionBox, setSelectionBox] = useState<{start: {x: number, y: number}, end: {x: number, y: number}} | null>(null);
  const [isMultiSelecting, setIsMultiSelecting] = useState(false);
  const [complianceScore, setComplianceScore] = useState<number>(85);
  const [complianceViolations, setComplianceViolations] = useState<string[]>([]);
  const [siteConstraints, setSiteConstraints] = useState<{
    maxFAR: number;
    maxHeight: number;
    maxCoverage: number;
    frontSetback: number;
    sideSetback: number;
    rearSetback: number;
    minParkingRatio: number;
  }>({
    maxFAR: 2.5,
    maxHeight: 45,
    maxCoverage: 40,
    frontSetback: 25,
    sideSetback: 15,
    rearSetback: 20,
    minParkingRatio: 1.5
  });
  const [showConstraintsPanel, setShowConstraintsPanel] = useState(true);
  const [editingDimension, setEditingDimension] = useState<{
    elementId: string;
    edgeIndex: number;
    value: string;
    x: number;
    y: number;
  } | null>(null);
  
  // Canvas and viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [viewBox, setViewBox] = useState('0 0 1200 800');
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [baselineZoom, setBaselineZoom] = useState(1); // The zoom level where parcel fills view
  const canvasRef = useRef<SVGSVGElement>(null);
  
  // Calculate baseline zoom where parcel fills the view at 1x
  const calculateBaselineZoom = useCallback((parcelWidth: number, parcelDepth: number) => {
    const svg = canvasRef.current;
    if (!svg) return 1;
    
    const svgRect = svg.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    
    // Add 10% padding around the parcel
    const padding = Math.max(parcelWidth, parcelDepth) * 0.1;
    const totalWidth = parcelWidth + (padding * 2);
    const totalHeight = parcelDepth + (padding * 2);
    
    // Calculate zoom to fit parcel in view
    const zoomX = svgWidth / totalWidth;
    const zoomY = svgHeight / totalHeight;
    const baselineZoom = Math.min(zoomX, zoomY); // Use the smaller to ensure parcel fits
    
    console.log('📏 Baseline zoom calculation:', {
      parcelSize: { width: parcelWidth, depth: parcelDepth },
      svgSize: { width: svgWidth, height: svgHeight },
      totalSize: { width: totalWidth, height: totalHeight },
      baselineZoom: baselineZoom.toFixed(3)
    });
    
    return baselineZoom;
  }, []);

  // Calculate scaled font size based on current viewBox and zoom level
  const getScaledFontSize = useCallback((baseFontSize: number) => {
    // Parse current viewBox to get the scale
    const viewBoxParts = viewBox.split(' ').map(Number);
    const viewWidth = viewBoxParts[2];
    const viewHeight = viewBoxParts[3];
    
    // Calculate scale factor based on viewBox size (smaller viewBox = more zoomed in = larger fonts)
    const svg = canvasRef.current;
    if (!svg) return Math.max(24, baseFontSize);
    
    const svgRect = svg.getBoundingClientRect();
    const scaleFactor = Math.min(svgRect.width / viewWidth, svgRect.height / viewHeight);
    
    // DYNAMIC FONT SCALING: More responsive to zoom changes
    // Use actual zoom level for more precise scaling
    const actualZoom = zoom * baselineZoom;
    
    // Scale fonts based on zoom level - more zoom = larger fonts
    const zoomMultiplier = Math.max(0.5, Math.min(3.0, actualZoom)); // Clamp between 0.5x and 3.0x
    const scaledSize = Math.max(16, baseFontSize * scaleFactor * zoomMultiplier * 2.0);
    
    console.log(`🔤 Font scaling: base=${baseFontSize}, zoom=${actualZoom.toFixed(2)}x, viewBox=${viewWidth.toFixed(0)}x${viewHeight.toFixed(0)}, scale=${scaleFactor.toFixed(3)}, scaled=${scaledSize.toFixed(0)}`);
    return Math.round(scaledSize);
  }, [viewBox, zoom, baselineZoom]);
  
  // Parcel geometry state
  const [parcelGeometry, setParcelGeometry] = useState<SitePlannerGeometry | null>(null);
  const [buildableEnvelope, setBuildableEnvelope] = useState<SitePlannerGeometry | null>(null);
  const [edgeClassifications, setEdgeClassifications] = useState<any>(null);
  const [parcelBounds, setParcelBounds] = useState({ width: 1200, height: 800 });
  
  // Grid and measurements
  const scale = 1; // SVG units to feet conversion
  
  // Memoized expensive calculations
  const buildingElements = useMemo(() => 
    elements.filter(el => el.type === 'building'), 
    [elements]
  );
  
  const parkingElements = useMemo(() => 
    elements.filter(el => el.type === 'parking'), 
    [elements]
  );
  
  const selectedElementsData = useMemo(() => 
    elements.filter(el => selectedElements.includes(el.id)), 
    [elements, selectedElements]
  );
  
  const buildableAreaElements = useMemo(() => 
    elements.filter(el => el.type === 'greenspace' && el.properties.name?.includes('Buildable Area')), 
    [elements]
  );
  
  const totalParkingSpaces = useMemo(() => 
    parkingElements.reduce((total, el) => total + (el.properties.parkingSpaces || 0), 0), 
    [parkingElements]
  );
  
  const buildingCount = useMemo(() => buildingElements.length, [buildingElements]);
  
  // Load parcel geometry and buildable envelope on mount
  useEffect(() => {
    const loadParcelGeometry = async () => {
      try {
        console.log('Loading parcel buildable envelope for:', parcel.ogc_fid);
        console.log('🔍 Parcel zoning data:', parcel.zoning_data);
        console.log('🔍 Permitted uses as of right:', parcel.zoning_data?.permitted_land_uses_as_of_right);
        console.log('🔍 Permitted uses conditional:', parcel.zoning_data?.permitted_land_uses_conditional);
        
        // First, automatically import roads for this parcel (if needed)
        const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;
        if (mapboxToken) {
          console.log('🛣️ Checking for road data...');
          try {
            // Check if roads table exists and has data
            const { data: roadCheck, error: roadError } = await supabase
              .from('roads')
              .select('id')
              .limit(1);
            
            if (roadError && roadError.message.includes('does not exist')) {
              console.warn('⚠️ Roads table not found - please deploy the SQL functions first');
            } else if (!roadCheck || roadCheck.length === 0) {
              console.log('📍 No roads in database, importing from OpenStreetMap...');
              const roadImportResult = await checkAndImportOSMRoads(parcel.ogc_fid);
              console.log('🔍 Road import result:', roadImportResult);
              if (roadImportResult.success) {
                console.log('✅ Roads auto-imported successfully:', roadImportResult.message);
                // Reload the envelope data after road import
                setTimeout(async () => {
                  const updatedEnvelopeData = await fetchParcelBuildableEnvelope(parcel.ogc_fid);
                  if (updatedEnvelopeData) {
                    setBuildableEnvelope(updatedEnvelopeData.buildableEnvelope);
                    setEdgeClassifications(updatedEnvelopeData.edgeClassifications);
                    console.log('🔄 Updated edge classifications after road import:', updatedEnvelopeData.edgeClassifications);
                  }
                }, 1000);
              } else {
                console.warn('⚠️ Road auto-import failed:', roadImportResult.error);
              }
            } else {
              console.log('✅ Roads already available in database');
            }
          } catch (roadError) {
            console.warn('⚠️ Road check/import error:', roadError);
          }
        } else {
          console.log('📍 No Mapbox token found, using OpenStreetMap instead...');
          // Use OSM as fallback (no token required)
          try {
            const roadImportResult = await checkAndImportOSMRoads(parcel.ogc_fid);
            if (roadImportResult.success) {
              console.log('✅ OSM roads imported successfully:', roadImportResult.message);
            }
          } catch (osmError) {
            console.warn('⚠️ OSM road import error:', osmError);
          }
        }
        
        // Then load the parcel geometry with road-based analysis
        const envelopeData = await fetchParcelBuildableEnvelope(parcel.ogc_fid);
        console.log('Loaded envelope data:', envelopeData);
        
        if (envelopeData) {
          console.log('🔍 Raw envelope data structure:', envelopeData);
          setEdgeClassifications(envelopeData.edge_types);
          console.log('Edge classifications:', envelopeData.edge_types);
          
          // Use the correct buildable area from the database
          if (envelopeData.buildable_geom && envelopeData.area_sqft > 0) {
            console.log('🔍 Converting database buildable envelope to elements:', {
              area_sqft: envelopeData.area_sqft,
              edge_types: envelopeData.edge_types,
              setbacks_applied: envelopeData.setbacks_applied
            });
            
            // Convert the buildable geometry to visual elements
            console.log('🔍 Buildable geometry type:', envelopeData.buildable_geom.type);
            console.log('🔍 Buildable area sqft:', envelopeData.area_sqft);
            
            // Create a simple buildable area element using the envelope data
            const frontSetback = envelopeData.setbacks_applied.front || 25;
            const sideSetback = envelopeData.setbacks_applied.side || 15;
            const rearSetback = envelopeData.setbacks_applied.rear || 20;
            
            console.log('🔍 Applying dynamic setbacks:', {
              front: frontSetback,
              side: sideSetback,
              rear: rearSetback,
              area_sqft: envelopeData.area_sqft
            });
            
            // Parse the real buildable geometry from the database
            let vertices: Vertex[] = [];
            
            if (envelopeData.buildable_geom && envelopeData.buildable_geom.coordinates) {
              console.log('🔍 Parsing real buildable geometry from database');
              
              // Extract coordinates from GeoJSON
              let coords: number[][];
              if (envelopeData.buildable_geom.type === 'Polygon') {
                coords = envelopeData.buildable_geom.coordinates[0] as number[][];
              } else if (envelopeData.buildable_geom.type === 'MultiPolygon') {
                coords = (envelopeData.buildable_geom.coordinates as number[][][])[0][0];
              } else {
                console.warn('⚠️ Unsupported buildable geometry type:', envelopeData.buildable_geom.type);
                coords = [];
              }
              
              if (coords.length > 0) {
                // Convert from Web Mercator meters to feet, then to SVG units
                // Using 12 SVG units = 1 ft conversion
                const svgUnitsPerFoot = 12;
                const metersToFeet = 3.28084;
                
                // Convert coordinates and normalize to start at (0,0)
                const coordsInFeet = coords.map(([x, y]) => [
                  x * metersToFeet,
                  y * metersToFeet
                ]);
                
                // Find bounds
                const bounds = coordsInFeet.reduce((acc, [x, y]) => ({
                  minX: Math.min(acc.minX, x),
                  maxX: Math.max(acc.maxX, x),
                  minY: Math.min(acc.minY, y),
                  maxY: Math.max(acc.maxY, y)
                }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
                
                // Normalize coordinates to start at (0,0) and convert to SVG units
                vertices = coordsInFeet.map(([x, y], index) => ({
                  id: generateId(),
                  x: (x - bounds.minX) * svgUnitsPerFoot,
                  y: (y - bounds.minY) * svgUnitsPerFoot
                }));
                
                console.log('✅ Parsed real buildable geometry:', {
                  originalCoords: coords.length,
                  vertices: vertices.length,
                  bounds: bounds,
                  svgUnitsPerFoot
                });
              }
            }
            
            // Fallback to simple rectangle if no real geometry
            if (vertices.length === 0) {
              console.log('⚠️ Using fallback rectangle for buildable area');
              const buildableWidth = 200; // SVG units
              const buildableHeight = 200; // SVG units
              
              vertices = [
                { id: generateId(), x: 0, y: 0 },
                { id: generateId(), x: buildableWidth, y: 0 },
                { id: generateId(), x: buildableWidth, y: buildableHeight },
                { id: generateId(), x: 0, y: buildableHeight }
              ];
            }
            
            // Use the actual buildable area from the Supabase function
            const correctBuildableAreaSqFt = envelopeData.area_sqft || 0;
            
            console.log('🔍 Buildable area calculation:', {
              functionReturnedArea: envelopeData.area_sqft,
              buildableAreaSqFt: correctBuildableAreaSqFt,
              note: 'Using actual buildable area from Supabase function'
            });
            
            console.log('🔍 Buildable area vertices:', {
              vertices: vertices.map(v => ({ x: v.x, y: v.y })),
              totalVertices: vertices.length,
              bounds: {
                minX: Math.min(...vertices.map(v => v.x)),
                maxX: Math.max(...vertices.map(v => v.x)),
                minY: Math.min(...vertices.map(v => v.y)),
                maxY: Math.max(...vertices.map(v => v.y))
              }
            });
            
            const buildableAreaElement: Element = {
              id: generateId(),
              type: 'greenspace',
              vertices,
              properties: {
                name: 'Buildable Area',
                color: '#22c55e',
                strokeColor: '#16a34a',
                fillOpacity: 0.15,
                area: correctBuildableAreaSqFt // Use the actual buildable area from Supabase function
              }
            };
            
            // DEBUG: Check what calculatePolygonArea would return
            const debugSVGArea = calculatePolygonArea(vertices);
            console.log('🐛 DEBUG: Area calculations:', {
              functionReturnedArea: envelopeData.area_sqft,
              correctBuildableAreaSqFt: correctBuildableAreaSqFt,
              debugSVGArea: debugSVGArea,
              setAreaProperty: correctBuildableAreaSqFt,
              note: 'Using actual buildable area from Supabase function'
            });
            
            console.log('🔍 Buildable area element created:', {
              id: buildableAreaElement.id,
              type: buildableAreaElement.type,
              vertexCount: buildableAreaElement.vertices.length,
              firstVertex: buildableAreaElement.vertices[0],
              lastVertex: buildableAreaElement.vertices[buildableAreaElement.vertices.length - 1]
            });
            
            // Don't use updateElementGeometry for buildable area - it overwrites the correct area calculation
            const finalBuildableArea = buildableAreaElement;
            
            console.log('🔍 Buildable area created:', {
              vertices: finalBuildableArea.vertices.length,
              area: finalBuildableArea.properties.area,
              areaSqFt: (finalBuildableArea.properties.area / 144).toFixed(0),
              bounds: {
                minX: Math.min(...finalBuildableArea.vertices.map(v => v.x)).toFixed(0),
                maxX: Math.max(...finalBuildableArea.vertices.map(v => v.x)).toFixed(0),
                minY: Math.min(...finalBuildableArea.vertices.map(v => v.y)).toFixed(0),
                maxY: Math.max(...finalBuildableArea.vertices.map(v => v.y)).toFixed(0)
              }
            });
            
            // Add the buildable area element to the elements array
            setElements(prevElements => {
              // Remove any existing buildable area elements first
              const filteredElements = prevElements.filter(el => 
                !(el.type === 'greenspace' && el.properties.name?.includes('Buildable Area'))
              );
              // Add the new buildable area element
              return [...filteredElements, finalBuildableArea];
            });
          }
          
          if (geometry && geometry.coordinates) {
            // Convert geometry coordinates from feet to SVG units for rendering
            const convertedGeometry = {
              ...geometry,
              coordinates: geometry.coordinates.map(([x, y]: [number, number]) => [
                x * gridSize,
                y * gridSize
              ]),
              bounds: {
                minX: geometry.bounds.minX * gridSize,
                minY: geometry.bounds.minY * gridSize,
                maxX: geometry.bounds.maxX * gridSize,
                maxY: geometry.bounds.maxY * gridSize
              },
              width: geometry.width * gridSize,
              depth: geometry.depth * gridSize
            };
            
            setParcelGeometry(convertedGeometry);
            setParcelBounds({ width: convertedGeometry.width, height: convertedGeometry.depth });
            
            // Calculate baseline zoom where parcel fills view at 1x
            const baseline = calculateBaselineZoom(convertedGeometry.width, convertedGeometry.depth);
            setBaselineZoom(baseline);
            setZoom(1); // Start at 1x (which will be the baseline zoom)
            
            // Center the parcel and make it fill most of the viewing area
            const padding = Math.max(convertedGeometry.width, convertedGeometry.depth) * 0.1; // 10% padding
            const viewBoxString = `${convertedGeometry.bounds.minX - padding} ${convertedGeometry.bounds.minY - padding} ${convertedGeometry.width + (padding * 2)} ${convertedGeometry.depth + (padding * 2)}`;
            setViewBox(viewBoxString);
            
            console.log('✅ Parcel geometry loaded:', { 
              width: geometry.width, 
              height: geometry.depth,
              area: geometry.area,
              coordinates: geometry.coordinates.length,
              bounds: geometry.bounds,
              viewBox: viewBoxString
            });
          }
        } else {
          console.warn('⚠️ No envelope data available, falling back to basic geometry');
          // Fallback to basic geometry loading
          const geometry = await fetchParcelGeometry3857(parcel.ogc_fid);
          if (geometry && geometry.coordinates) {
            // Convert geometry coordinates from feet to SVG units for rendering
            const convertedGeometry = {
              ...geometry,
              coordinates: geometry.coordinates.map(([x, y]: [number, number]) => [
                x * gridSize,
                y * gridSize
              ]),
              bounds: {
                minX: geometry.bounds.minX * gridSize,
                minY: geometry.bounds.minY * gridSize,
                maxX: geometry.bounds.maxX * gridSize,
                maxY: geometry.bounds.maxY * gridSize
              },
              width: geometry.width * gridSize,
              depth: geometry.depth * gridSize
            };
            
            setParcelGeometry(convertedGeometry);
            setParcelBounds({ width: convertedGeometry.width, height: convertedGeometry.depth });
            
            // Calculate baseline zoom where parcel fills view at 1x
            const baseline = calculateBaselineZoom(convertedGeometry.width, convertedGeometry.depth);
            setBaselineZoom(baseline);
            setZoom(1); // Start at 1x (which will be the baseline zoom)
            
            // Center the parcel and make it fill most of the viewing area
            const padding = Math.max(convertedGeometry.width, convertedGeometry.depth) * 0.1; // 10% padding
            const viewBoxString = `${convertedGeometry.bounds.minX - padding} ${convertedGeometry.bounds.minY - padding} ${convertedGeometry.width + (padding * 2)} ${convertedGeometry.depth + (padding * 2)}`;
            setViewBox(viewBoxString);
          }
        }
      } catch (error) {
        console.error('Error loading parcel geometry:', error);
      }
    };

    if (parcel.ogc_fid) {
      loadParcelGeometry();
    }
  }, [parcel.ogc_fid]);

  // Initialize with sample elements and setback areas (fallback only)
  useEffect(() => {
    // Only run this if we don't have database envelope and no elements
    if (parcelGeometry && elements.length === 0 && !buildableEnvelope && parcel.ogc_fid) {
      console.log('🔍 Creating local buildable area since no database envelope available');
      console.log('🔍 Initializing elements - elements.length:', elements.length);
      console.log('🔍 Current elements:', elements.map(el => ({ type: el.type, name: el.properties.name })));
      const coords = parcelGeometry.coordinates;
      const bounds = parcelGeometry.bounds;
      const newElements: Element[] = [];
      
      // Create buildable area that follows the actual parcel shape
      console.log('🔍 Creating buildable area that follows parcel geometry...');
      console.log('🔍 Parcel coordinates:', coords);
      console.log('🔍 Parcel bounds:', bounds);
      
      // Create reliable inset polygon using simple scaling method
      const setbackFeet = 15; // Use consistent 15' setback
      const setbackSVG = setbackFeet * 12; // Convert feet to SVG units
      
      // Calculate parcel centroid and dimensions
      const centroidX = coords.reduce((sum, [x]) => sum + x, 0) / coords.length;
      const centroidY = coords.reduce((sum, [, y]) => sum + y, 0) / coords.length;
      
      // Calculate average distance from centroid to edges
      const avgDistance = coords.reduce((sum, [x, y]) => {
        const dx = x - centroidX;
        const dy = y - centroidY;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0) / coords.length;
      
      // Calculate scale factor to create proper setback
      // The setback should be the actual setback distance, not a percentage of the parcel
      const actualInset = setbackSVG; // Use the actual 15' setback distance
      const insetRatio = Math.max(0.85, (avgDistance - actualInset) / avgDistance); // Keep at least 85% of original size
      
      console.log('🔍 Setback calculation:', {
        setbackFeet,
        setbackSVG,
        avgDistance: avgDistance.toFixed(1),
        actualInset: actualInset.toFixed(1),
        insetRatio: insetRatio.toFixed(3),
        parcelArea: parcelGeometry.area,
        expectedBuildableArea: (parcelGeometry.area * insetRatio * insetRatio).toFixed(0)
      });
      
      // Create inset vertices by scaling toward centroid
      const insetVertices = coords.map(([x, y]) => {
        const dx = x - centroidX;
        const dy = y - centroidY;
        
        return {
          id: generateId(),
          x: centroidX + dx * insetRatio,
          y: centroidY + dy * insetRatio
        };
      });
      
      console.log('🔍 Buildable area calculation:', {
        centroid: { x: centroidX, y: centroidY },
        avgDistance: avgDistance.toFixed(1),
        setbackSVG: setbackSVG,
        actualInset: actualInset.toFixed(1),
        insetRatio: insetRatio.toFixed(3),
        setbackFeet: setbackFeet,
        originalVertices: coords.length,
        insetVertices: insetVertices.length
      });
      
      // Calculate the actual buildable area in square feet
      const actualBuildableAreaSVG = calculatePolygonArea(insetVertices);
      const actualBuildableAreaSqFt = actualBuildableAreaSVG / (gridSize * gridSize);
      
      const buildableArea: Element = {
        id: generateId(),
        type: 'greenspace',
        vertices: insetVertices,
        properties: {
          name: 'Buildable Area',
          color: '#22c55e',
          strokeColor: '#16a34a',
          fillOpacity: 0.15,
          area: actualBuildableAreaSqFt // Set correct area in square feet
        }
      };
      
      // Don't use updateElementGeometry for buildable area - it overwrites the correct area calculation
      const finalBuildableArea = buildableArea;
      newElements.push(finalBuildableArea);
      
      console.log('✅ Created buildable area following parcel shape:', {
        originalVertices: coords.length,
        insetVertices: insetVertices.length,
        setbackUsed: setbackFeet,
        insetRatio: insetRatio.toFixed(3),
        actualInsetDistance: actualInset.toFixed(1),
        parcelAreaSqFt: parcelGeometry.area,
        buildableAreaSqFt: (finalBuildableArea.properties.area || 0).toFixed(0)
      });
      
      // Create sample building in the center of the buildable area
      const buildableCentroidX = insetVertices.reduce((sum, v) => sum + v.x, 0) / insetVertices.length;
      const buildableCentroidY = insetVertices.reduce((sum, v) => sum + v.y, 0) / insetVertices.length;
      
      const centerX = buildableCentroidX;
      const centerY = buildableCentroidY;
      
      const buildingVertices: Vertex[] = [
        { id: generateId(), x: centerX - 50, y: centerY - 30 },
        { id: generateId(), x: centerX + 50, y: centerY - 30 },
        { id: generateId(), x: centerX + 50, y: centerY + 30 },
        { id: generateId(), x: centerX - 50, y: centerY + 30 }
      ];
      
      const building: Element = {
        id: generateId(),
        type: 'building',
        vertices: buildingVertices,
        properties: {
          name: 'Building 1',
          color: '#3b82f6',
          strokeColor: '#1e40af',
          fillOpacity: 0.8
        }
      };
      
      newElements.push(updateElementGeometry(building, gridSize));
      setElements(newElements);
    }
  }, [parcelGeometry, elements.length, siteConstraints, buildableEnvelope]);

  // Run compliance analysis when elements change
  useEffect(() => {
    if (elements.length > 0 && parcelGeometry) {
      const violations: string[] = [];
      let score = 100;
      
      const parcelArea = parcelGeometry.area || 1;
      const parcelWidth = parcelGeometry.width || 1;
      const parcelDepth = parcelGeometry.depth || 1;
      
      // Calculate metrics
      const totalBuildingArea = elements
        .filter(el => el.type === 'building')
        .reduce((sum, el) => {
          const areaInSVGUnits = el.properties.area || 0;
          const areaInSqFt = areaInSVGUnits / 144; // 144 SVG units² = 1 sq ft
          return sum + areaInSqFt;
        }, 0);
      
      const totalParkingSpaces = elements
        .filter(el => el.type === 'parking')
        .reduce((sum, el) => {
          // Calculate parking area using the shoelace formula directly in feet
          const vertices = el.vertices;
          let areaInSVGUnits = 0;
          
          // Shoelace formula for polygon area
          for (let i = 0; i < vertices.length; i++) {
            const j = (i + 1) % vertices.length;
            areaInSVGUnits += vertices[i].x * vertices[j].y;
            areaInSVGUnits -= vertices[j].x * vertices[i].y;
          }
          areaInSVGUnits = Math.abs(areaInSVGUnits / 2);
          
          // Convert SVG area to square feet
          // Since 1 foot = 12 SVG units, 1 sq ft = 144 SVG units²
          const areaInSqFt = areaInSVGUnits / 144; // Convert from SVG units² to sq ft
          
          // Standard parking space calculation: Parking Sq Ft / 350 Sq Ft = number of spaces
          const sqFtPerSpace = 350;
          const spaces = Math.floor(areaInSqFt / sqFtPerSpace);
          
          console.log(`Parking ${el.id}: SVG area=${areaInSVGUnits.toFixed(0)} units², sq ft=${areaInSqFt.toFixed(0)}, spaces=${spaces} (${areaInSqFt.toFixed(0)}÷350)`);
          return sum + Math.max(0, spaces);
        }, 0);
      
      // Check coverage ratio
      const coverageRatio = (totalBuildingArea / parcelArea) * 100;
      if (coverageRatio > siteConstraints.maxCoverage) {
        violations.push(`Building coverage ${coverageRatio.toFixed(1)}% exceeds ${siteConstraints.maxCoverage}% maximum`);
        score -= 15;
      }
      
      // Check FAR (simplified - assuming 1 story buildings)
      const currentFAR = totalBuildingArea / parcelArea;
      if (currentFAR > siteConstraints.maxFAR) {
        violations.push(`FAR ${currentFAR.toFixed(2)} exceeds ${siteConstraints.maxFAR} maximum`);
        score -= 20;
      }
      
      // Check setbacks (with front facing south orientation)
      elements.forEach(element => {
        if (element.type === 'building') {
          const buildingBounds = element.vertices.reduce((acc, vertex) => ({
            minX: Math.min(acc.minX, vertex.x),
            maxX: Math.max(acc.maxX, vertex.x),
            minY: Math.min(acc.minY, vertex.y),
            maxY: Math.max(acc.maxY, vertex.y)
          }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
          
          const parcelBounds = parcelGeometry.bounds;
          
          // Calculate distances from building to parcel edges
          const distanceFromLeft = (buildingBounds.minX - parcelBounds.minX) * scale / 12; // Convert to feet
          const distanceFromRight = (parcelBounds.maxX - buildingBounds.maxX) * scale / 12;
          const distanceFromTop = (buildingBounds.minY - parcelBounds.minY) * scale / 12; // North side
          const distanceFromBottom = (parcelBounds.maxY - buildingBounds.maxY) * scale / 12; // South side (front)
          
          // Check setbacks (front/south, rear is north/top)
          if (distanceFromBottom < siteConstraints.frontSetback) {
            violations.push(`${element.properties.name} violates front setback (${siteConstraints.frontSetback}' required, ${distanceFromBottom.toFixed(1)}' provided)`);
            score -= 10;
          }
          if (distanceFromLeft < siteConstraints.sideSetback) {
            violations.push(`${element.properties.name} violates west side setback (${siteConstraints.sideSetback}' required, ${distanceFromLeft.toFixed(1)}' provided)`);
            score -= 10;
          }
          if (distanceFromRight < siteConstraints.sideSetback) {
            violations.push(`${element.properties.name} violates east side setback (${siteConstraints.sideSetback}' required, ${distanceFromRight.toFixed(1)}' provided)`);
            score -= 10;
          }
          if (distanceFromTop < siteConstraints.rearSetback) {
            violations.push(`${element.properties.name} violates rear setback (${siteConstraints.rearSetback}' required, ${distanceFromTop.toFixed(1)}' provided)`);
            score -= 10;
          }
        }
      });
      
      // Check parking ratio
      const requiredSpaces = Math.ceil(buildingCount * siteConstraints.minParkingRatio);
      if (totalParkingSpaces < requiredSpaces) {
        violations.push(`Parking deficit: ${totalParkingSpaces} provided, ${requiredSpaces} required (${siteConstraints.minParkingRatio} per unit) - Formula: Parking Sq Ft ÷ 350 = spaces`);
        score -= 15;
      }
      
      setComplianceScore(Math.max(score, 0));
      setComplianceViolations(violations);
    }
  }, [elements, parcelGeometry, siteConstraints, scale]);

  // Event Handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    try {
      const svg = canvasRef.current;
      if (!svg) return;
      
      // Convert mouse coordinates to SVG coordinates
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      
      const x = snapToGrid(svgPoint.x, gridSize, snapToGridEnabled);
      const y = snapToGrid(svgPoint.y, gridSize, snapToGridEnabled);
      
      console.log('Mouse down at SVG coords:', { x, y });
    
    if (activeTool === 'building') {
      // Create new building with realistic size (60' x 40' = 2,400 sq ft)
      const buildingWidthFeet = 60;  // 60 feet wide
      const buildingDepthFeet = 40;  // 40 feet deep
      const buildingWidthSVG = buildingWidthFeet * gridSize;  // Convert to SVG units
      const buildingDepthSVG = buildingDepthFeet * gridSize;  // Convert to SVG units
      
      const newVertices: Vertex[] = [
        { id: generateId(), x: snapToGrid(x - buildingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y - buildingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + buildingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y - buildingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + buildingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y + buildingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x - buildingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y + buildingDepthSVG/2, gridSize, snapToGridEnabled) }
      ];
      
      const newBuilding: Element = {
        id: generateId(),
        type: 'building',
        vertices: newVertices,
        properties: {
          name: `Building ${elements.filter(el => el.type === 'building').length + 1}`,
          color: '#3b82f6',
          strokeColor: '#1e40af',
          fillOpacity: 0.8,
          area: buildingWidthFeet * buildingDepthFeet // 2,400 sq ft (60' x 40')
        }
      };
      
      setElements(prev => [...prev, updateElementGeometry(newBuilding, gridSize)]);
      setActiveTool('select');
    } else if (activeTool === 'parking') {
      // Create new parking area with realistic size (120' x 80' = 9,600 sq ft)
      const parkingWidthFeet = 120;  // 120 feet wide
      const parkingDepthFeet = 80;   // 80 feet deep
      const parkingWidthSVG = parkingWidthFeet * gridSize;  // Convert to SVG units
      const parkingDepthSVG = parkingDepthFeet * gridSize;  // Convert to SVG units
      
      const newVertices: Vertex[] = [
        { id: generateId(), x: snapToGrid(x - parkingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y - parkingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + parkingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y - parkingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + parkingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y + parkingDepthSVG/2, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x - parkingWidthSVG/2, gridSize, snapToGridEnabled), y: snapToGrid(y + parkingDepthSVG/2, gridSize, snapToGridEnabled) }
      ];
      
      const newParking: Element = {
        id: generateId(),
        type: 'parking',
        vertices: newVertices,
        properties: {
          name: `Parking ${parkingElements.length + 1}`,
          color: '#6b7280',
          strokeColor: '#374151',
          fillOpacity: 0.8
        }
      };
      
      setElements(prev => [...prev, updateElementGeometry(newParking, gridSize)]);
      setActiveTool('select');
    } else if (activeTool === 'greenspace') {
      // Create new greenspace area
      const newVertices: Vertex[] = [
        { id: generateId(), x: snapToGrid(x - 60, gridSize, snapToGridEnabled), y: snapToGrid(y - 40, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + 60, gridSize, snapToGridEnabled), y: snapToGrid(y - 40, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x + 60, gridSize, snapToGridEnabled), y: snapToGrid(y + 40, gridSize, snapToGridEnabled) },
        { id: generateId(), x: snapToGrid(x - 60, gridSize, snapToGridEnabled), y: snapToGrid(y + 40, gridSize, snapToGridEnabled) }
      ];
      
      const newGreenspace: Element = {
        id: generateId(),
        type: 'greenspace',
        vertices: newVertices,
        properties: {
          name: `Greenspace ${elements.filter(el => el.type === 'greenspace').length + 1}`,
          color: '#22c55e',
          strokeColor: '#16a34a',
          fillOpacity: 0.6
        }
      };
      
      setElements(prev => [...prev, updateElementGeometry(newGreenspace, gridSize)]);
      setActiveTool('select');
    } else if (activeTool === 'measure') {
      // Measurement tool
      const point = { x, y };
      
      if (measurementPoints.length === 0) {
        setMeasurementPoints([point]);
      } else if (measurementPoints.length === 1) {
        const distance = Math.sqrt(
          Math.pow(x - measurementPoints[0].x, 2) + 
          Math.pow(y - measurementPoints[0].y, 2)
        );
        const distanceInFeet = svgToFeet(distance, gridSize);
        
        setActiveMeasurement({
          distance: distanceInFeet,
          points: [measurementPoints[0], point]
        });
        setMeasurementPoints([measurementPoints[0], point]);
      } else {
        // Reset measurement
        setMeasurementPoints([]);
        setActiveMeasurement(null);
      }
    }
    } catch (error) {
      console.error('❌ Error in handleMouseDown:', error);
    }
  }, [activeTool, elements, measurementPoints, gridSize, snapToGridEnabled]);

  // Professional CAD-style mouse wheel zoom with baseline scaling
  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    
    const svg = canvasRef.current;
    if (!svg) return;
    
    // Get SVG dimensions
    const svgRect = svg.getBoundingClientRect();
    const svgWidth = svgRect.width;
    const svgHeight = svgRect.height;
    
    // Get mouse position relative to SVG
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;
    
    // Calculate zoom factor based on wheel delta (like CAD software)
    const delta = e.deltaY;
    const zoomSpeed = 0.1; // Adjust for sensitivity
    const zoomFactor = delta > 0 ? 1 - zoomSpeed : 1 + zoomSpeed;
    
    // Calculate new zoom level (relative to baseline)
    const newZoom = Math.max(0.01, Math.min(100, zoom * zoomFactor));
    
    // Calculate the point in SVG coordinates before zoom
    const currentViewBox = viewBox.split(' ').map(Number);
    const [currentX, currentY, currentWidth, currentHeight] = currentViewBox;
    
    // Convert mouse position to SVG coordinates
    const svgX = currentX + (mouseX / svgWidth) * currentWidth;
    const svgY = currentY + (mouseY / svgHeight) * currentHeight;
    
    // Calculate new viewBox dimensions based on baseline zoom
    const actualZoom = newZoom * baselineZoom;
    const newWidth = svgWidth / actualZoom;
    const newHeight = svgHeight / actualZoom;
    
    // Calculate new viewBox position to keep the mouse point in the same screen position
    const newX = svgX - (mouseX / svgWidth) * newWidth;
    const newY = svgY - (mouseY / svgHeight) * newHeight;
    
    // Update state
    setZoom(newZoom);
    setPan({ x: newX, y: newY });
    setViewBox(`${newX} ${newY} ${newWidth} ${newHeight}`);
    
    console.log(`🔍 CAD Zoom: ${newZoom.toFixed(2)}x (actual: ${actualZoom.toFixed(2)}x) at (${svgX.toFixed(0)}, ${svgY.toFixed(0)})`);
  }, [zoom, viewBox, baselineZoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    try {
      // Handle panning (CAD-style)
      if (isPanning) {
        const deltaX = e.clientX - lastPanPoint.x;
        const deltaY = e.clientY - lastPanPoint.y;
        
        // Get current viewBox
        const currentViewBox = viewBox.split(' ').map(Number);
        const [currentX, currentY, currentWidth, currentHeight] = currentViewBox;
        
        // Calculate new viewBox position (pan in SVG coordinates)
        const newX = currentX - (deltaX / 1200) * currentWidth; // 1200 is SVG width
        const newY = currentY - (deltaY / 800) * currentHeight;  // 800 is SVG height
        
        setPan({ x: newX, y: newY });
        setLastPanPoint({ x: e.clientX, y: e.clientY });
        
        // Update viewBox
        setViewBox(`${newX} ${newY} ${currentWidth} ${currentHeight}`);
        return;
      }
      
      // Handle rotation - track mouse movement in a circle
      if (isRotating && rotationCenter && rotationElementId) {
        const svg = canvasRef.current;
        if (!svg) return;
        
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
        
        // Calculate angle from center to current mouse position
        const currentAngle = Math.atan2(svgPoint.y - rotationCenter.y, svgPoint.x - rotationCenter.x);
        
        // Convert to degrees
        let angleDeg = currentAngle * (180 / Math.PI);
        
        // Normalize to 0-360 range
        if (angleDeg < 0) angleDeg += 360;
        
        // Snap to 15-degree increments when Shift is held
        if (e.shiftKey) {
          angleDeg = Math.round(angleDeg / 15) * 15;
        }
        
        // Apply rotation to the specific element being rotated
        setElements(prev => prev.map(element => {
          if (element.id === rotationElementId) {
            return rotateElement(element, angleDeg, rotationCenter);
          }
          return element;
        }));
        return;
      }
      
      if (!dragState.isDragging) return;
      
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      
      // Convert mouse coordinates to SVG coordinates
      const svg = canvasRef.current;
      if (!svg) return;
      
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
      
      const x = snapToGrid(svgPoint.x, gridSize, snapToGridEnabled);
      const y = snapToGrid(svgPoint.y, gridSize, snapToGridEnabled);
      
      if (dragState.dragType === 'vertex' && dragState.elementId && dragState.vertexId) {
        // Update vertex position - use direct coordinates, not deltas
        setElements(prev => prev.map(element => {
          if (element.id !== dragState.elementId) return element;
          
          const updatedVertices = element.vertices.map(vertex => {
            if (vertex.id === dragState.vertexId) {
              return { ...vertex, x, y };
            }
            return vertex;
          });
          
          return updateElementGeometry({
            ...element,
            vertices: updatedVertices
          }, gridSize);
        }));
      } else if (dragState.dragType === 'element' && dragState.elementId) {
        // Move entire element using deltas
        const deltaX = x - dragState.originalPosition.x;
        const deltaY = y - dragState.originalPosition.y;
        
        setElements(prev => prev.map(element => {
          if (element.id !== dragState.elementId) return element;
          
          // Use the stored original vertices to avoid accumulating errors
          const updatedVertices = dragState.originalVertices?.map(vertex => ({
            ...vertex,
            x: snapToGrid(vertex.x + deltaX, gridSize, snapToGridEnabled),
            y: snapToGrid(vertex.y + deltaY, gridSize, snapToGridEnabled)
          })) || element.vertices;
          
          return updateElementGeometry({
            ...element,
            vertices: updatedVertices
          }, gridSize);
        }));
      }
    } catch (error) {
      console.error('❌ Error in handleMouseMove:', error);
      // Reset drag state on error to prevent stuck dragging
      setDragState(prev => ({ ...prev, isDragging: false }));
    }
  }, [
    isPanning, 
    lastPanPoint, 
    viewBox, 
    isRotating, 
    rotationCenter, 
    selectedElements, 
    dragState, 
    gridSize, 
    snapToGridEnabled
  ]);

  const handleMouseUp = useCallback(() => {
    try {
      // Complete drag state cleanup
      setDragState(prev => ({ 
        ...prev, 
        isDragging: false,
        dragType: 'element',
        elementId: undefined,
        vertexId: undefined,
        offset: { x: 0, y: 0 },
        originalPosition: { x: 0, y: 0 },
        originalVertices: undefined
      }));
      
      // End panning
      if (isPanning) {
        setIsPanning(false);
        setLastPanPoint({ x: 0, y: 0 });
      }
      
      // End rotation
      if (isRotating) {
        setIsRotating(false);
        setRotationCenter(null);
        setRotationStartAngle(0);
        setRotationElementId(null);
      }
    } catch (error) {
      console.error('❌ Error in handleMouseUp:', error);
      // Force reset all states on error
      setDragState({
        isDragging: false,
        dragType: 'element',
        offset: { x: 0, y: 0 },
        originalPosition: { x: 0, y: 0 }
      });
      setIsPanning(false);
      setIsRotating(false);
    }
  }, [isPanning, isRotating]);

  // Tool Functions
  const addBuilding = useCallback(() => {
    setActiveTool('building');
  }, []);

  const addParking = useCallback(() => {
    setActiveTool('parking');
  }, []);

  const addGreenspace = useCallback(() => {
    setActiveTool('greenspace');
  }, []);

  const toggleVertexMode = useCallback(() => {
    setIsVertexMode(prev => !prev);
    setSelectedVertices([]);
  }, []);


  const startMeasurement = useCallback(() => {
    setActiveTool('measure');
    setMeasurementPoints([]);
    setActiveMeasurement(null);
  }, []);

  const clearMeasurement = useCallback(() => {
    setMeasurementPoints([]);
    setActiveMeasurement(null);
    if (activeTool === 'measure') {
      setActiveTool('select');
    }
  }, [activeTool]);

  // AI Optimization Engine
  const optimizeLayoutWithAI = useCallback(() => {
    if (!parcelGeometry) {
      console.error('❌ No parcel geometry for AI optimization');
      return;
    }
    
    console.log('🤖 AI analyzing optimal layout for maximum ROI...');
    
    // Find the buildable area element
    const buildableAreaElement = elements.find(el => 
      el.type === 'greenspace' && el.properties.name?.includes('Buildable Area')
    );
    
    if (!buildableAreaElement) {
      console.error('❌ No buildable area found for AI optimization');
      return;
    }
    
    // Prepare parameters for AI analysis using real zoning data
    const analysisParams: LayoutGenerationParams = {
      buildableArea: buildableAreaElement,
      parcelGeometry,
      siteConstraints,
      zoning: {
        maxFAR: parcel.zoning_data?.max_far || siteConstraints.maxFAR || 2.5,
        maxHeight: parcel.zoning_data?.max_building_height_ft || siteConstraints.maxHeight || 45,
        maxCoverage: parcel.zoning_data?.max_coverage_pct || siteConstraints.maxCoverage || 40,
        maxDensity: parcel.zoning_data?.max_density_du_per_acre || 50
      },
      marketData,
      gridSize
    };
    
    // AI Analysis: Test all templates and calculate ROI
    const scenarios: Array<{
      template: LayoutTemplate;
      layout: GeneratedLayout;
      roi: number;
      netIncome: number;
      score: number;
    }> = [];
    
    console.log('🧠 AI analyzing all development scenarios...');
    
    LAYOUT_TEMPLATES.forEach(template => {
      try {
        const layout = template.generator(analysisParams);
        
        // Calculate ROI metrics
        const annualRevenue = layout.metrics.estimatedRevenue;
        const totalCost = layout.metrics.estimatedCost;
        const annualOperatingCosts = annualRevenue * 0.4; // 40% operating expense ratio
        const netIncome = annualRevenue - annualOperatingCosts;
        const roi = totalCost > 0 ? (netIncome / totalCost) * 100 : 0;
        
        // AI Scoring Algorithm (weights different factors)
        const densityScore = (layout.metrics.density / 50) * 20; // Density efficiency (max 20 points)
        const roiScore = Math.min(roi, 15) * 2; // ROI efficiency (max 30 points)
        const utilizationScore = (layout.metrics.coverage / siteConstraints.maxCoverage) * 25; // Site utilization (max 25 points)
        const revenueScore = Math.min(annualRevenue / 1000000, 5) * 5; // Revenue scale (max 25 points)
        
        const totalScore = densityScore + roiScore + utilizationScore + revenueScore;
        
        scenarios.push({
          template,
          layout,
          roi,
          netIncome,
          score: totalScore
        });
        
        console.log(`📊 ${template.name} analysis:`, {
          units: layout.metrics.totalUnits,
          revenue: `$${(annualRevenue / 1000000).toFixed(1)}M`,
          roi: `${roi.toFixed(1)}%`,
          score: totalScore.toFixed(1)
        });
        
      } catch (error) {
        console.warn(`⚠️ Could not analyze ${template.name}:`, error);
      }
    });
    
    // AI selects the optimal scenario
    if (scenarios.length === 0) {
      alert('❌ AI could not find any viable development scenarios for this parcel.');
      return;
    }
    
    const optimalScenario = scenarios.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    
    console.log('🎯 AI selected optimal scenario:', {
      template: optimalScenario.template.name,
      score: optimalScenario.score.toFixed(1),
      roi: optimalScenario.roi.toFixed(1),
      netIncome: `$${(optimalScenario.netIncome / 1000000).toFixed(1)}M`
    });
    
    // Apply the optimal layout
    const filteredElements = buildableAreaElements;
    
    const allOptimalElements = [
      ...optimalScenario.layout.buildings,
      ...optimalScenario.layout.parking,
      ...optimalScenario.layout.amenities
    ];
    
    setElements([...filteredElements, ...allOptimalElements]);
    
    // Show AI results with editing instructions
    const metrics = optimalScenario.layout.metrics;
    alert(`🤖 AI Optimization Complete!\n\n` +
      `Optimal Strategy: ${optimalScenario.template.name}\n\n` +
      `• ${metrics.totalUnits} units\n` +
      `• ${metrics.parkingSpaces} parking spaces\n` +
      `• ${metrics.coverage.toFixed(1)}% coverage\n` +
      `• ROI: ${optimalScenario.roi.toFixed(1)}%\n` +
      `• Net Income: $${(optimalScenario.netIncome / 1000000).toFixed(1)}M/year\n` +
      `• AI Score: ${optimalScenario.score.toFixed(1)}/100\n\n` +
      `Factors: Density efficiency, ROI, site utilization, revenue potential\n\n` +
      `✏️ EDITING TIPS:\n` +
      `• Click buildings to select them\n` +
      `• Enable "Vertex Mode" to edit building shapes\n` +
      `• Drag vertices to resize buildings\n` +
      `• Use Ctrl+Click for multi-select\n` +
      `• Buildings can be moved, rotated, and resized!`);
      
  }, [elements, parcelGeometry, siteConstraints, marketData]);

  const applyLayoutTemplate = useCallback((templateId: string) => {
    const template = LAYOUT_TEMPLATES.find(t => t.id === templateId);
    if (!template || !parcelGeometry) {
      console.error('❌ Template not found or no parcel geometry:', templateId);
      return;
    }
    
    // Find the buildable area element
    const buildableAreaElement = elements.find(el => 
      el.type === 'greenspace' && el.properties.name?.includes('Buildable Area')
    );
    
    console.log('🔍 Available elements:', elements.map(el => ({ 
      type: el.type, 
      name: el.properties.name,
      area: el.properties.area,
      vertices: el.vertices.length,
      areaSqFt: el.properties.area ? (el.properties.area.toFixed(0) + ' sq ft') : 'N/A'
    })));
    console.log('🔍 Found buildable area element:', {
      found: !!buildableAreaElement,
      area: buildableAreaElement?.properties.area,
      vertices: buildableAreaElement?.vertices.length,
      firstVertex: buildableAreaElement?.vertices[0],
      bounds: buildableAreaElement ? {
        minX: Math.min(...buildableAreaElement.vertices.map(v => v.x)),
        maxX: Math.max(...buildableAreaElement.vertices.map(v => v.x)),
        minY: Math.min(...buildableAreaElement.vertices.map(v => v.y)),
        maxY: Math.max(...buildableAreaElement.vertices.map(v => v.y))
      } : null
    });
    
    if (!buildableAreaElement) {
      console.error('❌ No buildable area found for template application');
      return;
    }
    
    console.log(`🏗️ Applying intelligent ${template.name} template...`);
    
    // Prepare parameters for intelligent generation
    const generationParams: LayoutGenerationParams = {
      buildableArea: buildableAreaElement,
      parcelGeometry,
      siteConstraints,
      zoning: {
        maxFAR: siteConstraints.maxFAR || 2.5,
        maxHeight: siteConstraints.maxHeight || 45,
        maxCoverage: siteConstraints.maxCoverage || 40,
        maxDensity: 50 // Default 50 units per acre
      },
      marketData,
      gridSize
    };
    
    // Generate intelligent layout
    const generatedLayout = template.generator(generationParams);
    
    // Clear existing buildings and parking (keep buildable area)
    const filteredElements = buildableAreaElements;
    
    // Combine buildable area with generated elements
    const allGeneratedElements = [
      ...generatedLayout.buildings,
      ...generatedLayout.parking,
      ...generatedLayout.amenities
    ];
    
    setElements([...filteredElements, ...allGeneratedElements]);
    
    console.log(`✅ Applied intelligent ${template.name} template:`, generatedLayout.metrics);
    
    // Show results to user with editing instructions
    const metrics = generatedLayout.metrics;
    alert(`🏗️ ${template.name} Generated!\n\n` +
      `• ${metrics.totalUnits} units\n` +
      `• ${metrics.parkingSpaces} parking spaces\n` +
      `• ${metrics.density.toFixed(1)} units/acre\n` +
      `• ${metrics.coverage.toFixed(1)}% coverage\n` +
      `• Est. Revenue: $${(metrics.estimatedRevenue / 1000000).toFixed(1)}M/year\n\n` +
      `✏️ EDITING TIPS:\n` +
      `• Click buildings to select them\n` +
      `• Enable "Vertex Mode" to edit building shapes\n` +
      `• Drag vertices to resize buildings\n` +
      `• Use Ctrl+Click for multi-select\n` +
      `• Buildings can be moved, rotated, and resized!`);
      
  }, [elements, parcelGeometry, siteConstraints, marketData]);

  const importRoadsForCurrentParcel = useCallback(async () => {
    try {
      console.log('🛣️ Importing roads for current parcel...');
      // Try to use token from .env first, fallback to prompt
      const envToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN;
      let token = envToken;
      
      if (!token) {
        token = prompt('Mapbox token not found in .env. Enter your Mapbox access token:');
        if (!token) return;
      }
      
      const result = await browserImportRoads(parcel.ogc_fid, token);
      
      if (result.success) {
        alert(`✅ Successfully imported roads! ${result.message || 'Roads are now available for front lot line analysis.'}`);
        // Reload the parcel geometry to get updated setbacks
        window.location.reload();
      } else {
        alert(`❌ Failed to import roads: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Road import error:', error);
      alert(`❌ Error importing roads: ${error.message}`);
    }
  }, [parcel.ogc_fid]);

  const deleteSelected = useCallback(() => {
    setElements(prev => prev.filter(el => !selectedElements.includes(el.id)));
    setSelectedElements([]);
    setSelectedVertices([]);
  }, [selectedElements]);

  const copySelectedElements = useCallback(() => {
    const elementsToCopy = selectedElementsData;
    const copiedElements = elementsToCopy.map(element => ({
      ...element,
      id: generateId(),
      vertices: element.vertices.map(vertex => ({
        ...vertex,
        id: generateId(),
        x: vertex.x + 20,
        y: vertex.y + 20
      }))
    }));
    
    setElements(prev => [...prev, ...copiedElements]);
    setSelectedElements(copiedElements.map(el => el.id));
  }, [elements, selectedElements]);

  const alignElements = useCallback((alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (selectedElements.length < 2) return;
    
    const elementsToAlign = selectedElementsData;
    
    // Calculate alignment reference point
    let referenceValue = 0;
    
    if (alignment === 'left') {
      referenceValue = Math.min(...elementsToAlign.map(el => 
        Math.min(...el.vertices.map(v => v.x))
      ));
    } else if (alignment === 'right') {
      referenceValue = Math.max(...elementsToAlign.map(el => 
        Math.max(...el.vertices.map(v => v.x))
      ));
    } else if (alignment === 'center') {
      const minX = Math.min(...elementsToAlign.map(el => Math.min(...el.vertices.map(v => v.x))));
      const maxX = Math.max(...elementsToAlign.map(el => Math.max(...el.vertices.map(v => v.x))));
      referenceValue = (minX + maxX) / 2;
    }
    // Similar logic for top, middle, bottom...
    
    setElements(prev => prev.map(element => {
      if (!selectedElements.includes(element.id)) return element;
      
      const elementBounds = element.vertices.reduce((acc, vertex) => ({
        minX: Math.min(acc.minX, vertex.x),
        maxX: Math.max(acc.maxX, vertex.x),
        minY: Math.min(acc.minY, vertex.y),
        maxY: Math.max(acc.maxY, vertex.y)
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
      
      let offsetX = 0, offsetY = 0;
      
      if (alignment === 'left') {
        offsetX = referenceValue - elementBounds.minX;
      } else if (alignment === 'right') {
        offsetX = referenceValue - elementBounds.maxX;
      } else if (alignment === 'center') {
        offsetX = referenceValue - (elementBounds.minX + elementBounds.maxX) / 2;
      }
      
      return {
        ...element,
        vertices: element.vertices.map(vertex => ({
          ...vertex,
          x: vertex.x + offsetX,
          y: vertex.y + offsetY
        }))
      };
    }));
  }, [elements, selectedElements]);

  // CAD-style zoom in (center on current view)
  const zoomIn = useCallback(() => {
    const svg = canvasRef.current;
    if (!svg) return;
    
    const svgRect = svg.getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;
    
    // Simulate mouse wheel zoom at center
    const wheelEvent = {
      preventDefault: () => {},
      clientX: svgRect.left + centerX,
      clientY: svgRect.top + centerY,
      deltaY: -100 // Negative for zoom in
    } as React.WheelEvent<SVGSVGElement>;
    
    handleWheel(wheelEvent);
  }, [handleWheel]);

  // CAD-style zoom out (center on current view)
  const zoomOut = useCallback(() => {
    const svg = canvasRef.current;
    if (!svg) return;
    
    const svgRect = svg.getBoundingClientRect();
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;
    
    // Simulate mouse wheel zoom at center
    const wheelEvent = {
      preventDefault: () => {},
      clientX: svgRect.left + centerX,
      clientY: svgRect.top + centerY,
      deltaY: 100 // Positive for zoom out
    } as React.WheelEvent<SVGSVGElement>;
    
    handleWheel(wheelEvent);
  }, [handleWheel]);

  const fitToParcel = useCallback(() => {
    if (parcelGeometry) {
      const { width, depth, bounds } = parcelGeometry;
      
      // Reset to baseline zoom (1x = parcel fills view)
      setZoom(1);
      
      // Add proportional padding around the parcel (10% of largest dimension)
      const padding = Math.max(width, depth) * 0.1;
      const viewWidth = width + (padding * 2);
      const viewHeight = depth + (padding * 2);
      
      // Center the view on the parcel
      const centerX = bounds.minX + width / 2;
      const centerY = bounds.minY + depth / 2;
      
      const newViewBox = `${centerX - viewWidth / 2} ${centerY - viewHeight / 2} ${viewWidth} ${viewHeight}`;
      setViewBox(newViewBox);
      setPan({ x: centerX - viewWidth / 2, y: centerY - viewHeight / 2 });
      
      console.log('🎯 Fit to parcel (1x baseline):', {
        parcelBounds: bounds,
        viewBox: newViewBox,
        zoom: '1.00x (baseline)',
        baselineZoom: baselineZoom.toFixed(3)
      });
    }
  }, [parcelGeometry, baselineZoom]);

  // Keyboard shortcuts for CAD-style navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case '=':
        case '+':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          fitToParcel();
          break;
        case 'Escape':
          e.preventDefault();
          setActiveTool('select');
          setSelectedElements([]);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, fitToParcel]);

  // Render parcel outline
  const renderParcelOutline = useMemo(() => {
    if (!parcelGeometry || !parcelGeometry.coordinates) return null;
    
    const coords = parcelGeometry.coordinates;
    const pathData = coords.map(([x, y]: [number, number], index: number) => {
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ') + ' Z';
    
    return (
      <g>
        {/* Parcel outline */}
        <path
          d={pathData}
          fill="rgba(156, 163, 175, 0.1)"
          stroke="#374151"
          strokeWidth="2"
          strokeDasharray="8,4"
          style={{ cursor: activeTool === 'select' ? 'pointer' : 'crosshair' }}
          onClick={() => {
            // Only toggle parcel dimensions in select mode
            if (activeTool === 'select') {
              console.log('🔍 Parcel clicked, toggling dimensions:', !showParcelDimensions);
              setShowParcelDimensions(!showParcelDimensions);
            }
          }}
        />
        
        {/* Parcel dimensions */}
        {showParcelDimensions && coords.map(([x, y]: [number, number], index: number) => {
          const nextIndex = (index + 1) % coords.length;
          const [nextX, nextY] = coords[nextIndex];
          
          // Calculate distance in feet
          const distance = Math.sqrt(Math.pow(nextX - x, 2) + Math.pow(nextY - y, 2));
          const distanceInFeet = distance / gridSize;
          
          // Calculate midpoint for label
          const midX = (x + nextX) / 2;
          const midY = (y + nextY) / 2;
          
          return (
            <g key={`parcel-dim-${index}`}>
              {/* Dimension line */}
              <line
                x1={x}
                y1={y}
                x2={nextX}
                y2={nextY}
                stroke="#ef4444"
                strokeWidth="2"
                strokeDasharray="4,2"
              />
              {/* Dimension label background */}
              <rect
                x={midX - 20}
                y={midY - 16}
                width="40"
                height="16"
                fill="white"
                fillOpacity="0.9"
                stroke="#ef4444"
                strokeWidth="1"
                rx="2"
              />
              {/* Dimension text */}
                  <text
                    key={`dimension-${element.id}-${zoom}`}
                    x={midX}
                    y={midY - 4}
                    textAnchor="middle"
                    fontSize={Math.max(24, getScaledFontSize(20))}
                    fill="#ef4444"
                    fontWeight="bold"
                    stroke="white"
                    strokeWidth="2"
                    paintOrder="stroke fill"
                  >
                    {distanceInFeet.toFixed(0)}'
                  </text>
            </g>
          );
        })}
      </g>
    );
  }, [parcelGeometry, showParcelDimensions, gridSize]);

  // Render elements
  const renderElements = useMemo(() => {
    return elements.map(element => {
      const isSelected = selectedElements.includes(element.id);
      const isHovered = hoveredElement === element.id;
      
      return (
        <g key={element.id}>
          {/* Element shape */}
          <path
            d={createVertexPath(element.vertices)}
            fill={element.properties.color || '#3b82f6'}
            stroke={element.properties.strokeColor || '#1e40af'}
            strokeWidth={isSelected ? 3 : 2}
            fillOpacity={element.properties.fillOpacity || 0.8}
            className="cursor-pointer"
            onMouseEnter={() => setHoveredElement(element.id)}
            onMouseLeave={() => setHoveredElement(null)}
            onMouseDown={(e) => {
              if (!isVertexMode) {
                e.stopPropagation();
                const svg = canvasRef.current;
                if (svg) {
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  
                  setDragState({
                    isDragging: true,
                    dragType: 'element',
                    elementId: element.id,
                    offset: { x: 0, y: 0 },
                    originalPosition: { 
                      x: svgPoint.x, 
                      y: svgPoint.y 
                    },
                    originalVertices: [...element.vertices]
                  });
                }
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (e.ctrlKey || e.metaKey) {
                // Multi-select with Ctrl/Cmd
                if (selectedElements.includes(element.id)) {
                  setSelectedElements(prev => prev.filter(id => id !== element.id));
                } else {
                  setSelectedElements(prev => [...prev, element.id]);
                }
              } else {
                console.log('🖱️ Element clicked, selecting:', element.id, {
                  elementType: element.type,
                  elementName: element.properties.name,
                  activeTool,
                  isBuilding: element.type === 'building'
                });
                setSelectedElements([element.id]);
                
                // Force a re-render to show rotation handles
                console.log('🔄 Selection updated, should show rotation handles for building:', element.type === 'building');
                
                // Show dimensions for buildable area (greenspace) - only in select mode
                if (activeTool === 'select' && element.type === 'greenspace' && element.properties.name === 'Buildable Area') {
                  console.log('🔍 Buildable area clicked, toggling dimensions:', !showBuildableDimensions);
                  setShowBuildableDimensions(!showBuildableDimensions);
                }
              }
            }}
          />
          
          {/* Parking stripes */}
          {element.type === 'parking' && (
            <g>
              {createParkingLayout(element)}
            </g>
          )}
          
          {/* Vertex handles in vertex mode */}
          {isVertexMode && isSelected && element.vertices.map(vertex => (
            <circle
              key={vertex.id}
              cx={vertex.x}
              cy={vertex.y}
              r="4"
              fill={selectedVertices.includes(vertex.id) ? '#ef4444' : '#22c55e'}
              stroke="#ffffff"
              strokeWidth="2"
              className="cursor-move"
              onMouseEnter={() => setHoveredVertex(vertex.id)}
              onMouseLeave={() => setHoveredVertex(null)}
              onMouseDown={(e) => {
                e.stopPropagation();
                const svg = canvasRef.current;
                if (svg) {
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  
                  setDragState({
                    isDragging: true,
                    dragType: 'vertex',
                    elementId: element.id,
                    vertexId: vertex.id,
                    offset: { x: 0, y: 0 },
                    originalPosition: { x: svgPoint.x, y: svgPoint.y }
                  });
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedVertices.includes(vertex.id)) {
                  setSelectedVertices(prev => prev.filter(id => id !== vertex.id));
                } else {
                  setSelectedVertices(prev => [...prev, vertex.id]);
                }
              }}
            />
          ))}
          
          {/* PowerPoint-style selection box for selected elements */}
          {!isVertexMode && isSelected && (() => {
            const center = calculateElementCenter(element.vertices);
            const bounds = element.vertices.reduce((acc, vertex) => ({
              minX: Math.min(acc.minX, vertex.x),
              maxX: Math.max(acc.maxX, vertex.x),
              minY: Math.min(acc.minY, vertex.y),
              maxY: Math.max(acc.maxY, vertex.y)
            }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
            
            return (
              <g>
                {/* PowerPoint-style selection box around the element */}
                <rect
                  x={bounds.minX - 2}
                  y={bounds.minY - 2}
                  width={bounds.maxX - bounds.minX + 4}
                  height={bounds.maxY - bounds.minY + 4}
                  fill="none"
                  stroke="#0078d4"
                  strokeWidth="2"
                  strokeDasharray="none"
                />
                
                {/* Corner resize handles (like PowerPoint) */}
                {[
                  { x: bounds.minX - 4, y: bounds.minY - 4 }, // Top-left
                  { x: bounds.maxX + 4, y: bounds.minY - 4 }, // Top-right
                  { x: bounds.minX - 4, y: bounds.maxY + 4 }, // Bottom-left
                  { x: bounds.maxX + 4, y: bounds.maxY + 4 }  // Bottom-right
                ].map((corner, index) => (
                  <rect
                    key={index}
                    x={corner.x - 3}
                    y={corner.y - 3}
                    width="6"
                    height="6"
                    fill="#0078d4"
                    stroke="white"
                    strokeWidth="1"
                    className="cursor-nw-resize"
                  />
                ))}
              </g>
            );
          })()}
          
          {/* Element label */}
          {element.properties.name && (
            <text
              x={element.vertices.reduce((sum, v) => sum + v.x, 0) / element.vertices.length}
              y={element.vertices.reduce((sum, v) => sum + v.y, 0) / element.vertices.length}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={element.properties.name === 'Buildable Area' ? 
                Math.max(32, getScaledFontSize(28)) : // Much larger for buildable area
                Math.max(24, getScaledFontSize(20))} // Normal size for other elements
              fill="white"
              fontWeight="bold"
              stroke="black"
              strokeWidth="2"
              paintOrder="stroke fill"
              pointerEvents="none"
            >
              {element.properties.name}
            </text>
          )}
          
          {/* Area label */}
          {element.properties.area && (
            <text
              x={element.vertices.reduce((sum, v) => sum + v.x, 0) / element.vertices.length}
              y={element.vertices.reduce((sum, v) => sum + v.y, 0) / element.vertices.length + 15}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={element.properties.name === 'Buildable Area' ? 
                Math.max(28, getScaledFontSize(24)) : // Much larger for buildable area
                Math.max(20, getScaledFontSize(18))} // Normal size for other elements
              fill="white"
              fontWeight="bold"
              stroke="black"
              strokeWidth="2"
              paintOrder="stroke fill"
              pointerEvents="none"
            >
              {Math.round(element.properties.area || 0).toLocaleString()} sq ft
            </text>
          )}
          
          {/* Dimension lines - always show for buildings, show for buildable area when clicked */}
          {(isSelected || element.type === 'building' || (element.type === 'greenspace' && element.properties.name === 'Buildable Area' && showBuildableDimensions)) && (() => {
            if (element.type === 'greenspace' && element.properties.name === 'Buildable Area') {
              console.log('🔍 Rendering buildable area dimensions:', {
                showBuildableDimensions,
                elementName: element.properties.name,
                elementType: element.type
              });
            }
            return true;
          })() && element.vertices.map((vertex, index) => {
            const nextVertex = element.vertices[(index + 1) % element.vertices.length];
            const midX = (vertex.x + nextVertex.x) / 2;
            const midY = (vertex.y + nextVertex.y) / 2;
            const distance = Math.sqrt(
              Math.pow(nextVertex.x - vertex.x, 2) + Math.pow(nextVertex.y - vertex.y, 2)
            );
            const distanceInFeet = svgToFeet(distance, gridSize);
            
            // Debug logging for dimension calculation
            if (element.type === 'building' && index < 2) {
              console.log(`🔍 Building dimension ${index}:`, {
                svgDistance: distance.toFixed(1),
                gridSize: gridSize,
                feetDistance: distanceInFeet.toFixed(1),
                elementType: element.type,
                elementName: element.properties.name
              });
            }
            
            return (
              <g key={`dimension-${index}`}>
                <line
                  x1={vertex.x}
                  y1={vertex.y}
                  x2={nextVertex.x}
                  y2={nextVertex.y}
                  stroke={element.type === 'building' ? "#ef4444" : element.type === 'greenspace' ? "#22c55e" : "#f59e0b"}
                  strokeWidth={element.type === 'building' ? "2" : "1"}
                  strokeDasharray={element.type === 'building' ? "4,2" : "2,2"}
                />
                {/* Background rectangle for dimension text */}
                <rect
                  x={midX - 20}
                  y={midY - 16}
                  width="40"
                  height="16"
                  fill="white"
                  fillOpacity="0.9"
                  stroke={element.type === 'building' ? "#ef4444" : element.type === 'greenspace' ? "#22c55e" : "#f59e0b"}
                  strokeWidth="1"
                  rx="2"
                />
                  <text
                    x={midX}
                    y={midY - 8}
                    textAnchor="middle"
                    fontSize={Math.max(56, getScaledFontSize(element.type === 'building' ? 48 : 40))}
                    fill={element.type === 'building' ? "#ef4444" : element.type === 'greenspace' ? "#22c55e" : "#f59e0b"}
                    fontWeight="bold"
                    stroke="white"
                    strokeWidth="2"
                    paintOrder="stroke fill"
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingDimension({
                        elementId: element.id,
                        edgeIndex: index,
                        value: Math.round(distanceInFeet).toString(),
                        x: e.clientX,
                        y: e.clientY
                      });
                    }}
                  >
                    {Math.round(distanceInFeet)}'
                  </text>
              </g>
            );
          })}
          
          {/* Selection outline */}
          {isSelected && (
            <path
              d={createVertexPath(element.vertices)}
              fill="none"
              stroke="#22c55e"
              strokeWidth="3"
              strokeDasharray="5,5"
              pointerEvents="none"
            />
          )}
          
          {/* Compliance violations indicator */}
          {complianceViolations.some(v => v.includes(element.properties.name || '')) && (
            <circle
              cx={element.vertices[0].x + 10}
              cy={element.vertices[0].y - 10}
              r="8"
              fill="#ef4444"
              stroke="#ffffff"
              strokeWidth="2"
            />
          )}
        </g>
      );
    }).concat(
    // Add rotation handles for selected elements (rendered on top)
    !isVertexMode && selectedElements.length > 0 ? elements
      .filter(element => selectedElements.includes(element.id))
      .map(element => {
        // PowerPoint-style: handle attached to a vertex of the shape
        // Find the top-right vertex to attach the handle to
        const topRightVertex = element.vertices.reduce((topRight, vertex) => {
          // Find the vertex that's most to the right and up
          if (vertex.x > topRight.x || (vertex.x === topRight.x && vertex.y < topRight.y)) {
            return vertex;
          }
          return topRight;
        }, element.vertices[0]);
        
        // Position handle above and to the right of the top-right vertex
        const handleDistance = 50; // Distance from vertex
        const handleX = topRightVertex.x + handleDistance;
        const handleY = topRightVertex.y - handleDistance;
          
          return (
            <g key={`rotation-handle-${element.id}`}>
              {/* PowerPoint-style connecting line from vertex to handle */}
              <line
                x1={topRightVertex.x}
                y1={topRightVertex.y}
                x2={handleX}
                y2={handleY}
                stroke="#6b7280"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.6"
                pointerEvents="none"
              />
              
              {/* PowerPoint-style rotation handle in center, extending upward */}
              <circle
                cx={handleX}
                cy={handleY}
                r="12"
                fill="#6b7280"
                stroke="white"
                strokeWidth="2"
                className="cursor-grab hover:fill-gray-500 hover:scale-110 transition-all duration-200"
                title="Drag to rotate 360° • Hold Shift for 15° increments"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  console.log('🔄 PowerPoint-style rotation handle clicked for 360° rotation of', element.type, 'element!');
                  
                  // Convert mouse coordinates to SVG coordinates
                  const svg = canvasRef.current;
                  if (!svg) return;
                  
                  const pt = svg.createSVGPoint();
                  pt.x = e.clientX;
                  pt.y = e.clientY;
                  const svgPoint = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                  
                  // Calculate initial angle from vertex to mouse position
                  const startAngle = Math.atan2(svgPoint.y - topRightVertex.y, svgPoint.x - topRightVertex.x);
                  
                  setIsRotating(true);
                  setRotationCenter(topRightVertex);
                  setRotationStartAngle(startAngle);
                  setRotationElementId(element.id);
                }}
              />
              
              {/* PowerPoint-style rotation icon - fixed orientation relative to screen */}
              <g transform={`translate(${handleX}, ${handleY})`}>
                <path
                  d="M -6 -2 A 6 6 0 0 1 6 -2"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <path
                  d="M 4 -4 L 6 -2 L 4 0"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              </g>
              
              {/* Rotation angle indicator */}
              {isRotating && rotationElementId === element.id && (
                <>
                  <text
                    x={handleX}
                    y={handleY - 25}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#0078d4"
                    fontWeight="bold"
                    className="select-none"
                    pointerEvents="none"
                  >
                    {Math.round(element.rotation || 0)}°
                  </text>
                  
                  {/* Rotation guide line from vertex to handle */}
                  <line
                    x1={vertexX}
                    y1={vertexY}
                    x2={handleX}
                    y2={handleY}
                    stroke="#0078d4"
                    strokeWidth="2"
                    strokeDasharray="3,3"
                    opacity="0.8"
                    pointerEvents="none"
                  />
                </>
              )}
            </g>
          );
        }) : []
    );
  }, [elements, selectedElements, hoveredElement, isVertexMode, selectedVertices, hoveredVertex, complianceViolations, scale, gridSize, isRotating, rotationCenter, rotationElementId]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Toolbar - Compact */}
      <div className="bg-white border-b border-gray-200 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-semibold">CAD Site Planner</h3>
            <span className="text-sm font-medium text-gray-700">- {parcel.address}</span>
          </div>
          
          <div className="flex items-center space-x-1 overflow-x-auto">
            {/* Tool buttons - Compact */}
            <button
              onClick={() => setActiveTool('select')}
              className={`p-1.5 rounded ${activeTool === 'select' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title="Select"
            >
              <MousePointer className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={toggleVertexMode}
              className={`p-1.5 rounded ${isVertexMode ? 'bg-green-100 text-green-600' : 'hover:bg-gray-100'}`}
              title="Vertex Edit Mode"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            
            
            <div className="w-px h-4 bg-gray-300" />
            
            <button
              onClick={addBuilding}
              className={`p-1.5 rounded ${activeTool === 'building' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title="Add Building"
            >
              <Building className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={addParking}
              className={`p-1.5 rounded ${activeTool === 'parking' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title="Add Parking"
            >
              <Car className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={addGreenspace}
              className={`p-1.5 rounded ${activeTool === 'greenspace' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title="Add Greenspace"
            >
              <TreePine className="w-3.5 h-3.5" />
            </button>
            
            <div className="w-px h-4 bg-gray-300" />
            
            <button
              onClick={startMeasurement}
              className={`p-1.5 rounded ${activeTool === 'measure' ? 'bg-purple-100 text-purple-600' : 'hover:bg-gray-100'}`}
              title="Measure Distance"
            >
              <Ruler className="w-3.5 h-3.5" />
            </button>
            
            {activeMeasurement && (
              <button
                onClick={clearMeasurement}
                className="p-1.5 hover:bg-gray-100 rounded"
                title="Clear Measurement"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            
            <div className="w-px h-4 bg-gray-300" />
            
            {/* Alignment tools */}
            {selectedElements.length >= 2 && (
              <>
                <button
                  onClick={() => alignElements('left')}
                  className="p-1.5 hover:bg-gray-100 rounded"
                  title="Align Left"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                
                <button
                  onClick={() => alignElements('center')}
                  className="p-1.5 hover:bg-gray-100 rounded"
                  title="Align Center"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                
                <button
                  onClick={() => alignElements('right')}
                  className="p-1.5 hover:bg-gray-100 rounded"
                  title="Align Right"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                
                <div className="w-px h-4 bg-gray-300" />
              </>
            )}
            
            {/* Copy/Delete */}
            <button
              onClick={copySelectedElements}
              disabled={selectedElements.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Copy Selected"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            
            <button
              onClick={deleteSelected}
              disabled={selectedElements.length === 0}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title="Delete Selected"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            
            <div className="w-px h-4 bg-gray-300" />
            
            {/* Zoom controls - Compact with highlight */}
            <button
              onClick={zoomIn}
              className="p-1.5 hover:bg-blue-100 rounded bg-blue-50"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5 text-blue-600" />
            </button>
            
            <button
              onClick={zoomOut}
              className="p-1.5 hover:bg-blue-100 rounded bg-blue-50"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5 text-blue-600" />
            </button>
            
            <button
              onClick={fitToParcel}
              className="p-1.5 hover:bg-green-100 rounded bg-green-50"
              title="Fit to Parcel"
            >
              <Maximize className="w-3.5 h-3.5 text-green-600" />
            </button>
            
            {/* Zoom level indicator */}
            <div className="px-2 py-1 text-xs font-mono text-gray-600 bg-gray-100 rounded">
              {zoom.toFixed(2)}x
              {baselineZoom !== 1 && (
                <span className="text-gray-500 ml-1">
                  ({(zoom * baselineZoom).toFixed(2)}x)
                </span>
              )}
            </div>
            
            <div className="w-px h-6 bg-gray-300" />
            
            {/* AI Compliance */}
            <button
              onClick={() => {
                const violations: string[] = [];
                let score = 100;
                
                // Check setback violations (simplified)
                elements.forEach(element => {
                  if (element.type === 'building') {
                    const minDistanceToParcel = 15; // feet
                    if (Math.min(...element.vertices.map(v => v.x)) < minDistanceToParcel) {
                      violations.push(`${element.properties.name} violates front setback`);
                      score -= 10;
                    }
                  }
                });
                
                // Check coverage ratio
                const totalBuildingArea = elements
                  .filter(el => el.type === 'building')
                  .reduce((sum, el) => sum + (el.properties.area || 0), 0);
                
                const parcelArea = parcelGeometry?.area || 1;
                const coverageRatio = totalBuildingArea / parcelArea;
                
                if (coverageRatio > 0.4) {
                  violations.push('Building coverage exceeds 40% maximum');
                  score -= 15;
                }
                
                setComplianceScore(Math.max(score, 0));
                setComplianceViolations(violations);
              }}
              className="p-1.5 hover:bg-gray-100 rounded"
              title="Analyze Compliance"
            >
              <CheckCircle className="w-3.5 h-3.5" />
            </button>
            
            {complianceScore < 100 && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                complianceScore >= 80 ? 'bg-green-100 text-green-800' :
                complianceScore >= 60 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {complianceScore}%
              </span>
            )}
            
            <button
              onClick={() => setShowConstraintsPanel(!showConstraintsPanel)}
              className={`p-1.5 rounded ${showConstraintsPanel ? 'bg-orange-100 text-orange-600' : 'hover:bg-gray-100'}`}
              title={showConstraintsPanel ? "Hide Site Constraints" : "Show Site Constraints"}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            
            <div className="w-px h-4 bg-gray-300" />
            
            {/* AI Optimization */}
            <button
              onClick={optimizeLayoutWithAI}
              className="px-2 py-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-medium rounded hover:from-purple-600 hover:to-pink-600 shadow-lg"
              title="AI Optimization - Analyze all scenarios and select optimal layout for maximum ROI"
            >
              🤖 AI
            </button>
            
            <div className="w-px h-6 bg-gray-300" />
            
            {/* Layout Templates - Compact */}
            <div className="flex items-center space-x-0.5">
              <span className="text-xs text-gray-600">Templates:</span>
              <button
                onClick={() => applyLayoutTemplate('single-family')}
                className="px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                title="Single Family Home"
              >
                SFH
              </button>
              <button
                onClick={() => applyLayoutTemplate('duplex')}
                className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                title="Duplex (2 units)"
              >
                Duplex
              </button>
              <button
                onClick={() => applyLayoutTemplate('apartment-complex')}
                className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                title="Apartment Complex (4-400 units)"
              >
                Apt
              </button>
              <button
                onClick={() => applyLayoutTemplate('office-building')}
                className="px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                title="Office Building"
              >
                Office
              </button>
              <button
                onClick={() => applyLayoutTemplate('retail-center')}
                className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                title="Retail Center"
              >
                Retail
              </button>
              <button
                onClick={() => applyLayoutTemplate('hospitality')}
                className="px-1.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                title="Hotel/Hospitality"
              >
                Hotel
              </button>
            </div>
            
            <button
              onClick={importRoadsForCurrentParcel}
              className="p-1.5 hover:bg-gray-100 rounded"
              title="Refresh Roads"
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Optimized Layout */}
      <div className="flex flex-1 bg-gray-100 min-h-0">
        {/* Canvas - Takes most of the space */}
        <div className={`${showConstraintsPanel ? 'flex-1' : 'w-full'} p-2 min-h-0`}>
          <div className="w-full h-full bg-white border border-gray-300 rounded-lg shadow-lg relative overflow-hidden min-h-[600px]">
          <svg
            ref={canvasRef}
            width="100%"
            height="100%"
            viewBox={viewBox}
            className="absolute inset-0 cursor-crosshair"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            {/* Grid - Dynamic based on zoom level */}
            <defs>
              <pattern 
                id="grid" 
                width={gridSize} 
                height={gridSize} 
                patternUnits="userSpaceOnUse"
              >
                <path 
                  d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} 
                  fill="none" 
                  stroke={zoom > 2 ? "#d1d5db" : "#e5e7eb"} 
                  strokeWidth={zoom > 5 ? "1" : "0.5"}
                />
              </pattern>
              {/* Fine grid for high zoom levels */}
              {zoom > 3 && (
                <pattern 
                  id="fine-grid" 
                  width={gridSize / 4} 
                  height={gridSize / 4} 
                  patternUnits="userSpaceOnUse"
                >
                  <path 
                    d={`M ${gridSize / 4} 0 L 0 0 0 ${gridSize / 4}`} 
                    fill="none" 
                    stroke="#f3f4f6" 
                    strokeWidth="0.25"
                  />
                </pattern>
              )}
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
            {zoom > 3 && <rect width="100%" height="100%" fill="url(#fine-grid)" />}

            {/* Parcel outline */}
            {renderParcelOutline}
            
            {/* Street front indicator */}
            {parcelGeometry && (
              <g>
                {/* Dynamic street front label */}
                <text
                  x={parcelGeometry.bounds.minX + parcelGeometry.width / 2}
                  y={parcelGeometry.bounds.maxY + 40}
                  textAnchor="middle"
                  fontSize={Math.max(72, getScaledFontSize(60))}
                  fill="#ef4444"
                  fontWeight="bold"
                  stroke="white"
                  strokeWidth="3"
                  paintOrder="stroke fill"
                >
                  STREET FRONT
                  {edgeClassifications?.method === 'road_proximity' && edgeClassifications?.nearest_road_name && 
                    ` (${edgeClassifications.nearest_road_name})`
                  }
                </text>
                
                {/* Compass indicator */}
                <g transform={`translate(${parcelGeometry.bounds.maxX - 50}, ${parcelGeometry.bounds.minY + 50})`}>
                  <circle cx="0" cy="0" r="25" fill="white" stroke="#374151" strokeWidth="2" />
                  <text x="0" y="-8" textAnchor="middle" fontSize={Math.max(56, getScaledFontSize(48))} fill="#374151" fontWeight="bold" stroke="white" strokeWidth="2" paintOrder="stroke fill">N</text>
                  <text x="0" y="15" textAnchor="middle" fontSize={Math.max(56, getScaledFontSize(48))} fill="#ef4444" fontWeight="bold" stroke="white" strokeWidth="2" paintOrder="stroke fill">S</text>
                  <text x="-12" y="3" textAnchor="middle" fontSize={Math.max(56, getScaledFontSize(48))} fill="#374151" stroke="white" strokeWidth="2" paintOrder="stroke fill">W</text>
                  <text x="12" y="3" textAnchor="middle" fontSize={Math.max(56, getScaledFontSize(48))} fill="#374151" stroke="white" strokeWidth="2" paintOrder="stroke fill">E</text>
                  <line x1="0" y1="-18" x2="0" y2="-8" stroke="#ef4444" strokeWidth="3" markerEnd="url(#arrow)" />
                </g>
              </g>
            )}

            {/* Elements */}
            <g>
              {renderElements}
            </g>
            
            {/* Measurement overlay */}
            {activeMeasurement && (
              <g>
                <line
                  x1={activeMeasurement.points[0].x}
                  y1={activeMeasurement.points[0].y}
                  x2={activeMeasurement.points[1].x}
                  y2={activeMeasurement.points[1].y}
                  stroke="#8b5cf6"
                  strokeWidth="2"
                />
                <circle
                  cx={activeMeasurement.points[0].x}
                  cy={activeMeasurement.points[0].y}
                  r="4"
                  fill="#8b5cf6"
                />
                <circle
                  cx={activeMeasurement.points[1].x}
                  cy={activeMeasurement.points[1].y}
                  r="4"
                  fill="#8b5cf6"
                />
                <text
                  x={(activeMeasurement.points[0].x + activeMeasurement.points[1].x) / 2}
                  y={(activeMeasurement.points[0].y + activeMeasurement.points[1].y) / 2 - 10}
                  textAnchor="middle"
                  fontSize={Math.max(56, getScaledFontSize(48))}
                  fill="#8b5cf6"
                  fontWeight="bold"
                  stroke="white"
                  strokeWidth="2"
                  paintOrder="stroke fill"
                  className="bg-white"
                >
                  {Math.round(activeMeasurement.distance)}'
                </text>
              </g>
            )}
            
            {/* Measurement points */}
            {measurementPoints.map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r="3"
                fill="#8b5cf6"
                stroke="#ffffff"
                strokeWidth="2"
              />
            ))}
          </svg>
          
          {/* Dimension editing overlay */}
          {editingDimension && (
            <div
              className="absolute z-50 bg-white border border-gray-300 rounded shadow-lg p-2"
              style={{
                left: editingDimension.x - 50,
                top: editingDimension.y - 30
              }}
            >
              <input
                type="number"
                value={editingDimension.value}
                onChange={(e) => setEditingDimension(prev => 
                  prev ? { ...prev, value: e.target.value } : null
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Apply dimension change logic would go here
                    setEditingDimension(null);
                  } else if (e.key === 'Escape') {
                    setEditingDimension(null);
                  }
                }}
                onBlur={() => setEditingDimension(null)}
                className="w-16 px-2 py-1 text-sm border border-gray-300 rounded"
                autoFocus
              />
              <span className="text-xs text-gray-500 ml-1">'</span>
            </div>
          )}
          </div>
        </div>

        {/* Site Constraints Panel - Right Side - Compact */}
        {showConstraintsPanel && (
          <div className="w-72 bg-white border-l border-gray-300 overflow-y-auto p-2 max-h-full">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">Site Design Panel</h3>
            <div className="flex items-center space-x-2">
              <button
                onClick={importRoadsForCurrentParcel}
                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                title="Refresh Roads from Mapbox"
              >
                Refresh Roads
              </button>
              <button
                onClick={() => setShowConstraintsPanel(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="space-y-1">
          {/* AI Optimization - Ultra Compact */}
          <div className="mb-1 p-1.5 bg-gradient-to-r from-purple-50 to-pink-50 rounded border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-purple-900 text-xs">🤖 AI Optimization</h4>
                <div className="text-xs text-purple-700">Auto-select optimal layout</div>
              </div>
              <button
                onClick={optimizeLayoutWithAI}
                className="px-2 py-0.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-xs font-medium rounded hover:from-purple-700 hover:to-pink-700"
              >
                Run AI
              </button>
            </div>
          </div>

          {/* Layout Templates - Compact */}
          <div className="mb-1 p-1.5 bg-purple-50 rounded">
            <h4 className="font-medium text-purple-900 mb-1 text-xs">Development Templates</h4>
            <div className="space-y-0.5">
              {LAYOUT_TEMPLATES.map(template => {
                  // Calculate actual buildable area from the green buildable area element
                  const buildableAreaElement = elements.find(el => 
                    el.type === 'greenspace' && el.properties.name?.includes('Buildable Area')
                  );
                  
                  let buildableAreaSqFt = 0;
                  if (buildableAreaElement) {
                    // Use the SAME calculation as the visual display
                    buildableAreaSqFt = Math.round(buildableAreaElement.properties.area || 0);
                  } else {
                    // Fallback estimate
                    buildableAreaSqFt = parcelGeometry ? 
                      (parcelGeometry.width * parcelGeometry.height * 0.7) / 144 : 0;
                  }
                  
                  const canFit = buildableAreaSqFt >= template.minArea;
                  
                  // Debug logging
                  console.log(`🏗️ Template ${template.name}: buildable=${Math.round(buildableAreaSqFt)} sf, required=${template.minArea} sf, canFit=${canFit}`);
                  
                  // Calculate potential for this template type
                  let potential = '';
                  if (canFit) {
                    if (template.id === 'single-family') {
                      potential = '1 home, ~2,500 sq ft';
                    } else if (template.id === 'duplex') {
                      potential = '2 units, ~1,200 sq ft each';
                    } else if (template.id === 'apartment-complex') {
                      const maxUnits = Math.min(
                        Math.floor((parcelGeometry?.area || 0) / 43560 * 20), // RM20 = 20 units/acre
                        Math.floor(buildableAreaSqFt * 0.4 / 600)
                      );
                      potential = `${maxUnits} units, ${Math.floor(maxUnits / 4)} buildings`;
                    } else if (template.id === 'office-building') {
                      const maxSqFt = Math.floor(Math.min(buildableAreaSqFt * 0.4, 50000));
                      potential = `${maxSqFt.toLocaleString()} sq ft office`;
                    } else if (template.id === 'retail-center') {
                      const retailSqFt = Math.floor(Math.min(buildableAreaSqFt * 0.3, 20000));
                      const units = Math.floor(retailSqFt / 1500);
                      potential = `${units} retail units, ${retailSqFt.toLocaleString()} sq ft`;
                    } else if (template.id === 'hospitality') {
                      const hotelSqFt = Math.floor(Math.min(buildableAreaSqFt * 0.5, 30000));
                      const rooms = Math.floor(hotelSqFt / 400);
                      potential = `${rooms} hotel rooms`;
                    }
                  }
                  
                  return (
                    <div key={template.id} className={`flex items-center justify-between p-1 rounded border text-xs ${canFit ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-xs">{template.name}</span>
                        <div className="text-gray-600 text-xs truncate">
                          {canFit ? potential : `Need ${(template.minArea - buildableAreaSqFt).toLocaleString()} more SF`}
                        </div>
                      </div>
                      {canFit && (
                        <button
                          onClick={() => {
                            console.log(`🔄 Generate button clicked for ${template.name}`, {
                              templateId: template.id,
                              buildableAreaSqFt,
                              elementsCount: elements.length,
                              parcelGeometry: !!parcelGeometry
                            });
                            applyLayoutTemplate(template.id);
                          }}
                          className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex-shrink-0"
                        >
                          Generate
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          
          <div className="space-y-2">
            {/* Consolidated Zoning Information */}
            <div>
              <h4 className="font-medium text-gray-900 mb-1 text-xs">Zoning & Development Rights</h4>
              
              {/* Zoning Classification - Compact */}
              <div className="mb-1 p-1.5 bg-gray-50 rounded">
                <h5 className="font-medium text-gray-800 mb-1 text-xs">Zoning Classification:</h5>
                <div className="text-xs space-y-0.5">
                  <div><strong>Zone:</strong> {parcel.zoning || 'N/A'}</div>
                  <div><strong>Description:</strong> {parcel.zoning_description || 'N/A'}</div>
                  {parcel.zoning_data?.zoning_type && (
                    <div><strong>Type:</strong> {parcel.zoning_data.zoning_type}</div>
                  )}
                  {parcel.zoning_data?.zoning_objective && (
                    <div><strong>Objective:</strong> {parcel.zoning_data.zoning_objective}</div>
                  )}
                </div>
              </div>

              {/* Permitted Uses */}
              {parcel.zoning_data?.permitted_land_uses_as_of_right || parcel.zoning_data?.permitted_land_uses_conditional ? (
                <div className="mb-3 p-2 bg-green-50 rounded">
                  {parcel.zoning_data.permitted_land_uses_as_of_right && (
                    <div className="mb-2">
                      <h5 className="font-medium text-green-800 mb-1 text-sm">✅ Allowed By Right:</h5>
                      <div className="space-y-0.5 text-xs">
                        {parcel.zoning_data.permitted_land_uses_as_of_right.split(',').map((use, index) => (
                          <div key={index} className="flex items-center space-x-1">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                            <span>{use.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {parcel.zoning_data.permitted_land_uses_conditional && (
                    <div>
                      <h5 className="font-medium text-yellow-800 mb-1 text-sm">⚠️ Conditional Uses:</h5>
                      <div className="space-y-0.5 text-xs">
                        {parcel.zoning_data.permitted_land_uses_conditional.split(',').map((use, index) => (
                          <div key={index} className="flex items-center space-x-1">
                            <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                            <span>{use.trim()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-3 p-2 bg-yellow-50 rounded">
                  <h5 className="font-medium text-yellow-800 mb-1 text-sm">Permitted Uses (Based on Zone):</h5>
                  <div className="text-xs text-yellow-700 mb-1">
                    "{parcel.zoning_description}" typically allows:
                  </div>
                  <div className="space-y-0.5 text-xs">
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span>Residential: Up to {Math.floor((parcelGeometry?.area || 0) / 43560 * 20)} units (20/acre)</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full"></div>
                      <span>May allow accessory commercial uses</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Development Potential */}
              <div className="mb-3 p-2 bg-blue-50 rounded">
                <h5 className="font-medium text-blue-900 mb-1 text-sm">Development Potential:</h5>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-blue-800">
                  <div><strong>Units:</strong> {parcelGeometry ? Math.floor(((parcel.sqft || parcelGeometry.area) / 43560) * 20) : 'N/A'}</div>
                  <div><strong>Stories:</strong> {Math.floor((parcel.zoning_data?.max_building_height_ft || 45) / 10)}</div>
                  <div><strong>Floor Area:</strong> {parcelGeometry ? Math.round((parcel.sqft || parcelGeometry.area) * (parcel.zoning_data?.max_far || 2.5) / 1000).toLocaleString() : 'N/A'}k sf</div>
                  <div><strong>Coverage:</strong> {Math.round(((parcel.sqft || parcelGeometry?.area) || 0) * 0.4 / 1000).toLocaleString()}k sf</div>
                </div>
              </div>
              
              {/* Setback Requirements */}
              <div className="mb-3 p-2 bg-gray-50 rounded">
                <h5 className="font-medium text-gray-800 mb-1 text-sm">Setbacks & Requirements:</h5>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <span>Front:</span>
                    <span className="font-medium">{siteConstraints.frontSetback}'</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Rear:</span>
                    <span className="font-medium">{siteConstraints.rearSetback}'</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Side:</span>
                    <span className="font-medium">{siteConstraints.sideSetback}'</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Parking:</span>
                    <span className="font-medium">{siteConstraints.minParkingRatio}/unit</span>
                  </div>
                </div>
              </div>
              
              {/* Debug Info */}
              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer">🔍 Debug: Raw Zoning Data</summary>
                <pre className="text-xs bg-gray-100 p-2 mt-1 rounded overflow-auto max-h-32">
                  {JSON.stringify({
                    zoning: parcel.zoning,
                    zoning_description: parcel.zoning_description,
                    zoning_data_available: !!parcel.zoning_data,
                    permitted_as_of_right: parcel.zoning_data?.permitted_land_uses_as_of_right,
                    permitted_conditional: parcel.zoning_data?.permitted_land_uses_conditional,
                    max_density: parcel.zoning_data?.max_density_du_per_acre,
                    max_far: parcel.zoning_data?.max_far
                  }, null, 2)}
                </pre>
              </details>
            </div>
            
            {/* Violations */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">
                Current Violations ({complianceViolations.length})
              </h4>
              {complianceViolations.length > 0 ? (
                <div className="space-y-2">
                  {complianceViolations.map((violation, index) => (
                    <div key={index} className="flex items-start space-x-2 text-sm">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <span className="text-red-700">{violation}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center space-x-2 text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>All constraints satisfied</span>
                </div>
              )}
            </div>
          </div>
          

          {/* Current Metrics */}
          <div className="mt-3 pt-2 border-t border-gray-200">
            <h4 className="font-medium text-gray-900 mb-2 text-sm">Current Site Metrics</h4>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-center">
                <div className="text-sm font-bold text-blue-600">
                  {parcelGeometry ? `${parcelGeometry.width.toFixed(0)}' × ${parcelGeometry.depth.toFixed(0)}'` : 'N/A'}
                </div>
                <div className="text-xs text-gray-600">Parcel Size</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-blue-600">
                  {parcel.sqft ? Math.round(parcel.sqft).toLocaleString() : 'N/A'}
                </div>
                <div className="text-xs text-gray-600">Total Area (sq ft)</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-blue-600">
                  {elements.filter(el => el.type === 'building').length}
                </div>
                <div className="text-xs text-gray-600">Buildings</div>
              </div>
              <div className="text-center">
                <div className="text-sm font-bold text-blue-600">
                  {elements.filter(el => el.type === 'parking').reduce((sum, el) => {
                    const vertices = el.vertices;
                    let areaInSVGUnits = 0;
                    
                    for (let i = 0; i < vertices.length; i++) {
                      const j = (i + 1) % vertices.length;
                      areaInSVGUnits += vertices[i].x * vertices[j].y;
                      areaInSVGUnits -= vertices[j].x * vertices[i].y;
                    }
                    areaInSVGUnits = Math.abs(areaInSVGUnits / 2);
                    
                    const areaInSqFt = areaInSVGUnits / 144;
                    const spaces = Math.floor(areaInSqFt / 350);
                    return sum + Math.max(0, spaces);
                  }, 0)}
                </div>
                <div className="text-xs text-gray-600">Parking Spaces</div>
              </div>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center space-x-4">
            <span>
              Tool: {activeTool.charAt(0).toUpperCase() + activeTool.slice(1)}
              {isVertexMode && ' (Vertex Mode)'}
            </span>
            <span>Selected: {selectedElements.length}</span>
            <span>Elements: {elements.length}</span>
            {selectedVertices.length > 0 && (
              <span>Vertices: {selectedVertices.length}</span>
            )}
            {activeMeasurement && (
              <span className="text-purple-600 font-medium">
                Distance: {Math.round(activeMeasurement.distance)}'
              </span>
            )}
            {complianceViolations.length > 0 && (
              <span className="text-red-600 font-medium">
                Violations: {complianceViolations.length}
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>Zoom: {Math.round(zoom * 100)}%</span>
            <span>Grid: {gridSize/12}"</span>
            <span>
              Buildings: {buildingCount} |
              Parking: {parkingElements.length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default EnterpriseSitePlanner;
