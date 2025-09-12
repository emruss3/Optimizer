import { useState, useMemo, useCallback } from 'react';
import { UnderwritingAssumptions, UnderwritingResults, UnderwritingState, InvestmentStrategy, CashFlowProjection } from '../types/underwriting';
import { ProjectState, BuildingMassing } from '../types/project';
import { computeUnderwriting, UnderwritingInputs } from '../lib/finance';

// Default market assumptions for Nashville
const DEFAULT_ASSUMPTIONS: UnderwritingAssumptions = {
  // Development Costs (per SF)
  hardCostPerSF: 180,
  softCostPercentage: 20,
  contingencyPercentage: 10,
  
  // Financing
  loanToValue: 75,
  loanToCost: 80,
  interestRate: 7.5,
  loanTermYears: 30,
  
  // For-Sale Revenue
  salePricePerSF: 320,
  salePricePerUnit: 350000,
  
  // Rental Revenue
  rentPerSFPerMonth: 1.8,
  rentPerUnitPerMonth: 1800,
  vacancyRate: 5,
  operatingExpenseRatio: 35,
  capRate: 5.5,
  
  // Timeline
  developmentTimelineMonths: 18,
  sellTimelineMonths: 6,
  holdPeriodYears: 5,
  
  // Market
  appreciationRate: 3,
  rentGrowthRate: 2.5,
  exitCapRate: 6.0
};

export function useUnderwriting(project: ProjectState | null, massing: BuildingMassing | null) {
  const [strategy, setStrategy] = useState<InvestmentStrategy>('for-sale');
  const [customOverrides, setCustomOverrides] = useState<Partial<UnderwritingAssumptions>>({});

  const assumptions = useMemo((): UnderwritingAssumptions => {
    return { ...DEFAULT_ASSUMPTIONS, ...customOverrides };
  }, [customOverrides]);

  const updateAssumption = useCallback((key: keyof UnderwritingAssumptions, value: number) => {
    setCustomOverrides(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetToDefaults = useCallback(() => {
    setCustomOverrides({});
  }, []);

  const results = useMemo((): UnderwritingResults | null => {
    if (!project || !massing) return null;

    // Basic project metrics
    const landCost = project.totalLandValue;
    const buildingGSF = massing.totalGSF;
    const units = massing.units || 0;
    
    // Development costs
    const hardCosts = buildingGSF * assumptions.hardCostPerSF;
    const softCosts = hardCosts * (assumptions.softCostPercentage / 100);
    const contingency = (hardCosts + softCosts) * (assumptions.contingencyPercentage / 100);
    const totalDevelopmentCost = landCost + hardCosts + softCosts + contingency;
    
    // Financing
    const maxLoanFromLTV = (landCost + hardCosts + softCosts + contingency) * (assumptions.loanToValue / 100);
    const maxLoanFromLTC = totalDevelopmentCost * (assumptions.loanToCost / 100);
    const loanAmount = Math.min(maxLoanFromLTV, maxLoanFromLTC);
    const equityRequired = totalDevelopmentCost - loanAmount;
    
    // For-Sale Analysis
    const forSaleGrossRevenue = units > 0 
      ? units * assumptions.salePricePerUnit 
      : buildingGSF * assumptions.salePricePerSF;
    
    const sellingCosts = forSaleGrossRevenue * 0.08; // 8% selling costs
    const forSaleNetRevenue = forSaleGrossRevenue - sellingCosts;
    const forSaleProfitBeforeFinancing = forSaleNetRevenue - totalDevelopmentCost;
    
    // Calculate For-Sale IRR (simplified)
    const forSaleIRR = calculateForSaleIRR(
      equityRequired,
      forSaleProfitBeforeFinancing,
      assumptions.developmentTimelineMonths + assumptions.sellTimelineMonths,
      loanAmount,
      assumptions.interestRate
    );
    
    const forSaleROI = (forSaleProfitBeforeFinancing / totalDevelopmentCost) * 100;
    const forSaleCashOnCash = (forSaleProfitBeforeFinancing / equityRequired) * 100;
    
    // Rental Analysis
    const annualRent = units > 0 
      ? units * assumptions.rentPerUnitPerMonth * 12
      : buildingGSF * assumptions.rentPerSFPerMonth * 12;
    
    const effectiveRent = annualRent * (1 - assumptions.vacancyRate / 100);
    const operatingExpenses = effectiveRent * (assumptions.operatingExpenseRatio / 100);
    const yearOneNOI = effectiveRent - operatingExpenses;
    
    // Stabilized NOI (after first year)
    const stabilizedNOI = yearOneNOI * Math.pow(1 + assumptions.rentGrowthRate / 100, 2);
    
    // Property value based on cap rate
    const propertyValue = stabilizedNOI / (assumptions.capRate / 100);
    
    // Calculate cash flows for rental scenario
    const cashFlows = calculateRentalCashFlows(
      yearOneNOI,
      loanAmount,
      assumptions.interestRate,
      assumptions.loanTermYears,
      assumptions.rentGrowthRate,
      assumptions.holdPeriodYears
    );
    
    const rentalIRR = calculateRentalIRR(
      equityRequired,
      cashFlows,
      propertyValue,
      assumptions.exitCapRate,
      assumptions.holdPeriodYears
    );
    
    const firstYearCashFlow = cashFlows[0]?.cashFlow || 0;
    const rentalCashOnCash = (firstYearCashFlow / equityRequired) * 100;
    const totalReturn = propertyValue - totalDevelopmentCost;
    
    // Sensitivity Analysis
    const breakEvenRent = calculateBreakEvenRent(
      totalDevelopmentCost,
      loanAmount,
      assumptions.interestRate,
      assumptions.operatingExpenseRatio,
      assumptions.vacancyRate,
      units || buildingGSF
    );
    
    const breakEvenSalePrice = totalDevelopmentCost / (units || buildingGSF);
    const maxLandCost = calculateMaxLandCost(
      assumptions.salePricePerUnit,
      assumptions.hardCostPerSF,
      units,
      buildingGSF,
      15 // Target 15% IRR
    );

    return {
      landCost,
      hardCosts,
      softCosts,
      contingency,
      totalDevelopmentCost,
      loanAmount,
      equityRequired,
      forSale: {
        grossRevenue: forSaleGrossRevenue,
        netRevenue: forSaleNetRevenue,
        profitBeforeFinancing: forSaleProfitBeforeFinancing,
        irr: forSaleIRR,
        roi: forSaleROI,
        cashOnCash: forSaleCashOnCash
      },
      rental: {
        yearOneNOI,
        stabilizedNOI,
        propertyValue,
        totalReturn,
        irr: rentalIRR,
        cashOnCash: rentalCashOnCash,
        cashFlow: cashFlows
      },
      sensitivityMetrics: {
        breakEvenRent,
        breakEvenSalePrice,
        maxLandCost,
        minIRR: Math.min(forSaleIRR, rentalIRR)
      }
    };
  }, [project, massing, assumptions]);

  return {
    strategy,
    setStrategy,
    assumptions,
    updateAssumption,
    resetToDefaults,
    results,
    customOverrides
  };
}

// Helper calculation functions
function calculateForSaleIRR(
  equity: number,
  profit: number,
  timelineMonths: number,
  loanAmount: number,
  interestRate: number
): number {
  // Simplified IRR calculation for for-sale development
  const timelineYears = timelineMonths / 12;
  const interestCosts = loanAmount * (interestRate / 100) * timelineYears;
  const netProfit = profit - interestCosts;
  
  if (equity <= 0) return 0;
  
  // Simple annualized return
  const totalReturn = netProfit / equity;
  const annualizedReturn = Math.pow(1 + totalReturn, 1 / timelineYears) - 1;
  
  return Math.max(0, annualizedReturn * 100);
}

function calculateRentalCashFlows(
  yearOneNOI: number,
  loanAmount: number,
  interestRate: number,
  loanTerm: number,
  rentGrowth: number,
  holdPeriod: number
): CashFlowProjection[] {
  const monthlyRate = interestRate / 100 / 12;
  const totalPayments = loanTerm * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, totalPayments)) / 
                        (Math.pow(1 + monthlyRate, totalPayments) - 1);
  
  const cashFlows: CashFlowProjection[] = [];
  let cumulativeCashFlow = 0;
  
  for (let year = 1; year <= holdPeriod; year++) {
    const annualNOI = yearOneNOI * Math.pow(1 + rentGrowth / 100, year - 1);
    const monthlyNOI = annualNOI / 12;
    const annualDebtService = monthlyPayment * 12;
    const annualCashFlow = annualNOI - annualDebtService;
    
    cumulativeCashFlow += annualCashFlow;
    
    cashFlows.push({
      year,
      month: 12,
      grossIncome: annualNOI / 0.95, // Reverse out vacancy
      vacancy: (annualNOI / 0.95) * 0.05,
      effectiveIncome: annualNOI + (annualNOI * 0.35), // Add back operating expenses
      operatingExpenses: annualNOI * 0.35,
      noi: annualNOI,
      debtService: annualDebtService,
      cashFlow: annualCashFlow,
      cumulativeCashFlow
    });
  }
  
  return cashFlows;
}

function calculateRentalIRR(
  equity: number,
  cashFlows: CashFlowProjection[],
  propertyValue: number,
  exitCapRate: number,
  holdPeriod: number
): number {
  if (equity <= 0 || cashFlows.length === 0) return 0;
  
  // Simple IRR approximation
  const totalCashFlow = cashFlows.reduce((sum, cf) => sum + cf.cashFlow, 0);
  const exitValue = propertyValue; // Simplified - would typically calculate based on final year NOI and exit cap
  const totalReturn = totalCashFlow + exitValue - equity;
  
  const annualizedReturn = Math.pow(totalReturn / equity, 1 / holdPeriod) - 1;
  return Math.max(0, annualizedReturn * 100);
}

function calculateBreakEvenRent(
  totalCost: number,
  loanAmount: number,
  interestRate: number,
  opexRatio: number,
  vacancyRate: number,
  units: number
): number {
  const monthlyRate = interestRate / 100 / 12;
  const loanTerm = 30 * 12;
  const monthlyPayment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTerm)) / 
                        (Math.pow(1 + monthlyRate, loanTerm) - 1);
  
  const annualDebtService = monthlyPayment * 12;
  
  // Break-even NOI needs to cover debt service
  const requiredNOI = annualDebtService;
  
  // Work backwards from NOI to required rent
  const effectiveIncomeNeeded = requiredNOI / (1 - opexRatio / 100);
  const grossIncomeNeeded = effectiveIncomeNeeded / (1 - vacancyRate / 100);
  const monthlyRentPerUnit = grossIncomeNeeded / 12 / units;
  
  return monthlyRentPerUnit;
}

function calculateMaxLandCost(
  salePricePerUnit: number,
  hardCostPerSF: number,
  units: number,
  buildingGSF: number,
  targetIRR: number
): number {
  // Simplified calculation - work backwards from target returns
  const grossRevenue = units * salePricePerUnit;
  const hardCosts = buildingGSF * hardCostPerSF;
  const otherCosts = hardCosts * 0.3; // Soft costs + contingency
  const sellingCosts = grossRevenue * 0.08;
  
  // Target profit for desired IRR (simplified)
  const targetProfit = grossRevenue * (targetIRR / 100) * 1.5; // Rough approximation
  
  const maxLandCost = grossRevenue - sellingCosts - hardCosts - otherCosts - targetProfit;
  
  return Math.max(0, maxLandCost);
}