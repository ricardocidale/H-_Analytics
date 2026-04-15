/**
 * CompanyAssumptions.tsx — Editor for management-company-level financial assumptions.
 *
 * This page lets management-level users configure the inputs that drive the
 * company pro-forma (as opposed to individual property pro-formas). Sections:
 *   • Company Setup — name, model start date, projection years, inflation
 *   • Funding — SAFE note tranches (amount, date, valuation cap, discount rate)
 *   • Management Fees — base and incentive fee structures applied to properties
 *   • Compensation — partner comp schedule (by year) and staff salary assumptions
 *   • Fixed Overhead — office lease, professional services, tech start dates
 *   • Variable Costs — travel per client, IT licensing, marketing %, misc ops %
 *   • Tax — company income tax rate
 *   • Exit & Sale — exit cap rate, sales commission rate
 *   • Property Expense Rates — default cost-rate overrides for new properties
 *   • Catering — catering revenue boost percentage
 *   • Partner Comp — year-by-year partner count and compensation table
 *   • Summary Footer — visual summary of total expenses and breakeven point
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
import { AnimatedPage, ScrollReveal } from "@/components/graphics";
import { useGlobalAssumptions, useUpdateGlobalAssumptions, useMarketResearch, useProperties, useAllFeeCategories } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconPlay, IconAlertTriangle, IconTarget } from "@/components/icons";
import { OrbitalDots } from "@/components/ui/ai-loader";
import { usePageVisit } from "@/hooks/usePageVisit";
import { FirstVisitBanner } from "@/components/intelligence/FirstVisitBanner";
import { Link, useLocation } from "wouter";
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
} from "@/components/company-assumptions";
import { GovernedFieldWrapper } from "@/components/ui/governed-field";
import { isAdminRole, GOVERNED_FIELDS, DEPRECIATION_YEARS, DAYS_PER_MONTH } from "@shared/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const { isGenerating, streamedContent, generateResearch } = useCompanyResearchStream();

  const { isFirstVisit, isAnalystStale: _isAnalystStale, recordSave: _recordPageSave, recordAnalystRun: _recordAnalystRun } = usePageVisit("company:assumptions");
  const [intelligenceClicked, setIntelligenceClicked] = useState(false);

  useEffect(() => {
    if (isFirstVisit && !isGenerating && !intelligenceClicked && global && !isLoading) {
      const timer = setTimeout(() => {
        setIntelligenceClicked(true);
        generateResearch();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFirstVisit, isGenerating, intelligenceClicked, global, isLoading, generateResearch]);

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

  const { autoRefresh, setAutoRefresh } = useAutoRefreshIntelligence({
    entityKey: "company",
    entityReady: !!global && !isLoading,
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
      const parsePctRange = (str: string | undefined): { display: string; mid: number } | null => {
        if (!str) return null;
        const nums = str.replace(/[^0-9.,\-–]/g, ' ').split(/[\s–\-]+/).map(s => parseFloat(s.replace(/,/g, ''))).filter(n => !isNaN(n));
        if (nums.length >= 2) return { display: str, mid: (nums[0] + nums[1]) / 2 };
        if (nums.length === 1) return { display: str, mid: nums[0] };
        return null;
      };
      const parseDollarRange = (str: string | undefined): { display: string; mid: number } | null => {
        if (!str) return null;
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

  const modelStartYear = global?.modelStartDate 
    ? new Date(global.modelStartDate).getFullYear() 
    : new Date(DEFAULT_MODEL_START_DATE).getFullYear();

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
      />
      <AnimatedPage>
      <div className="space-y-6">
        <PageHeader
          title="Company Assumptions"
          subtitle={`Configure ${global.companyName ?? "Hospitality Business"} Co. operating parameters`}
          variant="dark"
          backLink="/company"
          actions={
            <div className="flex items-center gap-3">
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        variant="default"
                        onClick={generateResearch}
                        disabled={isGenerating || !formData.companyName || properties.length === 0}
                        data-testid="button-run-company-research"
                      >
                        {isGenerating ? (
                          <OrbitalDots size={18} />
                        ) : (
                          <IconPlay className="w-4 h-4" />
                        )}
                        {isGenerating ? "Consulting..." : "Ask the Analyst"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {(!formData.companyName || properties.length === 0) && (
                    <TooltipContent side="bottom" className="max-w-[280px] text-center">
                      {!formData.companyName
                        ? "Set a company name before generating intelligence."
                        : "Add at least one property to your portfolio first."}
                    </TooltipContent>
                  )}
                </Tooltip>
                {(() => {
                  const { status } = computeFreshnessStatus({ researchUpdatedAt: companyResearchUpdatedAt, lastAssumptionChangeAt: global.lastAssumptionChangeAt, isGenerating: false });
                  return (
                    <span
                      className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-background ${
                        status === "current" ? "bg-primary" :
                        status === "stale" ? "bg-accent-pop" : "bg-destructive"
                      }`}
                      data-testid="indicator-research-freshness"
                    />
                  );
                })()}
              </div>
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
                  When enabled, intelligence refreshes automatically whenever you open an assumptions page with outdated data.
                </TooltipContent>
              </Tooltip>
              <Link href="/company/icp-definition" className="text-inherit no-underline">
                <Button variant="outline" data-testid="button-icp-definition">
                  <IconTarget className="w-4 h-4" />
                  ICP Definition
                </Button>
              </Link>
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

        {isFirstVisit && !isGenerating && (
          <FirstVisitBanner
            onAskAnalyst={generateResearch}
            isGenerating={isGenerating}
          />
        )}

        <CompanySetupSection formData={formData} onChange={handleUpdate} global={global} isAdmin={isAdmin} researchValues={researchValues} />

        <FundingSection formData={formData} onChange={handleUpdate} global={global} />

        <ManagementFeesSection formData={formData} onChange={handleUpdate} global={global} properties={properties} allFeeCategories={allFeeCategories} researchValues={researchValues} />

        <CompensationSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />

        <ScrollReveal>
        <div className="grid gap-6 lg:grid-cols-2">
          <FixedOverheadSection formData={formData} onChange={handleUpdate} global={global} modelStartYear={modelStartYear} researchValues={researchValues} />
          <VariableCostsSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
        </div>
        </ScrollReveal>

        <ScrollReveal>
        <div className="grid gap-6 lg:grid-cols-2">
          <TaxSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
          <ExitAssumptionsSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
        </div>
        </ScrollReveal>

        <ScrollReveal>
        <div className="grid gap-6 lg:grid-cols-2">
          <PropertyExpenseRatesSection formData={formData} onChange={handleUpdate} global={global} researchValues={researchValues} />
        </div>
        </ScrollReveal>

        <ScrollReveal>
        <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
          <div className="relative">
            <div className="space-y-4">
              <h3 className="text-lg font-display text-foreground flex items-center gap-2">
                Model Constants
              </h3>
              <p className="text-sm text-muted-foreground">
                These values are governed by external authorities and apply uniformly across all properties. Change with caution.
              </p>
              <div className="grid gap-4 lg:grid-cols-2">
                <GovernedFieldWrapper
                  authority={GOVERNED_FIELDS.depreciationYears.authority}
                  label={GOVERNED_FIELDS.depreciationYears.fieldName}
                  helperText={GOVERNED_FIELDS.depreciationYears.helperText}
                  referenceUrl={GOVERNED_FIELDS.depreciationYears.referenceUrl}
                  data-testid="governed-field-depreciationYears"
                >
                  <div className="space-y-1">
                    <Label htmlFor="depreciationYears" className="text-xs text-accent-pop dark:text-accent-pop">Years</Label>
                    <Input
                      id="depreciationYears"
                      type="number"
                      step="0.5"
                      min="1"
                      max="50"
                      value={formData.depreciationYears ?? DEPRECIATION_YEARS}
                      onChange={(e) => handleUpdate("depreciationYears", parseFloat(e.target.value) || DEPRECIATION_YEARS)}
                      className="h-8 text-sm bg-white dark:bg-background border-accent-pop/30 dark:border-accent-pop/30"
                      data-testid="input-depreciationYears"
                    />
                  </div>
                </GovernedFieldWrapper>
                <GovernedFieldWrapper
                  authority={GOVERNED_FIELDS.daysPerMonth.authority}
                  label={GOVERNED_FIELDS.daysPerMonth.fieldName}
                  helperText={GOVERNED_FIELDS.daysPerMonth.helperText}
                  referenceUrl={GOVERNED_FIELDS.daysPerMonth.referenceUrl}
                  data-testid="governed-field-daysPerMonth"
                >
                  <div className="space-y-1">
                    <Label htmlFor="daysPerMonth" className="text-xs text-accent-pop dark:text-accent-pop">Days</Label>
                    <Input
                      id="daysPerMonth"
                      type="number"
                      step="0.5"
                      min="28"
                      max="31"
                      value={formData.daysPerMonth ?? DAYS_PER_MONTH}
                      onChange={(e) => handleUpdate("daysPerMonth", parseFloat(e.target.value) || DAYS_PER_MONTH)}
                      className="h-8 text-sm bg-white dark:bg-background border-accent-pop/30 dark:border-accent-pop/30"
                      data-testid="input-daysPerMonth"
                    />
                  </div>
                </GovernedFieldWrapper>
              </div>
            </div>
          </div>
        </div>
        </ScrollReveal>

        <ScrollReveal>
          <PartnerCompSection formData={formData} onChange={handleUpdate} global={global} modelStartYear={modelStartYear} researchValues={researchValues} />
        </ScrollReveal>

        <ScrollReveal>
          <SummaryFooter formData={formData} onChange={handleUpdate} global={global} />
        </ScrollReveal>

        <div className="flex justify-end pb-8">
          <SaveButton 
            onClick={handleSave} 
            isPending={updateMutation.isPending}
            hasChanges={isDirty}
          />
        </div>
      </div>

      </AnimatedPage>
    </Layout>
  );
}
