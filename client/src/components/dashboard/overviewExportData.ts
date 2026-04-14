/**
 * overviewExportData.ts
 *
 * Computes the rich Portfolio Overview export payload from raw financials,
 * properties, and projection settings. Used by PDF, Excel, CSV, and PPTX
 * renderers so they all consume a single well-typed source of truth.
 */
import { computeIRR } from "@analytics/returns/irr.js";

import { DEFAULT_EXIT_CAP_RATE } from "@/lib/constants";
import type { DashboardFinancials } from "./types";
import type { Property } from "@shared/schema";

export interface PropertyOverviewItem {
  name: string;
  market: string;
  rooms: number;
  status: string;
  acquisitionCost: number;
  adr: number;
  irr: number;
}

export interface WaterfallRow {
  label: string;
  values: number[];
  isDeduction: boolean;
  isSubtotal: boolean;
}

export interface OverviewExportData {
  propertyItems: PropertyOverviewItem[];
  marketCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  revenueNOIData: {
    year: number;
    revenue: number;
    noi: number;
    anoi: number;
    cashFlow: number;
  }[];
  waterfallRows: WaterfallRow[];
  yearLabels: number[];
  capitalStructure: {
    totalPurchasePrice: number;
    avgPurchasePrice: number;
    avgExitCapRate: number;
    holdPeriod: number;
    anoiMargin: number;
    totalProperties: number;
    totalRooms: number;
    avgRoomsPerProperty: number;
    avgADR: number;
    totalMarkets: number;
  };
  portfolioKPIs: {
    portfolioIRR: number;
    equityMultiple: number;
    cashOnCash: number;
    totalInitialEquity: number;
    totalExitValue: number;
    totalProjectionRevenue: number;
    totalProjectionNOI: number;
    totalProjectionANOI: number;
    totalProjectionCashFlow: number;
  };
}

function buildWaterfallRows(
  yearlyConsolidatedCache: DashboardFinancials["yearlyConsolidatedCache"],
  allPropertyYearlyCF: DashboardFinancials["allPropertyYearlyCF"],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
): { rows: WaterfallRow[]; yearLabels: number[] } {
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));

  const getYearData = (y: number) => {
    const d = yearlyConsolidatedCache[y];
    if (!d) return { revenueTotal: 0, gop: 0, agop: 0, noi: 0, anoi: 0, feeBase: 0, feeIncentive: 0, expenseFFE: 0, expenseTaxes: 0 };
    return d;
  };

  const rowDefs: { label: string; getValue: (y: number) => number; isDeduction: boolean; isSubtotal: boolean }[] = [
    { label: "Total Revenue", getValue: (y) => getYearData(y).revenueTotal, isDeduction: false, isSubtotal: true },
    { label: "(-) Operating Expenses", getValue: (y) => getYearData(y).revenueTotal - getYearData(y).gop, isDeduction: true, isSubtotal: false },
    { label: "Gross Operating Profit (GOP)", getValue: (y) => getYearData(y).gop, isDeduction: false, isSubtotal: true },
    { label: "(-) Management Fees", getValue: (y) => getYearData(y).feeBase + getYearData(y).feeIncentive, isDeduction: true, isSubtotal: false },
    { label: "Adjusted GOP (AGOP)", getValue: (y) => getYearData(y).agop, isDeduction: false, isSubtotal: true },
    { label: "(-) Fixed Charges & Taxes", getValue: (y) => getYearData(y).expenseTaxes, isDeduction: true, isSubtotal: false },
    { label: "Net Operating Income (NOI)", getValue: (y) => getYearData(y).noi, isDeduction: false, isSubtotal: true },
    { label: "(-) FF&E Reserve", getValue: (y) => getYearData(y).expenseFFE, isDeduction: true, isSubtotal: false },
    { label: "Adjusted NOI (ANOI)", getValue: (y) => getYearData(y).anoi, isDeduction: false, isSubtotal: true },
  ];

  const rows: WaterfallRow[] = rowDefs.map((def) => ({
    label: def.label,
    values: Array.from({ length: projectionYears }, (_, y) => def.getValue(y)),
    isDeduction: def.isDeduction,
    isSubtotal: def.isSubtotal,
  }));

  return { rows, yearLabels: years };
}

export function buildOverviewExportData(
  financials: DashboardFinancials,
  properties: Property[],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
): OverviewExportData {
  const {
    yearlyConsolidatedCache,
    allPropertyYearlyCF,
    portfolioIRR,
    equityMultiple,
    cashOnCash,
    totalInitialEquity,
    totalExitValue,
    totalProjectionRevenue,
    totalProjectionNOI,
    totalProjectionANOI,
    totalProjectionCashFlow,
    totalRooms,
  } = financials;

  const activeProperties = properties.filter(p => p.isActive !== false);
  const propertyItems: PropertyOverviewItem[] = activeProperties.map((prop, idx) => {
    const cashFlows = Array.from(
      { length: projectionYears },
      (_, y) => allPropertyYearlyCF[idx]?.[y]?.netCashFlowToInvestors ?? 0,
    );
    const result = computeIRR(cashFlows, 1);
    const irr = (result.irr_periodic ?? 0) * 100;
    return {
      name: prop.name,
      market: prop.market,
      rooms: prop.roomCount,
      status: prop.status,
      acquisitionCost: prop.purchasePrice,
      adr: prop.startAdr,
      irr: parseFloat(irr.toFixed(1)),
    };
  });

  const marketCounts = activeProperties.reduce<Record<string, number>>((acc, p) => {
    acc[p.market] = (acc[p.market] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = activeProperties.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const revenueNOIData = Array.from({ length: projectionYears }, (_, y) => ({
    year: getFiscalYear(y),
    revenue: Math.round(yearlyConsolidatedCache[y]?.revenueTotal ?? 0),
    noi: Math.round(yearlyConsolidatedCache[y]?.noi ?? 0),
    anoi: Math.round(yearlyConsolidatedCache[y]?.anoi ?? 0),
    cashFlow: Math.round(
      allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.netCashFlowToInvestors ?? 0), 0),
    ),
  }));

  const { rows: waterfallRows, yearLabels } = buildWaterfallRows(
    yearlyConsolidatedCache,
    allPropertyYearlyCF,
    projectionYears,
    getFiscalYear,
  );

  const totalProperties = activeProperties.length;
  const totalPurchasePrice = activeProperties.reduce((sum, p) => sum + p.purchasePrice, 0);
  const avgPurchasePrice = totalProperties > 0 ? totalPurchasePrice / totalProperties : 0;
  const avgExitCapRate =
    totalProperties > 0
      ? activeProperties.reduce((sum, p) => sum + (p.exitCapRate ?? DEFAULT_EXIT_CAP_RATE), 0) / totalProperties
      : DEFAULT_EXIT_CAP_RATE;
  const avgRoomsPerProperty = totalProperties > 0 ? totalRooms / totalProperties : 0;
  const avgADR =
    totalRooms > 0
      ? activeProperties.reduce((sum, p) => sum + p.startAdr * p.roomCount, 0) / totalRooms
      : 0;
  const anoiMargin =
    totalProjectionRevenue > 0 ? ((totalProjectionANOI ?? 0) / totalProjectionRevenue) * 100 : 0;

  return {
    propertyItems,
    marketCounts,
    statusCounts,
    revenueNOIData,
    waterfallRows,
    yearLabels,
    capitalStructure: {
      totalPurchasePrice,
      avgPurchasePrice,
      avgExitCapRate,
      holdPeriod: projectionYears,
      anoiMargin,
      totalProperties,
      totalRooms,
      avgRoomsPerProperty,
      avgADR,
      totalMarkets: Object.keys(marketCounts).length,
    },
    portfolioKPIs: {
      portfolioIRR,
      equityMultiple,
      cashOnCash,
      totalInitialEquity,
      totalExitValue,
      totalProjectionRevenue,
      totalProjectionNOI,
      totalProjectionANOI: totalProjectionANOI ?? 0,
      totalProjectionCashFlow,
    },
  };
}
