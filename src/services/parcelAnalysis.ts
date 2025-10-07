// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import { supabase } from '../lib/supabase';
import { GeoJSONGeometry } from '../types/parcel';

// Types for the planner_join table and RPC responses
export interface PlannerJoinData {
  parcel_id: string;
  address: string;
  deededacreage: number;
  sqft: number;
  zoning: string;
  zoning_type?: string;
  zoning_subtype?: string;
  zoning_description?: string;
  permitted_land_uses?: Record<string, string[]>;
  min_lot_area_sq_ft?: number;
  min_lot_width_ft?: number;
  max_building_height_ft?: number;
  max_far?: number;
  min_front_setback_ft?: number;
  min_rear_setback_ft?: number;
  min_side_setback_ft?: number;
  max_coverage_pct?: number;
  max_impervious_coverage_pct?: number;
  min_landscaped_space_pct?: number;
  min_open_space_pct?: number;
  max_density_du_per_acre?: number;
  municipality_name?: string;
  geometry?: GeoJSONGeometry;
}

export interface BuildableEnvelope {
  geometry: GeoJSONGeometry;
  area_sqft?: number;
  buildable_area_sqft?: number;
  coverage_ratio?: number;
  setbacks_applied?: boolean;
}

export interface PadScore {
  pad_sf: number;
  env_sf: number;
  coverage: number;
  stalls: number;
  stalls_needed: number;
  far_ok: boolean;
  parking_ok: boolean;
  envelope_ok: boolean;
  score: number;
}

export interface ParcelAnalysisResult {
  parcel: PlannerJoinData;
  envelope: GeoJSONGeometry;
  score: PadScore;
  analysis_date: Date;
}

/**
 * Service class for parcel analysis using Supabase RPC functions
 */
export class ParcelAnalysisService {
  /**
   * Fetch parcel data with enhanced zoning information from planner_join table
   */
  async fetchParcelData(parcelId: string): Promise<PlannerJoinData | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    try {
      console.log('🔍 Fetching parcel data for ID:', parcelId);
      
      const { data, error } = await supabase
        .from('planner_join')
        .select('*')
        .eq('parcel_id', parcelId)
        .single();

      if (error) {
        console.error('❌ Error fetching parcel data:', error);
        return null;
      }

      if (!data) {
        console.warn('⚠️ No parcel data found for ID:', parcelId);
        return null;
      }

      console.log('✅ Parcel data fetched successfully:', data);
      return data as PlannerJoinData;
    } catch (error) {
      console.error('❌ Exception fetching parcel data:', error);
      return null;
    }
  }

  /**
   * Get buildable envelope for a parcel using RPC function
   */
  async getBuildableEnvelope(parcelId: string): Promise<GeoJSONGeometry | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    try {
      console.log('🏗️ Calculating buildable envelope for parcel:', parcelId);
      
      const { data, error } = await supabase.rpc('get_buildable_envelope', {
        p_parcel_id: parcelId
      });

      if (error) {
        console.error('❌ Error calculating buildable envelope:', error);
        return null;
      }

      if (!data) {
        console.warn('⚠️ No envelope data returned for parcel:', parcelId);
        return null;
      }

      console.log('✅ Buildable envelope calculated:', data);
      return data as GeoJSONGeometry;
    } catch (error) {
      console.error('❌ Exception calculating buildable envelope:', error);
      return null;
    }
  }

  /**
   * Score a pad/polygon using the RPC function
   */
  async scorePad(
    parcelId: string, 
    padGeometry: GeoJSONGeometry, 
    parkingGeometry?: GeoJSONGeometry | null
  ): Promise<PadScore | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    try {
      console.log('📊 Scoring pad for parcel:', parcelId);
      console.log('📐 Pad geometry:', padGeometry);
      console.log('🅿️ Parking geometry:', parkingGeometry);
      
      const { data, error } = await supabase.rpc('score_pad', {
        p_parcel_id: parcelId,
        p_pad_3857: padGeometry,
        p_parking_3857: parkingGeometry || null
      });

      if (error) {
        console.error('❌ Error scoring pad:', error);
        return null;
      }

      if (!data) {
        console.warn('⚠️ No score data returned for pad');
        return null;
      }

      console.log('✅ Pad scored successfully:', data);
      return data as PadScore;
    } catch (error) {
      console.error('❌ Exception scoring pad:', error);
      return null;
    }
  }

  /**
   * Complete parcel analysis workflow: fetch parcel + envelope + score
   */
  async analyzeParcel(
    parcelId: string, 
    padGeometry?: GeoJSONGeometry, 
    parkingGeometry?: GeoJSONGeometry | null
  ): Promise<ParcelAnalysisResult | null> {
    try {
      console.log('🚀 Starting complete parcel analysis for:', parcelId);
      
      // Step 1: Fetch parcel data
      const parcel = await this.fetchParcelData(parcelId);
      if (!parcel) {
        console.error('❌ Failed to fetch parcel data');
        return null;
      }

      // Step 2: Get buildable envelope
      const envelope = await this.getBuildableEnvelope(parcelId);
      if (!envelope) {
        console.error('❌ Failed to calculate buildable envelope');
        return null;
      }

      // Step 3: Score the pad (use envelope geometry if no pad provided)
      const padToScore = padGeometry || envelope;
      const score = await this.scorePad(parcelId, padToScore, parkingGeometry);
      if (!score) {
        console.error('❌ Failed to score pad');
        return null;
      }

      const result: ParcelAnalysisResult = {
        parcel,
        envelope,
        score,
        analysis_date: new Date()
      };

      console.log('✅ Complete parcel analysis finished:', result);
      return result;
    } catch (error) {
      console.error('❌ Exception in complete parcel analysis:', error);
      return null;
    }
  }

  /**
   * Batch analyze multiple parcels
   */
  async analyzeMultipleParcels(parcelIds: string[]): Promise<ParcelAnalysisResult[]> {
    const results: ParcelAnalysisResult[] = [];
    
    console.log('🔄 Starting batch analysis for', parcelIds.length, 'parcels');
    
    for (const parcelId of parcelIds) {
      try {
        const result = await this.analyzeParcel(parcelId);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`❌ Failed to analyze parcel ${parcelId}:`, error);
      }
    }
    
    console.log(`✅ Batch analysis complete: ${results.length}/${parcelIds.length} successful`);
    return results;
  }

  /**
   * Get parcel geometry in different coordinate systems
   */
  async getParcelGeometry(parcelId: string, targetSRID: number = 3857): Promise<GeoJSONGeometry | null> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return null;
    }

    try {
      console.log(`🗺️ Fetching parcel geometry in SRID ${targetSRID} for:`, parcelId);
      
      const { data, error } = await supabase.rpc('get_parcel_geometry_3857', {
        p_parcel_id: parcelId
      });

      if (error) {
        console.error('❌ Error fetching parcel geometry:', error);
        return null;
      }

      if (!data) {
        console.warn('⚠️ No geometry data found for parcel:', parcelId);
        return null;
      }

      console.log('✅ Parcel geometry fetched:', data);
      return data as GeoJSONGeometry;
    } catch (error) {
      console.error('❌ Exception fetching parcel geometry:', error);
      return null;
    }
  }

  /**
   * Validate if a parcel ID exists in the database
   */
  async validateParcelId(parcelId: string): Promise<boolean> {
    if (!supabase) {
      console.error('❌ Supabase client not initialized');
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('planner_join')
        .select('parcel_id')
        .eq('parcel_id', parcelId)
        .limit(1);

      if (error) {
        console.error('❌ Error validating parcel ID:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('❌ Exception validating parcel ID:', error);
      return false;
    }
  }
}

// Export singleton instance
export const parcelAnalysisService = new ParcelAnalysisService();

// Export convenience functions
export const fetchParcelData = (parcelId: string) => parcelAnalysisService.fetchParcelData(parcelId);
export const getBuildableEnvelope = (parcelId: string) => parcelAnalysisService.getBuildableEnvelope(parcelId);
export const scorePad = (parcelId: string, padGeometry: GeoJSONGeometry, parkingGeometry?: GeoJSONGeometry | null) => 
  parcelAnalysisService.scorePad(parcelId, padGeometry, parkingGeometry);
export const analyzeParcel = (parcelId: string, padGeometry?: GeoJSONGeometry, parkingGeometry?: GeoJSONGeometry | null) => 
  parcelAnalysisService.analyzeParcel(parcelId, padGeometry, parkingGeometry);
