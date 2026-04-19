import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_PROPERTY_INCOME_TAX_RATE } from "@/lib/constants";
import type { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";

interface FCFAnalysisTableProps {
  properties: any[];
  allPropertyYearlyCF: ReturnType<typeof aggregateCashFlowByYear>[];
  getYearlyConsolidated: (yearIndex: number) => any;
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
  getPropertyAcquisitionYear: (prop: any) => number;
  getPropertyInvestment: (prop: any) => number;
  getEquityInvestmentForYear: (yearIndex: number) => number;
  getConsolidatedYearlyDetails: (yearIndex: number) => any;
  getPropertyExitValue: (propIndex: number) => number;
  consolidatedFlowsIA: number[];
  totalExitValueIA: number;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
}

export function FCFAnalysisTable({
  properties,
  allPropertyYearlyCF,
  getYearlyConsolidated,
  projectionYears,
  getFiscalYear,
  getPropertyAcquisitionYear,
  getPropertyInvestment,
  getEquityInvestmentForYear,
  getConsolidatedYearlyDetails,
  getPropertyExitValue,
  consolidatedFlowsIA,
  totalExitValueIA,
  expandedRows,
  toggleRow,
}: FCFAnalysisTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Free Cash Flow Analysis ({projectionYears}-Year)</CardTitle>
        <p className="text-sm text-muted-foreground">Investor cash flows including distributions, refinancing proceeds, and exit values</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-card min-w-[200px]">Category</TableHead>
              <TableHead className="text-right min-w-[110px]">{getFiscalYear(0)}</TableHead>
              {Array.from({ length: projectionYears }, (_, i) => (
                <TableHead key={i} className="text-right min-w-[110px]">{getFiscalYear(i + 1)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="font-semibold bg-muted/20 cursor-pointer hover:bg-muted/30" onClick={() => toggleRow('fcfEquity')}>
              <TableCell className="sticky left-0 bg-muted/20 flex items-center gap-2">
                {expandedRows.has('fcfEquity') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                Equity Investment
              </TableCell>
              {(() => {
                const year0Inv = getEquityInvestmentForYear(0);
                return <TableCell className={`text-right ${year0Inv > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{year0Inv > 0 ? `(${formatMoney(year0Inv)})` : '-'}</TableCell>;
              })()}
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearInv = getEquityInvestmentForYear(y + 1);
                return <TableCell key={y} className={`text-right ${yearInv > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{yearInv > 0 ? `(${formatMoney(yearInv)})` : '-'}</TableCell>;
              })}
            </TableRow>
            {expandedRows.has('fcfEquity') && properties.map((prop) => {
              const acqYear = getPropertyAcquisitionYear(prop);
              return (
                <TableRow key={prop.id} className="bg-muted/10">
                  <TableCell className="sticky left-0 bg-muted/10 pl-8 text-sm text-muted-foreground">{prop.name}</TableCell>
                  <TableCell className={`text-right text-sm ${acqYear === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {acqYear === 0 ? `(${formatMoney(getPropertyInvestment(prop))})` : '-'}
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => (
                    <TableCell key={y} className={`text-right text-sm ${acqYear === y + 1 ? 'text-destructive' : 'text-muted-foreground'}`}>
                      {acqYear === y + 1 ? `(${formatMoney(getPropertyInvestment(prop))})` : '-'}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}

            <TableRow className="cursor-pointer hover:bg-muted/20" onClick={() => toggleRow('fcfOperating')}>
              <TableCell className="sticky left-0 bg-card flex items-center gap-2">
                {expandedRows.has('fcfOperating') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                Free Cash Flow to Equity (FCFE)
                <InfoTooltip text="GAAP FCFE = Cash from Operations - Principal Payments. For hotels where FF&E reserves are included in NOI, this equals After-Tax Cash Flow (ATCF)." manualSection="investment-returns" manualLabel="FCFE formula in the Manual" />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const details = getConsolidatedYearlyDetails(y);
                return <TableCell key={y} className={`text-right ${details.atcf < 0 ? 'text-destructive' : ''}`}>{formatMoney(details.atcf)}</TableCell>;
              })}
            </TableRow>
            {expandedRows.has('fcfOperating') && (
              <>
                <TableRow className="bg-primary/5">
                  <TableCell className="sticky left-0 bg-primary/5 pl-8 text-sm font-medium text-muted-foreground" colSpan={1}>Cash Flow</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right text-sm text-muted-foreground">-</TableCell>)}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">Adjusted NOI (ANOI)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right text-sm text-muted-foreground">{formatMoney(getYearlyConsolidated(y)?.anoi ?? 0)}</TableCell>)}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">Less: Debt Service (P+I)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const ds = getConsolidatedYearlyDetails(y).debtService;
                    return <TableCell key={y} className="text-right text-sm text-destructive">{ds > 0 ? `(${formatMoney(ds)})` : '-'}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground flex items-center gap-1">
                    = Before-Tax Cash Flow (BTCF)
                    <InfoTooltip text="BTCF = ANOI − Debt Service. Cash available before income taxes." manualSection="property-formulas" />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const btcf = getConsolidatedYearlyDetails(y).btcf;
                    return <TableCell key={y} className={`text-right text-sm ${btcf < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{formatMoney(btcf)}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-accent-pop/10 dark:bg-accent-pop/5">
                  <TableCell className="sticky left-0 bg-accent-pop/10 dark:bg-accent-pop/5 pl-8 text-sm font-medium text-muted-foreground" colSpan={1}>Tax (GAAP)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right text-sm text-muted-foreground">-</TableCell>)}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">Less: Interest Expense</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const interest = getConsolidatedYearlyDetails(y).interestPortion;
                    return <TableCell key={y} className="text-right text-sm text-destructive">{interest > 0 ? `(${formatMoney(interest)})` : '-'}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">Less: Depreciation (non-cash)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const dep = getConsolidatedYearlyDetails(y).depreciation;
                    return <TableCell key={y} className="text-right text-sm text-destructive">{dep > 0 ? `(${formatMoney(dep)})` : '-'}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">= Taxable Income (NOI-Int-Dep)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const ti = getConsolidatedYearlyDetails(y).taxableIncome;
                    return <TableCell key={y} className={`text-right text-sm ${ti < 0 ? 'text-muted-foreground' : ''}`}>{formatMoney(ti)}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/5">
                  <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">Tax Liability (if positive)</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const tax = getConsolidatedYearlyDetails(y).taxLiability;
                    return <TableCell key={y} className="text-right text-sm text-destructive">{tax > 0 ? `(${formatMoney(tax)})` : '-'}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-primary/10 dark:bg-primary/5 border-t">
                  <TableCell className="sticky left-0 bg-primary/10 dark:bg-primary/5 pl-8 text-sm font-medium flex items-center gap-1">
                    After-Tax Cash Flow (ATCF)
                    <InfoTooltip text="ATCF = BTCF - Tax Liability. Cash available to investors after all taxes paid." manualSection="property-formulas" />
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const atcf = getConsolidatedYearlyDetails(y).atcf;
                    return <TableCell key={y} className={`text-right text-sm font-medium ${atcf < 0 ? 'text-destructive' : ''}`}>{formatMoney(atcf)}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/10">
                  <TableCell className="sticky left-0 bg-muted/10 pl-8 text-sm text-muted-foreground">By Property:</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right text-sm text-muted-foreground">-</TableCell>)}
                </TableRow>
                {properties.map((prop, idx) => (
                  <TableRow key={prop.id} className="bg-muted/5" data-testid={`fcf-property-${prop.id}`}>
                    <TableCell className="sticky left-0 bg-muted/5 pl-12 text-sm text-muted-foreground">
                      {prop.name}
                      <span className="text-xs ml-2">({((prop.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE) * 100).toFixed(0)}% income tax)</span>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                    {Array.from({ length: projectionYears }, (_, y) => {
                      const yr = allPropertyYearlyCF[idx]?.[y];
                      const atcf = yr?.atcf ?? 0;
                      return <TableCell key={y} className={`text-right text-sm ${atcf < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>{formatMoney(atcf)}</TableCell>;
                    })}
                  </TableRow>
                ))}
              </>
            )}

            <TableRow className="cursor-pointer hover:bg-muted/20" onClick={() => toggleRow('fcfRefi')}>
              <TableCell className="sticky left-0 bg-card flex items-center gap-2">
                {expandedRows.has('fcfRefi') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                Refinancing Proceeds
              </TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const totalRefi = allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.refinancingProceeds ?? 0), 0);
                return <TableCell key={y} className={`text-right ${totalRefi > 0 ? 'text-accent font-medium' : 'text-muted-foreground'}`}>{totalRefi > 0 ? formatMoney(totalRefi) : '-'}</TableCell>;
              })}
            </TableRow>
            {expandedRows.has('fcfRefi') && properties.filter(p => p.willRefinance === "Yes").map((prop) => {
              const propIdx = properties.findIndex(p => p.id === prop.id);
              const propYearly = allPropertyYearlyCF[propIdx];
              return (
                <TableRow key={prop.id} className="bg-muted/10">
                  <TableCell className="sticky left-0 bg-muted/10 pl-8 text-sm text-muted-foreground">{prop.name}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const refiAmt = propYearly?.[y]?.refinancingProceeds ?? 0;
                    return <TableCell key={y} className={`text-right text-sm ${refiAmt > 0 ? 'text-accent' : 'text-muted-foreground'}`}>{refiAmt > 0 ? formatMoney(refiAmt) : '-'}</TableCell>;
                  })}
                </TableRow>
              );
            })}

            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleRow('fcfExit')}>
              <TableCell className="sticky left-0 bg-card flex items-center gap-2">
                {expandedRows.has('fcfExit') ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                Exit Proceeds ({getFiscalYear(projectionYears - 1)})
              </TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => (
                <TableCell key={y} className={`text-right ${y !== projectionYears - 1 ? 'text-muted-foreground' : ''}`}>
                  {y === projectionYears - 1 ? formatMoney(totalExitValueIA) : '-'}
                </TableCell>
              ))}
            </TableRow>
            {expandedRows.has('fcfExit') && properties.map((prop, idx) => (
              <TableRow key={prop.id} className="bg-muted/10">
                <TableCell className="sticky left-0 bg-muted/10 pl-8 text-sm text-muted-foreground">
                  {prop.name}
                  <span className="text-xs ml-2">({((prop.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100).toFixed(1)}% cap)</span>
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">-</TableCell>
                {Array.from({ length: projectionYears }, (_, y) => (
                  <TableCell key={y} className={`text-right text-sm ${y === projectionYears - 1 ? 'text-accent' : 'text-muted-foreground'}`}>
                    {y === projectionYears - 1 ? formatMoney(getPropertyExitValue(idx)) : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}

            <TableRow className="bg-primary/10">
              <TableCell className="sticky left-0 bg-primary/10">Net Cash Flow to Investors</TableCell>
              <TableCell className="text-right text-destructive">{formatMoney(-getEquityInvestmentForYear(0))}</TableCell>
              {consolidatedFlowsIA.map((cf, i) => (
                <TableCell key={i} className={`text-right ${cf < 0 ? 'text-destructive' : ''}`}>{formatMoney(cf)}</TableCell>
              ))}
            </TableRow>

            <TableRow className="bg-muted/30">
              <TableCell className="sticky left-0 bg-muted/30 font-semibold">Cumulative Cash Flow</TableCell>
              {(() => {
                let cumulative = -getEquityInvestmentForYear(0);
                const cells = [
                  <TableCell key="y0" className={`text-right font-medium ${cumulative < 0 ? 'text-destructive' : 'text-accent'}`}>{formatMoney(cumulative)}</TableCell>
                ];
                consolidatedFlowsIA.forEach((cf, i) => {
                  cumulative += cf;
                  cells.push(<TableCell key={i} className={`text-right font-medium ${cumulative < 0 ? 'text-destructive' : 'text-accent'}`}>{formatMoney(cumulative)}</TableCell>);
                });
                return cells;
              })()}
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
