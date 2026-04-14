import React, { useRef, useMemo } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { InvestmentAnalysis } from "@/components/InvestmentAnalysis";
import { DashboardTabProps } from "./types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FinancialChart } from "@/components/ui/financial-chart";
import { useExpandableRows } from "./useExpandableRows";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function InvestmentAnalysisTab({ financials, properties, projectionYears, getFiscalYear, showCalcDetails, global }: DashboardTabProps & { global: any }) {
  const INV_ROW_KEYS = React.useMemo(() => ["metrics", "returns", "composition"], []);
  const { expandedRows, toggleRow } = useExpandableRows(INV_ROW_KEYS);
  const tabContentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { requestSave, SaveDialog } = useExportSave();

  const chartData = useMemo(() => {
    return Array.from({ length: projectionYears }, (_, i) => {
      const c = financials.yearlyConsolidatedCache[i];
      const cfYear = financials.allPropertyYearlyCF.reduce(
        (acc, prop) => ({
          debtService: acc.debtService + (prop[i]?.debtService ?? 0),
          fcfe: acc.fcfe + (prop[i]?.freeCashFlowToEquity ?? 0),
        }),
        { debtService: 0, fcfe: 0 }
      );
      return {
        year: getFiscalYear(i),
        NOI: c?.noi ?? 0,
        ANOI: c?.anoi ?? 0,
        DebtService: cfYear.debtService,
        FCFE: cfYear.fcfe,
      };
    });
  }, [financials, projectionYears, getFiscalYear]);


  return (
    <div className="space-y-6">
      {SaveDialog}
      <FinancialChart
        data={chartData}
        series={[
          { dataKey: "NOI", name: "Net Operating Income (NOI)", color: "hsl(var(--chart-1))", gradientTo: "hsl(var(--chart-1) / 0.5)" },
          { dataKey: "ANOI", name: "Adjusted NOI (ANOI)", color: "hsl(var(--chart-2))", gradientTo: "hsl(var(--chart-2) / 0.5)" },
          { dataKey: "DebtService", name: "Debt Service", color: "hsl(var(--chart-5))", gradientTo: "hsl(var(--chart-5) / 0.5)" },
          { dataKey: "FCFE", name: "Free Cash Flow to Equity", color: "hsl(var(--line-3))", gradientTo: "hsl(var(--line-3) / 0.5)" },
        ]}
        title={`Investment Returns (${projectionYears}-Year Projection)`}
        id="dashboard-investment-chart"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Investment Analysis</CardTitle>
        </CardHeader>
        <CardContent ref={tabContentRef}>
          <div className="space-y-6">
            <InvestmentAnalysis 
              properties={properties}
              allPropertyFinancials={financials.allPropertyFinancials}
              allPropertyYearlyCF={financials.allPropertyYearlyCF}
              getPropertyYearly={(propIdx, yearIdx) => financials.allPropertyYearlyIS[propIdx]?.[yearIdx]}
              getYearlyConsolidated={(yearIdx) => financials.yearlyConsolidatedCache[yearIdx]}
              global={global}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
