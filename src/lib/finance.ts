// src/lib/finance.ts

export interface UnderwritingInputs {
  land_cost: number;
  hard_cost: number;
  soft_cost: number;
  contingency: number;
  loan_amount: number;
  revenue: number;
  development_months: number; // months from equity outlay to monetization
}

export interface UnderwritingOutputs {
  total_cost: number;
  equity_required: number;
  profit: number;
  irr_annual_pct: number;       // % annualized
  irr_monthly_pct: number;      // % monthly
  yield_on_cost_pct: number;    // profit / total_cost
  equity_multiple: number;      // (revenue - loan payoff) / equity_required
  cash_on_cash_pct: number;     // profit / equity_required (simple, not time-based)
}

/** Clamp helper to keep numbers sane for display */
const clamp = (n: number) => (Number.isFinite(n) ? n : 0);

/** Net Present Value given periodic cashflows and periodic rate r */
function npv(rate: number, cashflows: number[]): number {
  let v = 0;
  let t = 0;
  for (const cf of cashflows) {
    v += cf / Math.pow(1 + rate, t++);
  }
  return v;
}

/**
 * Robust IRR (periodic) via bisection.
 * - Works on any sign-changing series (negative then positive, etc.).
 * - rate_low starts near -100% to allow steep curves.
 * - rate_high allows very high periodic IRR, we cap annual display later.
 */
function irrPeriodic(cashflows: number[], maxIter = 200, tol = 1e-7): number {
  // Must have at least one negative and one positive cashflow
  const hasNeg = cashflows.some(c => c < 0);
  const hasPos = cashflows.some(c => c > 0);
  if (!hasNeg || !hasPos) return NaN;

  let low = -0.9999; // -99.99% per period
  let high = 10;     // 1000% per period
  let fLow = npv(low, cashflows);
  let fHigh = npv(high, cashflows);

  // If no sign change on bounds, widen once; otherwise give up and return NaN
  if (fLow * fHigh > 0) {
    high = 100; // extremely high periodic IRR cap for pathological but solvable cases
    fHigh = npv(high, cashflows);
    if (fLow * fHigh > 0) return NaN;
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid, cashflows);
    if (Math.abs(fMid) < tol) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return (low + high) / 2;
}

/** Build a simple monthly cashflow: equity at t0, proceeds at month N. */
function buildMonthlyCashflows(equityRequired: number, proceedsToEquity: number, months: number): number[] {
  // t0: equity outflow (negative)
  // months 1..N-1: 0 during development (simple model)
  // month N: inflow to equity (net proceeds)
  const flows = new Array(Math.max(months + 1, 2)).fill(0);
  flows[0] = -equityRequired;
  flows[months] = proceedsToEquity;
  return flows;
}

/** Main public function: compute all metrics entirely client-side. */
export function computeUnderwriting(inputs: UnderwritingInputs): UnderwritingOutputs {
  const {
    land_cost = 0,
    hard_cost = 0,
    soft_cost = 0,
    contingency = 0,
    loan_amount = 0,
    revenue = 0,
    development_months = 18,
  } = inputs;

  const total_cost = land_cost + hard_cost + soft_cost + contingency;
  const equity_required = Math.max(total_cost - loan_amount, 0);
  const profit = revenue - total_cost;

  // Proceeds to equity at exit (simple sale/refi model with loan payoff)
  const proceedsToEquity = Math.max(revenue - loan_amount, 0);

  // Build monthly cashflows and compute monthly IRR
  const flows = buildMonthlyCashflows(equity_required, proceedsToEquity, Math.max(1, development_months));
  const irrMonthly = irrPeriodic(flows); // e.g., 0.02 means 2% per month

  // Annualize (handle NaN safely)
  const irrAnnual = Number.isFinite(irrMonthly) ? Math.pow(1 + irrMonthly, 12) - 1 : NaN;

  const yieldOnCost = total_cost > 0 ? profit / total_cost : NaN;
  const equityMultiple = equity_required > 0 ? proceedsToEquity / equity_required : NaN;
  const cashOnCash = equity_required > 0 ? profit / equity_required : NaN;

  // Return as percentages where appropriate
  return {
    total_cost: clamp(total_cost),
    equity_required: clamp(equity_required),
    profit: clamp(profit),
    irr_annual_pct: clamp(irrAnnual * 100),
    irr_monthly_pct: clamp(irrMonthly * 100),
    yield_on_cost_pct: clamp(yieldOnCost * 100),
    equity_multiple: clamp(equityMultiple),
    cash_on_cash_pct: clamp(cashOnCash * 100),
  };
}

// Default cost assumptions by zoning type
export const DEFAULT_COSTS = {
  // Single-Family Residential
  'RS5': { land_cost_per_acre: 400000, hard_cost_per_sf: 160, sale_price_per_unit: 280000, rent_per_unit_per_month: 1400 },
  'RS7.5': { land_cost_per_acre: 450000, hard_cost_per_sf: 165, sale_price_per_unit: 320000, rent_per_unit_per_month: 1600 },
  'RS10': { land_cost_per_acre: 500000, hard_cost_per_sf: 170, sale_price_per_unit: 350000, rent_per_unit_per_month: 1800 },
  'RS15': { land_cost_per_acre: 550000, hard_cost_per_sf: 175, sale_price_per_unit: 380000, rent_per_unit_per_month: 2000 },
  'RS20': { land_cost_per_acre: 600000, hard_cost_per_sf: 180, sale_price_per_unit: 420000, rent_per_unit_per_month: 2200 },
  
  // Multi-Family Residential
  'R6': { land_cost_per_acre: 800000, hard_cost_per_sf: 150, sale_price_per_unit: 250000, rent_per_unit_per_month: 1500 },
  'R8': { land_cost_per_acre: 900000, hard_cost_per_sf: 160, sale_price_per_unit: 280000, rent_per_unit_per_month: 1650 },
  'R10': { land_cost_per_acre: 1000000, hard_cost_per_sf: 170, sale_price_per_unit: 320000, rent_per_unit_per_month: 1800 },
  'R15': { land_cost_per_acre: 1200000, hard_cost_per_sf: 180, sale_price_per_unit: 350000, rent_per_unit_per_month: 2000 },
  'R20': { land_cost_per_acre: 1400000, hard_cost_per_sf: 190, sale_price_per_unit: 380000, rent_per_unit_per_month: 2200 },
  
  // Residential Mixed-Use
  'RM2': { land_cost_per_acre: 1000000, hard_cost_per_sf: 180, sale_price_per_unit: 320000, rent_per_unit_per_month: 1800 },
  'RM4': { land_cost_per_acre: 1200000, hard_cost_per_sf: 190, sale_price_per_unit: 350000, rent_per_unit_per_month: 2000 },
  'RM6': { land_cost_per_acre: 1400000, hard_cost_per_sf: 200, sale_price_per_unit: 380000, rent_per_unit_per_month: 2200 },
  'RM9': { land_cost_per_acre: 1600000, hard_cost_per_sf: 210, sale_price_per_unit: 420000, rent_per_unit_per_month: 2400 },
  'RM15': { land_cost_per_acre: 1800000, hard_cost_per_sf: 220, sale_price_per_unit: 450000, rent_per_unit_per_month: 2600 },
  'RM20': { land_cost_per_acre: 2000000, hard_cost_per_sf: 230, sale_price_per_unit: 500000, rent_per_unit_per_month: 2800 },
  
  // Commercial
  'CN': { land_cost_per_acre: 1500000, hard_cost_per_sf: 200, sale_price_per_sf: 300, rent_per_sf_per_month: 2.50 },
  'CR': { land_cost_per_acre: 1800000, hard_cost_per_sf: 220, sale_price_per_sf: 350, rent_per_sf_per_month: 3.00 },
  'CS': { land_cost_per_acre: 2200000, hard_cost_per_sf: 240, sale_price_per_sf: 400, rent_per_sf_per_month: 3.50 },
  'CA': { land_cost_per_acre: 2800000, hard_cost_per_sf: 260, sale_price_per_sf: 450, rent_per_sf_per_month: 4.00 },
  
  // Default fallback
  'default': { land_cost_per_acre: 500000, hard_cost_per_sf: 180, sale_price_per_unit: 350000, rent_per_unit_per_month: 1800 }
};

export function getDefaultCosts(zoning: string) {
  return DEFAULT_COSTS[zoning as keyof typeof DEFAULT_COSTS] || DEFAULT_COSTS.default;
}