import React, { useState, useMemo } from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollReveal } from "@/components/graphics";
import { FinancialChart } from "@/components/ui/financial-chart";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { computeIRR } from "@analytics/returns/irr.js";
import type { CompanyMonthlyFinancials } from "@/lib/financialEngine";
import type { CompanyChartDataPoint } from "./types";

interface CompanyInvestmentTabProps {
  financials: CompanyMonthlyFinancials[];
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
  yearlyChartData: CompanyChartDataPoint[];
  propertyFinancials: { property: { isActive?: boolean }; financials: { noi: number }[] }[];
  global: { companyOpsStartDate?: string; safeTranche1Date?: string; safeTranche1Amount?: number; safeTranche2Amount?: number; companyName?: string };
  tableRef?: React.RefObject<HTMLDivElement | null>;
  activeTab?: string;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function calculateSafeIRR(cashFlows: number[]): number | null {
  const hasPositive = cashFlows.some(cf => cf > 0);
  const hasNegative = cashFlows.some(cf => cf < 0);
  if (!hasPositive || !hasNegative) return null;
  const result = computeIRR(cashFlows, 1);
  return result.irr_periodic ?? null;
}

export default function CompanyInvestmentTab({
  financials,
  projectionYears,
  getFiscalYear,
  yearlyChartData,
  propertyFinancials,
  global,
  tableRef,
  activeTab,
}: CompanyInvestmentTabProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["runway", "fees", "valuation"]));

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));

  const totalSafeFunding = (global.safeTranche1Amount ?? 0) + (global.safeTranche2Amount ?? 0);

  const breakevenMonth = useMemo(() => {
    const SUSTAINED_MONTHS = 3;
    for (let i = 0; i < financials.length; i++) {
      const m = financials[i];
      if (m.endingCash > 0 && m.netIncome >= 0) {
        let sustained = true;
        for (let j = i + 1; j < Math.min(i + SUSTAINED_MONTHS, financials.length); j++) {
          if (financials[j].endingCash <= 0 || financials[j].netIncome < 0) {
            sustained = false;
            break;
          }
        }
        if (sustained) return i + 1;
      }
    }
    return null;
  }, [financials]);

  const lastYear = yearlyChartData[yearlyChartData.length - 1];
  const steadyStateNetMargin = lastYear && lastYear.Revenue > 0
    ? lastYear.NetIncome / lastYear.Revenue
    : 0;

  const activePropertyCount = propertyFinancials.filter(pf => pf.property.isActive !== false).length;
  const revenuePerProperty = lastYear && activePropertyCount > 0
    ? lastYear.Revenue / activePropertyCount
    : 0;

  const yearlyBurn = useMemo(() => {
    return Array.from({ length: projectionYears }, (_, y) => {
      const slice = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
      const totalExp = slice.reduce((a, m) => a + m.totalExpenses, 0);
      return totalExp / MONTHS_PER_YEAR;
    });
  }, [financials, projectionYears]);

  const portfolioNOI = useMemo(() => {
    return Array.from({ length: projectionYears }, (_, y) => {
      let noi = 0;
      for (const pf of propertyFinancials) {
        if (pf.property.isActive === false) continue;
        const slice = pf.financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
        noi += slice.reduce((a, m) => a + (m.noi ?? 0), 0);
      }
      return noi;
    });
  }, [propertyFinancials, projectionYears]);

  const stabilizedRevenue = lastYear?.Revenue ?? 0;
  const stabilizedEBITDA = lastYear ? lastYear.Revenue - lastYear.Expenses : 0;

  const revenueMultiples = [3, 4, 5];
  const ebitdaMultiples = [8, 10, 12];

  const valuationScenarios = useMemo(() => {
    const scenarios: { label: string; multiple: number; basis: "revenue" | "ebitda" }[] = [
      ...revenueMultiples.map(m => ({ label: `${m}x Revenue`, multiple: m, basis: "revenue" as const })),
      ...ebitdaMultiples.map(m => ({ label: `${m}x EBITDA`, multiple: m, basis: "ebitda" as const })),
    ];
    return scenarios.map(s => {
      const basisValue = s.basis === "revenue" ? stabilizedRevenue : stabilizedEBITDA;
      const exitValue = basisValue * s.multiple;
      const safeReturn = totalSafeFunding > 0 ? exitValue / totalSafeFunding : 0;

      const safeCashFlows: number[] = [];
      for (let y = 0; y < projectionYears; y++) {
        const yd = yearlyChartData[y];
        const funding = yd?.Funding ?? 0;
        if (y === projectionYears - 1) {
          safeCashFlows.push(-funding + exitValue);
        } else {
          safeCashFlows.push(-funding);
        }
      }
      const safeIRR = calculateSafeIRR(safeCashFlows);

      return {
        ...s,
        exitValue,
        safeReturn,
        safeIRR,
      };
    });
  }, [stabilizedRevenue, stabilizedEBITDA, totalSafeFunding, yearlyChartData, projectionYears]);

  const chartData = useMemo(() => {
    return yearlyChartData.map(yd => ({
      year: yd.year,
      Revenue: yd.Revenue,
      NetIncome: yd.NetIncome,
      EndingCash: yd.EndingCash,
      Funding: yd.Funding,
    }));
  }, [yearlyChartData]);

  const companyName = global.companyName || "Management Company";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="investment-kpi-cards">
        <KPICard
          label="Total SAFE Funding"
          value={formatMoney(totalSafeFunding)}
          sub="All tranches received"
          testId="kpi-total-safe-funding"
        />
        <KPICard
          label="Breakeven Month"
          value={breakevenMonth ? `Month ${breakevenMonth}` : "Not reached"}
          sub="First sustained positive cash"
          testId="kpi-breakeven-month"
        />
        <KPICard
          label="Steady-State Net Margin"
          value={pct(steadyStateNetMargin)}
          sub={`Year ${projectionYears} stabilized`}
          testId="kpi-steady-state-margin"
          highlight={steadyStateNetMargin > 0}
        />
        <KPICard
          label="Revenue per Property"
          value={formatMoney(revenuePerProperty)}
          sub={`${activePropertyCount} active properties`}
          testId="kpi-revenue-per-property"
        />
      </div>

      <FinancialChart
        data={chartData as unknown as Record<string, unknown>[]}
        series={["revenue", "netIncome", "endingCash", "funding"]}
        title={`${companyName} Investment Overview (${projectionYears}-Year)`}
        id="company-investment-chart"
      />

      <ScrollReveal>
      <div ref={activeTab === "investment" ? tableRef : undefined} className="space-y-6">
        <ExpandableTable
          id="runway"
          title="Cash Runway Analysis"
          expanded={expandedSections.has("runway")}
          onToggle={() => toggleSection("runway")}
          testId="table-cash-runway"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">Metric</TableHead>
                {years.map(y => <TableHead key={y} className="text-right font-mono">{y}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              <FinRow label="SAFE Funding Received" values={yearlyChartData.map(yd => yd.Funding)} testId="row-safe-funding" />
              <FinRow label="Monthly Burn Rate" values={yearlyBurn} testId="row-monthly-burn" />
              <RunwayRow label="Months of Runway" yearlyChartData={yearlyChartData} yearlyBurn={yearlyBurn} testId="row-months-runway" />
              <FinRow label="Ending Cash Balance" values={yearlyChartData.map(yd => yd.EndingCash)} bold testId="row-ending-cash" />
            </TableBody>
          </Table>
        </ExpandableTable>

        <ExpandableTable
          id="fees"
          title="Fee Revenue Decomposition"
          expanded={expandedSections.has("fees")}
          onToggle={() => toggleSection("fees")}
          testId="table-fee-revenue"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[240px]">Metric</TableHead>
                {years.map(y => <TableHead key={y} className="text-right font-mono">{y}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              <FinRow label="Base Fee Revenue" values={yearlyChartData.map(yd => yd.BaseFees)} testId="row-base-fees" />
              <FinRow label="Incentive Fee Revenue" values={yearlyChartData.map(yd => yd.IncentiveFees)} testId="row-incentive-fees" />
              <FinRow label="Total Fee Revenue" values={yearlyChartData.map(yd => yd.Revenue)} bold testId="row-total-fees" />
              <CountRow label="Active Properties" count={activePropertyCount} years={years} testId="row-active-properties" />
              <FinRow label="Revenue per Property" values={yearlyChartData.map(yd => activePropertyCount > 0 ? yd.Revenue / activePropertyCount : 0)} testId="row-rev-per-property" />
              <PctRow label="Fee Revenue as % of Portfolio NOI" revenues={yearlyChartData.map(yd => yd.Revenue)} denominators={portfolioNOI} testId="row-fee-pct-noi" />
            </TableBody>
          </Table>
        </ExpandableTable>

        <ExpandableTable
          id="valuation"
          title="Company Valuation Scenarios"
          expanded={expandedSections.has("valuation")}
          onToggle={() => toggleSection("valuation")}
          testId="table-valuation"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Metric</TableHead>
                {revenueMultiples.map(m => <TableHead key={`rev-${m}`} className="text-right font-mono">{m}x Revenue</TableHead>)}
                {ebitdaMultiples.map(m => <TableHead key={`ebitda-${m}`} className="text-right font-mono">{m}x EBITDA</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Implied Exit Value</TableCell>
                {valuationScenarios.map((s, i) => (
                  <TableCell key={i} className="text-right font-mono">{formatMoney(s.exitValue)}</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">SAFE Return Multiple</TableCell>
                {valuationScenarios.map((s, i) => (
                  <TableCell key={i} className="text-right font-mono">{s.safeReturn.toFixed(1)}x</TableCell>
                ))}
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Implied SAFE IRR</TableCell>
                {valuationScenarios.map((s, i) => (
                  <TableCell key={i} className={`text-right font-mono ${s.safeIRR !== null && s.safeIRR > 0.2 ? "text-positive" : s.safeIRR !== null && s.safeIRR < 0 ? "text-negative" : ""}`}>
                    {s.safeIRR !== null ? pct(s.safeIRR) : "N/A"}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
          <div className="mt-3 text-xs text-muted-foreground">
            Based on Year {projectionYears} stabilized revenue of {formatMoney(stabilizedRevenue)} and EBITDA of {formatMoney(stabilizedEBITDA)}.
            Total SAFE invested: {formatMoney(totalSafeFunding)}.
          </div>
        </ExpandableTable>
      </div>
      </ScrollReveal>
    </div>
  );
}

function KPICard({ label, value, sub, testId, highlight }: { label: string; value: string; sub: string; testId: string; highlight?: boolean }) {
  return (
    <div className="bg-card rounded-xl p-4 border shadow-sm">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-semibold font-mono ${highlight ? "text-positive" : "text-foreground"}`} data-testid={testId}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

function ExpandableTable({ id, title, expanded, onToggle, children, testId }: {
  id: string; title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode; testId: string;
}) {
  return (
    <div className="bg-card rounded-2xl p-6 shadow-sm border" data-testid={testId}>
      <button
        className="flex items-center gap-2 w-full text-left cursor-pointer"
        onClick={onToggle}
        data-testid={`button-toggle-${id}`}
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <h3 className="text-lg font-display text-foreground">{title}</h3>
      </button>
      {expanded && <div className="mt-4 overflow-x-auto">{children}</div>}
    </div>
  );
}

function FinRow({ label, values, bold, testId }: { label: string; values: number[]; bold?: boolean; testId: string }) {
  return (
    <TableRow data-testid={testId}>
      <TableCell className={bold ? "font-semibold" : ""}>{label}</TableCell>
      {values.map((v, i) => (
        <TableCell key={i} className={`text-right font-mono ${bold ? "font-semibold" : ""} ${v < 0 ? "text-negative" : ""}`}>
          {formatMoney(v)}
        </TableCell>
      ))}
    </TableRow>
  );
}

function RunwayRow({ label, yearlyChartData, yearlyBurn, testId }: {
  label: string; yearlyChartData: CompanyChartDataPoint[]; yearlyBurn: number[]; testId: string;
}) {
  return (
    <TableRow data-testid={testId}>
      <TableCell>{label}</TableCell>
      {yearlyChartData.map((yd, i) => {
        const burn = yearlyBurn[i];
        const months = burn > 0 ? yd.EndingCash / burn : Infinity;
        const isLow = months < 6 && isFinite(months);
        return (
          <TableCell key={i} className={`text-right font-mono ${isLow ? "text-negative font-semibold" : ""}`}>
            {isFinite(months) ? `${months.toFixed(1)}` : "∞"}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

function CountRow({ label, count, years, testId }: { label: string; count: number; years: number[]; testId: string }) {
  return (
    <TableRow data-testid={testId}>
      <TableCell>{label}</TableCell>
      {years.map((_, i) => (
        <TableCell key={i} className="text-right font-mono">{count}</TableCell>
      ))}
    </TableRow>
  );
}

function PctRow({ label, revenues, denominators, testId }: { label: string; revenues: number[]; denominators: number[]; testId: string }) {
  return (
    <TableRow data-testid={testId}>
      <TableCell>{label}</TableCell>
      {revenues.map((rev, i) => {
        const denom = denominators[i] ?? 0;
        const val = denom > 0 ? rev / denom : 0;
        return (
          <TableCell key={i} className="text-right font-mono">{pct(val)}</TableCell>
        );
      })}
    </TableRow>
  );
}
