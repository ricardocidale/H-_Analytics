export const DEFAULT_SAFE_VALUATION_CAP = 2500000;
export const DEFAULT_SAFE_DISCOUNT_RATE = 0.20;
export const DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM = 0.05;
export const DEFAULT_EARLY_STAGE_CAP_DISCOUNT = 0.20;
export const DEFAULT_TRANCHE_BUFFER_MULTIPLIER = 1.15;
export const DEFAULT_FUNDING_ROUNDING_INCREMENT = 50_000;
export const DEFAULT_TRANCHE1_PERIOD_RATIO = 0.45;
export const DEFAULT_TRANCHE1_MAX_ALLOCATION = 0.65;
export const DEFAULT_TRANCHE_BIFURCATION_MONTHS = 48;
export const DEFAULT_TRANCHE2_PERIOD_RATIO = 0.75;
export const DEFAULT_TRANCHE2_ALLOCATION_PCT = 0.55;
export const DEFAULT_VALUATION_CAP_UPLIFT = 1.20;
export const DEFAULT_MIN_DISCOUNT_RATE = 0.10;
export const DEFAULT_RISK_FREE_RATE_FALLBACK = 0.04;
export const DEFAULT_SINGLE_TRANCHE_MAX_MONTHS = 18;
export const DEFAULT_SINGLE_TRANCHE_MAX_RAISE = 400_000;
export const DEFAULT_THREE_TRANCHE_MIN_T2 = 500_000;
export const DEFAULT_TREASURY_HIGH_RATE_THRESHOLD = 4.5;
export const DEFAULT_TREASURY_LOW_RATE_THRESHOLD = 3.0;

export const DEFAULT_FUNDING_INTEREST_RATE = 0.08;
export const DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY = "accrues_only";

export const DEFAULT_SAFE_TRANCHE = 800_000;

export const DEFAULT_MAX_SAFE_DISCOUNT_RATE = 0.30;
export const DEFAULT_RISK_FREE_RATE_SENSITIVITY = 0.1;
export const TRAILING_YEAR_MONTHS_OFFSET = 11;

export const SEED_DEBT_ASSUMPTIONS = {
  acqLTV: 0.75,             // Acquisition loan-to-value (75% LTV means 25% equity down)
  refiLTV: 0.75,            // Refinance loan-to-value
  interestRate: 0.09,       // Annual interest rate (9%)
  amortizationYears: 25,    // Loan fully amortizes over 25 years
  acqClosingCostRate: 0.02, // Acquisition closing costs as % of loan amount
  refiClosingCostRate: 0.03,// Refinance closing costs as % of new loan amount
} as const;
