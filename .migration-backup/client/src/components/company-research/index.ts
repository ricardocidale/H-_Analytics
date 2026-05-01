/**
 * company-research/index.ts
 *
 * Barrel export for the company-level AI market research feature.
 * The research page has 7 tabbed sections:
 *
 *   1. Management Fees      – base/incentive fee benchmarks (AI-generated)
 *   2. Service Revenue       – per-service fee range benchmarks (deterministic)
 *   3. Vendor Costs & Markups – industry markup and margin analysis (deterministic)
 *   4. Overhead Benchmarks   – G&A overhead norms by portfolio scale (static)
 *   5. Competitive Landscape – competitor types and differentiation (static)
 *   6. Partner Compensation  – comp by role and growth stage (static + AI)
 *   7. Full AI Research      – complete AI-generated company research (AI-generated)
 */
export { CompanyResearchSections } from "./CompanyResearchSections";
export { useCompanyResearchStream } from "./useCompanyResearchStream";
export { ServiceRevenueTab } from "./ServiceRevenueTab";
export { VendorCostsTab } from "./VendorCostsTab";
export { OverheadBenchmarksTab } from "./OverheadBenchmarksTab";
export { CompetitiveLandscapeTab } from "./CompetitiveLandscapeTab";
export { PartnerCompTab } from "./PartnerCompTab";
export { companySectionColors } from "./types";
export type { SectionColorScheme } from "./types";
