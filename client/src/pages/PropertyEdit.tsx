/**
 * PropertyEdit.tsx — Property assumptions editor page.
 *
 * This page lets a user configure every financial input for a single property:
 *   • Basic info (name, location, status, photo)
 *   • Timeline (acquisition date, operations start, stabilization period)
 *   • Capital structure (purchase price, building improvements, reserves, loan terms)
 *   • Revenue assumptions (ADR, occupancy ramp, growth rates, revenue shares)
 *   • Operating cost rates (housekeeping, F&B, marketing, utilities, etc.)
 *   • Management fees (per-property fee categories with custom rates)
 *   • Other assumptions (exit cap rate, tax rate, land-value allocation)
 *
 * Research integration:
 *   The page fetches AI-generated market research for the property and merges
 *   those recommended values with generic industry defaults. Research values
 *   appear as "suggested" badges next to each input, so the user can compare
 *   their assumptions against market data at a glance.
 *
 * Saving:
 *   On save, the property record and its fee categories are updated in a
 *   two-step mutation (property first, then fees). All financial queries are
 *   invalidated so the rest of the app recalculates with the new inputs.
 *   A "beforeunload" listener warns the user if they try to leave with unsaved
 *   changes.
 */
import Layout from "@/components/Layout";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";

import { useProperty, useUpdateProperty, useGlobalAssumptions, useMarketResearch, useFeeCategories, useUpdateFeeCategories, usePropertyGuidance, type FeeCategoryResponse } from "@/lib/api";
import { useMarketRates } from "@/lib/api/market-rates";
import { ValidationStatusBadge, AnalystValidationBanner } from "@/components/analyst";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconWand2, IconEye, IconSparkles } from "@/components/icons";
import { OrbitalDots } from "@/components/ui/ai-loader";
import { usePageVisit } from "@/hooks/usePageVisit";
import { FirstVisitBanner } from "@/components/intelligence/FirstVisitBanner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SaveButton } from "@/components/ui/save-button";
import { PageHeader } from "@/components/ui/page-header";
import { Link, useRoute, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { useResearchStream } from "@/components/property-research/useResearchStream";
import { AnalystWorkingView } from "@/components/research/AnalystWorkingView";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { IntelligenceStatusBar, computeFreshnessStatus } from "@/components/intelligence/IntelligenceStatusBar";
import { useAutoRefreshIntelligence } from "@/hooks/use-auto-refresh-intelligence";
import { Switch } from "@/components/ui/switch";
import {
  PROJECTION_YEARS,
  DEFAULT_MODEL_START_DATE,
} from "@/lib/constants";
import {
  DescriptionSection,
  BasicInfoSection,
  TimelineSection,
  CapitalStructureSection,
  RevenueAssumptionsSection,
  OperatingCostRatesSection,
  ManagementFeesSection,
  OtherAssumptionsSection,
  SourceUrlsSection,
  PropertyLinksSection,
  ApplyResearchDialog,
} from "@/components/property-edit";
import RiskInsightsPanel from "@/components/property-edit/RiskInsightsPanel";
import RegulatoryNotesPanel from "@/components/property-edit/RegulatoryNotesPanel";

export default function PropertyEdit() {
  const [, params] = useRoute("/property/:id/edit");
  const [, setLocation] = useLocation();
  const propertyId = params?.id ? parseInt(params.id) : 0;
  
  const { data: property, isLoading, isError } = useProperty(propertyId);
  const { data: globalAssumptions } = useGlobalAssumptions();
  const { data: research } = useMarketResearch("property", propertyId);
  const { data: feeCategories } = useFeeCategories(propertyId);
  const { data: guidance } = usePropertyGuidance(propertyId);
  const updateProperty = useUpdateProperty();
  const updateFeeCategories = useUpdateFeeCategories();
  const { toast } = useToast();
  
  const [draft, setDraft] = useState<any>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [feeDraft, setFeeDraft] = useState<FeeCategoryResponse[] | null>(null);
  const { markDirty: markGlobalDirty, clearDirty: clearGlobalDirty } = useScenarioDirtyState();
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [showIntelligencePrompt, setShowIntelligencePrompt] = useState(false);
  const [intelligenceClicked, setIntelligenceClicked] = useState(false);
  const intelligencePromptShown = useRef(false);
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const wasGeneratingRef = useRef(false);
  const [researchStartedAt, setResearchStartedAt] = useState<number | null>(null);
  const { data: marketRates } = useMarketRates();

  const { isGenerating, streamedContent, phases, generateResearch } = useResearchStream({
    property: property ?? null,
    propertyId,
    global: globalAssumptions,
  });

  const researchUpdatedAt = research?.updatedAt ?? null;
  const propertyLastAssumptionChangeAt = property?.lastAssumptionChangeAt ?? null;

  const pageVisitKey = propertyId ? `property:${propertyId}:edit` : "";
  const { isFirstVisit, isAnalystStale: _isAnalystStale, recordSave: _recordPageSave, recordAnalystRun: _recordAnalystRun } = usePageVisit(
    pageVisitKey, "property", propertyId
  );

  const { autoRefresh, setAutoRefresh } = useAutoRefreshIntelligence({
    entityKey: `property-${propertyId}`,
    entityReady: !!property && !!(property.name && property.location && property.roomCount && property.startAdr),
    isGenerating,
    isDirty,
    researchUpdatedAt,
    lastAssumptionChangeAt: propertyLastAssumptionChangeAt,
    generateResearch,
  });

  useEffect(() => {
    if (!wasGeneratingRef.current && isGenerating) {
      setResearchStartedAt(Date.now());
    }
    if (wasGeneratingRef.current && !isGenerating && research?.content) {
      setShowApplyDialog(true);
    }
    wasGeneratingRef.current = isGenerating;
  }, [isGenerating, research]);

  useEffect(() => {
    if (feeCategories && !feeDraft) {
      setFeeDraft([...feeCategories]);
    }
  }, [feeCategories]);

  useEffect(() => {
    if (autoRefresh || intelligencePromptShown.current || !property || isGenerating) return;
    const hasBasicInfo = !!(property.name && property.location && property.roomCount && property.startAdr);
    if (!hasBasicInfo) return;
    const { status } = computeFreshnessStatus({
      researchUpdatedAt,
      lastAssumptionChangeAt: propertyLastAssumptionChangeAt,
      isGenerating: false,
    });
    if (status === "missing" || status === "stale" || status === "very_stale") {
      intelligencePromptShown.current = true;
      setShowIntelligencePrompt(true);
    }
  }, [autoRefresh, property, researchUpdatedAt, propertyLastAssumptionChangeAt, isGenerating]);

  useEffect(() => {
    if (isFirstVisit && !isGenerating && !intelligenceClicked && property?.id) {
      const hasBasicInfo = !!(property.name && property.location && property.roomCount && property.startAdr);
      if (!hasBasicInfo) return;
      const timer = setTimeout(() => {
        setIntelligenceClicked(true);
        generateResearch();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFirstVisit, isGenerating, intelligenceClicked, property?.id, property?.name, property?.location, property?.roomCount, property?.startAdr, generateResearch]);

  const handleIntelligenceNow = () => {
    setShowIntelligencePrompt(false);
    setIntelligenceClicked(true);
    generateResearch();
  };

  const handleIntelligenceLater = () => {
    setShowIntelligencePrompt(false);
  };

  // Build the merged research values used by assumption input fields.
  // Three layers are combined (lowest priority first):
  //   1. GENERIC_DEFAULTS — hardcoded industry averages used when no other data exists
  //   2. dbResearch — values previously saved in the property's `researchValues` JSON column
  //   3. AI research — real-time values extracted from the latest AI-generated market report
  // The result is a map like { adr: { display: "$175–$225", mid: 193 }, ... }
  // that each section component uses to show "suggested" badges next to inputs.
  const researchValues = (() => {
    const GENERIC_DEFAULTS: Record<string, { display: string; mid: number; source?: string }> = {
      adr: { display: "$175–$225", mid: 193 },
      occupancy: { display: "65%–73%", mid: 69 },
      startOccupancy: { display: "30%–45%", mid: 40 },
      rampMonths: { display: "12–24 mo", mid: 18 },
      capRate: { display: "8.0%–9.5%", mid: 8.5 },
      catering: { display: "25%–35%", mid: 30 },
      landValue: { display: "15%–25%", mid: 20 },
      costHousekeeping: { display: "15%–22%", mid: 20 },
      costFB: { display: "7%–12%", mid: 9 },
      costAdmin: { display: "4%–7%", mid: 5 },
      costPropertyOps: { display: "3%–5%", mid: 4 },
      costUtilities: { display: "2.9%–4.0%", mid: 3.3 },
      costFFE: { display: "3%–5%", mid: 4 },
      costMarketing: { display: "1%–3%", mid: 2 },
      costIT: { display: "0.5%–1.5%", mid: 1 },
      costOther: { display: "3%–6%", mid: 5 },
      costPropertyTaxes: { display: "1.0%–2.5%", mid: 1.5 },
      svcFeeMarketing: { display: "0.5%–1.5%", mid: 1 },
      svcFeeTechRes: { display: "1.0%–2.5%", mid: 2 },
      svcFeeAccounting: { display: "0.5%–1.5%", mid: 1 },
      svcFeeRevMgmt: { display: "0.5%–1.5%", mid: 1 },
      svcFeeGeneralMgmt: { display: "0.7%–1.2%", mid: 1 },
      svcFeeProcurement: { display: "0.5%–1.0%", mid: 0.8 },
      incentiveFee: { display: "8%–12%", mid: 10 },
      incomeTax: { display: "24%–28%", mid: 25 },
      adrGrowth: { display: "3%–5%", mid: 3.5 },
      occupancyStep: { display: "4%–6%", mid: 5 },
      revShareEvents: { display: "20%–35%", mid: 30 },
      revShareFB: { display: "15%–25%", mid: 18 },
      revShareOther: { display: "3%–8%", mid: 5 },
      saleCommission: { display: "4%–6%", mid: 5 },
    };

    const dbResearch = property?.researchValues as Record<string, { display: string; mid: number; source?: string }> | null | undefined;
    const baseDefaults: Record<string, { display: string; mid: number; source?: string }> = { ...GENERIC_DEFAULTS };
    if (dbResearch) {
      for (const [key, val] of Object.entries(dbResearch)) {
        if (val && val.display && val.mid != null && val.source !== 'none') {
          baseDefaults[key] = val;
        }
      }
    }

    if (!research?.content) {
      return baseDefaults;
    }
    const c = research.content;
    const parseRange = (rangeStr: string | undefined): { low: number; high: number; mid: number } | null => {
      if (!rangeStr) return null;
      const nums = rangeStr.replace(/[^0-9.,\-–]/g, ' ').split(/[\s–\-]+/).map(s => parseFloat(s.replace(/,/g, ''))).filter(n => !isNaN(n));
      if (nums.length >= 2) return { low: nums[0], high: nums[1], mid: Math.round((nums[0] + nums[1]) / 2) };
      if (nums.length === 1) return { low: nums[0], high: nums[0], mid: nums[0] };
      return null;
    };
    const parsePct = (pctStr: string | undefined): number | null => {
      if (!pctStr) return null;
      const match = pctStr.match(/([\d.]+)/);
      return match ? parseFloat(match[1]) : null;
    };
    const adrRange = parseRange(c.adrAnalysis?.recommendedRange);
    const capRange = parseRange(c.capRateAnalysis?.recommendedRange);
    const cateringPct = parsePct(c.cateringAnalysis?.recommendedBoostPercent);
    const landPct = parsePct(c.landValueAllocation?.recommendedPercent);
    const occText = c.occupancyAnalysis?.rampUpTimeline;
    let occRange: { low: number; high: number; mid: number } | null = null;
    let initOccRange: { low: number; high: number; mid: number } | null = null;
    let rampMonthsRange: { low: number; high: number; mid: number } | null = null;
    if (occText) {
      const stabMatch = occText.match(/stabilized occupancy of (\d+)[–\-](\d+)%/);
      if (stabMatch) occRange = { low: parseInt(stabMatch[1]), high: parseInt(stabMatch[2]), mid: Math.round((parseInt(stabMatch[1]) + parseInt(stabMatch[2])) / 2) };
      const initMatch = occText.match(/initial occupancy (?:around |of )?(\d+)[–\-](\d+)%/);
      if (initMatch) initOccRange = { low: parseInt(initMatch[1]), high: parseInt(initMatch[2]), mid: Math.round((parseInt(initMatch[1]) + parseInt(initMatch[2])) / 2) };
      const rampMatch = occText.match(/(\d+)[–\-](\d+) months/);
      if (rampMatch) rampMonthsRange = { low: parseInt(rampMatch[1]), high: parseInt(rampMatch[2]), mid: Math.round((parseInt(rampMatch[1]) + parseInt(rampMatch[2])) / 2) };
    }
    const parseCostRate = (cat: { recommendedRate?: string; industryRange?: string } | undefined): { display: string; mid: number } | null => {
      if (!cat?.recommendedRate) return null;
      const pct = parsePct(cat.recommendedRate);
      if (pct == null) return null;
      return { display: cat.recommendedRate, mid: pct };
    };

    const oc = c.operatingCostAnalysis;
    const pvc = c.propertyValueCostAnalysis;
    const msf = c.managementServiceFeeAnalysis;
    const ita = c.incomeTaxAnalysis;

    const aiValues: Record<string, { display: string; mid: number } | null> = {
      adr: adrRange ? { display: c.adrAnalysis?.recommendedRange ?? "", mid: adrRange.mid } : null,
      occupancy: occRange ? { display: `${occRange.low}%–${occRange.high}%`, mid: occRange.mid } : null,
      startOccupancy: initOccRange ? { display: `${initOccRange.low}%–${initOccRange.high}%`, mid: initOccRange.mid } : null,
      rampMonths: rampMonthsRange ? { display: `${rampMonthsRange.low}–${rampMonthsRange.high} mo`, mid: rampMonthsRange.mid } : null,
      capRate: capRange ? { display: c.capRateAnalysis?.recommendedRange ?? "", mid: (capRange.low + capRange.high) / 2 } : null,
      catering: cateringPct != null ? { display: c.cateringAnalysis?.recommendedBoostPercent ?? "", mid: cateringPct } : null,
      landValue: landPct != null ? { display: c.landValueAllocation?.recommendedPercent ?? "", mid: landPct } : null,
      costHousekeeping: parseCostRate(oc?.roomRevenueBased?.housekeeping),
      costFB: parseCostRate(oc?.roomRevenueBased?.fbCostOfSales),
      costAdmin: parseCostRate(oc?.totalRevenueBased?.adminGeneral),
      costPropertyOps: parseCostRate(oc?.totalRevenueBased?.propertyOps),
      costUtilities: parseCostRate(oc?.totalRevenueBased?.utilities),
      costFFE: parseCostRate(oc?.totalRevenueBased?.ffeReserve),
      costMarketing: parseCostRate(oc?.totalRevenueBased?.marketing),
      costIT: parseCostRate(oc?.totalRevenueBased?.it),
      costOther: parseCostRate(oc?.totalRevenueBased?.other),
      costPropertyTaxes: parseCostRate(pvc?.propertyTaxes),
      svcFeeMarketing: parseCostRate(msf?.serviceFeeCategories?.marketing),
      svcFeeTechRes: parseCostRate(msf?.serviceFeeCategories?.technologyReservations),
      svcFeeAccounting: parseCostRate(msf?.serviceFeeCategories?.accounting),
      svcFeeRevMgmt: parseCostRate(msf?.serviceFeeCategories?.revenueManagement),
      svcFeeGeneralMgmt: parseCostRate(msf?.serviceFeeCategories?.generalManagement),
      svcFeeProcurement: parseCostRate(msf?.serviceFeeCategories?.procurement),
      incentiveFee: parseCostRate(msf?.incentiveFee),
      incomeTax: ita?.recommendedRate ? parseCostRate({ recommendedRate: ita.recommendedRate }) : null,
      adrGrowth: (() => {
        const g = c.adrAnalysis?.recommendedGrowthRate ?? c.adrAnalysis?.annualGrowthRate;
        if (!g) return null;
        const pct = parsePct(g);
        return pct != null ? { display: g, mid: pct } : null;
      })(),
      occupancyStep: (() => {
        const s = c.occupancyAnalysis?.recommendedGrowthStep ?? c.occupancyAnalysis?.growthStepPercent;
        if (!s) return null;
        const pct = parsePct(s);
        return pct != null ? { display: s, mid: pct } : null;
      })(),
      revShareEvents: (() => {
        const ev = (c as any).eventDemandAnalysis?.recommendedRevenueShare ?? (c as any).eventDemandAnalysis?.recommendedPercent;
        if (!ev) return null;
        const pct = parsePct(ev);
        return pct != null ? { display: ev, mid: pct } : null;
      })(),
      revShareFB: (() => {
        const fb = (c as any).fbRevenueAnalysis?.recommendedPercent ?? (c as any).cateringAnalysis?.fbRevenueShare;
        if (!fb) return null;
        const pct = parsePct(fb);
        return pct != null ? { display: fb, mid: pct } : null;
      })(),
      revShareOther: (() => {
        const other = (c as any).ancillaryRevenueAnalysis?.recommendedPercent;
        if (!other) return null;
        const pct = parsePct(other);
        return pct != null ? { display: other, mid: pct } : null;
      })(),
      saleCommission: (() => {
        const comm = (c as any).dispositionAnalysis?.recommendedCommission ?? c.capRateAnalysis?.saleCommission;
        if (!comm) return null;
        const pct = parsePct(comm);
        return pct != null ? { display: comm, mid: pct } : null;
      })(),
    };

    const merged: Record<string, { display: string; mid: number; source?: string; sourceName?: string; sourceDate?: string }> = { ...baseDefaults };
    for (const [key, val] of Object.entries(aiValues)) {
      if (val) {
        merged[key] = { ...val, source: 'ai' };
      }
    }

    // Overlay live market rates for interest rate badge (SOFR + hotel lending spread)
    if (marketRates && marketRates.length > 0) {
      const sofr = marketRates.find(r => r.rateKey === "sofr");
      const spread = marketRates.find(r => r.rateKey === "hotel_lending_spread");
      if (sofr?.value != null) {
        const spreadBps = spread?.value ?? 275;
        const hotelRate = sofr.value + spreadBps / 100;
        merged.acqRate = {
          display: `~${hotelRate.toFixed(1)}%`,
          mid: hotelRate,
          source: "market",
          sourceName: `SOFR ${sofr.value.toFixed(2)}% + ${spreadBps}bps spread`,
          sourceDate: sofr.fetchedAt ?? undefined,
        };
      }
    }

    return merged;
  })();

  useEffect(() => {
    if (property && !draft) {
      setDraft({ ...property });
    }
  }, [property]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const projectionYears = globalAssumptions?.projectionYears ?? PROJECTION_YEARS;
  const modelStartYear = globalAssumptions?.modelStartDate 
    ? new Date(globalAssumptions.modelStartDate).getFullYear() 
    : new Date(DEFAULT_MODEL_START_DATE).getFullYear();
  const exitYear = modelStartYear + projectionYears - 1;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load property data. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <h2 className="text-2xl font-display">Property Not Found</h2>
          <Link href="/portfolio">
            <Button>Return to Portfolio</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  if (!draft) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const handleChange = (key: string, value: string | number | boolean | number[] | null) => {
    setDraft({ ...draft, [key]: value });
    setIsDirty(true);
    setDirtyFields(prev => new Set(prev).add(key));
    markGlobalDirty();
  };

  const handleNumberChange = (key: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setDraft({ ...draft, [key]: numValue });
      setIsDirty(true);
      setDirtyFields(prev => new Set(prev).add(key));
      markGlobalDirty();
    }
  };

  const handleFeeCategoryChange = (index: number, field: keyof FeeCategoryResponse, value: any) => {
    if (!feeDraft) return;
    const updated = [...feeDraft];
    updated[index] = { ...updated[index], [field]: value };
    setFeeDraft(updated);
    setIsDirty(true);
    markGlobalDirty();
  };

  const totalServiceFeeRate = feeDraft?.filter(c => c.isActive).reduce((sum, c) => sum + c.rate, 0) ?? 0;

  const finishSave = async () => {
    setIsDirty(false);
    clearGlobalDirty();
    toast({ title: "Saved", description: "Property assumptions updated successfully." });
    try {
      const res = await fetch(`/api/properties/${propertyId}/validation-alerts`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.alerts && data.alerts.length > 0) {
          const flagCount = data.alerts.length;
          toast({
            title: `The Analyst flagged ${flagCount} field${flagCount !== 1 ? "s" : ""}`,
            description: data.alerts.slice(0, 3).map((a: { field: string; message: string }) => `${a.field}: ${a.message}`).join(" · "),
            variant: "destructive",
            duration: 8000,
          });
        }
      }
    } catch {}
    setLocation(`/property/${propertyId}`);
  };

  const handleSave = () => {
    updateProperty.mutate({ id: propertyId, data: draft }, {
      onSuccess: () => {
        if (feeDraft) {
          updateFeeCategories.mutate({ propertyId, categories: feeDraft }, {
            onSuccess: () => { finishSave(); },
            onError: () => {
              toast({ title: "Error", description: "Failed to save fee categories.", variant: "destructive" });
            }
          });
        } else {
          finishSave();
        }
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save property assumptions.", variant: "destructive" });
      }
    });
  };

  const handleSourceUrlsChange = (urls: string[]) => {
    setDraft({ ...draft, sourceUrls: urls });
    setIsDirty(true);
    markGlobalDirty();
  };

  const handleResearchFromUrls = () => {
    const currentUrls = draft.sourceUrls ?? [];
    if (currentUrls.length === 0) return;
    updateProperty.mutate({ id: propertyId, data: { sourceUrls: currentUrls } }, {
      onSuccess: () => {
        generateResearch();
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save URLs before research.", variant: "destructive" });
      }
    });
  };

  const sectionProps = { draft, onChange: handleChange, onNumberChange: handleNumberChange, globalAssumptions, researchValues, guidance };

  const handleAcceptRange = (key: string, value: number) => {
    handleChange(key, value);
  };

  return (
    <Layout>
      <AnimatedPage>
      <div className="space-y-6 max-w-4xl">
        <PageHeader
          title={<span className="flex items-center gap-2">Property Assumptions <ValidationStatusBadge property={property} size="md" /></span>}
          subtitle={property.name}
          variant="dark"
          backLink={`/property/${propertyId}`}
          actions={
            <div className="flex items-center gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    onClick={() => { setIntelligenceClicked(true); generateResearch(); }}
                    disabled={isGenerating}
                    className={!intelligenceClicked && !isGenerating && (() => {
                      const { status } = computeFreshnessStatus({ researchUpdatedAt, lastAssumptionChangeAt: propertyLastAssumptionChangeAt, isGenerating: false });
                      return status !== "current";
                    })() ? "animate-intelligence-pulse" : ""}
                    data-testid="button-regenerate-intelligence"
                  >
                    <span className="relative">
                      {isGenerating ? (
                        <OrbitalDots size={18} />
                      ) : (
                        <IconSparkles className="w-4 h-4" />
                      )}
                      {!isGenerating && (() => {
                        const { status } = computeFreshnessStatus({ researchUpdatedAt, lastAssumptionChangeAt: propertyLastAssumptionChangeAt, isGenerating: false });
                        return (
                          <span
                            className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                              status === "current" ? "bg-emerald-500" :
                              status === "stale" ? "bg-amber-500" :
                              status === "very_stale" ? "bg-red-500" :
                              status === "missing" ? "bg-muted-foreground" : "bg-muted-foreground"
                            }`}
                          />
                        );
                      })()}
                    </span>
                    {isGenerating ? "Consulting..." : "Ask the Analyst"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-center">
                  {researchUpdatedAt
                    ? `Last researched ${(() => {
                        const ms = Date.now() - new Date(researchUpdatedAt).getTime();
                        const mins = Math.floor(ms / 60000);
                        if (mins < 1) return "just now";
                        if (mins < 60) return `${mins}m ago`;
                        const hrs = Math.floor(mins / 60);
                        if (hrs < 24) return `${hrs}h ago`;
                        return `${Math.floor(hrs / 24)}d ago`;
                      })()} · `
                    : ""}
                  Run AI research to get market-backed ranges for all assumptions.
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5" data-testid="toggle-auto-refresh">
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
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/property/${propertyId}/criteria`} className="text-inherit no-underline">
                    <Button variant="outline" data-testid="button-criteria">
                      <IconEye className="w-4 h-4" />
                      Criteria
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-center">
                  See exactly what data and instructions the AI uses when researching this property's market.
                </TooltipContent>
              </Tooltip>
              {research?.content && !((research.content as any)?.rawResponse) && (
                <Button
                  variant="default"
                  onClick={() => setShowApplyDialog(true)}
                  data-testid="button-apply-research"
                >
                  <IconWand2 className="w-4 h-4" />
                  Apply Research
                </Button>
              )}
              <SaveButton
                onClick={handleSave}
                isPending={updateProperty.isPending}
                hasChanges={isDirty}
              />
            </div>
          }
        />

        <IntelligenceStatusBar
          researchUpdatedAt={researchUpdatedAt}
          lastAssumptionChangeAt={propertyLastAssumptionChangeAt}
          isGenerating={isGenerating}
          onRunResearch={generateResearch}
        />

        {isFirstVisit && !isGenerating && (
          <FirstVisitBanner
            onAskAnalyst={() => { setIntelligenceClicked(true); generateResearch(); }}
            isGenerating={isGenerating}
          />
        )}

        <AnalystValidationBanner
          property={property}
          guidance={guidance}
          isGenerating={isGenerating}
          onTriggerResearch={() => { setIntelligenceClicked(true); generateResearch(); }}
          onAcceptRange={handleAcceptRange}
        />

        {isGenerating ? (
          <AnalystWorkingView
            propertyName={property.name}
            phases={phases}
            streamedContent={streamedContent}
            startedAt={researchStartedAt}
          />
        ) : (
          <>
            <BasicInfoSection {...sectionProps} />
            <DescriptionSection {...sectionProps} />
            <SourceUrlsSection
              urls={draft.sourceUrls ?? []}
              onChange={handleSourceUrlsChange}
              onRunResearch={handleResearchFromUrls}
              isGenerating={isGenerating}
            />
            <PropertyLinksSection propertyId={propertyId} />
            <TimelineSection {...sectionProps} />
            <CapitalStructureSection {...sectionProps} />
            <RevenueAssumptionsSection {...sectionProps} />
            <OperatingCostRatesSection {...sectionProps} />
            <ManagementFeesSection
              {...sectionProps}
              feeDraft={feeDraft}
              onFeeCategoryChange={handleFeeCategoryChange}
              totalServiceFeeRate={totalServiceFeeRate}
            />
            <OtherAssumptionsSection {...sectionProps} exitYear={exitYear} />

            <RiskInsightsPanel propertyId={propertyId} />
            <RegulatoryNotesPanel countryCode={draft.country} />
          </>
        )}

        <div className="flex justify-end pb-8">
          <SaveButton 
            onClick={handleSave} 
            isPending={updateProperty.isPending}
            hasChanges={isDirty}
          >
            Save All Changes
          </SaveButton>
        </div>
      </div>

      <Dialog open={showIntelligencePrompt} onOpenChange={setShowIntelligencePrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconSparkles className="w-5 h-5 text-primary" />
              Intelligence Refresh Available
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const { status } = computeFreshnessStatus({ researchUpdatedAt, lastAssumptionChangeAt: propertyLastAssumptionChangeAt, isGenerating: false });
                if (status === "missing") return "This property doesn't have AI guidance yet. Regenerating Intelligence will analyze market data and provide recommended ranges for all your assumptions.";
                if (status === "very_stale") return "AI guidance for this property is significantly outdated. Regenerating will refresh all recommended ranges with the latest market intelligence.";
                return "Assumptions have changed since the last intelligence run. Regenerating will align AI guidance with your current inputs.";
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={handleIntelligenceLater} data-testid="button-intelligence-later">
              Later
            </Button>
            <Button onClick={handleIntelligenceNow} data-testid="button-intelligence-now">
              <IconSparkles className="w-4 h-4 mr-1" />
              Ask the Analyst
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ApplyResearchDialog
        open={showApplyDialog}
        onOpenChange={setShowApplyDialog}
        draft={draft}
        researchValues={researchValues}
        dirtyFields={dirtyFields}
        onChange={(key, value) => {
          handleChange(key, value);
        }}
      />
      </AnimatedPage>
    </Layout>
  );
}
