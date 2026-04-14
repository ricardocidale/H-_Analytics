import { useMemo, useRef } from "react";
import { Property } from "@shared/schema";
import type { GlobalResponse } from "@/lib/api";
import { USE_SERVER_COMPUTE } from "@shared/constants";
import { useServerFinancials } from "@/hooks/useServerFinancials";
import { 
  generatePropertyProForma 
} from "@/lib/financialEngine";
import {
  PROJECTION_YEARS,
  MONTHS_PER_YEAR,
} from "@/lib/constants";
import { 
  LoanParams, 
  GlobalLoanParams 
} from "@/lib/financial/loanCalculations";
import {
  aggregateUnifiedByYear,
  YearlyPropertyFinancials
} from "@/lib/financial/yearlyAggregator";
import type { YearlyCashFlowResult } from "@/lib/financial/loanCalculations";
import { computeIRR } from "@analytics/returns/irr.js";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { consolidateYearlyFinancials, computeWeightedMetrics } from "@/lib/financial/consolidation";
import { DashboardFinancials } from "./types";
import type { MonthlyFinancials } from "@/lib/financialEngine";

function calculateIRR(cashFlows: number[]): number {
  const result = computeIRR(cashFlows, 1);
  return result.irr_periodic ?? 0;
}

interface CachedPropertyResult {
  property: Property;
  financials: MonthlyFinancials[];
  updatedAtMs: number;
}

function useClientPortfolioFinancials(
  properties: Property[] | undefined,
  global: GlobalResponse | undefined
): DashboardFinancials | null {
  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;

  const cacheRef = useRef<Map<number, CachedPropertyResult>>(new Map());
  const prevGlobalRef = useRef<GlobalResponse | undefined>(undefined);

  const allPropertyFinancials = useMemo(() => {
    if (!properties || !global) return [];
    if (prevGlobalRef.current !== global) {
      cacheRef.current = new Map();
      prevGlobalRef.current = global;
    }
    const cache = cacheRef.current;
    const newCache = new Map<number, CachedPropertyResult>();
    const activeProperties = properties.filter(p => p.isActive !== false);
    const result: CachedPropertyResult[] = activeProperties.map(p => {
      const cached = cache.get(p.id);
      const updatedAtMs = p.updatedAt ? new Date(p.updatedAt as string | Date).getTime() : 0;
      if (cached && cached.updatedAtMs === updatedAtMs) {
        newCache.set(p.id, cached);
        return cached;
      }
      const financials = generatePropertyProForma(p as any, global as any, projectionMonths);
      const entry: CachedPropertyResult = { property: p, financials, updatedAtMs };
      newCache.set(p.id, entry);
      return entry;
    });
    cacheRef.current = newCache;
    return result;
  }, [properties, global, projectionMonths]);

  const { allPropertyYearlyCF, allPropertyYearlyIS } = useMemo(() => {
    if (!properties || !global || allPropertyFinancials.length === 0) {
      return { allPropertyYearlyCF: [] as YearlyCashFlowResult[][], allPropertyYearlyIS: [] as YearlyPropertyFinancials[][] };
    }
    const cfResults: YearlyCashFlowResult[][] = [];
    const isResults: YearlyPropertyFinancials[][] = [];
    for (const { property: prop, financials } of allPropertyFinancials) {
      const unified = aggregateUnifiedByYear(
        financials,
        prop as unknown as LoanParams,
        global as unknown as GlobalLoanParams,
        projectionYears
      );
      cfResults.push(unified.yearlyCF);
      isResults.push(unified.yearlyIS);
    }
    return { allPropertyYearlyCF: cfResults, allPropertyYearlyIS: isResults };
  }, [allPropertyFinancials, properties, global, projectionYears]);

  const yearlyConsolidatedCache = useMemo(() =>
    consolidateYearlyFinancials(allPropertyYearlyIS, projectionYears),
    [allPropertyYearlyIS, projectionYears]
  );

  const weightedMetricsByYear = useMemo(() =>
    computeWeightedMetrics(allPropertyYearlyIS, projectionYears),
    [allPropertyYearlyIS, projectionYears]
  );

  const stats = useMemo(() => {
    if (!yearlyConsolidatedCache.length || !global) return null;

    let totalProjectionRevenue = 0, totalProjectionNOI = 0, totalProjectionANOI = 0, totalProjectionCashFlow = 0;
    for (let y = 0; y < projectionYears; y++) {
      const yearData = yearlyConsolidatedCache[y];
      totalProjectionRevenue += yearData.revenueTotal;
      totalProjectionNOI += yearData.noi;
      totalProjectionANOI += yearData.anoi;
      totalProjectionCashFlow += yearData.cashFlow;
    }

    const getPropertyAcquisitionYear = (prop: Property): number =>
      acquisitionYearIndex(prop.acquisitionDate, prop.operationsStartDate, global.modelStartDate);

    const getPropertyInvestment = (prop: Property): number =>
      propertyEquityInvested(prop);

    const activeProps = properties?.filter(p => p.isActive !== false) ?? [];

    const getEquityInvestmentForYear = (yearIndex: number): number =>
      activeProps.reduce((sum, prop) => sum + (getPropertyAcquisitionYear(prop) === yearIndex ? getPropertyInvestment(prop) : 0), 0);

    const consolidatedFlows = Array.from({ length: projectionYears }, (_, y) =>
      allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.netCashFlowToInvestors ?? 0), 0)
    );

    const portfolioIRR = calculateIRR(consolidatedFlows);
    const totalInitialEquity = activeProps.reduce((sum, prop) => sum + getPropertyInvestment(prop), 0);
    const totalExitValue = allPropertyYearlyCF.reduce(
      (sum, yearly) => sum + (yearly[projectionYears - 1]?.exitValue ?? 0), 0
    );
    const totalCashReturned = consolidatedFlows.reduce((sum, cf) => sum + cf, 0);
    const midProjectionEquity = Array.from({ length: projectionYears }, (_, y) => getEquityInvestmentForYear(y + 1))
      .reduce((sum, eq) => sum + eq, 0);
    
    const equityMultiple = totalInitialEquity > 0 ? (totalCashReturned + midProjectionEquity) / totalInitialEquity : 0;

    const operatingCashFlows = Array.from({ length: projectionYears }, (_, y) =>
      allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.atcf ?? 0), 0)
    );
    const avgAnnualCashFlow = operatingCashFlows.reduce((sum, cf) => sum + cf, 0) / projectionYears;
    const cashOnCash = totalInitialEquity > 0 ? (avgAnnualCashFlow / totalInitialEquity) * 100 : 0;

    return {
      totalProjectionRevenue,
      totalProjectionNOI,
      totalProjectionANOI,
      totalProjectionCashFlow,
      portfolioIRR,
      equityMultiple,
      cashOnCash,
      totalInitialEquity,
      totalExitValue
    };
  }, [yearlyConsolidatedCache, allPropertyYearlyCF, properties, global, projectionYears]);

  if (!stats) return null;

  const totalRooms = properties?.filter(p => p.isActive !== false).reduce((sum, p) => sum + p.roomCount, 0) ?? 0;

  return {
    allPropertyFinancials,
    allPropertyYearlyCF,
    allPropertyYearlyIS,
    yearlyConsolidatedCache,
    weightedMetricsByYear,
    totalRooms,
    ...stats
  };
}

export interface PortfolioFinancialsResult {
  financials: DashboardFinancials | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
}

export function usePortfolioFinancials(
  properties: Property[] | undefined,
  global: GlobalResponse | undefined
): PortfolioFinancialsResult {
  const serverResult = useServerFinancials(
    USE_SERVER_COMPUTE ? properties : undefined,
    USE_SERVER_COMPUTE ? global : undefined,
  );
  const clientResult = useClientPortfolioFinancials(
    USE_SERVER_COMPUTE ? undefined : properties,
    USE_SERVER_COMPUTE ? undefined : global,
  );

  if (USE_SERVER_COMPUTE) {
    return {
      financials: serverResult.data,
      isLoading: serverResult.isLoading,
      isError: serverResult.isError,
      error: serverResult.error,
    };
  }
  return { financials: clientResult, isLoading: false, isError: false, error: null };
}
