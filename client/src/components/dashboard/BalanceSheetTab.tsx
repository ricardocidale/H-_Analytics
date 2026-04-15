import React, { useMemo } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown } from "@/components/icons/themed-icons";
import { CalcDetailsProvider } from "@/components/financial-table";
import { FinancialChart } from "@/components/ui/financial-chart";
import { DashboardTabProps } from "./types";
import { useExpandableRows } from "./useExpandableRows";
import { useBalanceSheetData } from "./useBalanceSheetData";
import {
  AssetsSection,
  LiabilitiesSection,
  EquitySection,
  TotalLESection,
  MetricsSection,
} from "./BalanceSheetSections";


export function BalanceSheetTab({ financials, properties, global, projectionYears, getFiscalYear, showCalcDetails }: DashboardTabProps) {
  const BS_ROW_KEYS = useMemo(() => ["assets", "liabilities", "equity", "metrics"], []);
  const { expandedRows, expandedFormulas, toggleRow, toggleFormula, toggleAll, allRowsExpanded } = useExpandableRows(BS_ROW_KEYS);

  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));

  const yearlyData = useBalanceSheetData(
    financials.allPropertyFinancials,
    projectionYears,
    global.modelStartDate,
  );

  const chartData = useMemo(() => {
    return years.map((year, y) => ({
      year,
      Assets: yearlyData.consolidatedTotalAssets[y],
      Liabilities: yearlyData.consolidatedTotalLiabilities[y],
      Equity: yearlyData.consolidatedTotalEquity[y],
    }));
  }, [years, yearlyData]);

  const {
    consolidatedCash,
    consolidatedPPE,
    consolidatedAccDep,
    consolidatedDeferredFC,
    consolidatedTotalAssets,
    consolidatedDebt,
    consolidatedEquity,
    consolidatedRetained,
    consolidatedTotalLiabilities,
    consolidatedTotalEquity,
    consolidatedTotalLE,
    perPropertyByYear,
  } = yearlyData;

  const consolidatedNetFixed = useMemo(() =>
    years.map((_, y) => consolidatedPPE[y] - consolidatedAccDep[y]),
    [consolidatedPPE, consolidatedAccDep, years]
  );

  const sharedProps = {
    years,
    properties,
    expandedRows,
    expandedFormulas,
    toggleRow,
    toggleFormula,
    perPropertyByYear,
  };

  return (
    <div className="space-y-6">
      <div data-export-section="balance-sheet-chart">
      <FinancialChart
        data={chartData}
        series={[
          { dataKey: "Assets", name: "Total Assets", color: "hsl(var(--chart-2))", gradientTo: "hsl(var(--chart-2) / 0.5)" },
          { dataKey: "Liabilities", name: "Total Liabilities", color: "hsl(var(--chart-5))", gradientTo: "hsl(var(--chart-5) / 0.5)" },
          { dataKey: "Equity", name: "Total Equity", color: "hsl(var(--line-3))", gradientTo: "hsl(var(--line-3) / 0.5)" },
        ]}
        title={`Balance Sheet Trends (${projectionYears}-Year Projection)`}
        id="dashboard-balance-chart"
      />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <CardTitle>Consolidated Balance Sheet</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-xs text-muted-foreground h-7 px-2"
              data-testid="button-toggle-all-bs"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
              {allRowsExpanded ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent data-export-section="balance-sheet-table">
          <CalcDetailsProvider show={showCalcDetails}>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[280px] sticky left-0 bg-muted/50 z-10">Account</TableHead>
                    {years.map(year => (
                      <TableHead key={year} className="text-right">{year}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <AssetsSection
                    {...sharedProps}
                    consolidatedTotalAssets={consolidatedTotalAssets}
                    consolidatedCash={consolidatedCash}
                    consolidatedPPE={consolidatedPPE}
                    consolidatedAccDep={consolidatedAccDep}
                    consolidatedDeferredFC={consolidatedDeferredFC}
                    consolidatedNetFixed={consolidatedNetFixed}
                  />
                  <LiabilitiesSection
                    {...sharedProps}
                    consolidatedTotalLiabilities={consolidatedTotalLiabilities}
                    consolidatedDebt={consolidatedDebt}
                  />
                  <EquitySection
                    {...sharedProps}
                    consolidatedTotalEquity={consolidatedTotalEquity}
                    consolidatedEquity={consolidatedEquity}
                    consolidatedRetained={consolidatedRetained}
                  />
                  <TotalLESection
                    years={years}
                    expandedFormulas={expandedFormulas}
                    toggleFormula={toggleFormula}
                    consolidatedTotalLE={consolidatedTotalLE}
                    consolidatedTotalLiabilities={consolidatedTotalLiabilities}
                    consolidatedTotalEquity={consolidatedTotalEquity}
                    consolidatedTotalAssets={consolidatedTotalAssets}
                  />
                  <MetricsSection
                    years={years}
                    expandedRows={expandedRows}
                    toggleRow={toggleRow}
                    perPropertyByYear={perPropertyByYear}
                    consolidatedTotalAssets={consolidatedTotalAssets}
                    consolidatedTotalLiabilities={consolidatedTotalLiabilities}
                    consolidatedTotalEquity={consolidatedTotalEquity}
                  />
                </TableBody>
              </Table>
            </div>
          </CalcDetailsProvider>
        </CardContent>
      </Card>
    </div>
  );
}
