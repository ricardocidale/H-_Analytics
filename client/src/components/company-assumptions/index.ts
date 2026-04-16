/**
 * company-assumptions/index.ts
 *
 * Barrel export for the Management Company assumptions editor sections.
 * These components are mounted inside horizontal tabs on the
 * "Company Assumptions" page (see client/src/pages/CompanyAssumptions.tsx).
 *
 * Tab → component mapping:
 *   1. Setup            → CompanySetupSection (identity, contact, HQ,
 *                          inflation, depreciation years)
 *   2. Funding          → FundingSection
 *   3. Revenue Model    → ManagementFeesSection
 *   4. Compensation     → CompensationSection + PartnerCompSection
 *   5. Overhead         → FixedOverheadSection + VariableCostsSection
 *   6. Tax & Exit       → TaxSection + ExitAssumptionsSection
 *   7. Property Defaults → PropertyExpenseRatesSection
 *
 * Always pinned beneath the tabs: SummaryFooter.
 *
 * Each section uses EditableValue (an inline-editable numeric display) and
 * shares a common props contract (see types.ts) that provides the form
 * data, an onChange handler, and the global assumptions fallback values.
 *
 * Financial concepts configured here:
 *   • SAFE notes — Simple Agreement for Future Equity (startup funding instrument)
 *   • Valuation cap / discount rate — SAFE conversion terms
 *   • Staffing tiers — FTE headcount that scales with portfolio size
 *   • Fixed vs. variable costs — overhead that escalates annually vs. costs
 *     that scale per-property or as a percentage of management fee revenue
 */
export { default as EditableValue } from "./EditableValue";
export { default as CompanySetupSection } from "./CompanySetupSection";
export { default as FundingSection } from "./FundingSection";
export { default as ManagementFeesSection } from "./ManagementFeesSection";
export { default as CompensationSection } from "./CompensationSection";
export { default as FixedOverheadSection } from "./FixedOverheadSection";
export { default as VariableCostsSection } from "./VariableCostsSection";
export { default as TaxSection } from "./TaxSection";
export { default as ExitAssumptionsSection } from "./ExitAssumptionsSection";
export { default as PropertyExpenseRatesSection } from "./PropertyExpenseRatesSection";
export { default as PartnerCompSection } from "./PartnerCompSection";
export { TabActions } from "./TabActions";
export type { TabValidationWarning } from "./TabActions";
export { default as SummaryFooter } from "./SummaryFooter";
export type * from "./types";
