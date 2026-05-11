/**
 * company-assumptions/index.ts
 *
 * Barrel export for the Management Company assumptions editor sections.
 * These components are mounted inside horizontal tabs on the
 * "Company Assumptions" page (see client/src/pages/CompanyAssumptions.tsx).
 *
 * Tab → component mapping (4 tabs after the May 2026 Property Defaults
 * consolidation — see ARCHITECTURE.md §1a). The legacy `Company` tab was
 * removed earlier (identity / tax / inflation fields moved to Admin →
 * Model Defaults). The legacy `Property Defaults` tab was then merged
 * into Admin → Steady State → Property Underwriting (USALI expense
 * ratios, exit cap rate, sales commission, industry vertical, exit
 * revenue multiple). Both surfaces wrote to the same globalAssumptions
 * row the engine reads, so the move is behavior-neutral.
 *   1. Funding           → FundingSection + CostOfEquityCard
 *                          (capital raise tranches + cost of capital — the
 *                           discount rate for company-level DCF. The tranche
 *                           fields are `capitalRaise*`; the instrument can be
 *                           a SAFE, convertible note, seed round, etc.)
 *   2. Revenue Model     → ManagementFeesSection
 *   3. Compensation      → CompensationSection + PartnerCompSection
 *   4. Overhead          → FixedOverheadSection + VariableCostsSection
 *
 * The HMC is an operating service business: it has NO exit cap rate. Any
 * terminal value would be DCF on FCF discounted at costOfEquity, or an
 * EBITDA multiple. See .claude/skills/finance/management-company-statements.md.
 *
 * Always pinned beneath the tabs: SummaryFooter.
 *
 * Each section uses EditableValue (an inline-editable numeric display) and
 * shares a common props contract (see types.ts) that provides the form
 * data, an onChange handler, and the global assumptions fallback values.
 *
 * Financial concepts configured here:
 *   • Capital raise tranches (`capitalRaise*` fields) — startup funding
 *     instruments. Can be SAFE notes (Simple Agreement for Future Equity),
 *     convertible notes, seed rounds, etc.
 *   • Valuation cap / discount rate — conversion terms for convertible
 *     instruments (SAFEs and convertible notes)
 *   • Staffing tiers — FTE headcount that scales with portfolio size
 *   • Fixed vs. variable costs — overhead that escalates annually vs. costs
 *     that scale per-property or as a percentage of management fee revenue
 */
export { default as EditableValue } from "./EditableValue";
export { default as CompanyIdentitySection } from "./CompanyIdentitySection";
export { default as FundingSection, CapitalRaisesCard, ConvertibleTermsCard, CapitalStackDisciplineCard } from "./FundingSection";
export { default as ManagementFeesSection } from "./ManagementFeesSection";
export { default as CompensationSection } from "./CompensationSection";
export { default as FixedOverheadSection } from "./FixedOverheadSection";
export { default as VariableCostsSection } from "./VariableCostsSection";
export { default as CostOfEquityCard } from "./CostOfEquityCard";
export { default as PartnerCompSection } from "./PartnerCompSection";
export { TabWarningsPanel } from "./TabActions";
export type { TabValidationWarning } from "./TabActions";
export { RangePillsLayer } from "./RangePillsLayer";
export type { RangePillSpec } from "./RangePillsLayer";
export { default as SummaryFooter } from "./SummaryFooter";
export { CompanyAssumptionsHeaderBar } from "./CompanyAssumptionsHeaderBar";
export { CompanyAssumptionsTabsView } from "./CompanyAssumptionsTabsView";
export { CompanyAnalystOverlay } from "./CompanyAnalystOverlay";
export type * from "./types";
