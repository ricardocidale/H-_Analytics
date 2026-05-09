import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import superjson from "superjson";
import type { Property } from "@shared/schema";
import type { GlobalResponse } from "@/lib/api";
import type { DashboardFinancials } from "@/components/dashboard/types";
import type { MonthlyFinancials } from "@/lib/financialEngine";
import type { CompanyMonthlyFinancials } from "@engine/types";
import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";
import type { YearlyCashFlowResult, LoanParams, GlobalLoanParams } from "@/lib/financial/loanCalculations";
import { aggregateUnifiedByYear } from "@/lib/financial/yearlyAggregator";
import { consolidateYearlyFinancials, computeWeightedMetrics } from "@/lib/financial/consolidation";
import { computeIRR } from "@analytics/returns/irr.js";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { PROJECTION_YEARS } from "@/lib/constants";
import { analyzePortfolioForInsights } from "@/lib/rebecca-insights";
import { useRebeccaInsightStore } from "@/components/rebecca/RebeccaInsightBanner";
import type { WaterfallOutput } from "@calc/analysis/waterfall";

interface ServerReturnsSummary {
  portfolio: {
    irr: number | null;
    equityMultiple: number;
    cashOnCash: number;
    totalEquityInvested: number;
    totalExitValue: number;
    netCashFlowsByYear: number[];
  };
  properties: {
    propertyKey: string;
    propertyId: number | null;
    irr: number | null;
    equityMultiple: number;
    cashOnCash: number;
    equityInvested: number;
    exitValue: number;
    netCashFlowsByYear: number[];
    waterfallResult?: WaterfallOutput | null;
  }[];
}

interface ServerPortfolioResult {
  engineVersion: string;
  computedAt: string;
  perPropertyYearly: Record<string, YearlyPropertyFinancials[]>;
  perPropertyMonthly: Record<string, MonthlyFinancials[]>;
  consolidatedYearly: YearlyPropertyFinancials[];
  outputHash: string;
  propertyCount: number;
  projectionYears: number;
  cached?: boolean;
  validationSummary: {
    opinion: string;
    identityChecks: number;
    passed: number;
    failed: number;
  };
  returnsSummary?: ServerReturnsSummary;
}

function calculateIRR(cashFlows: number[]): number {
  const result = computeIRR(cashFlows, 1);
  return result.irr_periodic ?? 0;
}

async function fetchPortfolioCompute(
  properties: Property[],
  global: GlobalResponse,
): Promise<ServerPortfolioResult> {
  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;

  const body = {
    properties: properties.filter(p => p.isActive !== false),
    globalAssumptions: global,
    projectionYears,
  };

  const res = await fetch("/api/finance/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Server compute failed (${res.status})`);
  }

  const raw = await res.json();
  const isSuperjson = res.headers.get("X-Superjson") === "true";
  return isSuperjson ? (superjson.deserialize(raw) as ServerPortfolioResult) : raw;
}

function mapToDashboardFinancials(
  serverResult: ServerPortfolioResult,
  activeProperties: Property[],
  global: GlobalResponse,
): DashboardFinancials {
  const projectionYears = serverResult.projectionYears;

  const allPropertyFinancials: { property: Property; financials: MonthlyFinancials[] }[] = [];
  const allPropertyYearlyCF: YearlyCashFlowResult[][] = [];
  const allPropertyYearlyIS: YearlyPropertyFinancials[][] = [];

  for (const prop of activeProperties) {
    const key = `property_${prop.id}`;
    const monthly = serverResult.perPropertyMonthly[key] ?? [];
    const yearlyIS = serverResult.perPropertyYearly[key] ?? [];

    allPropertyFinancials.push({ property: prop, financials: monthly });
    allPropertyYearlyIS.push(yearlyIS);

    const unified = aggregateUnifiedByYear(
      monthly,
      prop as unknown as LoanParams,
      global as unknown as GlobalLoanParams,
      projectionYears,
    );
    allPropertyYearlyCF.push(unified.yearlyCF);
  }

  const yearlyConsolidatedCache = serverResult.consolidatedYearly.length > 0
    ? serverResult.consolidatedYearly
    : consolidateYearlyFinancials(allPropertyYearlyIS, projectionYears);

  const weightedMetricsByYear = computeWeightedMetrics(allPropertyYearlyIS, projectionYears);

  let totalProjectionRevenue = 0;
  let totalProjectionNOI = 0;
  let totalProjectionANOI = 0;
  let totalProjectionCashFlow = 0;

  for (let y = 0; y < projectionYears; y++) {
    const yearData = yearlyConsolidatedCache[y];
    if (!yearData) continue;
    totalProjectionRevenue += yearData.revenueTotal;
    totalProjectionNOI += yearData.noi;
    totalProjectionANOI += yearData.anoi;
    totalProjectionCashFlow += yearData.cashFlow;
  }

  const getPropertyInvestment = (prop: Property): number =>
    propertyEquityInvested(prop);

  // Prefer server-computed returns (canonical aggregateUnifiedByYear + IRR path).
  // Fall back to client computation if returnsSummary is absent (e.g. stale cache).
  const serverPortfolio = serverResult.returnsSummary?.portfolio;

  const totalInitialEquity =
    serverPortfolio?.totalEquityInvested ??
    activeProperties.reduce((sum, prop) => sum + getPropertyInvestment(prop), 0);

  const totalExitValue =
    serverPortfolio?.totalExitValue ??
    allPropertyYearlyCF.reduce((sum, yearly) => sum + (yearly[projectionYears - 1]?.exitValue ?? 0), 0);

  // consolidatedFlows is still needed for fallback and for downstream callers
  // that reference allPropertyYearlyCF directly (e.g. CF charts).
  const consolidatedFlows = Array.from({ length: projectionYears }, (_, y) =>
    allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.netCashFlowToInvestors ?? 0), 0),
  );

  const portfolioIRR = serverPortfolio?.irr ?? calculateIRR(consolidatedFlows);
  const equityMultiple = serverPortfolio?.equityMultiple ?? (() => {
    const totalCashReturned = consolidatedFlows.reduce((sum, cf) => sum + cf, 0);
    return totalInitialEquity > 0 ? (totalCashReturned + totalInitialEquity) / totalInitialEquity : 0;
  })();
  const cashOnCash = serverPortfolio?.cashOnCash ?? (() => {
    const operatingCashFlows = Array.from({ length: projectionYears }, (_, y) =>
      allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.atcf ?? 0), 0),
    );
    const avgAnnualCashFlow = operatingCashFlows.reduce((sum, cf) => sum + cf, 0) / projectionYears;
    return totalInitialEquity > 0 ? (avgAnnualCashFlow / totalInitialEquity) * 100 : 0;
  })();

  const totalRooms = activeProperties.reduce((sum, p) => sum + p.roomCount, 0);

  return {
    allPropertyFinancials,
    allPropertyYearlyCF,
    allPropertyYearlyIS,
    yearlyConsolidatedCache,
    weightedMetricsByYear,
    totalProjectionRevenue,
    totalProjectionNOI,
    totalProjectionANOI,
    totalProjectionCashFlow,
    portfolioIRR,
    equityMultiple,
    cashOnCash,
    totalInitialEquity,
    totalExitValue,
    totalRooms,
  };
}

function stableGlobalHash(global: GlobalResponse): string {
  return String(global.updatedAt ?? JSON.stringify(global));
}

function buildQueryKey(properties: Property[] | undefined, global: GlobalResponse | undefined): unknown[] {
  if (!properties || !global) return ["server-financials"];
  const propKeys = properties
    .filter(p => p.isActive !== false)
    .map(p => `${p.id}:${p.updatedAt ?? 0}`)
    .sort();
  return ["server-financials", propKeys.join(","), stableGlobalHash(global)];
}

export interface ServerFinancialsResult {
  data: DashboardFinancials | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useServerFinancials(
  properties: Property[] | undefined,
  global: GlobalResponse | undefined,
): ServerFinancialsResult {
  const activeProperties = properties?.filter(p => p.isActive !== false) ?? [];
  const enabled = !!properties && properties.length > 0 && !!global && activeProperties.length > 0;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: buildQueryKey(properties, global),
    queryFn: () => fetchPortfolioCompute(activeProperties, global!),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const mapped = useMemo(
    () => (data && global) ? mapToDashboardFinancials(data, activeProperties, global) : null,
    [data, global, activeProperties.length],
  );

  const addInsight = useRebeccaInsightStore((s) => s.addInsight);
  const outputHash = data?.outputHash ?? null;
  const propertyCount = activeProperties.length;
  const totalRooms = mapped?.totalRooms ?? 0;

  useEffect(() => {
    if (!outputHash || !mapped) return;

    const deterministicInsight = analyzePortfolioForInsights(
      mapped.yearlyConsolidatedCache,
      propertyCount,
      mapped.portfolioIRR,
    );
    if (deterministicInsight) {
      addInsight(deterministicInsight, outputHash);
    }

    const year1 = mapped.yearlyConsolidatedCache[0];
    const lastYear = mapped.yearlyConsolidatedCache[mapped.yearlyConsolidatedCache.length - 1];
    if (!year1 || year1.revenueTotal <= 0) return;

    const noiMargin = year1.noi / year1.revenueTotal;
    const revenueGrowth = lastYear && year1.revenueTotal > 0
      ? (lastYear.revenueTotal - year1.revenueTotal) / year1.revenueTotal
      : undefined;

    const ragHash = `rag-${outputHash}`;
    fetch("/api/rebecca/insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        noiMargin,
        portfolioIRR: mapped.portfolioIRR,
        year1Revenue: year1.revenueTotal,
        year1NOI: year1.noi,
        propertyCount,
        totalRooms,
        revenueGrowth,
      }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(responseData => {
        if (responseData?.insight) {
          addInsight(responseData.insight, ragHash);
        }
      })
      .catch(() => { /* ignore: insight fetch is non-critical background enrichment */ });
  }, [outputHash, propertyCount, addInsight]);

  return { data: mapped, isLoading: enabled && isLoading, isError, error: error as Error | null };
}

export function buildPropertyQueryKey(
  propertyId: number,
  property: Property | undefined,
  global: GlobalResponse | undefined,
): unknown[] {
  if (!property || !global) return ["server-property-financials", propertyId];
  return [
    "server-property-financials",
    propertyId,
    property.updatedAt ?? 0,
    stableGlobalHash(global),
  ];
}

export interface ServerSinglePropertyResult {
  engineVersion: string;
  computedAt: string;
  monthly: MonthlyFinancials[];
  yearly: YearlyPropertyFinancials[];
  outputHash: string;
  projectionYears: number;
  cached?: boolean;
  waterfallResult?: WaterfallOutput | null;
}

export async function fetchSinglePropertyCompute(
  property: Property,
  global: GlobalResponse,
): Promise<ServerSinglePropertyResult> {
  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;

  const body = {
    property,
    globalAssumptions: global,
    projectionYears,
  };

  const res = await fetch(`/api/finance/property/${property.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Property compute failed (${res.status})`);
  }

  const raw = await res.json();
  const isSuperjson = res.headers.get("X-Superjson") === "true";
  return isSuperjson ? (superjson.deserialize(raw) as ServerSinglePropertyResult) : raw;
}

export interface ServerExitScenariosResult {
  engineVersion: string;
  computedAt: string;
  outputHash: string;
  projectionYears: number;
  exitScenarios: import("@calc/analysis/exit-scenarios").ExitScenariosOutput;
}

/**
 * Task #807: fetch the 3 × 4 exit-scenarios bundle for a property. Reuses the
 * cached engine recompute on the server, so calling this is cheap when the
 * main `fetchSinglePropertyCompute` has already run.
 */
export async function fetchPropertyExitScenarios(
  property: Property,
  global: GlobalResponse,
): Promise<ServerExitScenariosResult> {
  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
  const body = { property, globalAssumptions: global, projectionYears };
  const res = await fetch(`/api/finance/property/${property.id}/exit-scenarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Exit scenarios fetch failed (${res.status})`);
  }
  const raw = await res.json();
  const isSuperjson = res.headers.get("X-Superjson") === "true";
  return isSuperjson ? (superjson.deserialize(raw) as ServerExitScenariosResult) : raw;
}

export function buildExitScenariosQueryKey(
  propertyId: number,
  property: Property | undefined,
  global: GlobalResponse | undefined,
): unknown[] {
  if (!property || !global) return ["server-property-exit-scenarios", propertyId];
  return [
    "server-property-exit-scenarios",
    propertyId,
    property.updatedAt ?? 0,
    stableGlobalHash(global),
  ];
}

export interface ServerCompanyResult {
  engineVersion: string;
  computedAt: string;
  companyMonthly: CompanyMonthlyFinancials[];
  companyYearly: unknown[];
  outputHash: string;
  projectionYears: number;
  cached?: boolean;
}

async function fetchCompanyCompute(
  properties: Property[],
  global: GlobalResponse,
): Promise<ServerCompanyResult> {
  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;

  const body = {
    properties: properties.filter(p => p.isActive !== false),
    globalAssumptions: global,
    projectionYears,
  };

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
  return isSuperjson ? (superjson.deserialize(raw) as ServerCompanyResult) : raw;
}

function buildCompanyQueryKey(properties: Property[] | undefined, global: GlobalResponse | undefined): unknown[] {
  if (!properties || !global) return ["server-company-financials"];
  const propKeys = properties
    .filter(p => p.isActive !== false)
    .map(p => `${p.id}:${p.updatedAt ?? 0}`)
    .sort();
  return ["server-company-financials", propKeys.join(","), stableGlobalHash(global)];
}

export interface ServerCompanyFinancialsResult {
  companyMonthly: CompanyMonthlyFinancials[];
  perPropertyFinancials: { property: Property; financials: MonthlyFinancials[] }[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function useServerCompanyFinancials(
  properties: Property[] | undefined,
  global: GlobalResponse | undefined,
): ServerCompanyFinancialsResult {
  const activeProperties = properties?.filter(p => p.isActive !== false) ?? [];
  const enabled = !!properties && properties.length > 0 && !!global && activeProperties.length > 0;

  const companyQuery = useQuery({
    queryKey: buildCompanyQueryKey(properties, global),
    queryFn: () => fetchCompanyCompute(activeProperties, global!),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const portfolioQuery = useQuery({
    queryKey: buildQueryKey(properties, global),
    queryFn: () => fetchPortfolioCompute(activeProperties, global!),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const companyMonthly = companyQuery.data?.companyMonthly ?? [];

  const perPropertyFinancials = (portfolioQuery.data && properties)
    ? activeProperties.map(prop => ({
        property: prop,
        financials: portfolioQuery.data!.perPropertyMonthly[`property_${prop.id}`] ?? [],
      }))
    : [];

  return {
    companyMonthly,
    perPropertyFinancials,
    isLoading: (enabled && companyQuery.isLoading) || (enabled && portfolioQuery.isLoading),
    isError: companyQuery.isError || portfolioQuery.isError,
    error: (companyQuery.error ?? portfolioQuery.error) as Error | null,
  };
}
