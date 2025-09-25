import { RegridZoningData } from './zoning';

/**
 * Standard interface for parcel data throughout the application.
 * All components should use this interface for consistency.
 */
export interface SelectedParcel {
  /** Unique parcel identifier */
  id?: string;
  
  /** OGC FID for database/MVT consistency */
  ogc_fid: number;
  
  /** Street address */
  address: string;
  
  /** Property size in square feet */
  sqft: number;
  
  /** Property size in acres */
  deeded_acres: number;
  
  /** GeoJSON geometry for the parcel boundary */
  geometry: GeoJSONGeometry | null;
  
  /** Comprehensive zoning data following Regrid standard */
  zoning_data: RegridZoningData | null;
  
  /** Legacy zoning code (for fallback) */
  zoning?: string;
  
  /** Primary property owner */
  primary_owner?: string;
  
  /** Property valuation data */
  parval?: number;
  landval?: number;
  improvval?: number;
  
  /** Sale information */
  saleprice?: number;
  saledate?: string;
  
  /** Tax information */
  taxamt?: number;
  taxyear?: string;
  
  /** Building information */
  yearbuilt?: number;
  structstyle?: string;
  numunits?: number;
  
  /** Location data */
  lat?: number;
  lon?: number;
  
  /** Assessment data */
  usedesc?: string;
  zoning_description?: string;
}

/**
 * GeoJSON geometry types that we support
 */
export type GeoJSONGeometry = {
  type: 'Polygon';
  coordinates: number[][][];
} | {
  type: 'MultiPolygon';
  coordinates: number[][][][];
};

/**
 * Market data for investment analysis
 */
export interface MarketData {
  avgPricePerSqFt: number;
  avgRentPerSqFt: number;
  capRate: number;
  constructionCostPerSqFt: number;
}

/**
 * Investment analysis results
 */
export interface InvestmentAnalysis {
  irr: number;
  capRate: number;
  cashOnCash: number;
  paybackPeriod: number;
  noi: number;
  totalProjectCost: number;
  totalRevenue: number;
  roi: number;
}

/**
 * Type guard to check if an object is a valid SelectedParcel
 */
export function isValidParcel(obj: unknown): obj is SelectedParcel {
  return (
    obj &&
    (typeof obj.id === 'string' || typeof obj.ogc_fid === 'number') &&
    typeof obj.address === 'string' &&
    typeof obj.sqft === 'number' &&
    (typeof obj.deeded_acres === 'number' || obj.deeded_acres === null || obj.deeded_acres === undefined)
  );
}

/**
 * Creates a fallback parcel with minimal required data
 */
export function createFallbackParcel(id: string | number, sqft: number = 4356): SelectedParcel {
  const aspectRatio = 1.5;
  const width = Math.sqrt(sqft * aspectRatio);
  const depth = sqft / width;
  
  return {
    id: typeof id === 'string' ? id : String(id),
    ogc_fid: typeof id === 'number' ? id : parseInt(String(id)) || 0,
    address: 'Unknown Address',
    sqft,
    deeded_acres: sqft / 43560,
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [width, 0], [width, depth], [0, depth], [0, 0]]]
    },
    zoning_data: null,
    zoning: 'Unknown'
  };
}
