/**
 * company-assumptions/types.ts
 *
 * Prop contracts for the Management Company assumptions editor sections.
 *
 * CompanyAssumptionsSectionProps is the base interface shared by most sections:
 *   • formData – the editable draft of the global assumptions object
 *   • onChange – writes a single field back to the draft
 *   • global   – the persisted global assumptions used as fallback values
 *
 * Specialized variants add extra data:
 *   • FundingSectionProps       – same base (SAFE tranche fields live in global)
 *   • ManagementFeesSectionProps – adds the list of properties and their fee
 *     categories so the read-only fee summary table can render per-property rates
 *   • CompensationSectionProps  – adds researchValues for AI salary benchmarks
 *   • FixedOverheadSectionProps – adds modelStartYear for display in the header
 *   • VariableCostsSectionProps – adds researchValues for marketing/travel benchmarks
 *   • PartnerCompSectionProps   – adds modelStartYear for year labels in the table
 *   • PropertyExpenseRatesSectionProps – adds researchValues for expense benchmarks
 */
import type { GlobalResponse, FeeCategoryResponse } from "@/lib/api";

export interface CompanyAssumptionsSectionProps {
  formData: Partial<GlobalResponse>;
  onChange: <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => void;
  global: GlobalResponse;
}

/**
 * FundingSection has the same shape as the base section. It used to also
 * accept the Funding Specialist verdict and render it inline; that
 * responsibility now lives in the parent (CompanyAssumptionsTabsView)
 * because the section emits a fragment of three sibling cards into the
 * outer grid and the verdict reads better as a full-width row beneath.
 */
export type FundingSectionProps = CompanyAssumptionsSectionProps;

export interface PortfolioPropertySummary {
  id: number;
  name: string;
  isActive?: boolean;
  baseManagementFeeRate?: number;
  incentiveManagementFeeRate?: number;
}

export interface ManagementFeesSectionProps extends CompanyAssumptionsSectionProps {
  properties: PortfolioPropertySummary[];
  allFeeCategories: FeeCategoryResponse[];
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export interface CompensationSectionProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export interface FixedOverheadSectionProps extends CompanyAssumptionsSectionProps {
  modelStartYear: number;
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export interface VariableCostsSectionProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export interface PropertyExpenseRatesSectionProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

export interface PartnerCompSectionProps extends CompanyAssumptionsSectionProps {
  modelStartYear: number;
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}
