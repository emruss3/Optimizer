export type UnitBasis = "fixed" | "per_sf" | "per_unit" | "percent_of_hard" | "percent_of_tdc";

export type LineItem = {
  id: string;               // e.g., "legal"
  label: string;            // "Legal"
  basis: UnitBasis;
  value: number;            // number the basis uses (e.g., 0.04 for 4%, 250 for $/SF)
  category: "SOFT" | "HARD" | "SITE" | "FEES" | "CONT" | "FIN";
  notes?: string;
  locked?: boolean;         // if true, show lock icon but still allow override if you want
};

export type Program = {
  lotSqft: number;
  buildableSf: number;     // FAR × effective lot
  units?: number;
  keys?: number;
};

export type CostContext = {
  // things formulae may reference
  hardSubtotalExCont: number; // Vertical + Site + Hard Demo + Amenities + Permit/Tap (pre-cont.)
  tdcBeforeFee: number;       // running total before developer fee (useful if you keep this)
  // knobs for $/unit / $/key:
  units?: number;
  keys?: number;
  // for /sf:
  buildableSf: number;
};

export type CostBreakdown = {
  items: Array<{ id: string; label: string; amount: number; category: LineItem["category"] }>;
  subtotals: {
    HARD: number; 
    SITE: number; 
    FEES: number; 
    SOFT: number; 
    CONT: number; 
    FIN: number;
  };
  tdc: number;
};