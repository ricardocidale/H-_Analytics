/**
 * property-edit/types.ts
 *
 * Shared prop contracts for the property assumption editor sections.
 *
 * PropertyEditSectionProps — the base interface every section receives:
 *   • draft          – the mutable property object the user is editing
 *   • onChange        – sets a single field on the draft (string, number, or null)
 *   • onNumberChange  – special handler for numeric string inputs that need
 *                       intermediate "empty string" states before committing a number
 *   • globalAssumptions – fallback defaults from the company-wide global assumptions
 *   • researchValues  – AI-generated benchmark data shown as "Research" badges next
 *                       to inputs; each entry has a display string, a mid-point
 *                       number, and an optional source citation
 *
 * ManagementFeesSectionProps adds the per-property fee category grid (base fee
 * broken into named service categories like Revenue Mgmt, Marketing, etc.)
 * and the computed totalServiceFeeRate that sums all active categories.
 *
 * OtherAssumptionsSectionProps adds exitYear so the exit-related fields can
 * show which calendar year the disposition is modeled to occur.
 */
import type { FeeCategoryResponse, GuidanceRecord } from "@/lib/api";

export interface PropertyEditSectionProps {
  draft: any;
  onChange: (key: string, value: string | number | boolean | number[] | null) => void;
  onNumberChange: (key: string, value: string) => void;
  globalAssumptions: any;
  researchValues: Record<string, { display: string; mid: number; source?: string; sourceName?: string; sourceDate?: string }>;
  guidance?: GuidanceRecord[];
}

export interface ManagementFeesSectionProps extends PropertyEditSectionProps {
  feeDraft: FeeCategoryResponse[] | null;
  onFeeCategoryChange: (index: number, field: keyof FeeCategoryResponse, value: any) => void;
  totalServiceFeeRate: number;
}

export interface OtherAssumptionsSectionProps extends PropertyEditSectionProps {
  exitYear: number;
}
