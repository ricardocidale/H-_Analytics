/**
 * property-detail/index.ts
 *
 * Barrel export for the read-only property detail view.
 * These components render the computed financial statements and KPIs for a
 * single property, drawing on data produced by the financial engine:
 *
 *   • PropertyHeader  – hero image, name, location, and acquisition details
 *   • IncomeStatementTab – multi-year USALI income statement with revenue,
 *                          departmental expenses, undistributed costs, and NOI
 *   • CashFlowTab     – annual cash flow waterfall from NOI through debt service,
 *                        reserves, and net cash flow; includes DSCR calculation
 *   • PPECostBasisSchedule – depreciation and cost basis schedule for Property,
 *                            Plant & Equipment (PP&E) and FF&E (furniture,
 *                            fixtures & equipment), following straight-line GAAP
 */
export { default as PPECostBasisSchedule } from "./PPECostBasisSchedule";
export { default as IncomeStatementTab } from "./IncomeStatementTab";
export { default as CashFlowTab } from "./CashFlowTab";
export { default as PropertyHeader } from "./PropertyHeader";
export { default as BenchmarkPanel } from "./BenchmarkPanel";
export { default as ReconciliationTab } from "./ReconciliationTab";
export { default as InvestmentReturnsTab } from "./InvestmentReturnsTab";
