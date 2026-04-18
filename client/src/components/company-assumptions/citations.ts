/**
 * citations.ts — Single source of truth for the industry-benchmark source names
 * shown on Analyst guidance badges across the company-assumptions editor.
 *
 * Each entry is the fallback `sourceName` displayed when no live guidance
 * record is available. When the server-side research layer returns a
 * GuidanceRecord with its own `sourceName`, that wins via `researchValues`.
 * These strings are the Tier-3 (industry default) attribution.
 *
 * Centralized here so the 18 hardcoded citations that used to be scattered
 * across ManagementFeesSection, PropertyExitDefaultsCard, TaxSection,
 * FixedOverheadSection, VariableCostsSection, CompensationSection,
 * PartnerCompSection, PropertyExpenseRatesSection, and CostOfEquityCard
 * update in one place. See audit tasks #4 and #8.
 */
export const CITATIONS = {
  // Fees & incentive — ManagementFeesSection
  hvsFeeSurvey: "HVS 2024 Fee Survey",

  // Exit defaults — PropertyExitDefaultsCard
  cbreCapRateSurvey: "CBRE Cap Rate Survey",
  narTransactionData: "NAR transaction data",

  // Tax & inflation — TaxSection
  aicpaIrsBenchmarks: "AICPA/IRS benchmarks",
  cpiFedReserve: "CPI / Fed Reserve",

  // Overhead — FixedOverheadSection
  hftpAicpaBenchmarks: "HFTP/AICPA benchmarks",
  aicpaPracticeBenchmarks: "AICPA practice benchmarks",
  hftpTechnologySurvey: "HFTP Technology Survey",
  insuranceIndustryBenchmarks: "Insurance industry benchmarks",

  // Variable costs — VariableCostsSection
  ahlaLodgingSurvey: "AHLA Lodging Survey",
  ahlaIndustryBenchmarks: "AHLA industry benchmarks",

  // Comp — CompensationSection + PartnerCompSection
  ahlaLodgingIndustrySurvey: "AHLA Lodging Industry Survey",
  hospitalityCompBenchmarks: "Hospitality comp benchmarks",

  // Property expense — PropertyExpenseRatesSection
  usaliBenchmarks: "USALI benchmarks",

  // Equity cost — CostOfEquityCard
  privateReEquityBenchmarks: "Private RE equity benchmarks",
} as const;
