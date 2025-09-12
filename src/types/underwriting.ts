export interface UnderwritingAssumptions {
  // Development Costs
  hardCostPerSF: number;
  softCostPercentage: number;
  contingencyPercentage: number;
  
  // Financing
  loanToValue: number;
  loanToCost: number;
  interestRate: number;
  loanTermYears: number;
  
  // Revenue (For-Sale)
  salePricePerSF: number;
  salePricePerUnit: number;
  
  // Revenue (Rental)
  rentPerSFPerMonth: number;
  rentPerUnitPerMonth: number;
  vacancyRate: number;
  operatingExpenseRatio: number;
  capRate: number;
  
  // Timeline
  developmentTimelineMonths: number;
  sellTimelineMonths: number;
  holdPeriodYears: number;
  
  // Market
  appreciationRate: number;
  rentGrowthRate: number;
  exitCapRate: number;
}

export interface UnderwritingResults {
  // Development Costs
  landCost: number;
  hardCosts: number;
  softCosts: number;
  contingency: number;
  totalDevelopmentCost: number;
  
  // Financing
  loanAmount: number;
  equityRequired: number;
  
  // Revenue Projections
  forSale: {
    grossRevenue: number;
    netRevenue: number;
    profitBeforeFinancing: number;
    irr: number;
    roi: number;
    cashOnCash: number;
  };
  
  rental: {
    yearOneNOI: number;
    stabilizedNOI: number;
    propertyValue: number;
    totalReturn: number;
    irr: number;
    cashOnCash: number;
    cashFlow: CashFlowProjection[];
  };
  
  // Sensitivity Analysis
  sensitivityMetrics: {
    breakEvenRent: number;
    breakEvenSalePrice: number;
    maxLandCost: number;
    minIRR: number;
  };
}

export interface CashFlowProjection {
  year: number;
  month: number;
  grossIncome: number;
  vacancy: number;
  effectiveIncome: number;
  operatingExpenses: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
}

export type InvestmentStrategy = 'for-sale' | 'rental' | 'mixed';

export interface UnderwritingState {
  strategy: InvestmentStrategy;
  assumptions: UnderwritingAssumptions;
  results: UnderwritingResults | null;
  customOverrides: Partial<UnderwritingAssumptions>;
}
</parameter>