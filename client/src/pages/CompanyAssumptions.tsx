/**
 * CompanyAssumptions.tsx — Editor for management-company-level financial assumptions.
 *
 * Layout: 7 horizontal tabs sit beneath a sticky header. A single shared
 * `formData` + `handleSave` powers every tab — tabs are pure visual organization
 * over the same form state. The active tab is mirrored to the URL via the
 * `?tab=` query param so deep links and refreshes preserve location.
 *
 * Tabs:
 *   1. Setup            — identity, contact, HQ, financial/regulatory,
 *                          inflation rate, depreciation years (model constant)
 *   2. Funding          — SAFE note tranches (amount, date, cap, discount, interest)
 *   3. Revenue Model    — service categories + incentive fee + per-property summary
 *   4. Compensation     — staff salary, staffing tiers, partner comp schedule
 *   5. Overhead         — fixed overhead + variable costs (side-by-side)
 *   6. Tax & Exit       — company income tax + exit/sale/valuation (side-by-side)
 *   7. Property Defaults — cascading defaults for new properties
 *
 * Pinned outside tabs: PageHeader, IntelligenceStatusBar, FirstVisitBanner,
 * ResearchTheater overlay, SummaryFooter (always visible totals), and the
 * bottom Save Changes button.
 *
 * Days Per Month is intentionally NOT here — it lives in
 * Admin → App Defaults → Market & Macro as the single source of truth for
 * that app-wide constant.
 *
 * AI research integration:
 *   The page loads company-level market research and extracts recommended values
 *   (e.g. industry-standard management fee ranges, staff salary benchmarks).
 *   These are passed to each section component so "suggested" badges appear.
 *
 * On save, the entire formData object is POSTed to the global-assumptions
 * endpoint, and all financial queries are invalidated for full recalculation.
 */
import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useGlobalAssumptions, useUpdateGlobalAssumptions, useMarketResearch, useProperties, useAllFeeCategories } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { usePageVisit } from "@/hooks/usePageVisit";
import { FirstVisitBanner } from "@/components/intelligence/FirstVisitBanner";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import type { GlobalResponse } from "@/lib/api";
import { SaveButton } from "@/components/ui/save-button";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { DEFAULT_MODEL_START_DATE } from "@/lib/constants";
import { useCompanyResearchStream } from "@/components/company-research/useCompanyResearchStream";
import { ResearchTheater } from "@/components/research/ResearchTheater";
import type { ResearchJob } from "@/components/research/ResearchTheater";
import {
  CompanySetupSection,
  FundingSection,
  ManagementFeesSection,
  CompensationSection,
  FixedOverheadSection,
  VariableCostsSection,
  TaxSection,
  ExitAssumptionsSection,
  PropertyExpenseRatesSection,
  PartnerCompSection,
  SummaryFooter,
  TabActions,
  type TabValidationWarning,
} from "@/components/company-assumptions";
import { isAdminRole } from "@shared/constants";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { IntelligenceStatusBar, computeFreshnessStatus } from "@/components/intelligence/IntelligenceStatusBar";
import { useAutoRefreshIntelligence } from "@/hooks/use-auto-refresh-intelligence";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

/** Structured guidance record from /api/guidance/enriched/company/:id */
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

/** Dollar-valued fields where low/mid/high are in absolute dollars (not percentages) */
const DOLLAR_FIELDS = new Set([
  "staffSalary", "partnerComp", "officeLease", "professionalServices",
  "techInfra", "businessInsurance", "travelCost", "itLicense",
]);

/** Convert a guidance record to the { display, mid } format badges expect */
function guidanceToDisplayValue(rec: GuidanceRecord): { display: string; mid: number; sourceName?: string; sourceDate?: string; confidence?: string } | null {
  if (rec.valueMid == null) return null;
  const isDollar = DOLLAR_FIELDS.has(rec.assumptionKey);

  let display: string;
  if (rec.valueLow != null && rec.valueHigh != null) {
    if (isDollar) {
      display = `$${formatDollar(rec.valueLow)}–$${formatDollar(rec.valueHigh)}`;
    } else {
      display = `${fmtNum(rec.valueLow)}%–${fmtNum(rec.valueHigh)}%`;
    }
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

function formatDollar(v: number): string {
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}

function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function CompanyAssumptions() {
  const [, setLocation] = useLocation();
  const { data: global, isLoading, isError } = useGlobalAssumptions();
  const { data: properties = [] } = useProperties();
  const { data: allFeeCategories = [] } = useAllFeeCategories();
  const updateMutation = useUpdateGlobalAssumptions();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;

  // Map server-returned error codes to actionable user-facing toasts.
  const handleResearchError = (err: { message: string; code?: string; status?: number }) => {
    if (err.code === "COMPANY_SETUP_INCOMPLETE") {
      toast({
        title: "Company setup incomplete",
        description: "Company name and start date are required before The Analyst can work.",
        variant: "destructive",
        action: (
          <button
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "setup");
              window.history.replaceState({}, "", url.toString());
              window.dispatchEvent(new Event("popstate"));
            }}
            className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1 text-xs font-medium hover:bg-accent"
            data-testid="toast-action-goto-setup"
          >
            Go to Setup
          </button>
        ) as never,
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

  const { isGenerating, streamedContent, generateResearch, abortResearch } = useCompanyResearchStream(handleResearchError);

  const { isFirstVisit, isAnalystStale: _isAnalystStale, recordSave: _recordPageSave, recordAnalystRun: _recordAnalystRun } = usePageVisit("company:assumptions");

  // The Analyst is an explicit, user-initiated action — never auto-fire on
  // mount. The page shows a "first visit" banner nudging the user toward the
  // header "Analyst" button; the Auto-refresh switch additionally
  // gates scheduled refreshes on sufficient company context below.

  const [formData, setFormData] = useState<Partial<GlobalResponse>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [dirtyFields, setDirtyFields] = useState<Set<keyof GlobalResponse>>(new Set());
  const { markDirty: markGlobalDirty, clearDirty: clearGlobalDirty } = useScenarioDirtyState();
  const { data: research } = useMarketResearch("company");
  const companyResearchUpdatedAt = research?.updatedAt ?? null;
  const entityId = user?.id ?? 1;

  // Fetch structured guidance records extracted by the server after research runs
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

  // The Analyst needs a minimum amount of company context before it can
  // produce useful research. Without at least a name and a country we block
  // auto-refresh so it doesn't burn an LLM call on an empty / seeded profile.
  const companyContextReady = !!(
    global &&
    (global.companyName ?? "").trim().length > 0 &&
    (global.companyCountry ?? "").trim().length > 0
  );

  const { autoRefresh, setAutoRefresh } = useAutoRefreshIntelligence({
    entityKey: "company",
    entityReady: !!global && !isLoading && companyContextReady,
    isGenerating,
    isDirty,
    researchUpdatedAt: companyResearchUpdatedAt,
    lastAssumptionChangeAt: global?.lastAssumptionChangeAt ?? null,
    generateResearch,
  });

  // Three-tier cascade: structured guidance → raw JSON parsing → industry defaults
  const researchValues = useMemo(() => {
    // Tier 3: Industry defaults (always available, lowest priority)
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

    const merged = { ...COMPANY_DEFAULTS };

    // Tier 2: Raw research JSON parsing (legacy fallback when guidance records not yet extracted)
    if (research?.content) {
      const c = research.content;
      const parsePctRange = (raw: unknown): { display: string; mid: number } | null => {
        if (typeof raw !== "string" || !raw) return null;
        const str = raw;
        const nums = str.replace(/[^0-9.,\-–]/g, ' ').split(/[\s–\-]+/).map(s => parseFloat(s.replace(/,/g, ''))).filter(n => !isNaN(n));
        if (nums.length >= 2) return { display: str, mid: (nums[0] + nums[1]) / 2 };
        if (nums.length === 1) return { display: str, mid: nums[0] };
        return null;
      };
      const parseDollarRange = (raw: unknown): { display: string; mid: number } | null => {
        if (typeof raw !== "string" || !raw) return null;
        const str = raw;
        const nums = str.replace(/[^0-9.,\-–kK]/g, ' ').replace(/[kK]/g, '000').split(/[\s–\-]+/).map(s => parseFloat(s.replace(/,/g, ''))).filter(n => !isNaN(n));
        if (nums.length >= 2) return { display: str, mid: Math.round((nums[0] + nums[1]) / 2) };
        if (nums.length === 1) return { display: str, mid: nums[0] };
        return null;
      };

      const baseManagementFee = parsePctRange(c.managementFees?.baseFee?.recommended || c.managementFees?.baseFee?.boutiqueRange);
      const incentiveManagementFee = parsePctRange(c.managementFees?.incentiveFee?.recommended || c.managementFees?.incentiveFee?.industryRange);

      const svcCategories = c.managementFees?.serviceCategories || c.serviceCategories;
      const findSvcFee = (keyword: string) => {
        if (!svcCategories || !Array.isArray(svcCategories)) return null;
        const match = (svcCategories as Array<{ name?: string; category?: string; rate?: string; range?: string }>).find(
          s => (s.name || s.category || "").toLowerCase().includes(keyword.toLowerCase())
        );
        return match ? parsePctRange(match.rate || match.range) : null;
      };

      const opExRatios = c.industryBenchmarks?.operatingExpenseRatios as Array<{ category: string; range: string }> | undefined;
      const findRatio = (keyword: string) => {
        if (!opExRatios) return null;
        const match = opExRatios.find(r => r.category?.toLowerCase().includes(keyword.toLowerCase()));
        return match ? parsePctRange(match.range) : null;
      };

      const rawOverrides: Record<string, { display: string; mid: number } | null> = {
        baseManagementFee, incentiveManagementFee,
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

    // Tier 1: Structured guidance records (highest priority — from server-side extraction)
    if (guidanceRecords.length > 0) {
      for (const rec of guidanceRecords) {
        const val = guidanceToDisplayValue(rec);
        if (val) merged[rec.assumptionKey] = val;
      }
    }

    return merged;
  }, [research, guidanceRecords]);

  useEffect(() => {
    if (global) {
      setFormData(global);
    }
  }, [global]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("analyst") !== "1") return;
    if (!companyContextReady || isGenerating) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("analyst");
    window.history.replaceState({}, "", url.toString());
    generateResearch();
  }, [companyContextReady, isGenerating, generateResearch]);

  const modelStartYear = global?.modelStartDate 
    ? new Date(global.modelStartDate).getFullYear() 
    : new Date(DEFAULT_MODEL_START_DATE).getFullYear();

  const TAB_KEYS = ["setup", "funding", "revenue", "compensation", "overhead", "tax-exit", "property-defaults"] as const;
  type TabKey = typeof TAB_KEYS[number];

  // Which form fields belong to which tab. Drives per-tab save + per-tab
  // validation. Fields not listed in any tab are saved via the global header
  // Save button (which sends the full dirty set).
  const TAB_FIELDS: Record<TabKey, readonly (keyof GlobalResponse)[]> = {
    setup: [
      "companyName", "companyCountry", "companyCity", "companyAddress",
      "companyOpsStartDate", "modelStartDate", "projectionYears",
      "companyInflationRate", "inflationRate", "depreciationYears",
      "companyLogoId", "companyPhone", "companyEmail", "companyWebsite",
      "companyRegistrationNumber", "companyTaxId",
      "companyContactName", "companyContactTitle", "companyContactEmail", "companyContactPhone",
    ] as unknown as Array<keyof GlobalResponse>,
    funding: [
      "safeNoteTranches", "safeNoteCapAmount", "safeNoteDiscount",
    ] as unknown as Array<keyof GlobalResponse>,
    revenue: [
      "baseManagementFee", "incentiveManagementFee",
      "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
      "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
    ] as unknown as Array<keyof GlobalResponse>,
    compensation: [
      "staffSalary",
      "staffTier1MaxProperties", "staffTier1Fte",
      "staffTier2MaxProperties", "staffTier2Fte", "staffTier3Fte",
      "partnerCompYear1", "partnerCompYear2", "partnerCompYear3",
      "partnerCompYear4", "partnerCompYear5", "partnerCompYear6",
      "partnerCompYear7", "partnerCompYear8", "partnerCompYear9", "partnerCompYear10",
      "partnerCountYear1", "partnerCountYear2", "partnerCountYear3",
      "partnerCountYear4", "partnerCountYear5", "partnerCountYear6",
      "partnerCountYear7", "partnerCountYear8", "partnerCountYear9", "partnerCountYear10",
    ] as unknown as Array<keyof GlobalResponse>,
    overhead: [
      "officeLease", "professionalServices", "techInfra",
      "businessInsurance", "travelCost", "itLicense",
      "eventExpense", "marketingRate", "miscOps",
    ] as unknown as Array<keyof GlobalResponse>,
    "tax-exit": [
      "companyTaxRate", "costOfEquity", "exitCapRate", "dispositionCommission",
    ] as unknown as Array<keyof GlobalResponse>,
    "property-defaults": [
      "eventExpenseRate", "otherExpenseRate", "utilitiesVariableSplit",
    ] as unknown as Array<keyof GlobalResponse>,
  };

  // Post-save validation warnings, keyed by tab. Populated after a tab save
  // when saved values fall outside The Analyst's recommended range.
  const [tabWarnings, setTabWarnings] = useState<Record<TabKey, TabValidationWarning[]>>({
    setup: [], funding: [], revenue: [], compensation: [],
    overhead: [], "tax-exit": [], "property-defaults": [],
  });
  const [savingTab, setSavingTab] = useState<TabKey | null>(null);

  const TAB_LABELS: Record<TabKey, string> = {
    setup: "Setup",
    funding: "Funding",
    revenue: "Revenue Model",
    compensation: "Compensation",
    overhead: "Overhead",
    "tax-exit": "Tax & Exit",
    "property-defaults": "Property Defaults",
  };
  const getInitialTab = (): TabKey => {
    if (typeof window === "undefined") return "setup";
    const t = new URLSearchParams(window.location.search).get("tab");
    return (TAB_KEYS as readonly string[]).includes(t ?? "") ? (t as TabKey) : "setup";
  };
  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab);
  const handleTabChange = (val: string) => {
    setActiveTab(val as TabKey);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", val);
      window.history.replaceState({}, "", url.toString());
    }
  };

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load assumptions. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  if (isLoading || !global) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const handleUpdate = <K extends keyof GlobalResponse>(field: K, value: GlobalResponse[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setDirtyFields((prev) => new Set(prev).add(field));
    setIsDirty(true);
    markGlobalDirty();
  };


  // Parse a "low–high" or "$X–$Y" display string into numeric bounds.
  const parseRange = (display: string): { low: number; high: number } | null => {
    if (!display) return null;
    const nums = display
      .replace(/[kK]/g, "000")
      .replace(/[^0-9.,\-–]/g, " ")
      .split(/[\s–\-]+/)
      .map((s) => parseFloat(s.replace(/,/g, "")))
      .filter((n) => !Number.isNaN(n));
    if (nums.length >= 2) return { low: Math.min(nums[0], nums[1]), high: Math.max(nums[0], nums[1]) };
    return null;
  };

  // Map a formData field key to the researchValues key (most are identical;
  // partnerComp{Year,Count}* collapse to the single "partnerComp" entry).
  const researchKeyFor = (field: keyof GlobalResponse): string | null => {
    const f = String(field);
    if (f.startsWith("partnerComp")) return "partnerComp";
    return f in researchValues ? f : null;
  };

  const computeTabWarnings = (
    keys: readonly (keyof GlobalResponse)[],
    data: Partial<GlobalResponse>,
  ): TabValidationWarning[] => {
    const out: TabValidationWarning[] = [];
    // De-duplicate multi-year fields (e.g., partnerCompYear1..10) that map to a
    // single research key — one warning per research key, not per field.
    const seenByResearchKey = new Set<string>();
    for (const k of keys) {
      const rk = researchKeyFor(k);
      if (!rk) continue;
      const rv = researchValues[rk];
      if (!rv) continue;
      const range = parseRange(rv.display);
      if (!range) continue;
      const raw = data[k];
      const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
      if (!Number.isFinite(num)) continue;
      if (num < range.low || num > range.high) {
        if (seenByResearchKey.has(rk)) continue;
        seenByResearchKey.add(rk);
        out.push({
          fieldName: String(k),
          fieldLabel: String(k),
          currentValue: num,
          rangeLow: range.low,
          rangeHigh: range.high,
          display: rv.display,
        });
      }
    }
    return out;
  };

  const handleSaveTab = async (tab: TabKey) => {
    const keys = TAB_FIELDS[tab];
    const touched = keys.filter((k) => dirtyFields.has(k));
    if (touched.length === 0) {
      toast({ title: "No changes in this tab", description: "Nothing to save." });
      return;
    }
    const payload: Partial<GlobalResponse> = {};
    for (const k of touched) (payload as Record<string, unknown>)[k as string] = formData[k];

    setSavingTab(tab);
    try {
      await updateMutation.mutateAsync(payload);
      // Remove saved keys from dirty set; update isDirty accordingly.
      setDirtyFields((prev) => {
        const next = new Set(prev);
        for (const k of touched) next.delete(k);
        if (next.size === 0) {
          setIsDirty(false);
          clearGlobalDirty();
        }
        return next;
      });

      // Post-save validation — flag fields outside The Analyst's range.
      const warnings = computeTabWarnings(touched, formData);
      setTabWarnings((prev) => ({ ...prev, [tab]: warnings }));

      toast({
        title: `${tab === "tax-exit" ? "Tax & Exit" : tab.replace(/-/g, " ")} saved`,
        description: warnings.length > 0
          ? `${warnings.length} value${warnings.length === 1 ? "" : "s"} outside The Analyst's range — review below.`
          : "Changes take effect immediately.",
      });
    } catch (error: unknown) {
      console.error(`Failed to save ${tab} tab:`, error);
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Failed to save changes.",
        variant: "destructive",
      });
    } finally {
      setSavingTab(null);
    }
  };

  // Clear a tab's warnings when the user starts editing fields in that tab again.
  useEffect(() => {
    (Object.keys(TAB_FIELDS) as TabKey[]).forEach((tab) => {
      if (tabWarnings[tab].length === 0) return;
      const stillDirty = TAB_FIELDS[tab].some((k) => dirtyFields.has(k));
      if (stillDirty) {
        setTabWarnings((prev) => ({ ...prev, [tab]: [] }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyFields]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(formData);
      setIsDirty(false);
      setDirtyFields(new Set());
      clearGlobalDirty();

      const propertyDefaultKeys: Array<keyof GlobalResponse> = [
        "eventExpenseRate",
        "otherExpenseRate",
        "utilitiesVariableSplit",
      ];
      const touchedPropertyDefaults = propertyDefaultKeys.some(
        (k) => dirtyFields.has(k),
      );

      if (touchedPropertyDefaults) {
        toast({
          title: "Property defaults saved",
          description: `These will apply to new properties. ${properties.length} existing ${properties.length === 1 ? "property retains its" : "properties retain their"} current values.`,
        });
      } else {
        toast({
          title: "Company settings saved",
          description: "Changes take effect immediately.",
        });
      }
      setLocation("/company");
    } catch (error: unknown) {
      console.error("Failed to save company assumptions:", error);
      toast({
        title: "Error",
        description: "Failed to save company assumptions.",
        variant: "destructive",
      });
    }
  };

  const researchJobs: ResearchJob[] = isGenerating ? [
    { id: "company-context", label: "Analyzing company context", group: "Preparation", status: streamedContent.length > 0 ? "complete" : "generating" },
    { id: "icp-profile", label: "Processing ICP profile", group: "Preparation", status: streamedContent.length > 100 ? "complete" : streamedContent.length > 0 ? "generating" : "pending" },
    { id: "fee-benchmarks", label: "Benchmarking fee structures", group: "Research", status: streamedContent.length > 500 ? "complete" : streamedContent.length > 100 ? "generating" : "pending" },
    { id: "compensation", label: "Analyzing compensation data", group: "Research", status: streamedContent.length > 1000 ? "complete" : streamedContent.length > 500 ? "generating" : "pending" },
    { id: "operating-ratios", label: "Calculating operating ratios", group: "Research", status: streamedContent.length > 1500 ? "complete" : streamedContent.length > 1000 ? "generating" : "pending" },
    { id: "synthesis", label: "Synthesizing findings", group: "Finalization", status: streamedContent.length > 2000 ? "generating" : "pending" },
  ] : [];

  return (
    <Layout>
      <ResearchTheater
        jobs={researchJobs}
        streamingText={streamedContent}
        isVisible={isGenerating}
        onCancel={abortResearch}
      />
      <AnimatedPage>
      <div className="space-y-6">
        <PageHeader
          title="Company Assumptions"
          subtitle={`Configure ${global.companyName ?? "Hospitality Business"} operating parameters`}
          variant="dark"
          backLink="/company"
          actions={
            <div className="flex items-center gap-3">
              <AnalystButton
                onClick={generateResearch}
                isRunning={isGenerating}
                disabled={!formData.companyName || properties.length === 0}
                disabledReason={
                  !formData.companyName
                    ? "Set a company name before generating intelligence."
                    : "Add at least one property to your portfolio first."
                }
                freshnessStatus={
                  computeFreshnessStatus({
                    researchUpdatedAt: companyResearchUpdatedAt,
                    lastAssumptionChangeAt: global.lastAssumptionChangeAt,
                    isGenerating: false,
                  }).status
                }
                dataTestId="button-run-company-research"
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5" data-testid="toggle-auto-refresh-company">
                    <Switch
                      checked={autoRefresh}
                      onCheckedChange={setAutoRefresh}
                      className="scale-75"
                    />
                    <span className="text-[10px] font-medium text-muted-foreground leading-tight whitespace-nowrap">Auto</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-center">
                  Auto-refresh intelligence when assumptions change
                </TooltipContent>
              </Tooltip>
              <SaveButton 
                onClick={handleSave} 
                isPending={updateMutation.isPending}
                hasChanges={isDirty}
              />
            </div>
          }
        />

        <IntelligenceStatusBar
          researchUpdatedAt={companyResearchUpdatedAt}
          lastAssumptionChangeAt={global.lastAssumptionChangeAt ?? null}
          isGenerating={isGenerating}
          onRunResearch={generateResearch}
        />

        {(() => {
          const { status } = computeFreshnessStatus({
            researchUpdatedAt: companyResearchUpdatedAt,
            lastAssumptionChangeAt: global.lastAssumptionChangeAt,
            isGenerating,
          });
          // Hide the first-visit banner once intelligence is up to date —
          // the green status bar already conveys the same information.
          if (!isFirstVisit || isGenerating || status === "current") return null;
          return <FirstVisitBanner />;
        })()}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="sticky top-0 z-10 -mx-2 px-2 py-2 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1" data-testid="tabs-company-assumptions">
              <TabsTrigger value="setup" data-testid="tab-setup">Setup</TabsTrigger>
              <TabsTrigger value="funding" data-testid="tab-funding">Funding</TabsTrigger>
              <TabsTrigger value="revenue" data-testid="tab-revenue">Revenue Model</TabsTrigger>
              <TabsTrigger value="compensation" data-testid="tab-compensation">Compensation</TabsTrigger>
              <TabsTrigger value="overhead" data-testid="tab-overhead">Overhead</TabsTrigger>
              <TabsTrigger value="tax-exit" data-testid="tab-tax-exit">Tax &amp; Exit</TabsTrigger>
              <TabsTrigger value="property-defaults" data-testid="tab-property-defaults">Property Defaults</TabsTrigger>
            </TabsList>
          </div>

          {(TAB_KEYS).map((tab) => {
            const renderBody = () => {
              switch (tab) {
                case "setup":
                  return <CompanySetupSection formData={formData} onChange={handleUpdate} global={global} isAdmin={isAdmin} researchValues={researchValues} />;
                case "funding":
                  return <FundingSection formData={formData} onChange={handleUpdate} global={global} />;
                case "revenue":
                  return <ManagementFeesSection formData={formData} onChange={handleUpdate} global={global} properties={properties} allFeeCategories={allFeeCategories} researchValues={researchValues} />;
                case "compensation":
                  return (
                    <>
                      <CompensationSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
                      <PartnerCompSection formData={formData} onChange={handleUpdate} global={global} modelStartYear={modelStartYear} researchValues={researchValues} />
                    </>
                  );
                case "overhead":
                  return (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <FixedOverheadSection formData={formData} onChange={handleUpdate} global={global} modelStartYear={modelStartYear} researchValues={researchValues} />
                      <VariableCostsSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
                    </div>
                  );
                case "tax-exit":
                  return (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <TaxSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
                      <ExitAssumptionsSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
                    </div>
                  );
                case "property-defaults":
                  return <PropertyExpenseRatesSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />;
              }
            };
            const tabDirty = TAB_FIELDS[tab].some((k) => dirtyFields.has(k));
            return (
              <TabsContent
                key={tab}
                value={tab}
                className="mt-0 space-y-6"
                data-testid={`tab-content-${tab}`}
              >
                <TabActions
                  tabLabel={TAB_LABELS[tab]}
                  onAskAnalyst={generateResearch}
                  isAnalystRunning={isGenerating}
                  askAnalystDisabled={!formData.companyName || properties.length === 0}
                  askAnalystDisabledReason={
                    !formData.companyName
                      ? "Set a company name before generating intelligence."
                      : properties.length === 0
                        ? "Add at least one property to your portfolio first."
                        : undefined
                  }
                  onSave={() => handleSaveTab(tab)}
                  isSaving={savingTab === tab && updateMutation.isPending}
                  hasChanges={tabDirty}
                  warnings={tabWarnings[tab]}
                  onDismissWarning={(fieldName) =>
                    setTabWarnings((prev) => ({
                      ...prev,
                      [tab]: prev[tab].filter((w) => w.fieldName !== fieldName),
                    }))
                  }
                />
                {renderBody()}
              </TabsContent>
            );
          })}
        </Tabs>

        <SummaryFooter formData={formData} onChange={handleUpdate} global={global} activeTab={activeTab} />
      </div>

      </AnimatedPage>
    </Layout>
  );
}
