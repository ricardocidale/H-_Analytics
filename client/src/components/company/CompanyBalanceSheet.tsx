/**
 * CompanyBalanceSheet.tsx — Simplified balance sheet for the management company.
 *
 * Shows the management entity's financial position at each year-end:
 *
 *   Assets:
 *     • Cash & Equivalents (cumulative net cash from the cash flow statement)
 *
 *   Liabilities:
 *     • Capital Raise Notes Payable — total outstanding capital-raise
 *       obligations (e.g. SAFE — Simple Agreement for Future Equity — or
 *       similar convertible instruments). These typically convert to equity
 *       at a future priced round; until then they sit as a liability.
 *
 *   Equity:
 *     • Retained Earnings — cumulative net income less distributions
 *     • Common Stock / Paid-in Capital
 *
 * The balance sheet follows the fundamental accounting equation:
 *   Assets = Liabilities + Equity
 *
 * For a startup management company, the early years may show negative
 * retained earnings offset by capital-raise proceeds, which is normal until the
 * portfolio generates sufficient fee revenue to cover overhead.
 */
import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { ScrollReveal } from "@/components/graphics";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FinancialChart } from "@/components/ui/financial-chart";
import type { CompanyBalanceSheetProps } from "./types";

export default function CompanyBalanceSheet({
  financials,
  global,
  projectionYears,
  getFiscalYear,
  fundingLabel,
  bsExpanded,
  setBsExpanded,
  tableRef,
  activeTab,
  yearlyChartData,
}: CompanyBalanceSheetProps) {
  const companyName = global?.companyName || "Hospitality Business Co.";

  return (
    <div className="space-y-6">
    {yearlyChartData && yearlyChartData.length > 0 && (
      <FinancialChart
        data={yearlyChartData}
        series={[
          { dataKey: "Assets", name: "Total Assets", color: "hsl(var(--chart-2))", gradientTo: "hsl(var(--chart-2) / 0.5)" },
          { dataKey: "Liabilities", name: "Total Liabilities", color: "hsl(var(--chart-4))", gradientTo: "hsl(var(--chart-4) / 0.5)" },
          { dataKey: "Equity", name: "Total Equity", color: "hsl(var(--chart-3))", gradientTo: "hsl(var(--chart-3) / 0.5)" },
        ]}
        title={`${companyName} Balance Sheet Trends (${projectionYears}-Year Projection)`}
        id="company-balance-chart"
      />
    )}
    <ScrollReveal>
    <div ref={activeTab === 'balance' ? tableRef : undefined} className="bg-card rounded-2xl p-6 shadow-sm border">
      <div>
        <h3 className="text-lg font-display text-foreground mb-4">{companyName} Balance Sheet (As of {getFiscalYear(projectionYears - 1)})</h3>
        {(() => {
          const cumulativeNetIncome = financials.reduce((a, m) => a + m.netIncome, 0);
          
          const capitalRaise1 = global.capitalRaise1Amount || 0;
          const capitalRaise2 = global.capitalRaise2Amount || 0;
          const totalCapitalRaiseFunding = capitalRaise1 + capitalRaise2;
          
          const lastMonth = financials[financials.length - 1];
          const accruedInterestBalance = lastMonth?.cumulativeAccruedInterest ?? 0;
          
          const cashBalance = lastMonth?.endingCash ?? 0;
          const totalAssets = cashBalance;
          
          const safeNotesPayable = totalCapitalRaiseFunding;
          const totalLiabilities = safeNotesPayable + accruedInterestBalance;
          
          const retainedEarnings = cumulativeNetIncome;
          const totalEquity = retainedEarnings;
          const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

          return (
            <Table>
              <TableBody>
                <TableRow className="bg-muted font-semibold">
                  <TableCell colSpan={2} className="text-lg font-display text-accent">ASSETS</TableCell>
                </TableRow>
                
                <TableRow className="bg-muted">
                  <TableCell className="font-medium pl-4">Current Assets</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow 
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setBsExpanded(prev => ({ ...prev, cash: !prev.cash }))}
                >
                  <TableCell className="pl-8">
                    <span className="flex items-center gap-1">
                      {bsExpanded.cash ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      Cash & Cash Equivalents
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(cashBalance)}</TableCell>
                </TableRow>
                {bsExpanded.cash && (
                  <>
                    <TableRow
                      className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                      data-expandable-row="true"
                      onClick={() => setBsExpanded(prev => ({ ...prev, cashFormula: !prev.cashFormula }))}
                    >
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {bsExpanded.cashFormula ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <span className="italic">Formula</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0.5" />
                    </TableRow>
                    {bsExpanded.cashFormula && (
                      <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                        <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">
                          = Cumulative Cash Flow (Net Income + Funding{accruedInterestBalance > 0 ? ' + Non-cash Interest − Interest Payments' : ''})
                        </TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">
                          {formatMoney(cashBalance)}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">{fundingLabel} Funding (Total)</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(totalCapitalRaiseFunding)}</TableCell>
                    </TableRow>
                    {capitalRaise1 > 0 && (
                      <TableRow className="bg-primary/5" data-expandable-row="true">
                        <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">Capital Raise 1</TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(capitalRaise1)}</TableCell>
                      </TableRow>
                    )}
                    {capitalRaise2 > 0 && (
                      <TableRow className="bg-primary/5" data-expandable-row="true">
                        <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">Capital Raise 2</TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(capitalRaise2)}</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">+ Cumulative Net Income</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(cumulativeNetIncome)}</TableCell>
                    </TableRow>
                  </>
                )}
                <TableRow className="font-medium bg-muted/50">
                  <TableCell className="pl-4">Total Current Assets</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(cashBalance)}</TableCell>
                </TableRow>
                
                <TableRow className="font-semibold border-t-2">
                  <TableCell>TOTAL ASSETS</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalAssets)}</TableCell>
                </TableRow>

                <TableRow><TableCell colSpan={2} className="h-4"></TableCell></TableRow>

                <TableRow className="bg-muted font-semibold">
                  <TableCell colSpan={2} className="text-lg font-display text-accent">LIABILITIES</TableCell>
                </TableRow>
                
                <TableRow className="bg-muted">
                  <TableCell className="font-medium pl-4">Long-Term Liabilities</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setBsExpanded(prev => ({ ...prev, notes: !prev.notes }))}
                >
                  <TableCell className="pl-8">
                    <span className="flex items-center gap-1">
                      {bsExpanded.notes ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      {fundingLabel} Notes Payable
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(safeNotesPayable)}</TableCell>
                </TableRow>
                {bsExpanded.notes && (
                  <>
                    {capitalRaise1 > 0 && (
                      <TableRow className="bg-primary/5" data-expandable-row="true">
                        <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Capital Raise 1</TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(capitalRaise1)}</TableCell>
                      </TableRow>
                    )}
                    {capitalRaise2 > 0 && (
                      <TableRow className="bg-primary/5" data-expandable-row="true">
                        <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Capital Raise 2</TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(capitalRaise2)}</TableCell>
                      </TableRow>
                    )}
                  </>
                )}
                {accruedInterestBalance > 0 && (
                  <TableRow>
                    <TableCell className="pl-8">
                      <span className="flex items-center gap-1">
                        Accrued Interest on Notes
                        <InfoTooltip text="Cumulative unpaid interest that has accrued on the outstanding funding principal. This liability grows each month by the monthly interest amount and is reduced when interest payments are made." />
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(accruedInterestBalance)}</TableCell>
                  </TableRow>
                )}
                <TableRow className="font-medium bg-muted/50">
                  <TableCell className="pl-4">Total Long-Term Liabilities</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalLiabilities)}</TableCell>
                </TableRow>
                
                <TableRow className="font-semibold border-t">
                  <TableCell>TOTAL LIABILITIES</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalLiabilities)}</TableCell>
                </TableRow>

                <TableRow><TableCell colSpan={2} className="h-4"></TableCell></TableRow>

                <TableRow className="bg-muted font-semibold">
                  <TableCell colSpan={2} className="text-lg font-display text-accent">EQUITY</TableCell>
                </TableRow>
                
                <TableRow
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setBsExpanded(prev => ({ ...prev, equity: !prev.equity }))}
                >
                  <TableCell className="pl-4">
                    <span className="flex items-center gap-1">
                      {bsExpanded.equity ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      Retained Earnings
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(retainedEarnings)}</TableCell>
                </TableRow>
                {bsExpanded.equity && (
                  <>
                    <TableRow
                      className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                      data-expandable-row="true"
                      onClick={() => setBsExpanded(prev => ({ ...prev, equityFormula: !prev.equityFormula }))}
                    >
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          {bsExpanded.equityFormula ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <span className="italic">Formula</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-0.5" />
                    </TableRow>
                    {bsExpanded.equityFormula && (() => {
                      const cumInterest = financials.reduce((a, m) => a + m.fundingInterestExpense, 0);
                      const hasInt = cumInterest > 0;
                      return (
                        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                          <TableCell className="pl-16 py-0.5 text-xs text-muted-foreground italic">
                            = Cumulative Revenue − Cumulative Expenses{hasInt ? ' − Interest Expense' : ''} − Tax
                          </TableCell>
                          <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">
                            {formatMoney(cumulativeNetIncome)}
                          </TableCell>
                        </TableRow>
                      );
                    })()}
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Cumulative Revenue</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(financials.reduce((a, m) => a + m.totalRevenue, 0))}</TableCell>
                    </TableRow>
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Less: Cumulative Expenses</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(-financials.reduce((a, m) => a + m.totalExpenses, 0))}</TableCell>
                    </TableRow>
                    {financials.reduce((a, m) => a + m.fundingInterestExpense, 0) > 0 && (
                      <TableRow className="bg-primary/5" data-expandable-row="true">
                        <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Less: Interest Expense</TableCell>
                        <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(-financials.reduce((a, m) => a + m.fundingInterestExpense, 0))}</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">Less: Tax</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(-financials.reduce((a, m) => a + m.companyIncomeTax, 0))}</TableCell>
                    </TableRow>
                    <TableRow className="bg-primary/5" data-expandable-row="true">
                      <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">= Net Income</TableCell>
                      <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">{formatMoney(cumulativeNetIncome)}</TableCell>
                    </TableRow>
                  </>
                )}
                
                <TableRow className="font-semibold border-t">
                  <TableCell>
                    <span className="flex items-center gap-1">
                      TOTAL EQUITY
                      <InfoTooltip text="Total Equity = Retained Earnings. For this management company, equity is entirely composed of cumulative net income." />
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalEquity)}</TableCell>
                </TableRow>

                <TableRow><TableCell colSpan={2} className="h-4"></TableCell></TableRow>

                <TableRow className="font-bold border-t-2 bg-primary/10">
                  <TableCell>TOTAL LIABILITIES & EQUITY</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalLiabilitiesAndEquity)}</TableCell>
                </TableRow>

                <TableRow
                  className="bg-primary/5 cursor-pointer hover:bg-primary/10"
                  data-expandable-row="true"
                  onClick={() => setBsExpanded(prev => ({ ...prev, balanceCheck: !prev.balanceCheck }))}
                >
                  <TableCell className="pl-8 py-0.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      {bsExpanded.balanceCheck ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      <span className="italic">Balance Check</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-0.5" />
                </TableRow>
                {bsExpanded.balanceCheck && (
                  <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
                    <TableCell className="pl-12 py-0.5 text-xs text-muted-foreground italic">
                      Assets = Liabilities + Equity → {formatMoney(totalAssets)} = {formatMoney(totalLiabilities)} + {formatMoney(totalEquity)}
                    </TableCell>
                    <TableCell className="text-right py-0.5 font-mono text-xs text-muted-foreground">
                      {Math.abs(totalAssets - totalLiabilitiesAndEquity) <= 1 ? "✓ Balanced" : `Variance: ${formatMoney(totalAssets - totalLiabilitiesAndEquity)}`}
                    </TableCell>
                  </TableRow>
                )}

                {Math.abs(totalAssets - totalLiabilitiesAndEquity) > 1 && (
                  <TableRow>
                    <TableCell colSpan={2} className="bg-destructive/10 border-t border-destructive/30">
                      <span className="text-destructive text-xs font-medium">
                        Balance sheet does not balance — Assets {formatMoney(totalAssets)} ≠ L+E {formatMoney(totalLiabilitiesAndEquity)} (variance: {formatMoney(totalAssets - totalLiabilitiesAndEquity)})
                      </span>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          );
        })()}
      </div>
    </div>
    </ScrollReveal>
    </div>
  );
}
