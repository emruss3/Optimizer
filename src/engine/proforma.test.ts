import { describe, it, expect } from 'vitest';
import { computeProForma } from './proforma';
import { generateDefaultUnitMix } from './model';

describe('computeProForma', () => {
  const baseInput = () => ({
    totalGFASqft: 100_000,
    siteAreaSqft: 50_000,
    unitMix: generateDefaultUnitMix(100_000),
    surfaceStalls: 150,
    structuredStalls: 0,
    landCost: 1_000_000,
  });

  it('computes yield on cost as NOI / total development cost', () => {
    const pf = computeProForma(baseInput());
    expect(pf.yieldOnCost).toBeCloseTo(pf.netOperatingIncome / pf.totalDevelopmentCost, 6);
    expect(pf.yieldOnCost).toBeGreaterThan(0);
  });

  it('splits the capital stack into equity and debt (loan-to-cost = 1 - equityPct)', () => {
    const pf = computeProForma({ ...baseInput(), market: { equityPct: 0.35 } });
    expect(pf.equityRequired).toBeCloseTo(pf.totalDevelopmentCost * 0.35, 4);
    expect(pf.loanAmount).toBeCloseTo(pf.totalDevelopmentCost * 0.65, 4);
    expect(pf.annualDebtService).toBeGreaterThan(0);
  });

  it('equity multiple nets out debt (not gross value over equity)', () => {
    const pf = computeProForma(baseInput());
    const buggyOldValue = pf.stabilizedValue / pf.equityRequired;
    const expected = (pf.stabilizedValue - pf.loanAmount) / pf.equityRequired;
    expect(pf.equityMultiple).toBeCloseTo(expected, 6);
    // The corrected multiple must be strictly below the old debt-blind formula.
    expect(pf.equityMultiple).toBeLessThan(buggyOldValue);
  });

  it('cash-on-cash subtracts debt service from NOI', () => {
    const pf = computeProForma(baseInput());
    const expected = (pf.netOperatingIncome - pf.annualDebtService) / pf.equityRequired;
    expect(pf.cashOnCash).toBeCloseTo(expected, 6);
    // Leveraged CoC must be below the unlevered NOI/equity it used to report.
    expect(pf.cashOnCash).toBeLessThan(pf.netOperatingIncome / pf.equityRequired);
  });

  it('charges construction interest on the average (not full) loan balance', () => {
    const pf = computeProForma({
      ...baseInput(),
      landCost: 0,
      market: { interestRate: 0.06, constructionMonths: 18 },
    });
    const base = pf.totalHardCosts + pf.softCosts + pf.contingency;
    const fullBalance = base * 0.06 * (18 / 12);
    // Average-draw factor is 0.6, so financing is ~60% of the full-balance figure.
    expect(pf.financingCosts).toBeCloseTo(fullBalance * 0.6, 2);
    expect(pf.financingCosts).toBeLessThan(fullBalance);
  });

  it('handles a zero-revenue plan without NaN/Infinity', () => {
    const pf = computeProForma({
      totalGFASqft: 0,
      siteAreaSqft: 0,
      unitMix: [],
      surfaceStalls: 0,
      structuredStalls: 0,
    });
    for (const v of Object.values(pf)) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(pf.totalUnits).toBe(0);
  });
});
