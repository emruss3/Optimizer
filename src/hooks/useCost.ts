import { useState, useEffect } from 'react';

interface CostData {
  unitCost: number | null;
  lastUpdated?: Date;
  source?: string;
}

// Hard-cost hook for CSI codes
export function useCost(csiCode: string): CostData {
  const [costData, setCostData] = useState<CostData>({ unitCost: null });
  
  useEffect(() => {
    // Mock cost lookup - in real app would fetch from cost database
    const getCostData = async (code: string): Promise<CostData> => {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Mock cost data based on CSI code
      const mockCosts: Record<string, number> = {
        '03300': 180, // Concrete
        '05100': 220, // Steel framing
        '06100': 150, // Wood framing
        '07200': 12,  // Insulation
        '09200': 8,   // Gypsum
      };
      
      const unitCost = mockCosts[code] || null;
      
      return {
        unitCost,
        lastUpdated: new Date(),
        source: 'Mock Cost Database'
      };
    };
    
    if (csiCode) {
      getCostData(String(csiCode))
        .then(setCostData)
        .catch(() => setCostData({ unitCost: null }));
    }
  }, [csiCode]);
  
  return costData;
}