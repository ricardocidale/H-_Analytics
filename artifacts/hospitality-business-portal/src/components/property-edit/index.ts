/**
 * property-edit/index.ts
 *
 * Barrel export for the property assumptions editor.
 * These seven section components are rendered together on the "Edit Property"
 * page, which lets users configure every financial input for a single hotel
 * property — from basic info (name, rooms, ADR) through capital structure,
 * revenue, operating costs, management fees, and exit assumptions.
 *
 * Each section receives a shared `PropertyEditSectionProps` contract (see
 * types.ts) so the parent page can pass the draft property object, a global
 * assumptions fallback, and an `onChange` handler that writes back to the
 * optimistic draft before persisting.
 */
export { default as DescriptionSection } from "./DescriptionSection";
export { default as BasicInfoSection } from "./BasicInfoSection";
export { default as TimelineSection } from "./TimelineSection";
export { default as CapitalStructureSection } from "./CapitalStructureSection";
export { default as RevenueAssumptionsSection } from "./RevenueAssumptionsSection";
export { default as OperatingCostRatesSection } from "./OperatingCostRatesSection";
export { default as ManagementFeesSection } from "./ManagementFeesSection";
export { default as OtherAssumptionsSection } from "./OtherAssumptionsSection";
export { default as SourceUrlsSection } from "./SourceUrlsSection";
export { default as PropertyLinksSection } from "./PropertyLinksSection";
export { ApplyResearchDialog, RESEARCH_TO_PROPERTY_MAP } from "./ApplyResearchDialog";
export type { PropertyEditSectionProps, ManagementFeesSectionProps, OtherAssumptionsSectionProps } from "./types";
