/**
 * Grading Engine - Cut/Fill Cost Calculation
 * 
 * Calculates earthwork costs based on existing topography (DEM) and proposed pad elevation.
 * Returns cut/fill volumes in cubic yards and associated costs.
 */

export interface GradingParams {
  padElevationFt: number;
  cutCostPerCY?: number;    // Cost per cubic yard of cut
  fillCostPerCY?: number;   // Cost per cubic yard of fill
  haulCostPerCY?: number;   // Cost per cubic yard-mile for hauling
  maxHaulDistance?: number; // Maximum haul distance in miles
}

export interface GradingResult {
  cutCY: number;           // Cubic yards of cut
  fillCY: number;          // Cubic yards of fill
  netCY: number;           // Net cut/fill (positive = excess fill)
  cutCost: number;         // Total cut cost
  fillCost: number;        // Total fill cost
  haulCost: number;        // Total haul cost
  totalCost: number;       // Total grading cost
  balanceRatio: number;    // Fill/Cut ratio (1.0 = balanced)
  costPerSqFt: number;     // Cost per square foot of site
}

export interface DEMSampler {
  (x: number, y: number): number; // Returns elevation in feet at x,y coordinates
}

/**
 * Calculate grading costs for a buildable polygon at specified pad elevation
 */
export function gradeCost(
  buildableFeetPolygon: GeoJSON.Polygon,
  demSampler: DEMSampler,
  params: GradingParams
): GradingResult {
  const {
    padElevationFt,
    cutCostPerCY = 8.50,    // Default: $8.50/CY for cut
    fillCostPerCY = 12.00,  // Default: $12.00/CY for fill
    haulCostPerCY = 2.50,   // Default: $2.50/CY-mile for haul
    maxHaulDistance = 5.0   // Default: 5 mile max haul
  } = params;

  // Sample DEM on a grid within the buildable polygon
  const gridSpacing = 10; // 10-foot grid spacing
  const samples = sampleDEMGrid(buildableFeetPolygon, demSampler, gridSpacing);
  
  // Calculate cut/fill volumes
  let totalCut = 0;
  let totalFill = 0;
  let totalArea = 0;

  for (const sample of samples) {
    const { elevation, area } = sample;
    const cut = Math.max(0, elevation - padElevationFt);
    const fill = Math.max(0, padElevationFt - elevation);
    
    totalCut += cut * area;
    totalFill += fill * area;
    totalArea += area;
  }

  // Convert to cubic yards (cubic feet / 27)
  const cutCY = totalCut / 27;
  const fillCY = totalFill / 27;
  const netCY = fillCY - cutCY;

  // Calculate costs
  const cutCost = cutCY * cutCostPerCY;
  const fillCost = fillCY * fillCostPerCY;
  
  // Haul cost for excess fill (when fill > cut)
  const excessFill = Math.max(0, netCY);
  const haulCost = excessFill * haulCostPerCY * maxHaulDistance;
  
  const totalCost = cutCost + fillCost + haulCost;
  const balanceRatio = cutCY > 0 ? fillCY / cutCY : 1.0;
  const costPerSqFt = totalArea > 0 ? totalCost / totalArea : 0;

  return {
    cutCY: Math.round(cutCY),
    fillCY: Math.round(fillCY),
    netCY: Math.round(netCY),
    cutCost: Math.round(cutCost),
    fillCost: Math.round(fillCost),
    haulCost: Math.round(haulCost),
    totalCost: Math.round(totalCost),
    balanceRatio: Math.round(balanceRatio * 100) / 100,
    costPerSqFt: Math.round(costPerSqFt * 100) / 100
  };
}

/**
 * Sample DEM on a regular grid within the polygon
 */
function sampleDEMGrid(
  polygon: GeoJSON.Polygon,
  demSampler: DEMSampler,
  gridSpacing: number
): Array<{ elevation: number; area: number }> {
  const samples: Array<{ elevation: number; area: number }> = [];
  
  // Get bounding box of polygon
  const coords = polygon.coordinates[0];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  // Sample on grid
  for (let x = minX; x <= maxX; x += gridSpacing) {
    for (let y = minY; y <= maxY; y += gridSpacing) {
      // Check if point is inside polygon
      if (isPointInPolygon([x, y], polygon)) {
        const elevation = demSampler(x, y);
        const area = gridSpacing * gridSpacing; // Square feet per grid cell
        samples.push({ elevation, area });
      }
    }
  }

  return samples;
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
function isPointInPolygon(point: [number, number], polygon: GeoJSON.Polygon): boolean {
  const [x, y] = point;
  const coords = polygon.coordinates[0];
  
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i];
    const [xj, yj] = coords[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

/**
 * Create a simple DEM sampler for testing (flat terrain with slight slope)
 */
export function createTestDEMSampler(baseElevation: number = 100, slope: number = 0.01): DEMSampler {
  return (x: number, y: number) => {
    // Simple linear slope: elevation increases with x coordinate
    return baseElevation + (x * slope);
  };
}

/**
 * Create a DEM sampler from real elevation data (placeholder for future implementation)
 */
export function createDEMSamplerFromData(elevationData: Array<{x: number, y: number, elevation: number}>): DEMSampler {
  // For now, return a simple interpolator
  // In production, this would use proper spatial interpolation (IDW, Kriging, etc.)
  return (x: number, y: number) => {
    // Find nearest neighbor for now
    let nearest = elevationData[0];
    let minDist = Math.sqrt(Math.pow(x - nearest.x, 2) + Math.pow(y - nearest.y, 2));
    
    for (const point of elevationData) {
      const dist = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
      if (dist < minDist) {
        minDist = dist;
        nearest = point;
      }
    }
    
    return nearest.elevation;
  };
}
