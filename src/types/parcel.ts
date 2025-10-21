export type ParcelId = string;

// GeoJSON geometry type for compatibility
export interface GeoJSONGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';
  coordinates: number[] | number[][] | number[][][];
}

// Legacy SelectedParcel interface for backward compatibility
export interface SelectedParcel {
  ogc_fid: ParcelId;
  parcelnumb: string | null;
  parcelnumb_no_formatting: string | null;
  address: string | null;
  zoning: string | null;
  zoning_description: string | null;
  zoning_type: string | null;
  owner: string | null;
  deeded_acres: number | null;
  gisacre: number | null;
  sqft: number | null;
  landval: number | null;
  parval: number | null;
  yearbuilt: number | null;
  numstories: number | null;
  numunits: number | null;
  lat: number | null;
  lon: number | null;
  geometry: GeoJSONGeometry;
  
  // Enhanced Zoning Data (from Regrid schema)
  zoning_data?: any; // Will be properly typed when RegridZoningData is available
  
  // Legacy Zoning constraints (for backward compatibility)
  max_far?: number;
  max_height_ft?: number;
  max_coverage_pct?: number;
  min_front_setback_ft?: number;
  min_rear_setback_ft?: number;
  min_side_setback_ft?: number;
}

export interface ParcelBBoxRow {
  ogc_fid: ParcelId;
  parcelnumb: string | null;
  parcelnumb_no_formatting: string | null;
  address: string | null;
  zoning: string | null;
  zoning_description: string | null;
  zoning_type: string | null;
  owner: string | null;
  deeded_acres: number | null;
  gisacre: number | null;
  sqft: number | null;
  landval: number | null;
  parval: number | null;
  yearbuilt: number | null;
  numstories: number | null;
  numunits: number | null;
  lat: number | null;
  lon: number | null;
  geometry: unknown; // GeoJSON
}

export interface ScorePadResult {
  parcel_id: ParcelId;
  metrics: {
    parcel_area_sqft: number | null;
    building_area_sqft: number | null;
    site_coverage_pct: number | null;
    far: number | null;
  };
  checks: {
    setbacks: boolean | null;
    coverage: boolean | null;
    far: boolean | null;
  };
}

// Market data interface for investment analysis
export interface MarketData {
  avgPricePerSqft: number;
  avgRentPerSqft: number;
  marketTrend: 'rising' | 'stable' | 'declining';
  comparableProperties: any[];
  marketCapRate: number;
  vacancyRate: number;
}

  // Investment analysis interface
  export interface InvestmentAnalysis {
    totalInvestment: number;
    projectedRevenue: number;
    operatingExpenses: number;
    netOperatingIncome: number;
    capRate: number;
    irr: number;
    paybackPeriod: number;
    riskAssessment: 'low' | 'medium' | 'high';
  }

  // Utility functions for parcel validation
  export function isValidParcel(parcel: any): parcel is SelectedParcel {
    return parcel && 
           typeof parcel.ogc_fid === 'string' && 
           parcel.ogc_fid.length > 0;
  }

  export function createFallbackParcel(parcelId: string): SelectedParcel {
    return {
      ogc_fid: parcelId,
      parcelnumb: null,
      parcelnumb_no_formatting: null,
      address: null,
      zoning: null,
      zoning_description: null,
      zoning_type: null,
      owner: null,
      deeded_acres: null,
      gisacre: null,
      sqft: null,
      landval: null,
      parval: null,
      yearbuilt: null,
      numstories: null,
      numunits: null,
      lat: null,
      lon: null,
      geometry: { type: 'Polygon', coordinates: [] }
    };
  }