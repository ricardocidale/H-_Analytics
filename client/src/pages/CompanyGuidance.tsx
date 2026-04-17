/**
 * CompanyGuidance.tsx — AI-Guided Assumptions page for non-admin users.
 *
 * Shows all company-level assumptions as read-only values alongside
 * AI guidance ranges (from the intelligence engine). Each field displays:
 *   - Current value (set by admin)
 *   - AI guidance range (low–high from assumption_guidance)
 *   - Provenance badge: AI-Validated, Review Recommended, or Awaiting Validation
 *   - Explainer text per group
 *
 * Route: /company/guidance
 * Access: Any authenticated user (non-admin sees this instead of /company/assumptions)
 */
import { useMemo } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics";
import { useGlobalAssumptions, useProperties } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCheckCircle, IconAlertTriangle, IconClock } from "@/components/icons";
import { formatMoney } from "@/lib/financialEngine";
import { PROJECTION_YEARS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/* ─── Types ──────────────────────────────────────────────────────── */

interface GuidanceRecord {
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: "high" | "medium" | "low" | null;
  sourceName: string | null;
  sourceDate: string | null;
  reasoning: string | null;
  confidenceScore?: number;
}

type ProvenanceStatus = "validated" | "review" | "awaiting";

interface FieldDef {
  key: string;
  label: string;
  format: "pct" | "dollar" | "dollarPerYear" | "number" | "years";
  guidanceKey?: string; // maps to assumptionKey in guidance records
}

/* ─── Group Definitions ──────────────────────────────────────────── */

interface GuidanceGroup {
  id: string;
  name: string;
  explainer: string;
  fields: FieldDef[];
}

const GROUPS: GuidanceGroup[] = [
  {
    id: "revenue",
    name: "Revenue Intelligence",
    explainer:
      "Management fee structures validated against boutique hospitality industry benchmarks. Our AI cross-references CBRE, STR, and hospitality management surveys to recommend competitive fee rates.",
    fields: [
      { key: "baseManagementFee", label: "Base Management Fee", format: "pct", guidanceKey: "baseFee" },
      { key: "incentiveManagementFee", label: "Incentive Management Fee", format: "pct", guidanceKey: "incentiveFee" },
      { key: "commissionRate", label: "Acquisition Commission", format: "pct", guidanceKey: "commissionRate" },
      { key: "salesCommissionRate", label: "Disposition Commission", format: "pct", guidanceKey: "salesCommission" },
    ],
  },
  {
    id: "capital",
    name: "Capital Structure",
    explainer:
      "Capital raise architecture for the management entity. Capital commitments and deployment schedule that determine your operational runway and investor returns.",
    fields: [
      { key: "capitalRaise1Amount", label: "Capital Raise 1", format: "dollar" },
      { key: "capitalRaise2Amount", label: "Capital Raise 2", format: "dollar" },
    ],
  },
  {
    id: "team",
    name: "Team & Operations",
    explainer:
      "Staffing model calibrated to portfolio scale. The AI tiers headcount to property growth, ensuring operational efficiency at every stage of the management company's lifecycle.",
    fields: [
      { key: "staffSalary", label: "Staff Salary", format: "dollar", guidanceKey: "staffSalary" },
      { key: "staffTier1Fte", label: "Tier 1 FTE", format: "number" },
      { key: "staffTier2Fte", label: "Tier 2 FTE", format: "number" },
      { key: "staffTier3Fte", label: "Tier 3 FTE", format: "number" },
      { key: "partnerCountYear1", label: "Partners (Year 1)", format: "number" },
    ],
  },
  {
    id: "operating",
    name: "Operating Environment",
    explainer:
      "Fixed cost assumptions benchmarked against comparable hospitality management companies in your target markets. These escalate annually at the configured inflation rate.",
    fields: [
      { key: "officeLeaseStart", label: "Office Lease", format: "dollarPerYear", guidanceKey: "officeLease" },
      { key: "professionalServicesStart", label: "Professional Services", format: "dollarPerYear", guidanceKey: "professionalServices" },
      { key: "techInfraStart", label: "Tech Infrastructure", format: "dollarPerYear", guidanceKey: "techInfra" },
      { key: "businessInsuranceStart", label: "Business Insurance", format: "dollarPerYear", guidanceKey: "businessInsurance" },
      { key: "fixedCostEscalationRate", label: "Escalation Rate", format: "pct" },
    ],
  },
  {
    id: "variable",
    name: "Variable Cost Intelligence",
    explainer:
      "Per-client and percentage-based costs that scale with the portfolio. AI benchmarks these against peer hospitality management platforms to ensure realistic projections.",
    fields: [
      { key: "travelCostPerClient", label: "Travel Cost / Client", format: "dollar", guidanceKey: "travelCost" },
      { key: "itLicensePerClient", label: "IT License / Client", format: "dollar", guidanceKey: "itLicense" },
      { key: "marketingRate", label: "Marketing Rate", format: "pct", guidanceKey: "marketingRate" },
      { key: "miscOpsRate", label: "Misc Operations", format: "pct", guidanceKey: "miscOpsRate" },
    ],
  },
  {
    id: "macro",
    name: "Macro Calibration",
    explainer:
      "Economic and regulatory assumptions that frame the entire financial model. Tax jurisdiction, inflation trajectory, and projection horizon — validated against current macro data from FRED and central bank sources.",
    fields: [
      { key: "companyTaxRate", label: "Company Tax Rate", format: "pct", guidanceKey: "taxRate" },
      { key: "inflationRate", label: "Inflation Rate", format: "pct", guidanceKey: "inflationRate" },
      { key: "projectionYears", label: "Projection Years", format: "years" },
      { key: "costOfEquity", label: "Cost of Equity", format: "pct", guidanceKey: "costOfEquity" },
    ],
  },
];

/* ─── Formatting helpers ─────────────────────────────────────────── */

function formatFieldValue(value: unknown, format: FieldDef["format"]): string {
  if (value == null) return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return "—";

  switch (format) {
    case "pct":
      return `${(num * 100).toFixed(1)}%`;
    case "dollar":
      return formatMoney(num);
    case "dollarPerYear":
      return `${formatMoney(num)}/yr`;
    case "number":
      return String(Math.round(num));
    case "years":
      return `${Math.round(num)} years`;
    default:
      return String(num);
  }
}

function formatGuidanceRange(rec: GuidanceRecord, format: FieldDef["format"]): string | null {
  if (rec.valueLow == null || rec.valueHigh == null) return null;
  const isDollar = format === "dollar" || format === "dollarPerYear";

  if (isDollar) {
    return `${formatCompactDollar(rec.valueLow)} – ${formatCompactDollar(rec.valueHigh)}`;
  }
  if (format === "pct") {
    return `${fmtPct(rec.valueLow)} – ${fmtPct(rec.valueHigh)}`;
  }
  return `${Math.round(rec.valueLow)} – ${Math.round(rec.valueHigh)}`;
}

function formatCompactDollar(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

function fmtPct(v: number): string {
  const p = v * 100;
  return Number.isInteger(p) ? `${p}%` : `${p.toFixed(1)}%`;
}

/* ─── Provenance logic ───────────────────────────────────────────── */

function getProvenance(
  currentValue: unknown,
  guidance: GuidanceRecord | undefined,
): { status: ProvenanceStatus; label: string; description: string } {
  if (!guidance || guidance.valueMid == null) {
    return {
      status: "awaiting",
      label: "Awaiting Validation",
      description: "Not yet reviewed. Press the Analyst button on the Assumptions page to get guidance for this field.",
    };
  }

  const num = typeof currentValue === "number" ? currentValue : Number(currentValue);
  if (!Number.isFinite(num)) {
    return {
      status: "awaiting",
      label: "Awaiting Validation",
      description: "Current value is not set.",
    };
  }

  const low = guidance.valueLow ?? guidance.valueMid;
  const high = guidance.valueHigh ?? guidance.valueMid;

  // Allow 5% tolerance outside range
  const tolerance = Math.abs(high - low) * 0.05;
  if (num >= low - tolerance && num <= high + tolerance) {
    return {
      status: "validated",
      label: "AI-Validated",
      description: guidance.reasoning || "This value is aligned with AI intelligence recommendations.",
    };
  }

  const direction = num < low ? "below" : "above";
  return {
    status: "review",
    label: "Review Recommended",
    description: `Current value is ${direction} the AI guidance range. ${guidance.reasoning || "Consider reviewing with your administrator."}`,
  };
}

const PROVENANCE_STYLES: Record<ProvenanceStatus, { bg: string; border: string; text: string; icon: typeof IconCheckCircle }> = {
  validated: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-400",
    icon: IconCheckCircle,
  },
  review: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: IconAlertTriangle,
  },
  awaiting: {
    bg: "bg-muted/50",
    border: "border-border/60",
    text: "text-muted-foreground",
    icon: IconClock,
  },
};

/* ─── Main Component ─────────────────────────────────────────────── */

export default function CompanyGuidance() {
  const { data: global, isLoading } = useGlobalAssumptions();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: properties } = useProperties();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user } = useAuth();

  // Build a company ID for guidance API — use "company" entity type
  const companyId = global?.id?.toString() ?? "0";

  const { data: guidanceData } = useQuery<{ records: GuidanceRecord[] }>({
    queryKey: ["guidance", "company", companyId],
    queryFn: async () => {
      const res = await fetch(`/api/guidance/company/${companyId}`, { credentials: "include" });
      if (!res.ok) return { records: [] };
      return res.json();
    },
    enabled: !!global?.id,
    staleTime: 60_000,
  });

  // Index guidance records by assumptionKey
  const guidanceMap = useMemo(() => {
    const map = new Map<string, GuidanceRecord>();
    if (guidanceData?.records) {
      for (const rec of guidanceData.records) {
        map.set(rec.assumptionKey, rec);
      }
    }
    return map;
  }, [guidanceData]);

  // Compute overall validation stats
  const validationStats = useMemo(() => {
    let validated = 0;
    let review = 0;
    let awaiting = 0;
    for (const group of GROUPS) {
      for (const field of group.fields) {
        const gKey = field.guidanceKey ?? field.key;
        const guidance = guidanceMap.get(gKey);
        const value = (global as any)?.[field.key];
        const prov = getProvenance(value, guidance);
        if (prov.status === "validated") validated++;
        else if (prov.status === "review") review++;
        else awaiting++;
      }
    }
    return { validated, review, awaiting, total: validated + review + awaiting };
  }, [global, guidanceMap]);

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  if (!global) {
    return (
      <Layout>
        <div className="text-center py-16 text-muted-foreground">No company data found.</div>
      </Layout>
    );
  }

  const companyName = global.companyName || "Management Company";
  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fundingLabel = global.fundingSourceLabel ?? "Funding Vehicle";

  // Find last research timestamp from guidance records
  const lastValidated = guidanceData?.records?.reduce((latest: string | null, r) => {
    if (r.sourceDate && (!latest || r.sourceDate > latest)) return r.sourceDate;
    return latest;
  }, null);

  return (
    <Layout>
      <AnimatedPage>
        <PageHeader
          title="AI-Guided Assumptions"
          subtitle={`Intelligence-validated parameters powering ${companyName}'s financial model`}
          variant="dark"
          backLink="/company"
        />

        {/* Validation Summary Bar */}
        <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-card border border-border mb-6" data-testid="guidance-summary-bar">
          <div className="flex items-center gap-6 flex-1">
            <div className="flex items-center gap-1.5">
              <IconCheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                {validationStats.validated} AI-Validated
              </span>
            </div>
            {validationStats.review > 0 && (
              <div className="flex items-center gap-1.5">
                <IconAlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                  {validationStats.review} Review Recommended
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <IconClock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {validationStats.awaiting} Awaiting Validation
              </span>
            </div>
          </div>
          {lastValidated && (
            <span className="text-xs text-muted-foreground">
              Last validated: {new Date(lastValidated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
          )}
        </div>

        {/* Groups */}
        <div className="space-y-6">
          {GROUPS.map((group) => (
            <Card key={group.id} className="bg-card border-border shadow-sm" data-testid={`guidance-group-${group.id}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-display">{group.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{group.explainer}</p>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border/60">
                  {group.fields.map((field) => {
                    const value = field.key === "projectionYears"
                      ? projectionYears
                      : (global as any)?.[field.key];
                    const gKey = field.guidanceKey ?? field.key;
                    const guidance = guidanceMap.get(gKey);
                    const provenance = getProvenance(value, guidance);
                    const styles = PROVENANCE_STYLES[provenance.status];
                    const StatusIcon = styles.icon;
                    const rangeStr = guidance ? formatGuidanceRange(guidance, field.format) : null;

                    return (
                      <div
                        key={field.key}
                        className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                        data-testid={`guidance-field-${field.key}`}
                      >
                        {/* Label */}
                        <div className="w-44 flex-shrink-0">
                          <span className="text-sm font-medium text-foreground">{field.label}</span>
                        </div>

                        {/* Current Value */}
                        <div className="w-28 flex-shrink-0">
                          <span className="text-sm font-semibold text-foreground" data-testid={`value-${field.key}`}>
                            {formatFieldValue(value, field.format)}
                          </span>
                        </div>

                        {/* AI Guidance Range */}
                        <div className="w-36 flex-shrink-0">
                          {rangeStr ? (
                            <span className="text-xs font-medium text-secondary" data-testid={`range-${field.key}`}>
                              {rangeStr}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>

                        {/* Provenance Badge */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium cursor-help",
                                styles.bg, styles.border, styles.text
                              )}
                              data-testid={`provenance-${field.key}`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {provenance.label}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[320px]">
                            <p className="text-sm">{provenance.description}</p>
                            {guidance?.sourceName && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Source: {guidance.sourceName}
                                {guidance.sourceDate && ` · ${new Date(guidance.sourceDate).toLocaleDateString()}`}
                              </p>
                            )}
                            {guidance?.confidence && (
                              <p className="text-xs text-muted-foreground">
                                Confidence: {guidance.confidence}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>

                        {/* Spacer for alignment */}
                        <div className="flex-1" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 mb-4 text-center">
          <p className="text-xs text-muted-foreground">
            These values are configured by your administrator on the{" "}
            <span className="font-medium text-foreground">Company Assumptions</span> page.
            AI guidance ranges are generated by the intelligence engine and updated each time research is regenerated.
          </p>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
