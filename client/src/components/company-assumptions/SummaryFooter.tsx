/**
 * SummaryFooter.tsx — Tab-aware computed summary line for Company Assumptions.
 *
 * Renders a single sentence pinned beneath the tab content that summarizes
 * the policy of the currently active tab. Kept tab-aware so we never mix
 * topics (e.g., overhead escalation language next to staffing-tier language —
 * staffing belongs with Compensation, not Overhead).
 *
 *   • compensation tab → "Staff scales: 2.5 FTE (1-3 properties)…"
 *   • overhead tab     → "Fixed overhead escalates at X%/year…"
 *   • all other tabs   → no footer (avoid noise)
 */
import { formatPercent } from "@/lib/financialEngine";
import { STAFFING_TIERS } from "@/lib/constants";
import type { CompanyAssumptionsSectionProps } from "./types";

type FooterTab =
  | "setup"
  | "funding"
  | "revenue"
  | "compensation"
  | "overhead"
  | "tax-exit"
  | "property-defaults";

interface SummaryFooterProps extends CompanyAssumptionsSectionProps {
  activeTab: FooterTab;
}

export default function SummaryFooter({ formData, global, activeTab }: SummaryFooterProps) {
  if (activeTab === "compensation") {
    const tier1Max = formData.staffTier1MaxProperties ?? global.staffTier1MaxProperties ?? STAFFING_TIERS[0].maxProperties;
    const tier2Max = formData.staffTier2MaxProperties ?? global.staffTier2MaxProperties ?? STAFFING_TIERS[1].maxProperties;
    const tier1Fte = formData.staffTier1Fte ?? global.staffTier1Fte ?? STAFFING_TIERS[0].fte;
    const tier2Fte = formData.staffTier2Fte ?? global.staffTier2Fte ?? STAFFING_TIERS[1].fte;
    const tier3Fte = formData.staffTier3Fte ?? global.staffTier3Fte ?? STAFFING_TIERS[2].fte;
    return (
      <div
        className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm"
        data-testid="footer-compensation-summary"
      >
        <p className="text-sm text-muted-foreground text-center label-text">
          Staff scales:{" "}
          <span className="font-mono">{tier1Fte}</span> FTE (1-{tier1Max} properties),{" "}
          <span className="font-mono">{tier2Fte}</span> ({tier1Max + 1}-{tier2Max}),{" "}
          <span className="font-mono">{tier3Fte}</span> ({tier2Max + 1}+). Compensation
          begins at Operations Start Date and is prorated for partial years.
        </p>
      </div>
    );
  }

  if (activeTab === "overhead") {
    return (
      <div
        className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm"
        data-testid="footer-overhead-summary"
      >
        <p className="text-sm text-muted-foreground text-center label-text">
          Fixed overhead escalates at{" "}
          <span className="font-mono">
            {formatPercent(formData.fixedCostEscalationRate ?? global.fixedCostEscalationRate)}
          </span>
          /year. All costs begin at Operations Start Date and are prorated for partial years.
        </p>
      </div>
    );
  }

  return null;
}
