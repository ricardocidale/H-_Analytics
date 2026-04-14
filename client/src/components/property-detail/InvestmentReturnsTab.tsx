import { useMemo, useState, useCallback } from "react";
import { InvestmentAnalysis } from "@/components/InvestmentAnalysis";
import { FinancialChart } from "@/components/ui/financial-chart";
import { aggregatePropertyByYear } from "@/lib/financial/yearlyAggregator";
import type { YearlyCashFlowResult } from "@/lib/financial/loanCalculations";
import type { MonthlyFinancials } from "@engine/types";

interface InvestmentReturnsTabProps {
  property: any;
  global: any;
  financials: MonthlyFinancials[];
  cashFlowData: YearlyCashFlowResult[];
  projectionYears: number;
  startYear: number;
  getFiscalYear: (yearIndex: number) => number;
}

export default function InvestmentReturnsTab({
  property,
  global,
  financials,
  cashFlowData,
  projectionYears,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  startYear,
  getFiscalYear,
}: InvestmentReturnsTabProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const yearlyIS = useMemo(
    () => aggregatePropertyByYear(financials, projectionYears),
    [financials, projectionYears]
  );

  const chartData = useMemo(() => {
    return Array.from({ length: projectionYears }, (_, i) => ({
      year: getFiscalYear(i),
      NOI: yearlyIS[i]?.noi ?? 0,
      ANOI: yearlyIS[i]?.anoi ?? 0,
      DebtService: cashFlowData[i]?.debtService ?? 0,
      FCFE: cashFlowData[i]?.freeCashFlowToEquity ?? 0,
    }));
  }, [yearlyIS, cashFlowData, projectionYears, getFiscalYear]);

  const properties = useMemo(() => [property], [property]);
  const allPropertyFinancials = useMemo(() => [financials], [financials]);
  const allPropertyYearlyCF = useMemo(() => [cashFlowData], [cashFlowData]);

  const getPropertyYearly = useCallback(
    (_propIndex: number, yearIndex: number) => yearlyIS[yearIndex],
    [yearlyIS]
  );

  const getYearlyConsolidated = useCallback(
    (yearIndex: number) => yearlyIS[yearIndex],
    [yearlyIS]
  );

  if (!cashFlowData.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No cash flow data available to compute investment returns.
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="investment-returns-tab">
      <FinancialChart
        data={chartData}
        series={[
          { dataKey: "NOI", name: "Net Operating Income (NOI)", color: "hsl(var(--chart-1))", gradientTo: "hsl(var(--chart-1) / 0.5)" },
          { dataKey: "ANOI", name: "Adjusted NOI (ANOI)", color: "hsl(var(--chart-2))", gradientTo: "hsl(var(--chart-2) / 0.5)" },
          { dataKey: "DebtService", name: "Debt Service", color: "hsl(var(--chart-5))", gradientTo: "hsl(var(--chart-5) / 0.5)" },
          { dataKey: "FCFE", name: "Free Cash Flow to Equity", color: "hsl(var(--line-3))", gradientTo: "hsl(var(--line-3) / 0.5)" },
        ]}
        title={`${property.name} — Investment Returns (${projectionYears}-Year Projection)`}
        id="property-investment-chart"
      />

      <InvestmentAnalysis
        properties={properties}
        allPropertyFinancials={allPropertyFinancials}
        allPropertyYearlyCF={allPropertyYearlyCF}
        getPropertyYearly={getPropertyYearly}
        getYearlyConsolidated={getYearlyConsolidated}
        global={global}
        expandedRows={expandedRows}
        toggleRow={toggleRow}
      />
    </div>
  );
}
