/**
 * company/index.ts
 *
 * Barrel export for the Management Company financial statement components.
 * The "Management Company" page shows the consolidated financials of the
 * hospitality management company itself (as opposed to individual property
 * SPVs). Revenue comes from base management fees (% of property revenue) and
 * incentive fees (% of GOP — Gross Operating Profit). Expenses are the
 * company's own overhead: partner compensation, staff salaries, office lease,
 * tech, travel, marketing, etc.
 *
 *   • CompanyHeader      – summary bar with total revenue, EBITDA, and cash
 *   • CompanyIncomeTab   – multi-year income statement for the management entity
 *   • CompanyCashFlowTab – cash flow: operating cash, funding inflows, net cash
 *   • CompanyBalanceSheet – simplified balance sheet (cash, SAFE notes, equity)
 */
export { default as CompanyIncomeTab } from "./CompanyIncomeTab";
export { default as CompanyCashFlowTab } from "./CompanyCashFlowTab";
export { default as CompanyBalanceSheet } from "./CompanyBalanceSheet";
export { default as CompanyHeader } from "./CompanyHeader";
export { default as CompanyProfileTab } from "./CompanyProfileTab";
export { default as CompanyBenchmarkPanel } from "./CompanyBenchmarkPanel";
export { default as CompanyInvestmentTab } from "./CompanyInvestmentTab";
export type { CompanyTabProps, CompanyBalanceSheetProps, CompanyHeaderProps, CompanyChartDataPoint, CompanyCashAnalysis } from "./types";
