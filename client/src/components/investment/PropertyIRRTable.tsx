import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatMoney } from "@/lib/financialEngine";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_PROPERTY_INCOME_TAX_RATE, IRR_HIGHLIGHT_THRESHOLD } from "@/lib/constants";

interface PropertyIRRTableProps {
  properties: any[];
  getPropertyInvestment: (prop: any) => number;
  getPropertyExitValue: (propIndex: number) => number;
  getPropertyCashFlows: (propIndex: number) => number[];
  calculateIRR: (cashFlows: number[]) => number;
  totalInitialEquityIA: number;
  totalExitValueIA: number;
  consolidatedFlowsIA: number[];
  equityMultipleIA: number;
  portfolioIRRIA: number;
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
}

export function PropertyIRRTable({
  properties,
  getPropertyInvestment,
  getPropertyExitValue,
  getPropertyCashFlows,
  calculateIRR,
  totalInitialEquityIA,
  totalExitValueIA,
  consolidatedFlowsIA,
  equityMultipleIA,
  portfolioIRRIA,
  projectionYears,
  getFiscalYear,
}: PropertyIRRTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Property-Level IRR Analysis</CardTitle>
        <p className="text-sm text-muted-foreground">Individual property returns based on equity investment, cash flows, and exit value</p>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead className="text-right">Equity Investment</TableHead>
              <TableHead className="text-right">Income Tax</TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  Exit Cap Rate
                  <InfoTooltip text="Capitalization rate used to value the property at sale. Lower cap rate = higher valuation." manualSection="investment-returns" />
                </div>
              </TableHead>
              <TableHead className="text-right">Exit Value ({getFiscalYear(projectionYears - 1)})</TableHead>
              <TableHead className="text-right">Total Distributions</TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  Equity Multiple
                  <InfoTooltip text="Total cash returned divided by total equity invested. A 2.0x multiple means investors received $2 for every $1 invested." manualSection="investment-returns" />
                </div>
              </TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-1">
                  IRR
                  <InfoTooltip text="Internal Rate of Return — the annualized return that makes the net present value of all cash flows equal to zero." manualSection="investment-returns" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {properties.map((prop, idx) => {
              const equity = getPropertyInvestment(prop);
              const exitValue = getPropertyExitValue(idx);
              const cashFlows = getPropertyCashFlows(idx);
              const irr = calculateIRR(cashFlows);
              const totalDistributions = cashFlows.slice(1).reduce((a, b) => a + b, 0);
              const equityMultiple = totalDistributions / equity;

              return (
                <TableRow key={prop.id}>
                  <TableCell className="font-medium">{prop.name}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(equity)}</TableCell>
                  <TableCell className="text-right">{((prop.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE) * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{((prop.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-accent">{formatMoney(exitValue)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(totalDistributions)}</TableCell>
                  <TableCell className="text-right font-medium">{equityMultiple.toFixed(2)}x</TableCell>
                  <TableCell className={`text-right font-bold ${irr > IRR_HIGHLIGHT_THRESHOLD ? 'text-accent' : irr > 0 ? 'text-primary' : 'text-destructive'}`}>
                    {(irr * 100).toFixed(1)}%
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-primary/10 font-bold">
              <TableCell>Portfolio Total</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(totalInitialEquityIA)}</TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              <TableCell className="text-right text-muted-foreground">-</TableCell>
              <TableCell className="text-right text-accent">{formatMoney(totalExitValueIA)}</TableCell>
              <TableCell className="text-right font-mono">{formatMoney(consolidatedFlowsIA.slice(1).reduce((a, b) => a + b, 0))}</TableCell>
              <TableCell className="text-right">{equityMultipleIA.toFixed(2)}x</TableCell>
              <TableCell className="text-right text-primary">{(portfolioIRRIA * 100).toFixed(1)}%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
