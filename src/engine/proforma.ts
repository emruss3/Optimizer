// © 2025 ER Technologies. All rights reserved.
// Proprietary and confidential. Not for distribution.

import type { UnitMixEntry } from './model';

// ─── Input / Output types ────────────────────────────────────────────────────

export interface ProFormaInput {
  /** Total GFA in sqft */
  totalGFASqft: number;
  /** Total site area in sqft */
  siteAreaSqft: number;
  /** Unit mix across all buildings */
  unitMix: UnitMixEntry[];
  /** Parking stalls: surface */
  surfaceStalls: number;
  /** Parking stalls: structured (e.g., podium / garage) */
  structuredStalls: number;
  /** Land cost (purchase price); defaults to 0 if not set */
  landCost?: number;
  /** Market assumptions overrides */
  market?: Partial<MarketAssumptions>;
}

export interface MarketAssumptions {
  vacancyRate: number;       // default 0.05
  opexRatio: number;         // default 0.35
  capRate: number;           // default 0.055
  constructionType: 'wood-frame' | 'steel' | 'concrete';
  costPerSFOverride?: number; // override per-sf construction cost
  equityPct: number;         // default 0.35
  constructionMonths: number; // default 18
  interestRate: number;      // default 0.06
}

export interface ProFormaResult {
  // Revenue
  grossPotentialRent: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  operatingExpenses: number;
  netOperatingIncome: number;

  // Costs
  landCost: number;
  buildingConstructionCost: number;
  siteWorkCost: number;
  parkingCost: number;
  totalHardCosts: number;
  softCosts: number;
  contingency: number;
  financingCosts: number;
  totalDevelopmentCost: number;

  // Returns
  yieldOnCost: number;
  stabilizedValue: number;
  profit: number;
  equityMultiple: number;
  cashOnCash: number;
  costPerUnit: number;
  costPerSF: number;

  // Convenience
  totalUnits: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MARKET: MarketAssumptions = {
  vacancyRate: 0.05,
  opexRatio: 0.35,
  capRate: 0.055,
  constructionType: 'wood-frame',
  equityPct: 0.35,
  constructionMonths: 18,
  interestRate: 0.06,
};

const COST_PER_SF: Record<MarketAssumptions['constructionType'], number> = {
  'wood-frame': 165,
  'steel': 210,
  'concrete': 260,
};

const SITE_WORK_PER_SF = 15;
const SURFACE_STALL_COST = 5_000;
const STRUCTURED_STALL_COST = 25_000;
const SOFT_COST_PCT = 0.20;
const CONTINGENCY_PCT = 0.05;

// ─── Engine ──────────────────────────────────────────────────────────────────

export function computeProForma(input: ProFormaInput): ProFormaResult {
  const m: MarketAssumptions = { ...DEFAULT_MARKET, ...input.market };

  const totalUnits = input.unitMix.reduce((s, e) => s + e.count, 0);

  // ── Revenue ────────────────────────────────────────────────────────────
  const grossPotentialRent = input.unitMix.reduce(
    (s, e) => s + e.count * e.rentPerMonth * 12, 0
  );
  const vacancyLoss = grossPotentialRent * m.vacancyRate;
  const effectiveGrossIncome = grossPotentialRent - vacancyLoss;
  const operatingExpenses = effectiveGrossIncome * m.opexRatio;
  const netOperatingIncome = effectiveGrossIncome - operatingExpenses;

  // ── Costs ──────────────────────────────────────────────────────────────
  const landCost = input.landCost ?? 0;
  const costPerSF = m.costPerSFOverride ?? COST_PER_SF[m.constructionType];
  const buildingConstructionCost = input.totalGFASqft * costPerSF;
  const siteWorkCost = input.siteAreaSqft * SITE_WORK_PER_SF;
  const parkingCost =
    input.surfaceStalls * SURFACE_STALL_COST +
    input.structuredStalls * STRUCTURED_STALL_COST;
  const totalHardCosts = buildingConstructionCost + siteWorkCost + parkingCost;
  const softCosts = totalHardCosts * SOFT_COST_PCT;
  const contingency = (totalHardCosts + softCosts) * CONTINGENCY_PCT;
  const financingCosts =
    (totalHardCosts + softCosts + contingency) *
    m.interestRate *
    (m.constructionMonths / 12);
  const totalDevelopmentCost = landCost + totalHardCosts + softCosts + contingency + financingCosts;

  // ── Returns ────────────────────────────────────────────────────────────
  const yieldOnCost = totalDevelopmentCost > 0 ? netOperatingIncome / totalDevelopmentCost : 0;
  const stabilizedValue = m.capRate > 0 ? netOperatingIncome / m.capRate : 0;
  const profit = stabilizedValue - totalDevelopmentCost;
  const equityRequired = totalDevelopmentCost * m.equityPct;
  const equityMultiple = equityRequired > 0 ? stabilizedValue / equityRequired : 0;
  const cashOnCash = equityRequired > 0 ? netOperatingIncome / equityRequired : 0;
  const costPerUnit = totalUnits > 0 ? totalDevelopmentCost / totalUnits : 0;
  const costPerSFTotal = input.totalGFASqft > 0 ? totalDevelopmentCost / input.totalGFASqft : 0;

  return {
    grossPotentialRent,
    vacancyLoss,
    effectiveGrossIncome,
    operatingExpenses,
    netOperatingIncome,
    landCost,
    buildingConstructionCost,
    siteWorkCost,
    parkingCost,
    totalHardCosts,
    softCosts,
    contingency,
    financingCosts,
    totalDevelopmentCost,
    yieldOnCost,
    stabilizedValue,
    profit,
    equityMultiple,
    cashOnCash,
    costPerUnit,
    costPerSF: costPerSFTotal,
    totalUnits,
  };
}
