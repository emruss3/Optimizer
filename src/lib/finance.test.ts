import { computeUnderwriting } from "./finance";
import { describe, it, expect } from "vitest";

describe("computeUnderwriting", () => {
  it("computes sane metrics", () => {
    const out = computeUnderwriting({
      land_cost: 1_000_000,
      hard_cost: 6_000_000,
      soft_cost: 1_000_000,
      contingency: 500_000,
      loan_amount: 6_000_000,
      revenue: 9_500_000,
      development_months: 18,
    });

    expect(out.total_cost).toBe(8_500_000);
    expect(out.equity_required).toBe(2_500_000);
    expect(out.profit).toBe(1_000_000);
    expect(out.equity_multiple).toBeCloseTo((9_500_000 - 6_000_000) / 2_500_000, 6);
    expect(out.yield_on_cost_pct).toBeCloseTo((1_000_000 / 8_500_000) * 100, 6);
    expect(Number.isFinite(out.irr_annual_pct)).toBe(true);
  });

  it("handles edge cases gracefully", () => {
    // Zero equity case
    const zeroEquity = computeUnderwriting({
      land_cost: 0,
      hard_cost: 0,
      soft_cost: 0,
      contingency: 0,
      loan_amount: 0,
      revenue: 1000000,
      development_months: 12,
    });

    expect(zeroEquity.equity_required).toBe(0);
    expect(zeroEquity.total_cost).toBe(0);
    expect(Number.isFinite(zeroEquity.irr_annual_pct)).toBe(false); // NaN case

    // Negative revenue case
    const negativeRevenue = computeUnderwriting({
      land_cost: 1000000,
      hard_cost: 2000000,
      soft_cost: 200000,
      contingency: 100000,
      loan_amount: 2000000,
      revenue: 0,
      development_months: 24,
    });

    expect(negativeRevenue.profit).toBeLessThan(0);
    expect(negativeRevenue.equity_required).toBe(1_300_000);
  });

  it("handles extreme development timelines", () => {
    // Very short timeline
    const shortTimeline = computeUnderwriting({
      land_cost: 500000,
      hard_cost: 2000000,
      soft_cost: 300000,
      contingency: 200000,
      loan_amount: 2000000,
      revenue: 4000000,
      development_months: 1,
    });

    expect(Number.isFinite(shortTimeline.irr_annual_pct)).toBe(true);
    expect(shortTimeline.irr_annual_pct).toBeGreaterThan(0);

    // Very long timeline
    const longTimeline = computeUnderwriting({
      land_cost: 500000,
      hard_cost: 2000000,
      soft_cost: 300000,
      contingency: 200000,
      loan_amount: 2000000,
      revenue: 4000000,
      development_months: 60,
    });

    expect(Number.isFinite(longTimeline.irr_annual_pct)).toBe(true);
    expect(longTimeline.irr_annual_pct).toBeLessThan(shortTimeline.irr_annual_pct);
  });
});