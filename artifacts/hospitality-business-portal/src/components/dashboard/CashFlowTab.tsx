import React, { useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, ChevronsUpDown } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { CalcDetailsProvider } from "@/components/financial-table";
import { FinancialChart } from "@/components/ui/financial-chart";
import { DashboardTabProps } from "./types";
import { useExpandableRows } from "./useExpandableRows";

function LineItemRow({ label, values, indent = false, negate = false }: { label: string; values: number[]; indent?: boolean; negate?: boolean }) {
  return (
    <TableRow data-testid={`row-cf-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <TableCell className={`${indent ? 'pl-14' : 'pl-10'} sticky left-0 bg-card z-10 text-sm text-muted-foreground`}>{label}</TableCell>
      {values.map((val, i) => (
        <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground">
          {formatMoney(negate ? -val : val)}
        </TableCell>
      ))}
    </TableRow>
  );
}

function MetricItemRow({ label, values }: { label: string; values: string[] }) {
  return (
    <TableRow data-testid={`row-cf-metric-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <TableCell className="pl-10 sticky left-0 bg-card z-10 text-sm text-muted-foreground italic">{label}</TableCell>
      {values.map((val, i) => (
        <TableCell key={i} className="text-right font-mono text-sm text-muted-foreground italic">
          {val}
        </TableCell>
      ))}
    </TableRow>
  );
}

export function CashFlowTab({ financials, properties, projectionYears, getFiscalYear, showCalcDetails }: DashboardTabProps) {
  const {
    allPropertyYearlyCF,
    yearlyConsolidatedCache,
  } = financials;
  const CF_ROW_KEYS = useMemo(() => ["cfo", "cfi", "cff", "fcf", "metrics"], []);
  const { expandedRows, expandedFormulas, toggleRow, toggleFormula, toggleAll, allRowsExpanded } = useExpandableRows(CF_ROW_KEYS);

  const years = useMemo(() => Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i)), [projectionYears, getFiscalYear]);

  const consolidatedRevenue = useMemo(() =>
    years.map((_, y) => yearlyConsolidatedCache[y]?.revenueTotal ?? 0),
    [yearlyConsolidatedCache, years]
  );

  const consolidatedNOI = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.noi ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedANOI = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.anoi ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedInterest = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.interestExpense ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedTax = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.taxLiability ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedCFO = useMemo(() => 
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.cashFromOperations ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedCapex = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.capitalExpenditures ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedExit = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.exitValue ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedCFI = useMemo(() => 
    years.map((_, y) => consolidatedCapex[y] + consolidatedExit[y]),
    [consolidatedCapex, consolidatedExit, years]
  );

  const consolidatedPrincipal = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.principalPayment ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedRefi = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.refinancingProceeds ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedCFF = useMemo(() => 
    years.map((_, y) => consolidatedRefi[y] - consolidatedPrincipal[y]),
    [consolidatedRefi, consolidatedPrincipal, years]
  );

  const netChangeInCash = useMemo(() => 
    years.map((_, y) => consolidatedCFO[y] + consolidatedCFI[y] + consolidatedCFF[y]),
    [consolidatedCFO, consolidatedCFI, consolidatedCFF, years]
  );

  const consolidatedFCF = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.freeCashFlow ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedFCFE = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.freeCashFlowToEquity ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const consolidatedDebtService = useMemo(() =>
    years.map((_, y) => allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.debtService ?? 0), 0)),
    [allPropertyYearlyCF, years]
  );

  const chartData = useMemo(() => {
    return years.map((year, y) => {
      return { year, NOI: consolidatedNOI[y], ANOI: consolidatedANOI[y], CashFlow: consolidatedFCF[y], FCFE: consolidatedFCFE[y] };
    });
  }, [consolidatedNOI, consolidatedANOI, consolidatedFCF, consolidatedFCFE, years]);

  const totalEquity = financials.totalInitialEquity;

  return (
    <div className="space-y-6">
      <div data-export-section="cash-flow-chart">
      <FinancialChart
        data={chartData}
        series={["noi", "anoi", "cashFlow", "fcfe"]}
        title={`Cash Flow Trends (${projectionYears}-Year Projection)`}
        id="dashboard-cashflow-chart"
      />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <CardTitle>Consolidated Cash Flow Statement</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              className="text-xs text-muted-foreground h-7 px-2"
              data-testid="button-toggle-all-cf"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
              {allRowsExpanded ? "Collapse All" : "Expand All"}
            </Button>
          </div>
        </CardHeader>
        <CardContent data-export-section="cash-flow-table">
          <CalcDetailsProvider show={showCalcDetails}>
            <div className="rounded-md border overflow-hidden overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[280px] sticky left-0 bg-muted/50 z-10">Section</TableHead>
                    {years.map(year => (
                      <TableHead key={year} className="text-right">{year}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* ── CFO ── */}
                  <TableRow className="bg-muted/20 font-bold" onClick={() => toggleRow("cfo")} style={{ cursor: 'pointer' }} data-testid="row-cfo-header">
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        {expandedRows.has("cfo") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Cash Flow from Operations (CFO)
                      </div>
                    </TableCell>
                    {consolidatedCFO.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  {expandedRows.has("cfo") && (
                    <>
                      <TableRow
                        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                        data-expandable-row="true"
                        onClick={() => toggleFormula("cfo-formula")}
                      >
                        <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {expandedFormulas.has("cfo-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className="italic">Formula</span>
                          </div>
                        </TableCell>
                        {consolidatedCFO.map((_, i) => (
                          <TableCell key={i} className="py-0.5" />
                        ))}
                      </TableRow>
                      {expandedFormulas.has("cfo-formula") && (
                        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                          <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                            = Revenue − Operating Expenses − Interest − Taxes
                          </TableCell>
                          {consolidatedCFO.map((val, i) => (
                            <TableCell key={i} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                              {formatMoney(val)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                      <LineItemRow label="Total Revenue" values={consolidatedRevenue} />
                      <LineItemRow label="NOI" values={consolidatedNOI} />
                      <LineItemRow label="ANOI" values={consolidatedANOI} />
                      <LineItemRow label="Less: Interest Paid" values={consolidatedInterest} negate />
                      <LineItemRow label="Less: Income Taxes" values={consolidatedTax} negate />
                      <MetricItemRow label="CFO Margin" values={years.map((_, y) => consolidatedRevenue[y] > 0 ? `${((consolidatedCFO[y] / consolidatedRevenue[y]) * 100).toFixed(1)}%` : "-")} />
                      {properties.map((prop, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="pl-10 sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                          {years.map((_, y) => (
                            <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                              {formatMoney(allPropertyYearlyCF[idx]?.[y]?.cashFromOperations ?? 0)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  )}

                  {/* ── CFI ── */}
                  <TableRow className="bg-muted/20 font-bold" onClick={() => toggleRow("cfi")} style={{ cursor: 'pointer' }} data-testid="row-cfi-header">
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        {expandedRows.has("cfi") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Cash Flow from Investing (CFI)
                      </div>
                    </TableCell>
                    {consolidatedCFI.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  {expandedRows.has("cfi") && (
                    <>
                      <TableRow
                        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                        data-expandable-row="true"
                        onClick={() => toggleFormula("cfi-formula")}
                      >
                        <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {expandedFormulas.has("cfi-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className="italic">Formula</span>
                          </div>
                        </TableCell>
                        {consolidatedCFI.map((_, i) => (
                          <TableCell key={i} className="py-0.5" />
                        ))}
                      </TableRow>
                      {expandedFormulas.has("cfi-formula") && (
                        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                          <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                            = −(Acquisition + FF&E) + Exit Proceeds
                          </TableCell>
                          {consolidatedCFI.map((val, i) => (
                            <TableCell key={i} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                              {formatMoney(val)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                      <LineItemRow label="Capital Expenditures (FF&E)" values={consolidatedCapex} />
                      <LineItemRow label="Sale Proceeds (Net Exit)" values={consolidatedExit} />
                      {properties.map((prop, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="pl-10 sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                          {years.map((_, y) => (
                            <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                              {formatMoney((allPropertyYearlyCF[idx]?.[y]?.capitalExpenditures ?? 0) + (allPropertyYearlyCF[idx]?.[y]?.exitValue ?? 0))}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  )}

                  {/* ── CFF ── */}
                  <TableRow className="bg-muted/20 font-bold" onClick={() => toggleRow("cff")} style={{ cursor: 'pointer' }} data-testid="row-cff-header">
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        {expandedRows.has("cff") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Cash Flow from Financing (CFF)
                      </div>
                    </TableCell>
                    {consolidatedCFF.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  {expandedRows.has("cff") && (
                    <>
                      <TableRow
                        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                        data-expandable-row="true"
                        onClick={() => toggleFormula("cff-formula")}
                      >
                        <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {expandedFormulas.has("cff-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className="italic">Formula</span>
                          </div>
                        </TableCell>
                        {consolidatedCFF.map((_, i) => (
                          <TableCell key={i} className="py-0.5" />
                        ))}
                      </TableRow>
                      {expandedFormulas.has("cff-formula") && (
                        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                          <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                            = Refinancing Proceeds − Principal Payments
                          </TableCell>
                          {consolidatedCFF.map((val, i) => (
                            <TableCell key={i} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                              {formatMoney(val)}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                      <LineItemRow label="Less: Principal Repayments" values={consolidatedPrincipal} negate />
                      <LineItemRow label="Refinancing Proceeds" values={consolidatedRefi} />
                      {properties.map((prop, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="pl-10 sticky left-0 bg-card z-10 text-muted-foreground text-xs">{prop.name}</TableCell>
                          {years.map((_, y) => (
                            <TableCell key={y} className="text-right font-mono text-muted-foreground text-xs">
                              {formatMoney((allPropertyYearlyCF[idx]?.[y]?.refinancingProceeds ?? 0) - (allPropertyYearlyCF[idx]?.[y]?.principalPayment ?? 0))}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  )}

                  {/* ── Net Change ── */}
                  <TableRow className="bg-primary/10 font-bold border-t-2 border-primary" data-testid="row-net-change">
                    <TableCell className="sticky left-0 bg-primary/5 z-10 font-bold">Net Change in Cash</TableCell>
                    {netChangeInCash.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow
                    className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                    data-expandable-row="true"
                    onClick={() => toggleFormula("netcash-formula")}
                  >
                    <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {expandedFormulas.has("netcash-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="italic">Formula</span>
                      </div>
                    </TableCell>
                    {netChangeInCash.map((_, i) => (
                      <TableCell key={i} className="py-0.5" />
                    ))}
                  </TableRow>
                  {expandedFormulas.has("netcash-formula") && (
                    <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                      <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                        = CFO + CFI + CFF
                      </TableCell>
                      {years.map((_, y) => (
                        <TableCell key={y} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                          {formatMoney(consolidatedCFO[y])} + {formatMoney(consolidatedCFI[y])} + {formatMoney(consolidatedCFF[y])}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}

                  {/* ── Free Cash Flow ── */}
                  <TableRow className="bg-muted/20 font-bold" onClick={() => toggleRow("fcf")} style={{ cursor: 'pointer' }} data-testid="row-fcf-header">
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        {expandedRows.has("fcf") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Free Cash Flow (FCF)
                      </div>
                    </TableCell>
                    {consolidatedFCF.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  {expandedRows.has("fcf") && (
                    <>
                      <TableRow
                        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                        data-expandable-row="true"
                        onClick={() => toggleFormula("fcf-formula")}
                      >
                        <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            {expandedFormulas.has("fcf-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className="italic">Formula</span>
                          </div>
                        </TableCell>
                        {years.map((_, i) => (
                          <TableCell key={i} className="py-0.5" />
                        ))}
                      </TableRow>
                      {expandedFormulas.has("fcf-formula") && (
                        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                          <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                            = CFO − Capital Expenditures (FF&E)
                          </TableCell>
                          {years.map((_, y) => (
                            <TableCell key={y} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                              {formatMoney(consolidatedCFO[y])} − {formatMoney(Math.abs(consolidatedCapex[y]))}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                      <LineItemRow label="Cash from Operations (CFO)" values={consolidatedCFO} />
                      <LineItemRow label="Less: FF&E Reserve" values={consolidatedCapex.map(v => Math.abs(v))} negate />
                    </>
                  )}

                  <TableRow className="font-medium bg-primary/10" data-testid="row-fcfe">
                    <TableCell className="pl-6 sticky left-0 bg-primary/10 z-10">Free Cash Flow to Equity (FCFE)</TableCell>
                    {consolidatedFCFE.map((val, i) => (
                      <TableCell key={i} className="text-right font-mono">{formatMoney(val)}</TableCell>
                    ))}
                  </TableRow>
                  <TableRow
                    className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                    data-expandable-row="true"
                    onClick={() => toggleFormula("fcfe-formula")}
                  >
                    <TableCell className="pl-10 sticky left-0 bg-primary/5 z-10 py-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        {expandedFormulas.has("fcfe-formula") ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        <span className="italic">Formula</span>
                      </div>
                    </TableCell>
                    {years.map((_, i) => (
                      <TableCell key={i} className="py-0.5" />
                    ))}
                  </TableRow>
                  {expandedFormulas.has("fcfe-formula") && (
                    <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                      <TableCell className="pl-14 sticky left-0 bg-primary/[0.03] z-10 py-0.5 text-xs text-muted-foreground italic">
                        = FCF − Principal Payments
                      </TableCell>
                      {years.map((_, y) => (
                        <TableCell key={y} className="text-right font-mono text-xs text-muted-foreground py-0.5">
                          {formatMoney(consolidatedFCF[y])} − {formatMoney(consolidatedPrincipal[y])}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}

                  {/* ── Key Metrics ── */}
                  <TableRow className="bg-muted/20 font-bold border-t" onClick={() => toggleRow("metrics")} style={{ cursor: 'pointer' }} data-testid="row-metrics-header">
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div className="flex items-center gap-2">
                        {expandedRows.has("metrics") ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        Key Metrics
                      </div>
                    </TableCell>
                    {years.map((_, i) => (
                      <TableCell key={i} />
                    ))}
                  </TableRow>
                  {expandedRows.has("metrics") && (
                    <>
                      <MetricItemRow
                        label="DSCR (Debt Service Coverage)"
                        values={years.map((_, y) => consolidatedDebtService[y] > 0 ? `${(consolidatedANOI[y] / consolidatedDebtService[y]).toFixed(2)}x` : "N/A")}
                      />
                      <MetricItemRow
                        label="Cash-on-Cash Return"
                        values={years.map((_, y) => totalEquity > 0 ? `${((consolidatedFCFE[y] / totalEquity) * 100).toFixed(1)}%` : "-")}
                      />
                      <MetricItemRow
                        label="FCF Margin"
                        values={years.map((_, y) => consolidatedRevenue[y] > 0 ? `${((consolidatedFCF[y] / consolidatedRevenue[y]) * 100).toFixed(1)}%` : "-")}
                      />
                      <MetricItemRow
                        label="FCFE Margin"
                        values={years.map((_, y) => consolidatedRevenue[y] > 0 ? `${((consolidatedFCFE[y] / consolidatedRevenue[y]) * 100).toFixed(1)}%` : "-")}
                      />
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </CalcDetailsProvider>
        </CardContent>
      </Card>
    </div>
  );
}
