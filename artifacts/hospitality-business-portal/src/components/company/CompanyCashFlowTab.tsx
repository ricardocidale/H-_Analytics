/**
 * CompanyCashFlowTab.tsx — Cash flow statement for the management company.
 *
 * Tracks the cash position of the management entity across projection years:
 *
 *   Operating Cash Flow:
 *     Net Income (from the income statement)
 *     + Non-cash adjustments (depreciation, amortization)
 *     = Operating Cash Flow
 *
 *   Financing Activities:
 *     + Capital raise funding inflows (pre-revenue capital, e.g. SAFE notes)
 *     − Partner draws / distributions
 *
 *   Ending Cash = Opening Cash + Operating CF + Financing CF
 *
 * Also computes "months of runway" (ending cash / monthly burn rate) which
 * is critical for a startup management company that may operate at a loss
 * in early years before the portfolio reaches sufficient scale.
 *
 * Summary cards at the top show opening cash, operating cash, funding
 * received, partner draws, and closing cash for the selected year.
 */
import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { ScrollReveal } from "@/components/graphics";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FinancialChart } from "@/components/ui/financial-chart";
import { CashFlowOperatingRows } from "./CashFlowOperatingRows";
import type { CompanyTabProps } from "./types";

export default function CompanyCashFlowTab({
  financials,
  properties,
  global,
  projectionYears,
  expandedRows,
  toggleRow,
  getFiscalYear,
  fundingLabel,
  tableRef,
  activeTab,
  propertyFinancials,
  yearlyChartData,
}: CompanyTabProps) {
  const getPropertyYearlyBaseFee = (propIdx: number, year: number) => {
    const pf = propertyFinancials[propIdx].financials;
    const yearData = pf.slice(year * MONTHS_PER_YEAR, (year + 1) * MONTHS_PER_YEAR);
    return yearData.reduce((a: number, m: any) => a + m.feeBase, 0);
  };

  const FormulaRow = ({ rowKey, label, values }: { rowKey: string; label: string; values: string[] }) => (
    <>
      <TableRow
        className="bg-primary/5 cursor-pointer hover:bg-primary/10"
        data-expandable-row="true"
        onClick={() => toggleRow(rowKey)}
      >
        <TableCell className="sticky left-0 bg-primary/5 pl-8 py-0.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            {expandedRows.has(rowKey) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="italic">Formula</span>
          </div>
        </TableCell>
        {Array.from({ length: projectionYears }, (_, i) => (
          <TableCell key={i} className="py-0.5" />
        ))}
      </TableRow>
      {expandedRows.has(rowKey) && (
        <TableRow className="bg-primary/[0.03]" data-expandable-row="true">
          <TableCell className="sticky left-0 bg-primary/[0.03] pl-12 py-0.5 text-xs text-muted-foreground italic">
            {label}
          </TableCell>
          {values.map((v, i) => (
            <TableCell key={i} className="text-right py-0.5 font-mono text-xs text-muted-foreground">
              {v}
            </TableCell>
          ))}
        </TableRow>
      )}
    </>
  );

  const companyName = global?.companyName || "Hospitality Business Co.";

  const y1 = yearlyChartData?.[0];
  const y1FundingReceived = y1
    ? financials.slice(0, MONTHS_PER_YEAR).reduce((a, m) => a + (m.capitalRaiseFunding ?? 0), 0)
    : 0;
  const y1OperatingCF = y1
    ? financials.slice(0, MONTHS_PER_YEAR).reduce((a, m) => a + m.netIncome + (m.fundingInterestExpense ?? 0), 0)
    : 0;
  const y1MonthlyExpenses = y1 && y1.Expenses > 0 ? y1.Expenses / MONTHS_PER_YEAR : 0;
  const y1Runway = y1 && y1MonthlyExpenses > 0 && y1.EndingCash > 0
    ? Math.round(y1.EndingCash / y1MonthlyExpenses)
    : null;

  return (
    <div className="space-y-6">
    {y1 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="cashflow-kpi-cards">
        {([
          { label: "Year 1 Operating Cash", value: y1OperatingCF, sub: "Net income + non-cash adjustments" },
          { label: "Year 1 Funding Received", value: y1FundingReceived, sub: "Capital raise inflows" },
          { label: "Year 1 Net Cash Change", value: y1.CashFlow, sub: "Annual net cash increase" },
          { label: "Year 1 Ending Cash", value: y1.EndingCash, sub: y1Runway ? `${y1Runway} months runway` : "End of year 1 balance" },
        ] as { label: string; value: number; sub: string }[]).map(card => (
          <div key={card.label} className="bg-card rounded-xl p-4 border shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className={`text-xl font-semibold font-mono ${card.value < 0 ? "text-negative" : "text-foreground"}`} data-testid={`kpi-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>{formatMoney(card.value)}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>
    )}
    {yearlyChartData && yearlyChartData.length > 0 && (
      <FinancialChart
        data={yearlyChartData}
        series={["netIncome", "funding", "cashFlow", "endingCash"]}
        title={`${companyName} Cash Flow Trends (${projectionYears}-Year Projection)`}
        id="company-cashflow-chart"
      />
    )}
    <ScrollReveal>
    <div ref={activeTab === 'cashflow' ? tableRef : undefined} className="bg-card rounded-2xl p-6 shadow-sm border">
      <div>
        <h3 className="text-lg font-display text-foreground mb-4">{companyName} Statement of Cash Flows</h3>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="sticky left-0 bg-muted text-foreground">Category</TableHead>
              {Array.from({ length: projectionYears }, (_, i) => (
                <TableHead key={i} className="text-right min-w-[100px]">{getFiscalYear(i)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="font-semibold bg-muted">
              <TableCell className="sticky left-0 bg-muted">Cash Flow from Operating Activities</TableCell>
              {Array.from({ length: projectionYears }, (_, i) => (
                <TableCell key={i} className="text-right font-mono"></TableCell>
              ))}
            </TableRow>
            <CashFlowOperatingRows
              financials={financials}
              properties={properties}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              fundingLabel={fundingLabel}
              propertyFinancials={propertyFinancials}
              getPropertyYearlyBaseFee={getPropertyYearlyBaseFee}
              FormulaRow={FormulaRow}
            />

            <TableRow className="font-semibold bg-muted">
              <TableCell className="sticky left-0 bg-muted">Cash Flow from Financing Activities</TableCell>
              {Array.from({ length: projectionYears }, (_, i) => (
                <TableCell key={i} className="text-right font-mono"></TableCell>
              ))}
            </TableRow>
            <TableRow
              className="cursor-pointer hover:bg-muted"
              onClick={() => toggleRow('cfSafe')}
            >
              <TableCell className="sticky left-0 bg-card flex items-center gap-2 pl-6">
                {expandedRows.has('cfSafe') ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
                {fundingLabel} Funding Received
              </TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + m.capitalRaiseFunding, 0);
                return <TableCell key={y} className="text-right text-muted-foreground font-mono">{total > 0 ? formatMoney(total) : '-'}</TableCell>;
              })}
            </TableRow>
            {expandedRows.has('cfSafe') && (
              <>
                <TableRow className="bg-muted/50">
                  <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">
                    {fundingLabel} 1
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    const total = yearData.reduce((a, m) => a + m.capitalRaiseFunding1, 0);
                    return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{total > 0 ? formatMoney(total) : '-'}</TableCell>;
                  })}
                </TableRow>
                <TableRow className="bg-muted/50">
                  <TableCell className="sticky left-0 bg-muted/50 pl-12 text-sm text-muted-foreground">
                    {fundingLabel} 2
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    const total = yearData.reduce((a, m) => a + m.capitalRaiseFunding2, 0);
                    return <TableCell key={y} className="text-right text-sm text-muted-foreground font-mono">{total > 0 ? formatMoney(total) : '-'}</TableCell>;
                  })}
                </TableRow>
              </>
            )}
            {financials.some(m => (m.fundingInterestPayment ?? 0) > 0) && (
              <TableRow>
                <TableCell className="sticky left-0 bg-card pl-6 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    Interest Paid on Notes
                    <InfoTooltip text="Cash payments of accrued interest on funding notes per the payment schedule." />
                  </span>
                </TableCell>
                {Array.from({ length: projectionYears }, (_, y) => {
                  const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                  const total = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                  return (
                    <TableCell key={y} className="text-right text-muted-foreground font-mono">
                      {total > 0 ? `(${formatMoney(total)})` : '-'}
                    </TableCell>
                  );
                })}
              </TableRow>
            )}
            <TableRow className="border-t-2 border-border font-semibold">
              <TableCell className="sticky left-0 bg-card">Net Cash from Financing Activities</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const funding = yearData.reduce((a, m) => a + m.capitalRaiseFunding, 0);
                const interestPaid = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                const total = funding - interestPaid;
                return <TableCell key={y} className="text-right font-mono">{total !== 0 ? formatMoney(total) : '-'}</TableCell>;
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-financingCF"
              label={
                financials.some(m => (m.fundingInterestPayment ?? 0) > 0)
                  ? `= ${fundingLabel} Funding Received − Interest Paid on Notes`
                  : `= ${fundingLabel} Funding Received (Capital Raise 1 + Capital Raise 2)`
              }
              values={Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const t1 = yearData.reduce((a, m) => a + m.capitalRaiseFunding1, 0);
                const t2 = yearData.reduce((a, m) => a + m.capitalRaiseFunding2, 0);
                const interestPaid = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                if (interestPaid > 0) {
                  return `${formatMoney(t1 + t2)} − ${formatMoney(interestPaid)}`;
                }
                return t1 + t2 > 0 ? `${formatMoney(t1)} + ${formatMoney(t2)}` : '—';
              })}
            />

            <TableRow className="bg-primary/10 font-bold">
              <TableCell className="sticky left-0 bg-primary/10">Net Increase (Decrease) in Cash</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + m.cashFlow, 0);
                return (
                  <TableCell key={y} className={`text-right font-mono ${total < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(total)}
                  </TableCell>
                );
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-netCash"
              label="= Operating Cash Flow + Financing Cash Flow"
              values={Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
                const interestAddback = yearData.reduce((a, m) => a + (m.fundingInterestExpense ?? 0), 0);
                const opsCF = netIncome + interestAddback;
                const funding = yearData.reduce((a, m) => a + m.capitalRaiseFunding, 0);
                const interestPaid = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                const finCF = funding - interestPaid;
                return `${formatMoney(opsCF)} + ${formatMoney(finCF)}`;
              })}
            />
            <TableRow>
              <TableCell className="sticky left-0 bg-card text-muted-foreground">Opening Cash Balance</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                let cumulative = 0;
                for (let i = 0; i < y; i++) {
                  const yearData = financials.slice(i * MONTHS_PER_YEAR, (i + 1) * MONTHS_PER_YEAR);
                  cumulative += yearData.reduce((a, m) => a + m.cashFlow, 0);
                }
                return <TableCell key={y} className="text-right text-muted-foreground font-mono">{formatMoney(cumulative)}</TableCell>;
              })}
            </TableRow>
            <TableRow className="bg-muted font-semibold">
              <TableCell className="sticky left-0 bg-muted">Closing Cash Balance</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                let cumulative = 0;
                for (let i = 0; i <= y; i++) {
                  const yearData = financials.slice(i * MONTHS_PER_YEAR, (i + 1) * MONTHS_PER_YEAR);
                  cumulative += yearData.reduce((a, m) => a + m.cashFlow, 0);
                }
                return (
                  <TableCell key={y} className={`text-right font-mono ${cumulative < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(cumulative)}
                  </TableCell>
                );
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-closingCash"
              label="= Opening Cash + Net Change in Cash"
              values={Array.from({ length: projectionYears }, (_, y) => {
                let opening = 0;
                for (let i = 0; i < y; i++) {
                  const yd = financials.slice(i * MONTHS_PER_YEAR, (i + 1) * MONTHS_PER_YEAR);
                  opening += yd.reduce((a, m) => a + m.cashFlow, 0);
                }
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const netChange = yearData.reduce((a, m) => a + m.cashFlow, 0);
                return `${formatMoney(opening)} + ${formatMoney(netChange)}`;
              })}
            />
            <TableRow>
              <TableCell className="sticky left-0 bg-card text-muted-foreground">
                <span className="flex items-center gap-1">
                  Months of Runway
                  <InfoTooltip text="Closing Cash ÷ Average Monthly Burn Rate. Indicates how many months the company can operate before running out of cash at the current expense rate." />
                </span>
              </TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                let closingCash = 0;
                for (let i = 0; i <= y; i++) {
                  const yd = financials.slice(i * MONTHS_PER_YEAR, (i + 1) * MONTHS_PER_YEAR);
                  closingCash += yd.reduce((a, m) => a + m.cashFlow, 0);
                }
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const annualExpenses = yearData.reduce((a, m) => a + m.totalExpenses, 0);
                const annualInterestPaid = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                const monthlyBurn = (annualExpenses + annualInterestPaid) / MONTHS_PER_YEAR;
                const months = monthlyBurn > 0 ? closingCash / monthlyBurn : Infinity;
                return (
                  <TableCell key={y} className={`text-right text-muted-foreground font-mono ${months < 6 ? 'text-destructive' : ''}`}>
                    {months === Infinity ? "∞" : `${months.toFixed(1)} mo`}
                  </TableCell>
                );
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-runway"
              label={financials.some(m => (m.fundingInterestPayment ?? 0) > 0)
                ? "= Closing Cash ÷ ((Annual Expenses + Interest Paid) ÷ 12)"
                : "= Closing Cash ÷ (Annual Expenses ÷ 12)"}
              values={Array.from({ length: projectionYears }, (_, y) => {
                let closingCash = 0;
                for (let i = 0; i <= y; i++) {
                  const yd = financials.slice(i * MONTHS_PER_YEAR, (i + 1) * MONTHS_PER_YEAR);
                  closingCash += yd.reduce((a, m) => a + m.cashFlow, 0);
                }
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const annualExpenses = yearData.reduce((a, m) => a + m.totalExpenses, 0);
                const annualInterestPaid = yearData.reduce((a, m) => a + (m.fundingInterestPayment ?? 0), 0);
                const totalBurn = annualExpenses + annualInterestPaid;
                return `${formatMoney(closingCash)} ÷ ${formatMoney(totalBurn / MONTHS_PER_YEAR)}/mo`;
              })}
            />
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
    </ScrollReveal>
    </div>
  );
}
