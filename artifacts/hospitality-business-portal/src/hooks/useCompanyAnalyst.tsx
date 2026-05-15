/**
 * useCompanyAnalyst — Owns the Analyst research stream, structured guidance
 * fetching, and three-tier researchValues cascade for the Company Assumptions
 * page.
 *
 * Extracted from `client/src/pages/CompanyAssumptions.tsx` (audit #319 R4
 * deferred precursor — task #471).
 *
 * Trigger discipline (.claude/rules/analyst-trigger-discipline.md, task
 * #738): The Analyst evaluates ONLY on an explicit `<AnalystButton />`
 * click. This hook used to host two implicit auto-triggers — the
 * `?analyst=1` deep-link and the `useAutoRefreshIntelligence` consumer —
 * both of which silently fired `generateResearch` outside the canonical
 * button-click path. Those have been removed; the only entry point is
 * `generateResearch()` returned from this hook, which the page wires
 * directly to the AnalystButton's `onClick`.
 *
 * Boundaries:
 *   • This hook does NOT own form state. It reads `global` (server payload)
 *     and the form's `isDirty` flag for read-only consumers (e.g. button
 *     gating).
 *   • Toast-driven error mapping for research failures lives here so
 *     `useCompanyResearchStream` can be wired without leaking React imports
 *     into the page shell.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { GlobalResponse } from "@/lib/api";
import { useMarketResearch } from "@/lib/api";
import type { useToast } from "@/hooks/use-toast";
import { useCompanyResearchStream } from "@/components/company-research/useCompanyResearchStream";

type Toast = ReturnType<typeof useToast>["toast"];

export interface GuidanceRecord {
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

/** Dollar-valued fields where low/mid/high are in absolute dollars. */
const DOLLAR_FIELDS = new Set([
  "staffSalary", "partnerComp", "officeLease", "professionalServices",
  "techInfra", "businessInsurance", "travelCost", "itLicense",
]);

function formatDollar(v: number): string {
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}
function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function guidanceToDisplayValue(rec: GuidanceRecord): {
  display: string;
  mid: number;
  sourceName?: string;
  sourceDate?: string;
  confidence?: string;
} | null {
  if (rec.valueMid == null) return null;
  const isDollar = DOLLAR_FIELDS.has(rec.assumptionKey);
  let display: string;
  if (rec.valueLow != null && rec.valueHigh != null && rec.valueLow !== rec.valueHigh) {
    display = isDollar
      ? `$${formatDollar(rec.valueLow)}–$${formatDollar(rec.valueHigh)}`
      : `${fmtNum(rec.valueLow)}%–${fmtNum(rec.valueHigh)}%`;
  } else {
    display = isDollar ? `$${formatDollar(rec.valueMid)}` : `${fmtNum(rec.valueMid)}%`;
  }
  return {
    display,
    mid: rec.valueMid,
    sourceName: rec.sourceName ?? undefined,
    sourceDate: rec.sourceDate ?? undefined,
    confidence: rec.confidence ?? undefined,
  };
}

/** Industry defaults (Tier 3 — always available, lowest priority). */
const COMPANY_DEFAULTS: Record<string, { display: string; mid: number }> = {
  staffSalary: { display: "$65K–$90K", mid: 75000 },
  partnerComp: { display: "$120K–$250K", mid: 180000 },
  baseManagementFee: { display: "3%–5%", mid: 4 },
  incentiveManagementFee: { display: "8%–15%", mid: 12 },
  svcFeeMarketing: { display: "0.5%–1.5%", mid: 1 },
  svcFeeTechRes: { display: "0.5%–1.2%", mid: 0.8 },
  svcFeeAccounting: { display: "0.3%–0.8%", mid: 0.5 },
  svcFeeRevMgmt: { display: "0.5%–1.5%", mid: 1 },
  svcFeeGeneralMgmt: { display: "1%–2.5%", mid: 1.5 },
  svcFeeProcurement: { display: "0.3%–0.8%", mid: 0.5 },
  eventExpense: { display: "55%–70%", mid: 65 },
  marketingRate: { display: "3%–7%", mid: 5 },
  miscOps: { display: "2%–4%", mid: 3 },
  officeLease: { display: "$24K–$48K", mid: 36000 },
  professionalServices: { display: "$18K–$36K", mid: 24000 },
  techInfra: { display: "$12K–$24K", mid: 18000 },
  businessInsurance: { display: "$8K–$20K", mid: 14000 },
  travelCost: { display: "$8K–$18K", mid: 12000 },
  itLicense: { display: "$2K–$5K", mid: 3000 },
  companyTaxRate: { display: "25%–35%", mid: 30 },
  costOfEquity: { display: "15%–22%", mid: 18 },
  exitCapRate: { display: "7%–10%", mid: 8.5 },
  dispositionCommission: { display: "4%–6%", mid: 5 },
  companyInflationRate: { display: "2.5%–4%", mid: 3 },
  otherExpenseRate: { display: "50%–70%", mid: 60 },
  utilitiesVariableSplit: { display: "50%–70%", mid: 60 },
};

export interface UseCompanyAnalystArgs {
  global: GlobalResponse | undefined;
  isLoading: boolean;
  isDirty: boolean;
  entityId: number;
  toast: Toast;
}

export interface UseCompanyAnalystReturn {
  isGenerating: boolean;
  streamedContent: string;
  generateResearch: () => void | Promise<void>;
  abortResearch: () => void;
  companyResearchUpdatedAt: string | null;
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
  companyContextReady: boolean;
}

export function useCompanyAnalyst(args: UseCompanyAnalystArgs): UseCompanyAnalystReturn {
  const { global, isLoading, isDirty, entityId, toast } = args;

  const handleResearchError = (err: { message: string; code?: string; status?: number }) => {
    if (err.code === "COMPANY_SETUP_INCOMPLETE") {
      // Company identity / start date are now managed via Admin → Model
      // Defaults (the legacy in-page Company tab was removed), so the
      // toast no longer carries a "Go to Company" jump action — there's
      // no in-page tab to jump to anymore.
      toast({
        title: "Company setup incomplete",
        description:
          "Company name and start date are required before The Analyst can work. Set them in Admin → Model Defaults.",
        variant: "destructive",
      });
      return;
    }
    if (err.code === "PROPERTIES_EXCLUDED") {
      toast({
        title: "Properties excluded by The Analyst",
        description: err.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "The Analyst couldn't run", description: err.message, variant: "destructive" });
  };

  const { isGenerating, streamedContent, generateResearch, abortResearch } =
    useCompanyResearchStream(handleResearchError);

  const { data: research } = useMarketResearch("company");
  const companyResearchUpdatedAt = research?.updatedAt ?? null;

  const { data: guidanceRecords = [] } = useQuery<GuidanceRecord[]>({
    queryKey: ["guidance", "company", entityId],
    queryFn: async () => {
      const res = await fetch(`/api/guidance/enriched/company/${entityId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!entityId,
    refetchOnWindowFocus: false,
  });

  const companyContextReady = !!(
    global &&
    (global.companyName ?? "").trim().length > 0 &&
    (global.companyCountry ?? "").trim().length > 0
  );

  // Mark `isLoading` and `isDirty` as intentionally read but not consumed
  // here — they used to drive the removed `useAutoRefreshIntelligence`
  // call. Kept on the args interface because callers (CompanyAssumptions
  // page) still pass them, and downstream button-gating logic that may
  // need them lives one level up. See header doc + task #738.
  void isLoading;
  void isDirty;

  // Three-tier cascade: structured guidance → raw JSON parsing → industry defaults.
  const researchValues = useMemo(() => {
    const merged: Record<string, { display: string; mid: number }> = { ...COMPANY_DEFAULTS };

    // Tier 2: Raw research JSON parsing (legacy fallback).
    if (research?.content) {
      const c = research.content;
      const parsePctRange = (raw: unknown): { display: string; mid: number } | null => {
        if (typeof raw !== "string" || !raw) return null;
        const str = raw;
        const nums = str.replace(/[^0-9.,\-–]/g, " ").split(/[\s–\-]+/)
          .map((s) => parseFloat(s.replace(/,/g, ""))).filter((n) => !isNaN(n));
        if (nums.length >= 2) return { display: str, mid: (nums[0] + nums[1]) / 2 };
        if (nums.length === 1) return { display: str, mid: nums[0] };
        return null;
      };
      const parseDollarRange = (raw: unknown): { display: string; mid: number } | null => {
        if (typeof raw !== "string" || !raw) return null;
        const str = raw;
        const nums = str.replace(/[^0-9.,\-–kK]/g, " ").replace(/[kK]/g, "000").split(/[\s–\-]+/)
          .map((s) => parseFloat(s.replace(/,/g, ""))).filter((n) => !isNaN(n));
        if (nums.length >= 2) return { display: str, mid: Math.round((nums[0] + nums[1]) / 2) };
        if (nums.length === 1) return { display: str, mid: nums[0] };
        return null;
      };

      const baseManagementFee = parsePctRange(
        c.managementFees?.baseFee?.recommended || c.managementFees?.baseFee?.boutiqueRange,
      );
      const incentiveManagementFee = parsePctRange(
        c.managementFees?.incentiveFee?.recommended || c.managementFees?.incentiveFee?.industryRange,
      );

      const svcCategories = c.managementFees?.serviceCategories || c.serviceCategories;
      const findSvcFee = (keyword: string) => {
        if (!svcCategories || !Array.isArray(svcCategories)) return null;
        const match = (svcCategories as Array<{ name?: string; category?: string; rate?: string; range?: string }>).find(
          (s) => (s.name || s.category || "").toLowerCase().includes(keyword.toLowerCase()),
        );
        return match ? parsePctRange(match.rate || match.range) : null;
      };

      const opExRatios = c.industryBenchmarks?.operatingExpenseRatios as
        | Array<{ category: string; range: string }>
        | undefined;
      const findRatio = (keyword: string) => {
        if (!opExRatios) return null;
        const match = opExRatios.find((r) => r.category?.toLowerCase().includes(keyword.toLowerCase()));
        return match ? parsePctRange(match.range) : null;
      };

      const rawOverrides: Record<string, { display: string; mid: number } | null> = {
        baseManagementFee,
        incentiveManagementFee,
        eventExpense: findRatio("event") || findRatio("banquet") || findRatio("catering"),
        marketingRate: findRatio("marketing") || findRatio("sales & marketing") || findRatio("franchise"),
        staffSalary: c.compensationBenchmarks?.manager ? parseDollarRange(c.compensationBenchmarks.manager) : null,
        partnerComp: c.compensationBenchmarks?.partner ? parseDollarRange(c.compensationBenchmarks.partner) : null,
        costOfEquity: parsePctRange(c.costOfEquity?.recommendedRate),
        svcFeeMarketing: findSvcFee("marketing"),
        svcFeeTechRes: findSvcFee("tech") || findSvcFee("reservations"),
        svcFeeAccounting: findSvcFee("accounting") || findSvcFee("finance"),
        svcFeeRevMgmt: findSvcFee("revenue"),
        svcFeeGeneralMgmt: findSvcFee("general") || findSvcFee("management"),
        svcFeeProcurement: findSvcFee("procurement") || findSvcFee("purchasing"),
      };
      for (const [key, val] of Object.entries(rawOverrides)) {
        if (val) merged[key] = val;
      }
    }

    // Tier 1: Structured guidance records (highest priority).
    if (guidanceRecords.length > 0) {
      for (const rec of guidanceRecords) {
        const val = guidanceToDisplayValue(rec);
        if (val) merged[rec.assumptionKey] = val;
      }
    }

    return merged;
  }, [research, guidanceRecords]);

  // NOTE (task #738): The `?analyst=1` deep-link auto-trigger that used to
  // live here was removed. Per .claude/rules/analyst-trigger-discipline.md
  // The Analyst evaluates ONLY on an explicit AnalystButton click, so
  // deep-links may no longer side-effect a research generation. If a deep
  // link to "open the page with the Analyst already running" is needed in
  // the future, surface it as a focus hint on the AnalystButton (e.g.
  // pulse + scroll-into-view) — never as a silent `generateResearch()`.

  return {
    isGenerating,
    streamedContent,
    generateResearch,
    abortResearch,
    companyResearchUpdatedAt,
    researchValues,
    companyContextReady,
  };
}
