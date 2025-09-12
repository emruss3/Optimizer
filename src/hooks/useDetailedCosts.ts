import { useState, useEffect, useMemo } from 'react';
import { LineItem, Program, CostBreakdown } from '../lib/costSchema';
import { DEFAULT_LINE_ITEMS } from '../lib/defaultLineItems';
import { computeBreakdown } from '../lib/computeCosts';
import { supabase } from '../lib/supabase';

export function useDetailedCosts(
  projectId: string | null,
  parcelId: string | null,
  program: Program
) {
  const [lineItems, setLineItems] = useState<LineItem[]>(DEFAULT_LINE_ITEMS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved cost overrides
  useEffect(() => {
    if (projectId && parcelId) {
      loadCostOverrides(projectId, parcelId);
    }
  }, [projectId, parcelId]);

  const loadCostOverrides = async (projId: string, parcId: string) => {
    if (!supabase) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('parcel_cost_overrides')
        .select('line_items')
        .eq('project_id', projId)
        .eq('parcel_id', parseInt(parcId))
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        throw error;
      }

      if (data?.line_items) {
        setLineItems(data.line_items);
      }
    } catch (error) {
      console.error('Error loading cost overrides:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCostOverrides = async (items: LineItem[]) => {
    if (!supabase || !projectId || !parcelId) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('parcel_cost_overrides')
        .upsert({
          project_id: projectId,
          parcel_id: parseInt(parcelId),
          line_items: items,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error saving cost overrides:', error);
    } finally {
      setSaving(false);
    }
  };

  // Calculate breakdown
  const breakdown = useMemo(() => {
    return computeBreakdown(lineItems, program);
  }, [lineItems, program]);

  const updateLineItems = (items: LineItem[]) => {
    setLineItems(items);
    
    // Auto-save after 500ms delay
    setTimeout(() => {
      if (projectId && parcelId) {
        saveCostOverrides(items);
      }
    }, 500);
  };

  return {
    lineItems,
    breakdown,
    loading,
    saving,
    updateLineItems,
    saveCostOverrides: () => projectId && parcelId ? saveCostOverrides(lineItems) : Promise.resolve(),
    resetToDefaults: () => {
      setLineItems(DEFAULT_LINE_ITEMS);
      if (projectId && parcelId) {
        saveCostOverrides(DEFAULT_LINE_ITEMS);
      }
    }
  };
}