import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { DEFAULT_PROPERTY_INCOME_TAX_RATE } from "@/lib/constants";
import { DEFAULT_COST_OF_EQUITY } from "@shared/constants";
import { propertyEquityInvested } from "@/lib/financial/equityCalculations";
import type { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";
import { dPow } from "@calc/shared/decimal";

interface DCFAnalysisProps {
  properties: any[];
  allPropertyYearlyCF: ReturnType<typeof aggregateCashFlowByYear>[];
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
  global: any;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
}

interface PropertyDCF {
  name: string;
  location: string;
  country: string;
  crp: number;
  costOfEquity: number;
  equity: number;
  debt: number;
  debtRate: number;
  taxRate: number;
  wacc: number;
  equityWeight: number;
  debtWeight: number;
  afterTaxDebtCost: number;
  yearlyATCF: number[];
  exitValue: number;
  pvCashFlows: number[];
  pvTerminal: number;
  dcfValue: number;
  npv: number;
  valueCreation: number;
}

export function DCFAnalysis({
  properties,
  allPropertyYearlyCF,
  projectionYears,
  getFiscalYear,
  global,
  expandedRows,
  toggleRow,
}: DCFAnalysisProps) {
  const baseCostOfEquity = global?.costOfEquity ?? DEFAULT_COST_OF_EQUITY;

  const propDCFs: PropertyDCF[] = properties.map((prop, pi) => {
    const crp = prop.countryRiskPremium ?? 0;
    const location = prop.location ?? '';
    const costOfEquity = baseCostOfEquity + crp;

    const equity = propertyEquityInvested(prop);
    const isFullEquity = prop.type === 'Full Equity';
    const debt = isFullEquity ? 0 : (prop.purchasePrice ?? 0) * (prop.acquisitionLTV ?? 0);
    const debtRate = prop.acquisitionInterestRate ?? 0.09;
    const taxRate = prop.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE;

    const totalCapital = equity + debt;
    const equityWeight = totalCapital > 0 ? equity / totalCapital : 1;
    const debtWeight = totalCapital > 0 ? debt / totalCapital : 0;
    const afterTaxDebtCost = debtRate * (1 - taxRate);
    const wacc = (equityWeight * costOfEquity) + (debtWeight * afterTaxDebtCost);
    const discountRate = wacc > 0 ? wacc : 0.10;

    const yearly = allPropertyYearlyCF[pi];
    const yearlyATCF = Array.from({ length: projectionYears }, (_, y) => yearly?.[y]?.atcf ?? 0);
    const exitValue = yearly?.[projectionYears - 1]?.exitValue ?? 0;

    const pvFactors = Array.from({ length: projectionYears }, (_, y) => 1 / dPow(1 + discountRate, y + 1));
    const pvCashFlows = yearlyATCF.map((cf, y) => cf * pvFactors[y]);
    const pvTerminal = exitValue * pvFactors[projectionYears - 1];
    const dcfValue = pvCashFlows.reduce((s, pv) => s + pv, 0) + pvTerminal;
    const npv = dcfValue - equity;
    const valueCreation = equity > 0 ? (npv / equity) * 100 : 0;

    let country = 'Unknown';
    const loc = location.toLowerCase();
    if (/colombia|medell[ií]n|bogot[aá]|cartagena|antioquia/i.test(loc)) country = 'Colombia';
    else if (/new york|utah|california|texas|florida|catskills|sullivan|ogden/i.test(loc)) country = 'United States';

    return { name: prop.name, location, country, crp, costOfEquity, equity, debt, debtRate, taxRate, wacc: discountRate, equityWeight, debtWeight, afterTaxDebtCost, yearlyATCF, exitValue, pvCashFlows, pvTerminal, dcfValue, npv, valueCreation };
  });

  const portfolioEquity = propDCFs.reduce((s, p) => s + p.equity, 0);
  const portfolioDCF = propDCFs.reduce((s, p) => s + p.dcfValue, 0);
  const portfolioNPV = propDCFs.reduce((s, p) => s + p.npv, 0);
  const portfolioValueCreation = portfolioEquity > 0 ? (portfolioNPV / portfolioEquity) * 100 : 0;
  const portfolioTotalCapital = propDCFs.reduce((s, p) => s + p.equity + p.debt, 0);
  const portfolioWACC = portfolioTotalCapital > 0 ? propDCFs.reduce((s, p) => s + p.wacc * ((p.equity + p.debt) / portfolioTotalCapital), 0) : 0;

  return (
    <Card data-testid="dcf-analysis-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Discounted Cash Flow (DCF) Analysis — Per Property
          <InfoTooltip text="Per-property DCF valuation using individual WACC for each property. Each property's cost of equity = base Re + country risk premium (Damodaran). WACC = (E/V × Re) + (D/V × Rd × (1−T))." manualSection="investment-returns" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">Individual property valuations with country-adjusted discount rates (source: Damodaran Jan 2026)</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
              <p className="text-sm font-medium text-foreground/70 flex items-center mb-2" data-testid="text-portfolio-wacc-label">
                Portfolio WACC
                <InfoTooltip text={`Capital-weighted average WACC across all properties. Base Re: ${(baseCostOfEquity * 100).toFixed(0)}% + per-property country risk premium (Damodaran).`} manualSection="investment-returns" />
              </p>
              <div className="text-2xl font-bold text-foreground font-mono" data-testid="text-portfolio-wacc">{(portfolioWACC * 100).toFixed(1)}%</div>
              <p className="text-[10px] text-muted-foreground mt-1">Base Re: {(baseCostOfEquity * 100).toFixed(0)}% + country risk</p>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
              <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">DCF Portfolio Value<InfoTooltip text="Sum of individual property DCF values. Each property discounted at its own WACC." /></p>
              <div className="text-2xl font-bold text-foreground font-mono" data-testid="text-portfolio-dcf">{formatMoney(portfolioDCF)}</div>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
              <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">Net Present Value (NPV)<InfoTooltip text="Sum of individual property NPVs. Positive = portfolio creates value above the required return." /></p>
              <div className={`text-2xl font-bold font-mono ${portfolioNPV >= 0 ? 'text-accent' : 'text-destructive'}`} data-testid="text-portfolio-npv">{formatMoney(portfolioNPV)}</div>
            </div>
            <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
              <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">Value Creation<InfoTooltip text="Portfolio NPV as % of total equity. Positive = investment exceeds required return." /></p>
              <div className={`text-2xl font-bold font-mono ${portfolioValueCreation >= 0 ? 'text-accent' : 'text-destructive'}`} data-testid="text-portfolio-value-creation">
                {portfolioValueCreation >= 0 ? '+' : ''}{portfolioValueCreation.toFixed(1)}%
              </div>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card min-w-[220px]">Property</TableHead>
                <TableHead className="text-right min-w-[90px]">Country</TableHead>
                <TableHead className="text-right min-w-[70px]"><span className="flex items-center justify-end gap-1">CRP<InfoTooltip text="Country Risk Premium (Damodaran). Additional equity return required for country-specific risk." /></span></TableHead>
                <TableHead className="text-right min-w-[70px]"><span className="flex items-center justify-end gap-1">Re<InfoTooltip text="Cost of Equity = Base Re + Country Risk Premium" /></span></TableHead>
                <TableHead className="text-right min-w-[70px]">E/V</TableHead>
                <TableHead className="text-right min-w-[70px]">WACC</TableHead>
                <TableHead className="text-right min-w-[100px]">Equity</TableHead>
                <TableHead className="text-right min-w-[100px]">DCF Value</TableHead>
                <TableHead className="text-right min-w-[100px]">NPV</TableHead>
                <TableHead className="text-right min-w-[80px]">Value Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {propDCFs.map((d, i) => (
                <TableRow key={i} className="cursor-pointer hover:bg-muted/20" onClick={() => toggleRow(`dcf-${i}`)} data-testid={`row-dcf-property-${i}`}>
                  <TableCell className="sticky left-0 bg-card font-medium">
                    <div className="flex items-center gap-2">
                      {expandedRows.has(`dcf-${i}`) ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      <span className="truncate">{d.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm">{d.country}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{d.crp > 0 ? `+${(d.crp * 100).toFixed(1)}%` : '0%'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{(d.costOfEquity * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">{(d.equityWeight * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{(d.wacc * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatMoney(d.equity)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatMoney(d.dcfValue)}</TableCell>
                  <TableCell className={`text-right font-mono text-sm ${d.npv >= 0 ? 'text-accent' : 'text-destructive'}`}>{formatMoney(d.npv)}</TableCell>
                  <TableCell className={`text-right font-mono text-sm font-medium ${d.valueCreation >= 0 ? 'text-accent' : 'text-destructive'}`}>{d.valueCreation >= 0 ? '+' : ''}{d.valueCreation.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
              {propDCFs.map((d, i) => expandedRows.has(`dcf-${i}`) && (
                <TableRow key={`detail-${i}`} className="bg-muted/10">
                  <TableCell colSpan={10} className="p-4">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[160px]">{d.name}</TableHead>
                            {Array.from({ length: projectionYears }, (_, y) => <TableHead key={y} className="text-right min-w-[100px]">{getFiscalYear(y)}</TableHead>)}
                            <TableHead className="text-right min-w-[110px] font-bold">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow>
                            <TableCell>ATCF</TableCell>
                            {d.yearlyATCF.map((cf, y) => <TableCell key={y} className={`text-right font-mono ${cf < 0 ? 'text-destructive' : ''}`}>{formatMoney(cf)}</TableCell>)}
                            <TableCell className="text-right font-mono font-medium">{formatMoney(d.yearlyATCF.reduce((a, b) => a + b, 0))}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>Terminal Value</TableCell>
                            {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right font-mono text-muted-foreground">{y === projectionYears - 1 ? formatMoney(d.exitValue) : '-'}</TableCell>)}
                            <TableCell className="text-right font-mono font-medium">{formatMoney(d.exitValue)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-muted/20">
                            <TableCell className="font-medium">Discount Factor <span className="text-xs text-muted-foreground">@ {(d.wacc * 100).toFixed(1)}%</span></TableCell>
                            {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right font-mono text-muted-foreground">{(1 / dPow(1 + d.wacc, y + 1)).toFixed(4)}</TableCell>)}
                            <TableCell className="text-right text-muted-foreground">-</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>PV of Cash Flows</TableCell>
                            {d.pvCashFlows.map((pv, y) => <TableCell key={y} className={`text-right font-mono ${pv < 0 ? 'text-destructive' : ''}`}>{formatMoney(pv)}</TableCell>)}
                            <TableCell className="text-right font-mono font-medium">{formatMoney(d.pvCashFlows.reduce((a, b) => a + b, 0))}</TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell>PV of Terminal</TableCell>
                            {Array.from({ length: projectionYears }, (_, y) => <TableCell key={y} className="text-right font-mono text-muted-foreground">{y === projectionYears - 1 ? formatMoney(d.pvTerminal) : '-'}</TableCell>)}
                            <TableCell className="text-right font-mono font-medium">{formatMoney(d.pvTerminal)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-primary/10 font-bold">
                            <TableCell>DCF Value</TableCell>
                            {Array.from({ length: projectionYears }, () => <TableCell className="text-right text-muted-foreground">-</TableCell>)}
                            <TableCell className="text-right font-mono">{formatMoney(d.dcfValue)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-primary/10 font-bold">
                <TableCell className="sticky left-0 bg-primary/10">Portfolio Total</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                <TableCell className="text-right text-muted-foreground">-</TableCell>
                <TableCell className="text-right font-mono">{(portfolioWACC * 100).toFixed(1)}%</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(portfolioEquity)}</TableCell>
                <TableCell className="text-right font-mono">{formatMoney(portfolioDCF)}</TableCell>
                <TableCell className={`text-right font-mono ${portfolioNPV >= 0 ? 'text-accent' : 'text-destructive'}`}>{formatMoney(portfolioNPV)}</TableCell>
                <TableCell className={`text-right font-mono ${portfolioValueCreation >= 0 ? 'text-accent' : 'text-destructive'}`}>{portfolioValueCreation >= 0 ? '+' : ''}{portfolioValueCreation.toFixed(1)}%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
