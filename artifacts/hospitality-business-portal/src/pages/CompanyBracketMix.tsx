import { useState, useMemo, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import superjson from "superjson";
import Layout from "@/components/Layout";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { PageErrorState } from "@/components/ui/page-error-state";
import { AnimatedPage, AnimatedSection } from "@/components/graphics/AnimatedPage";
import {
  useGlobalAssumptions,
  useProperties,
  useIcpBrackets,
  useIcpBracketMix,
  useSaveBracketMix,
  type IcpBracket,
  type BracketMix,
} from "@/lib/api";
import { PROJECTION_YEARS } from "@/lib/constants";
import type { CompanyMonthlyFinancials } from "@engine/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconTarget,
  IconBuilding,
  IconDatabase,
  IconDollarSign,
  IconUsers,
  IconFileText,
  IconMapPin,
  IconAlertTriangle,
  IconInfo,
  IconExternalLink,
  IconBookOpen,
  IconGlobe,
  IconCheck,
} from "@/components/icons";
import { DEFAULT_ICP_CONFIG, DEFAULT_ICP_DESCRIPTIVE } from "@/components/admin/icp-config";
import type { IcpConfig, IcpDescriptive } from "@/components/admin/icp-config";
import type { GlobalResponse, PropertyResponse } from "@/lib/api/types";
import {
  ICP_BRACKET_MIX_MAX_ENTRIES,
  ICP_BRACKET_MIX_WEIGHT_TOLERANCE,
} from "@shared/constants";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const TABS: CurrentThemeTabItem[] = [
  { value: "bracket-mix", label: "Bracket Mix", icon: IconTarget },
  { value: "market-evidence", label: "Market Evidence", icon: IconDatabase },
  { value: "data-sources", label: "Data Sources", icon: IconGlobe },
  { value: "legacy-icp", label: "Legacy ICP", icon: IconBookOpen },
];

function DataCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-muted/30 border-border p-3 space-y-1">
      <p className="label-text text-muted-foreground uppercase tracking-wide text-[11px]">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </Card>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const ICP_BRACKET_FOCUS_AREAS = [
  "Competitive brand comps — ADR bands, RevPAR benchmarks, service tiers",
  "Customer property archetypes — boutique hotel, branded STR cluster, agritourism, event-venue",
  "Service-consumption profiles — hotel (full) vs STR (marketing / branding / performance bonus only)",
  "National pass-through vendor cost percentages per service line",
  "Mgmt Co markup factors on vendor pass-through as % of revenue",
  "Market RevPAR and occupancy trends per bracket archetype",
];

function formatAdrBand(low: number | null, high: number | null): string {
  if (!low && !high) return "—";
  const fmt = (n: number) => `$${n.toFixed(0)}`;
  if (low && high) return `${fmt(low)}–${fmt(high)}/night`;
  if (low) return `${fmt(low)}+/night`;
  return `up to ${fmt(high!)}/night`;
}

function BracketCard({
  bracket,
  isSelected,
  weightPct,
  onToggle,
  onWeightChange,
  disabled,
}: {
  bracket: IcpBracket;
  isSelected: boolean;
  weightPct: string;
  onToggle: () => void;
  onWeightChange: (val: string) => void;
  disabled: boolean;
}) {
  const isHotel = bracket.customer_type === "hotel";
  const typeColor = isHotel
    ? "border-chart-1/30 bg-chart-1/5"
    : "border-primary/30 bg-primary/5";
  const selectedBorder = isSelected
    ? isHotel
      ? "border-chart-1/60 ring-1 ring-chart-1/30"
      : "border-primary/60 ring-1 ring-primary/30"
    : "border-border";

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all cursor-pointer select-none",
        typeColor,
        selectedBorder,
        !isSelected && "opacity-70 hover:opacity-100",
      )}
      data-testid={`bracket-card-${bracket.slug}`}
      onClick={onToggle}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-4 h-4 rounded border flex items-center justify-center shrink-0",
              isSelected
                ? isHotel ? "bg-chart-1 border-chart-1" : "bg-primary border-primary"
                : "border-muted-foreground/40 bg-background",
            )}
          >
            {isSelected && <IconCheck className="w-2.5 h-2.5 text-white" />}
          </div>
          <p className="text-sm font-semibold text-foreground leading-tight">{bracket.name}</p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] shrink-0 uppercase tracking-wide",
            isHotel ? "border-chart-1/40 text-chart-1" : "border-primary/40 text-primary",
          )}
        >
          {bracket.customer_type}
        </Badge>
      </div>

      <p className="text-[11px] font-medium text-muted-foreground mb-1">{bracket.archetype_label}</p>

      {bracket.description && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-2 line-clamp-2">
          {bracket.description}
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground mb-3">
        <span className="flex items-center gap-1">
          <IconDollarSign className="w-3 h-3" />
          {formatAdrBand(bracket.target_adr_band_low, bracket.target_adr_band_high)}
        </span>
        {bracket.service_consumption_profile === "str_only" && (
          <span className="text-primary/70">Marketing &amp; bonus only</span>
        )}
        {bracket.service_consumption_profile === "full" && (
          <span className="text-chart-1/70">All service lines</span>
        )}
      </div>

      {bracket.comp_set_names && bracket.comp_set_names.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {bracket.comp_set_names.slice(0, 4).map((name, i) => (
            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">
              {name}
            </Badge>
          ))}
          {bracket.comp_set_names.length > 4 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              +{bracket.comp_set_names.length - 4}
            </Badge>
          )}
        </div>
      )}

      {isSelected && (
        <div
          className="flex items-center gap-2 pt-2 border-t border-border/50 mt-1"
          onClick={(e) => e.stopPropagation()}
        >
          <label className="text-xs text-muted-foreground shrink-0 min-w-[52px]">Weight %</label>
          <Input
            type="number"
            min={1}
            max={100}
            step={1}
            value={weightPct}
            onChange={(e) => onWeightChange(e.target.value)}
            disabled={disabled}
            className="h-7 text-xs w-24"
            data-testid={`bracket-weight-${bracket.slug}`}
          />
        </div>
      )}
    </div>
  );
}

interface CompanyImpactSummary {
  year1Revenue: number;
  year1GrossProfit: number;
  totalRevenue: number;
  totalGrossProfit: number;
}

function summarizeCompanyImpact(monthly: CompanyMonthlyFinancials[], projectionYears: number): CompanyImpactSummary {
  const monthsPerYear = 12;
  const year1Months = monthly.slice(0, monthsPerYear);
  const totalMonths = monthly.slice(0, projectionYears * monthsPerYear);
  return {
    year1Revenue: year1Months.reduce((s, m) => s + (m.totalRevenue ?? 0), 0),
    year1GrossProfit: year1Months.reduce((s, m) => s + (m.grossProfit ?? 0), 0),
    totalRevenue: totalMonths.reduce((s, m) => s + (m.totalRevenue ?? 0), 0),
    totalGrossProfit: totalMonths.reduce((s, m) => s + (m.grossProfit ?? 0), 0),
  };
}

function findFirstShortfall(
  monthly: CompanyMonthlyFinancials[],
  projectionYears: number,
): { year: number; endingCash: number } | null {
  const horizon = Math.min(monthly.length, projectionYears * 12);
  for (let i = 0; i < horizon; i++) {
    const m = monthly[i];
    if (m.cashShortfall) {
      return { year: m.year, endingCash: m.endingCash };
    }
  }
  return null;
}

async function fetchCompanyComputeWithMix(
  properties: PropertyResponse[],
  global: GlobalResponse,
  bracketMix: BracketMix | null,
  projectionYears: number,
): Promise<CompanyMonthlyFinancials[]> {
  const body: Record<string, unknown> = {
    properties: properties.filter((p) => p.isActive !== false),
    globalAssumptions: global,
    projectionYears,
  };
  if (bracketMix && bracketMix.length > 0) body.bracketMix = bracketMix;
  const res = await fetch("/api/finance/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Company compute failed (${res.status})`);
  }
  const raw = await res.json();
  const isSuperjson = res.headers.get("X-Superjson") === "true";
  const result = (isSuperjson ? superjson.deserialize(raw) : raw) as { companyMonthly: CompanyMonthlyFinancials[] };
  return result.companyMonthly ?? [];
}

function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtSignedMoney(n: number): string {
  if (Math.abs(n) < 1) return "$0";
  const formatted = fmtMoney(n);
  return n > 0 ? `+${formatted}` : formatted;
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function BracketMixImpactCallout({
  savedMix,
  proposedMix,
  proposedReady,
}: {
  savedMix: BracketMix | null | undefined;
  proposedMix: BracketMix;
  proposedReady: boolean;
}) {
  const { data: global } = useGlobalAssumptions();
  const { data: properties } = useProperties();
  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const activeProperties = (properties ?? []).filter((p) => p.isActive !== false);
  const enabled = !!global && activeProperties.length > 0 && proposedReady;

  const savedKey = JSON.stringify((savedMix ?? []).slice().sort((a, b) => a.bracketSlug.localeCompare(b.bracketSlug)));
  const proposedKey = JSON.stringify(proposedMix.slice().sort((a, b) => a.bracketSlug.localeCompare(b.bracketSlug)));
  const sameAsSaved = savedKey === proposedKey;

  const savedQuery = useQuery({
    queryKey: ["bracket-impact-saved", savedKey, projectionYears, activeProperties.length],
    queryFn: () => fetchCompanyComputeWithMix(activeProperties, global!, savedMix ?? null, projectionYears),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const proposedQuery = useQuery({
    queryKey: ["bracket-impact-proposed", proposedKey, projectionYears, activeProperties.length],
    queryFn: () => fetchCompanyComputeWithMix(activeProperties, global!, proposedMix, projectionYears),
    enabled: enabled && !sameAsSaved,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  if (!enabled) {
    return (
      <Card className="border border-dashed border-border bg-muted/20 p-4" data-testid="bracket-impact-callout-empty">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Revenue impact preview</p>
            <p className="text-xs text-muted-foreground mt-1">
              Pick brackets that sum to 100% to see how the proposed mix shifts company
              revenue and gross profit versus your currently saved mix.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const isLoading = savedQuery.isLoading || (!sameAsSaved && proposedQuery.isLoading);
  const error = savedQuery.error ?? proposedQuery.error;

  if (error) {
    return (
      <Card className="border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-4" data-testid="bracket-impact-callout-error">
        <div className="flex gap-3">
          <IconAlertTriangle className="w-5 h-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">Could not compute revenue impact</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error"}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (isLoading || !savedQuery.data) {
    return (
      <Card className="border border-border p-4" data-testid="bracket-impact-callout-loading">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Estimating revenue impact…</p>
        </div>
      </Card>
    );
  }

  const baseline = summarizeCompanyImpact(savedQuery.data, projectionYears);
  const proposedMonthly = sameAsSaved ? savedQuery.data : proposedQuery.data;
  const proposed = sameAsSaved
    ? baseline
    : (proposedQuery.data ? summarizeCompanyImpact(proposedQuery.data, projectionYears) : null);
  const proposedShortfall = proposedMonthly
    ? findFirstShortfall(proposedMonthly, projectionYears)
    : null;
  const baselineShortfall = findFirstShortfall(savedQuery.data, projectionYears);

  if (!proposed) {
    return (
      <Card className="border border-border p-4" data-testid="bracket-impact-callout-loading">
        <div className="flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Estimating revenue impact…</p>
        </div>
      </Card>
    );
  }

  const revDelta = proposed.totalRevenue - baseline.totalRevenue;
  const gpDelta = proposed.totalGrossProfit - baseline.totalGrossProfit;
  const revDeltaPct = baseline.totalRevenue > 0 ? revDelta / baseline.totalRevenue : NaN;
  const gpDeltaPct = baseline.totalGrossProfit > 0 ? gpDelta / baseline.totalGrossProfit : NaN;
  const y1RevDelta = proposed.year1Revenue - baseline.year1Revenue;
  const y1GpDelta = proposed.year1GrossProfit - baseline.year1GrossProfit;

  const tone = revDelta > 0
    ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950/30"
    : revDelta < 0
      ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
      : "border-border bg-muted/20";
  const savedHasMix = !!savedMix && savedMix.length > 0;

  return (
    <Card className={cn("border p-4 space-y-3", tone)} data-testid="bracket-impact-callout">
      <div className="flex items-start gap-3">
        <IconDollarSign className="w-5 h-5 text-foreground/70 shrink-0 mt-0.5" />
        <div className="space-y-1 flex-1">
          <p className="text-sm font-semibold text-foreground">
            Revenue impact of the proposed mix
          </p>
          <p className="text-xs text-muted-foreground">
            Comparing the proposed mix against{" "}
            <span className="font-medium text-foreground">
              {savedHasMix ? "your currently saved mix" : "the no-bracket baseline"}
            </span>
            {" "}across the {projectionYears}-year company pro forma.
          </p>
        </div>
      </div>

      {proposedShortfall && (
        <div
          className="rounded-lg border border-amber-400 bg-amber-100/70 dark:border-amber-600 dark:bg-amber-950/50 p-3 flex gap-2 items-start"
          data-testid="bracket-impact-cash-shortfall-warning"
        >
          <IconAlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Proposed mix triggers a cash shortfall in year {proposedShortfall.year}
            </p>
            <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed">
              The Mgmt Co's projected ending cash first turns negative
              ({fmtMoney(proposedShortfall.endingCash)}) in year {proposedShortfall.year} under
              this mix{baselineShortfall ? ` (saved mix also shortfalls in year ${baselineShortfall.year})` : ""}.
              Adjust weights toward higher-margin brackets to remove the shortfall.
            </p>
          </div>
        </div>
      )}

      {sameAsSaved ? (
        <p className="text-xs text-muted-foreground" data-testid="bracket-impact-no-change">
          Proposed mix matches the saved mix — no change in projected revenue or gross profit.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-border bg-background/60 p-3" data-testid="impact-revenue">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {projectionYears}-yr revenue
            </p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {fmtSignedMoney(revDelta)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({fmtPct(revDeltaPct)})
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Year 1 {fmtSignedMoney(y1RevDelta)} · {fmtMoney(baseline.totalRevenue)} → {fmtMoney(proposed.totalRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background/60 p-3" data-testid="impact-gross-profit">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {projectionYears}-yr gross profit
            </p>
            <p className="text-base font-semibold tabular-nums text-foreground">
              {fmtSignedMoney(gpDelta)}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({fmtPct(gpDeltaPct)})
              </span>
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Year 1 {fmtSignedMoney(y1GpDelta)} · {fmtMoney(baseline.totalGrossProfit)} → {fmtMoney(proposed.totalGrossProfit)}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function BracketMixTab() {
  const { data: brackets = [], isLoading: bracketsLoading } = useIcpBrackets();
  const { data: savedMix, isLoading: mixLoading } = useIcpBracketMix();
  const saveMutation = useSaveBracketMix();
  const { toast } = useToast();

  const [selectedSlugs, setSelectedSlugs] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (initialized || mixLoading) return;
    if (savedMix && savedMix.length > 0) {
      setSelectedSlugs(new Set(savedMix.map((e) => e.bracketSlug)));
      const w: Record<string, string> = {};
      savedMix.forEach((e) => { w[e.bracketSlug] = String(Math.round(e.weight * 100)); });
      setWeights(w);
    }
    setInitialized(true);
  }, [savedMix, mixLoading, initialized]);

  const weightSum = Array.from(selectedSlugs).reduce((sum, slug) => {
    const pct = parseFloat(weights[slug] ?? "0");
    return sum + (isNaN(pct) ? 0 : pct);
  }, 0);

  const weightSumFraction = weightSum / 100;
  const weightSumOk = Math.abs(weightSumFraction - 1) <= ICP_BRACKET_MIX_WEIGHT_TOLERANCE;
  const selectedCount = selectedSlugs.size;
  const atMax = selectedCount >= ICP_BRACKET_MIX_MAX_ENTRIES;

  const handleToggle = (slug: string) => {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
        setWeights((w) => { const n = { ...w }; delete n[slug]; return n; });
      } else {
        if (next.size >= ICP_BRACKET_MIX_MAX_ENTRIES) {
          toast({
            title: "Bracket limit reached",
            description: `You can select up to ${ICP_BRACKET_MIX_MAX_ENTRIES} brackets.`,
            variant: "destructive",
          });
          return prev;
        }
        next.add(slug);
        const remaining = 100 - Array.from(next).filter((s) => s !== slug).reduce((s, sl) => {
          const pct = parseFloat(weights[sl] ?? "0");
          return s + (isNaN(pct) ? 0 : pct);
        }, 0);
        setWeights((w) => ({ ...w, [slug]: String(Math.max(1, remaining)) }));
      }
      return next;
    });
  };

  const handleSplitEqually = () => {
    const slugs = Array.from(selectedSlugs);
    if (slugs.length < 2) return;
    const base = Math.floor(100 / slugs.length);
    const remainder = 100 - base * slugs.length;
    const next: Record<string, string> = { ...weights };
    slugs.forEach((slug, idx) => {
      const value = idx === slugs.length - 1 ? base + remainder : base;
      next[slug] = String(value);
    });
    setWeights(next);
  };

  const handleSave = async () => {
    if (selectedSlugs.size === 0) {
      toast({ title: "No brackets selected", description: "Select at least one bracket.", variant: "destructive" });
      return;
    }
    if (!weightSumOk) {
      toast({
        title: "Weights must sum to 100%",
        description: `Current total: ${weightSum.toFixed(1)}%. Adjust weights before saving.`,
        variant: "destructive",
      });
      return;
    }
    const mix = Array.from(selectedSlugs).map((slug) => ({
      bracketSlug: slug,
      weight: Math.round((parseFloat(weights[slug] ?? "0") / 100) * 10000) / 10000,
    }));
    try {
      await saveMutation.mutateAsync(mix);
      toast({ title: "Bracket mix saved", description: "Your bracket mix has been updated." });
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : "An error occurred.",
        variant: "destructive",
      });
    }
  };

  const isLoading = bracketsLoading || mixLoading;

  const proposedMix: BracketMix = useMemo(
    () =>
      Array.from(selectedSlugs).map((slug) => ({
        bracketSlug: slug,
        weight: Math.round((parseFloat(weights[slug] ?? "0") / 100) * 10000) / 10000,
      })),
    [selectedSlugs, weights],
  );

  return (
    <div className="space-y-4">
      <Card className="bg-primary/5 border-primary/20 p-4" data-testid="bracket-mix-info">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">What is a bracket mix?</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Each Management Company's ICP is expressed as a weighted mix across up to{" "}
              <span className="font-medium text-foreground">{ICP_BRACKET_MIX_MAX_ENTRIES} brackets</span>.
              Brackets are customer-property archetypes characterized from real hospitality brand
              comps. The mix drives all Management Company revenue and expense calculations
              automatically. Hotels consume all service lines; STRs consume only marketing,
              branding, and performance-bonus fees.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-5" data-testid="bracket-mix-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">ICP Bracket Mix</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Select 1–{ICP_BRACKET_MIX_MAX_ENTRIES} brackets and assign weights that sum to 100%.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selectedCount > 0 && (
              <div
                className={cn(
                  "flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-mono tabular-nums",
                  weightSumOk
                    ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-200"
                    : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
                )}
                data-testid="weight-sum-indicator"
              >
                {weightSumOk
                  ? <IconCheck className="w-3 h-3" />
                  : <IconAlertTriangle className="w-3 h-3" />}
                {weightSum.toFixed(0)}%
              </div>
            )}
            {selectedCount >= 2 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSplitEqually}
                disabled={saveMutation.isPending || isLoading}
                className="text-xs h-8"
                data-testid="button-split-equally"
              >
                Split equally
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveMutation.isPending || selectedCount === 0 || !weightSumOk || isLoading}
              className="text-xs h-8 gap-1.5"
              data-testid="button-save-bracket-mix"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {saveMutation.isPending ? "Saving…" : "Save Mix"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : brackets.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-14 rounded-xl border border-dashed border-border bg-muted/20 text-center gap-3"
            data-testid="bracket-catalog-empty"
          >
            <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center">
              <IconTarget className="w-5 h-5 text-muted-foreground opacity-50" />
            </div>
            <p className="text-sm font-medium text-foreground">No brackets in catalog</p>
            <p className="text-xs text-muted-foreground max-w-sm leading-relaxed">
              The bracket catalog is managed by Administrators under{" "}
              <span className="font-medium">
                Admin → AI → Intelligence → Knowledge &amp; Resources → Tables
              </span>
              .
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {atMax && (
              <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2" data-testid="bracket-max-warning">
                <IconAlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Maximum of {ICP_BRACKET_MIX_MAX_ENTRIES} brackets selected. Deselect one to add another.
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="bracket-catalog">
              {brackets.map((bracket) => (
                <BracketCard
                  key={bracket.slug}
                  bracket={bracket}
                  isSelected={selectedSlugs.has(bracket.slug)}
                  weightPct={weights[bracket.slug] ?? ""}
                  onToggle={() => handleToggle(bracket.slug)}
                  onWeightChange={(val) => setWeights((w) => ({ ...w, [bracket.slug]: val }))}
                  disabled={saveMutation.isPending}
                />
              ))}
            </div>
            {selectedCount > 0 && !weightSumOk && (
              <p className="text-xs text-amber-700 dark:text-amber-300" data-testid="weight-sum-error">
                Weights sum to {weightSum.toFixed(1)}% — adjust to reach exactly 100% before saving.
              </p>
            )}
            {selectedCount > 0 && weightSumOk && (
              <p className="text-xs text-green-700 dark:text-green-400" data-testid="weight-sum-ok">
                Weights sum to 100% — ready to save.
              </p>
            )}
          </div>
        )}
      </Card>

      <BracketMixImpactCallout
        savedMix={savedMix}
        proposedMix={proposedMix}
        proposedReady={selectedCount > 0 && weightSumOk}
      />
      <Card className="border border-border rounded-lg p-5 space-y-3" data-testid="service-consumption-rules">
        <SectionHeading icon={IconUsers} title="Service-Consumption Rules (built into the model)" />
        <p className="text-xs text-muted-foreground">
          These are hard rules baked into each bracket — not per-company toggles.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 rounded-lg border border-chart-1/20 bg-chart-1/5 px-3 py-2.5">
            <IconBuilding className="w-4 h-4 text-chart-1 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Hotel brackets</p>
              <p className="text-xs text-muted-foreground">
                Consume <span className="font-medium">all</span> Management Company service lines
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <IconBuilding className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">STR brackets</p>
              <p className="text-xs text-muted-foreground">
                Consume <span className="font-medium">only</span> marketing, branding, and
                performance-bonus fees
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MarketEvidenceTab({
  global,
  properties,
}: {
  global: GlobalResponse;
  properties: PropertyResponse[];
}) {
  const assetDef = global.assetDefinition;

  const companyInputs = useMemo(() => {
    const inputs: { label: string; value: string }[] = [
      { label: "Company Name", value: global.companyName ?? "—" },
      { label: "Property Label", value: global.propertyLabel ?? "Boutique Hotel" },
      { label: "Base Management Fee", value: `${global.baseManagementFee ?? "—"}%` },
      { label: "Incentive Management Fee", value: `${global.incentiveManagementFee ?? "—"}%` },
      { label: "Marketing Rate", value: `${global.marketingRate ?? "—"}%` },
    ];
    return inputs;
  }, [global]);

  return (
    <div className="space-y-4">
      <Card className="bg-accent-pop/5 border-accent-pop/20 p-4" data-testid="evidence-advisory-note">
        <div className="flex gap-3">
          <IconInfo className="w-5 h-5 text-accent-pop dark:text-accent-pop shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Bracket Evidence Panel</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              These values provide context for the ICP Research Specialist when characterizing
              brackets from market comps. The Specialist extracts the revenue side of each comp —
              what kind of customer property it serves and at what price band — not whether comps
              own their properties.
            </p>
          </div>
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDatabase} title="Company Context" />
        <p className="text-xs text-muted-foreground">
          Company-level details that shape the Specialist's understanding of the management entity
          and the asset classes it serves.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-company-context">
          {companyInputs.map((input, i) => (
            <DataCard key={i} label={input.label} value={input.value} />
          ))}
          <DataCard label="Property Count" value={`${properties.length} properties`} />
          {properties.length > 0 && (
            <DataCard
              label="Portfolio Markets"
              value={
                Array.from(new Set(properties.map((p) => p.location).filter(Boolean))).join(
                  ", ",
                ) || "—"
              }
            />
          )}
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Fee Structures" />
        <p className="text-xs text-muted-foreground">
          Management fee rates applied across the portfolio — used by the ICP Research Specialist
          to benchmark against market comps.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-fee-structures">
          <DataCard label="Base Management Fee" value={`${global.baseManagementFee}%`} />
          <DataCard label="Incentive Management Fee" value={`${global.incentiveManagementFee}%`} />
          <DataCard label="Marketing Rate" value={`${global.marketingRate}%`} />
          <DataCard label="Misc Ops Rate" value={`${global.miscOpsRate}%`} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconBuilding} title="Overhead Structure" />
        <p className="text-xs text-muted-foreground">
          Fixed overhead costs that define the management company's operational cost base.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-overhead">
          <DataCard label="Office Lease" value={fmt$(global.officeLeaseStart)} />
          <DataCard label="Professional Services" value={fmt$(global.professionalServicesStart)} />
          <DataCard label="Tech Infrastructure" value={fmt$(global.techInfraStart)} />
          <DataCard label="Travel per Client" value={fmt$(global.travelCostPerClient)} />
          <DataCard label="IT License per Client" value={fmt$(global.itLicensePerClient)} />
        </div>
      </Card>

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconUsers} title="Staffing Model" />
        <p className="text-xs text-muted-foreground">
          Staffing tiers and compensation structure for the management company.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="criteria-staffing">
          <DataCard label="Staff Salary (avg)" value={fmt$(global.staffSalary)} />
          <DataCard label="Partner Count (Yr 1)" value={`${global.partnerCountYear1} partners`} />
          <DataCard label="Partner Comp (Yr 1)" value={fmt$(global.partnerCompYear1)} />
          <DataCard label="Tier 1 (≤ props)" value={`≤${global.staffTier1MaxProperties} → ${global.staffTier1Fte} FTE`} />
          <DataCard label="Tier 2 (≤ props)" value={`≤${global.staffTier2MaxProperties} → ${global.staffTier2Fte} FTE`} />
          <DataCard label="Tier 3 (above)" value={`${global.staffTier3Fte} FTE`} />
        </div>
      </Card>

      {assetDef?.description && (
        <Card className="border border-border rounded-lg p-5 space-y-3">
          <SectionHeading icon={IconFileText} title="Asset Class Description" />
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {assetDef.description}
          </p>
        </Card>
      )}

      <Card className="border border-border rounded-lg p-5 space-y-4">
        <SectionHeading icon={IconDollarSign} title="Bracket Research Focus Areas" />
        <p className="text-xs text-muted-foreground">
          The ICP Research Specialist covers these domains when characterizing brackets from market
          comps.
        </p>
        <div className="space-y-1.5">
          {ICP_BRACKET_FOCUS_AREAS.map((area, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5 px-3 rounded-md bg-muted/30">
              <span className="text-xs font-mono text-primary/60 w-5">{i + 1}.</span>
              <span className="text-sm text-foreground">{area}</span>
            </div>
          ))}
        </div>
      </Card>

      {(() => {
        const locs = (global as unknown as { portfolioLocations?: unknown }).portfolioLocations;
        return Array.isArray(locs) && locs.length > 0;
      })() && (
        <Card className="border border-border rounded-lg p-5 space-y-4">
          <SectionHeading icon={IconMapPin} title="Portfolio Locations / Markets" />
          <div className="flex flex-wrap gap-1.5">
            {(
              (global as unknown as { portfolioLocations?: string[] }).portfolioLocations ?? []
            ).map((loc, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {loc}
              </Badge>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function DataSourcesTab() {
  return (
    <div className="space-y-4">
      <Card className="border border-border rounded-lg p-5 space-y-4" data-testid="kr-link-block">
        <SectionHeading icon={IconGlobe} title="Knowledge & Resources" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          The ICP bracket catalog, national pass-through vendor cost table, and national markup
          factor table are maintained by Administrators in the Knowledge &amp; Resources section.
          They are not edited here — front-of-app surfaces the bracket mix and calculation outputs
          only.
        </p>

        <div className="space-y-2 pt-1">
          {[
            {
              label: "ICP Bracket Catalog",
              description: "The 3–5 reusable brackets that characterize customer-property archetypes.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "National Pass-Through Cost Table",
              description: "Vendor pass-through costs as % of revenue per service line. Refreshed from national research.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "National Markup Factor Table",
              description: "Mgmt Co markup factors on pass-through vendor costs as % of revenue.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → Tables",
            },
            {
              label: "Brand Comp Sources",
              description: "URL links and research sources used to characterize brackets.",
              path: "Admin → AI → Intelligence → Knowledge & Resources → URL Links",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-1.5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <IconExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
              <p className="text-[10px] font-mono text-muted-foreground/70">{item.path}</p>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-3 mt-2">
          Administrators can navigate to{" "}
          <span className="font-medium text-foreground">
            Admin → AI → Intelligence → Knowledge &amp; Resources
          </span>{" "}
          using the sidebar to view and manage these resources.
        </p>
      </Card>
    </div>
  );
}

function LegacyIcpTab({
  icpConfig,
  icpDescriptive,
}: {
  icpConfig: IcpConfig;
  icpDescriptive: IcpDescriptive;
}) {
  const hasLegacyData =
    (icpConfig as unknown as { _generated?: boolean })._generated === true ||
    icpConfig.roomsMin !== DEFAULT_ICP_CONFIG.roomsMin;

  const AMENITY_LABELS: Record<string, string> = {
    pool: "Pool", spa: "Spa", sauna: "Sauna", steamRoom: "Steam Room",
    coldPlunge: "Cold Plunge", yogaStudio: "Yoga Studio", gym: "Gym",
    tennis: "Tennis", pickleball: "Pickleball", hikingTrails: "Hiking Trails",
    garden: "Garden", vineyard: "Vineyard", casitas: "Casitas", barn: "Barn",
    glamping: "Glamping", firePit: "Fire Pit", wineCellar: "Wine Cellar",
    outdoorKitchen: "Outdoor Kitchen", hotTub: "Hot Tub", horseFacilities: "Horse Facilities",
  };

  const amenities = Object.entries(AMENITY_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      priority: (icpConfig as unknown as Record<string, string | undefined>)[key],
    }))
    .filter((a) => a.priority && a.priority !== "no");

  return (
    <div className="space-y-4">
      <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 p-4" data-testid="legacy-deprecated-notice">
        <div className="flex gap-3">
          <IconAlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Deprecated — Legacy 70-field ICP Record
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 leading-relaxed">
              This tab shows the previous per-company ICP record preserved as read-only reference
              data. It <span className="font-semibold">does not drive any financial calculation</span>.
              All calculations now use the bracket mix above. No new values can be saved here.
            </p>
          </div>
        </div>
      </Card>

      {!hasLegacyData ? (
        <Card className="border border-border rounded-lg p-8 text-center" data-testid="legacy-no-data">
          <IconBookOpen className="w-8 h-8 mx-auto mb-3 opacity-30 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">No legacy ICP record found</p>
          <p className="text-xs text-muted-foreground mt-1">
            This company never had a 70-field ICP profile generated.
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-2" data-testid="legacy-icp-accordion">
          <AccordionItem value="physical" className="border border-border rounded-lg overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
              Physical Property Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                <DataCard label="Room Count" value={`${icpConfig.roomsMin}–${icpConfig.roomsMax}`} />
                <DataCard label="Sweet Spot" value={`${icpConfig.roomsSweetSpotMin}–${icpConfig.roomsSweetSpotMax} rooms`} />
                <DataCard label="Land Area" value={`${icpConfig.landAcresMin}–${icpConfig.landAcresMax} acres`} />
                <DataCard label="Built Area" value={`${icpConfig.builtSqFtMin.toLocaleString()}–${icpConfig.builtSqFtMax.toLocaleString()} sq ft`} />
                <DataCard label="Indoor Event Capacity" value={`${icpConfig.indoorEventMin}–${icpConfig.indoorEventMax} guests`} />
                <DataCard label="Outdoor Event Capacity" value={`${icpConfig.outdoorEventMin}–${icpConfig.outdoorEventMax} guests`} />
                <DataCard label="Dining Capacity" value={`${icpConfig.diningCapacityMin}–${icpConfig.diningCapacityMax} guests`} />
                <DataCard label="Parking" value={`${icpConfig.parkingMin}–${icpConfig.parkingMax} spaces`} />
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="financial" className="border border-border rounded-lg overflow-hidden bg-card">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
              Financial Parameters
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-2">
                <DataCard label="Acquisition Range" value={`${fmt$(icpConfig.acquisitionMin)}–${fmt$(icpConfig.acquisitionMax)}`} />
                <DataCard label="Target ADR" value={`$${icpConfig.adrMin}–$${icpConfig.adrMax}`} />
                <DataCard label="Occupancy Target" value={`${icpConfig.occupancyMin}%–${icpConfig.occupancyMax}%`} />
                <DataCard label="RevPAR Target" value={`$${icpConfig.revParMin}–$${icpConfig.revParMax}`} />
                <DataCard label="Base Mgmt Fee" value={`${icpConfig.baseMgmtFeeMin}%–${icpConfig.baseMgmtFeeMax}%`} />
                <DataCard label="Target IRR" value={`${icpConfig.targetIrr}%+`} />
                <DataCard label="Equity Multiple" value={`${icpConfig.equityMultipleMin}x–${icpConfig.equityMultipleMax}x`} />
                <DataCard label="Hold Period" value={`${icpConfig.holdYearsMin}–${icpConfig.holdYearsMax} years`} />
                <DataCard label="Exit Cap Rate" value={`${icpConfig.exitCapRateMin}%–${icpConfig.exitCapRateMax}%`} />
              </div>
            </AccordionContent>
          </AccordionItem>

          {amenities.length > 0 && (
            <AccordionItem value="amenities" className="border border-border rounded-lg overflow-hidden bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
                Amenity Priorities
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex flex-wrap gap-2 pt-2">
                  {amenities.map((a) => (
                    <span
                      key={a.key}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border bg-muted/30 border-border text-foreground"
                    >
                      {a.label}
                      <span className="ml-1 opacity-60">({a.priority})</span>
                    </span>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {(icpDescriptive.propertyTypes || icpDescriptive.locationCharacteristics || icpDescriptive.locationDetails) && (
            <AccordionItem value="descriptive" className="border border-border rounded-lg overflow-hidden bg-card">
              <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/30 text-sm font-medium">
                Descriptive Sections
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-3 pt-2">
                  {[
                    { label: "Property Types", value: icpDescriptive.propertyTypes },
                    { label: "F&B Operations", value: icpDescriptive.fbLevel },
                    { label: "Location Characteristics", value: icpDescriptive.locationCharacteristics },
                    { label: "Target Markets", value: icpDescriptive.locationDetails },
                    { label: "Condition Requirements", value: icpDescriptive.conditionNotes },
                    { label: "Vendor Services", value: icpDescriptive.vendorServices },
                    { label: "Exclusions", value: icpDescriptive.exclusions },
                  ]
                    .filter((s) => s.value)
                    .map((s) => (
                      <div key={s.label} className="space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          {s.label}
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {s.value}
                        </p>
                      </div>
                    ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}

export function IcpMixContent() {
  const { data: global, isLoading } = useGlobalAssumptions();
  const { data: properties = [] } = useProperties();
  const [activeTab, setActiveTab] = useState("bracket-mix");

  const g = global as unknown as { icpConfig?: unknown; icpDescriptive?: unknown } | undefined;

  const icpConfig: IcpConfig = useMemo(
    () => ({
      ...DEFAULT_ICP_CONFIG,
      ...(g?.icpConfig && typeof g.icpConfig === "object"
        ? (g.icpConfig as Partial<IcpConfig>)
        : {}),
    }),
    [g],
  );

  const icpDescriptive: IcpDescriptive = useMemo(
    () => ({
      ...DEFAULT_ICP_DESCRIPTIVE,
      ...(g?.icpDescriptive && typeof g.icpDescriptive === "object"
        ? (g.icpDescriptive as Partial<IcpDescriptive>)
        : {}),
    }),
    [g],
  );

  if (isLoading) {
    return <PageLoadingState />;
  }

  if (!global) {
    return <PageErrorState message="Failed to load company data" />;
  }

  return (
    <div className="space-y-6">
      <CurrentThemeTab tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div>
        {activeTab === "bracket-mix" && <BracketMixTab />}
        {activeTab === "market-evidence" && (
          <MarketEvidenceTab global={global} properties={properties} />
        )}
        {activeTab === "data-sources" && <DataSourcesTab />}
        {activeTab === "legacy-icp" && (
          <LegacyIcpTab icpConfig={icpConfig} icpDescriptive={icpDescriptive} />
        )}
      </div>
    </div>
  );
}

export default function CompanyBracketMix() {
  const { data: global } = useGlobalAssumptions();
  const companyName = global?.companyName ?? "Hospitality Business";

  return (
    <Layout>
      <AnimatedPage>
        <div className="space-y-6 p-4 sm:p-6 max-w-6xl">
          <PageHeader
            title={`ICP Bracket Mix — ${companyName}`}
            subtitle="Customer-property archetype mix that drives Management Company revenue and expense calculations"
            backLink="/company/assumptions"
          />

          <AnimatedSection delay={0.1}>
            <IcpMixContent />
          </AnimatedSection>
        </div>
      </AnimatedPage>
    </Layout>
  );
}
