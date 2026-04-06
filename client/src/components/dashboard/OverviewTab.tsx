import React, { useRef, useState, useMemo } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { Button } from "@/components/ui/button";
import { type Insight } from "@/components/graphics";
import { ResponsiveContainer, AreaChart, Area, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { type ChartConfig } from "@/components/ui/chart";
import { DashboardTabProps } from "./types";
import { formatMoney, getFiscalYearForModelYear } from "@/lib/financialEngine";
import { DEFAULT_EXIT_CAP_RATE } from "@/lib/constants";
import { propertyEquityInvested } from "@/lib/financial/equityCalculations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PIE_COLORS, buildWaterfallData, calculateIRR, truncName, type ChartMode } from "./overview-helpers";
import { InvestmentPerformanceSection } from "./OverviewPerformanceSection";
import { PortfolioCompositionSection, PortfolioInsightsSection, MarketStatusSection, WaterfallSection } from "./OverviewCompositionSections";

function ChartModeToggle({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  return (
    <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5" data-testid="chart-mode-toggle">
      <Button
        variant={mode === "area" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("area")}
        className={`px-2.5 py-1 text-xs font-medium ${
          mode === "area"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="toggle-area-chart"
      >
        Area
      </Button>
      <Button
        variant={mode === "line" ? "secondary" : "ghost"}
        size="sm"
        onClick={() => onChange("line")}
        className={`px-2.5 py-1 text-xs font-medium ${
          mode === "line"
            ? "bg-card text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
        data-testid="toggle-line-chart"
      >
        Line
      </Button>
    </div>
  );
}

export function OverviewTab({ financials, properties, projectionYears, getFiscalYear, global }: DashboardTabProps) {
  const {
    yearlyConsolidatedCache,
    allPropertyYearlyCF,
    allPropertyYearlyIS,
    portfolioIRR,
    equityMultiple,
    cashOnCash,
    totalInitialEquity,
    totalExitValue,
    totalProjectionRevenue,
    totalProjectionNOI,
    totalProjectionCashFlow
  } = financials;

  const [chartMode, setChartMode] = useState<ChartMode>("area");

  const tabContentRef = useRef<HTMLDivElement>(null);
  const chartsRef = useRef<HTMLDivElement>(null);
  const { requestSave, SaveDialog } = useExportSave();

  const activeProperties = properties.filter(p => p.isActive !== false);
  const totalProperties = activeProperties.length;
  const totalRooms = financials.totalRooms;
  const totalPurchasePrice = activeProperties.reduce((sum, p) => sum + p.purchasePrice, 0);
  const avgPurchasePrice = totalProperties > 0 ? totalPurchasePrice / totalProperties : 0;
  const avgRoomsPerProperty = totalProperties > 0 ? totalRooms / totalProperties : 0;
  const avgADR = totalRooms > 0
    ? activeProperties.reduce((sum, p) => sum + p.startAdr * p.roomCount, 0) / totalRooms
    : 0;
  const avgExitCapRate = totalProperties > 0 ? activeProperties.reduce((sum, p) => sum + (p.exitCapRate ?? DEFAULT_EXIT_CAP_RATE), 0) / totalProperties : DEFAULT_EXIT_CAP_RATE;
  const totalInvestment = totalPurchasePrice;
  const investmentHorizon = projectionYears;

  const [waterfallYear, setWaterfallYear] = useState<string>("0");

  const marketCounts = activeProperties.reduce((acc, p) => {
    acc[p.market] = (acc[p.market] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const marketEntries = Object.entries(marketCounts);
  const marketData = marketEntries.map(([name, value], i) => ({
    market: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    value,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const marketChartConfig: ChartConfig = {
    value: { label: "Properties" },
    ...Object.fromEntries(
      marketEntries.map(([name], i) => [
        name.toLowerCase().replace(/\s+/g, "-"),
        { label: name, color: PIE_COLORS[i % PIE_COLORS.length] },
      ])
    ),
  };

  const statusCounts = activeProperties.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const yearTabs = useMemo(() => {
    const tabs = Array.from({ length: projectionYears }, (_, i) => {
      const fy = global?.modelStartDate
        ? getFiscalYearForModelYear(global.modelStartDate, global?.fiscalYearStartMonth ?? 1, i)
        : `Year ${i + 1}`;
      return { value: String(i), label: String(fy) };
    });
    tabs.push({ value: "all", label: "Consolidated" });
    return tabs;
  }, [projectionYears, global?.modelStartDate, global?.fiscalYearStartMonth]);

  const waterfallData = useMemo(() => {
    if (!yearlyConsolidatedCache?.length) return null;
    if (waterfallYear === "all") {
      const summed = yearlyConsolidatedCache.reduce((acc, y) => ({
        revenueTotal: acc.revenueTotal + y.revenueTotal,
        gop: acc.gop + y.gop,
        agop: acc.agop + y.agop,
        noi: acc.noi + y.noi,
        anoi: acc.anoi + y.anoi,
        feeBase: acc.feeBase + y.feeBase,
        feeIncentive: acc.feeIncentive + y.feeIncentive,
        expenseFFE: acc.expenseFFE + y.expenseFFE,
        expenseTaxes: acc.expenseTaxes + y.expenseTaxes,
      }), { revenueTotal: 0, gop: 0, agop: 0, noi: 0, anoi: 0, feeBase: 0, feeIncentive: 0, expenseFFE: 0, expenseTaxes: 0 });
      return buildWaterfallData(summed);
    }
    const idx = Math.min(Number(waterfallYear), yearlyConsolidatedCache.length - 1);
    return buildWaterfallData(yearlyConsolidatedCache[idx]);
  }, [yearlyConsolidatedCache, waterfallYear]);

  const getPropertyCashFlows = (idx: number): number[] =>
    Array.from({ length: projectionYears }, (_, y) => allPropertyYearlyCF[idx]?.[y]?.netCashFlowToInvestors ?? 0);

  const getPropertyInvestment = (prop: typeof properties[0]): number =>
    propertyEquityInvested(prop);

  const propertyIRRData = useMemo(() => properties.map((prop, idx) => {
    const cashFlows = getPropertyCashFlows(idx);
    const irr = calculateIRR(cashFlows);
    return {
      name: truncName(prop.name),
      fullName: prop.name,
      irr: parseFloat((irr * 100).toFixed(1)),
    };
  }), [properties, allPropertyYearlyCF, projectionYears]);

  const propertyInvestmentData = useMemo(() => properties.map((prop) => {
    const investment = getPropertyInvestment(prop);
    return {
      name: truncName(prop.name),
      fullName: prop.name,
      investment: Math.round(investment),
    };
  }), [properties]);

  const revenueNOIData = useMemo(() => Array.from({ length: projectionYears }, (_, y) => {
    const rev = yearlyConsolidatedCache[y]?.revenueTotal ?? 0;
    const noi = yearlyConsolidatedCache[y]?.noi ?? 0;
    const anoi = yearlyConsolidatedCache[y]?.anoi ?? 0;
    const cf = allPropertyYearlyCF.reduce((sum, propCF) => sum + (propCF[y]?.netCashFlowToInvestors ?? 0), 0);
    return {
      year: getFiscalYear(y),
      revenue: Math.round(rev),
      noi: Math.round(noi),
      anoi: Math.round(anoi),
      cashFlow: Math.round(cf),
    };
  }), [projectionYears, yearlyConsolidatedCache, allPropertyYearlyCF, getFiscalYear]);

  const exitGainPercent = totalInitialEquity > 0 ? ((totalExitValue / totalInitialEquity - 1) * 100).toFixed(0) : "0";

  const marketList = Object.entries(marketCounts).map(([m, c]) => `${m} (${c})`).join(', ');
  const insights: Insight[] = [
    { text: `Markets: ${marketList}`, type: "neutral" as const },
    { text: `${investmentHorizon}-year total revenue`, metric: formatMoney(totalProjectionRevenue), type: "neutral" as const },
    { text: `${investmentHorizon}-year total NOI`, metric: formatMoney(totalProjectionNOI), type: "neutral" as const },
    { text: `${investmentHorizon}-year total ANOI`, metric: formatMoney(financials.totalProjectionANOI || 0), type: "neutral" as const },
    { text: `${investmentHorizon}-year total cash flow`, metric: formatMoney(totalProjectionCashFlow), type: "neutral" as const },
  ];

  return (
    <Card className="bg-card border-border shadow-sm relative overflow-hidden">
      {SaveDialog}
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
        <CardTitle>Portfolio Overview</CardTitle>
      </CardHeader>
      <CardContent ref={tabContentRef} className="relative z-10">
        <Accordion type="multiple" defaultValue={["performance", "projection", "composition", "insights", "marketStatus", "waterfall"]} className="space-y-4">

          <InvestmentPerformanceSection
            investmentHorizon={investmentHorizon}
            totalProperties={totalProperties}
            totalRooms={totalRooms}
            portfolioIRR={portfolioIRR}
            equityMultiple={equityMultiple}
            cashOnCash={cashOnCash}
            totalInitialEquity={totalInitialEquity}
            totalExitValue={totalExitValue}
            exitGainPercent={exitGainPercent}
            propertyIRRData={propertyIRRData}
            propertyInvestmentData={propertyInvestmentData}
            chartsRef={chartsRef}
          />

          <AccordionItem value="projection" className="border-none">
            <div className="flex items-center gap-2 py-3 px-1">
              <AccordionTrigger className="hover:no-underline p-0">
                <span className="text-sm font-semibold text-foreground tracking-wide uppercase">Revenue & ANOI Projection</span>
              </AccordionTrigger>
              <InfoTooltip
                text="Revenue is total income from all hotel operations. ANOI (Adjusted Net Operating Income) is the bottom operating line after all operating expenses, management fees, fixed charges, and FF&E reserve."
                formula="ANOI = NOI − Mgmt Fees − FF&E Reserve"
                light
                side="right"
              />
            </div>
            <AccordionContent className="pt-2 pb-4">
            <div className="bg-card rounded-lg border border-border shadow-sm p-4 sm:p-6" data-export-section="revenue-anoi-chart">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground font-display">Revenue & ANOI</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground label-text">{investmentHorizon}-year consolidated projection</p>
                </div>
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="flex items-center gap-3 sm:gap-4 text-xs label-text">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-1))' }} />
                      <span className="text-muted-foreground">Revenue</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full" style={{ backgroundColor: 'hsl(var(--chart-2))' }} />
                      <span className="text-muted-foreground">ANOI</span>
                    </span>
                  </div>
                  <ChartModeToggle mode={chartMode} onChange={setChartMode} />
                </div>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                {chartMode === "area" ? (
                  <AreaChart data={revenueNOIData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="anoiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                    <YAxis tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={false}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = { revenue: "Revenue — Total Revenue", anoi: "ANOI — Adjusted Net Operating Income" };
                        return [formatMoney(value), labels[name] ?? name];
                      }}
                      contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', color: 'hsl(var(--foreground))' }}
                    />
                    <Area type="monotone" dataKey="revenue" fill="url(#revenueGrad)" stroke="hsl(var(--line-1))" strokeWidth={2} dot={{ fill: "hsl(var(--line-1))", stroke: "hsl(var(--card))", strokeWidth: 2, r: 3 }} activeDot={{ r: 5, fill: "hsl(var(--line-1))", stroke: "hsl(var(--card))", strokeWidth: 2 }} />
                    <Area type="monotone" dataKey="anoi" fill="url(#anoiGrad)" stroke="hsl(var(--line-2))" strokeWidth={2} dot={{ fill: "hsl(var(--line-2))", stroke: "hsl(var(--card))", strokeWidth: 2, r: 3 }} activeDot={{ r: 5, fill: "hsl(var(--line-2))", stroke: "hsl(var(--card))", strokeWidth: 2 }} />
                  </AreaChart>
                ) : (
                  <LineChart data={revenueNOIData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                    <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} />
                    <YAxis tickFormatter={(v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${(v / 1_000).toFixed(0)}K`} tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }} axisLine={false} tickLine={false} width={60} />
                    <Tooltip
                      cursor={false}
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = { revenue: "Revenue — Total Revenue", anoi: "ANOI — Adjusted Net Operating Income" };
                        return [formatMoney(value), labels[name] ?? name];
                      }}
                      contentStyle={{ borderRadius: 10, border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', color: 'hsl(var(--foreground))' }}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="hsl(var(--line-1))" strokeWidth={2.5} dot={{ fill: "hsl(var(--line-1))", stroke: "hsl(var(--card))", strokeWidth: 2, r: 3.5 }} activeDot={{ r: 5.5, fill: "hsl(var(--line-1))", stroke: "hsl(var(--card))", strokeWidth: 2 }} />
                    <Line type="monotone" dataKey="anoi" stroke="hsl(var(--line-2))" strokeWidth={2.5} dot={{ fill: "hsl(var(--line-2))", stroke: "hsl(var(--card))", strokeWidth: 2, r: 3.5 }} activeDot={{ r: 5.5, fill: "hsl(var(--line-2))", stroke: "hsl(var(--card))", strokeWidth: 2 }} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
            </AccordionContent>
          </AccordionItem>

          <PortfolioCompositionSection
            totalProperties={totalProperties}
            totalRooms={totalRooms}
            avgRoomsPerProperty={avgRoomsPerProperty}
            avgADR={avgADR}
            totalPurchasePrice={totalPurchasePrice}
            avgPurchasePrice={avgPurchasePrice}
            avgExitCapRate={avgExitCapRate}
            investmentHorizon={investmentHorizon}
            totalProjectionRevenue={totalProjectionRevenue}
            totalProjectionNOI={totalProjectionNOI}
            marketCounts={marketCounts}
          />

          <PortfolioInsightsSection
            properties={properties}
            propertyIRRData={propertyIRRData}
            insights={insights}
          />

          <MarketStatusSection
            totalProperties={totalProperties}
            marketData={marketData}
            marketChartConfig={marketChartConfig}
            statusCounts={statusCounts}
          />

          {waterfallData && (
            <WaterfallSection
              waterfallData={waterfallData}
              waterfallYear={waterfallYear}
              setWaterfallYear={setWaterfallYear}
              yearTabs={yearTabs}
            />
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
