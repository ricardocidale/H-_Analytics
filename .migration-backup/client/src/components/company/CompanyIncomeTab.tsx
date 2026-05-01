import React from "react";
import { formatMoney } from "@/lib/financialEngine";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollReveal } from "@/components/graphics";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { FinancialChart } from "@/components/ui/financial-chart";
import { FormulaRow } from "./income-helpers";
import IncomeRevenueRows from "./IncomeRevenueRows";
import IncomeExpenseRows from "./IncomeExpenseRows";
import type { CompanyTabProps } from "./types";

export default function CompanyIncomeTab({
  financials,
  properties,
  global,
  projectionYears,
  expandedRows,
  toggleRow,
  getFiscalYear,
  tableRef,
  activeTab,
  propertyFinancials,
  yearlyChartData,
}: CompanyTabProps) {
  const companyName = global?.companyName || "Hospitality Business Co.";

  const y1 = yearlyChartData?.[0];
  const y1NetMargin = y1 && y1.Revenue > 0 ? ((y1.NetIncome / y1.Revenue) * 100).toFixed(1) : null;

  return (
    <div className="space-y-6">
    {y1 && (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="income-kpi-cards">
        {([
          { label: "Year 1 Revenue", value: y1.Revenue, sub: "Total management fees" },
          { label: "Year 1 Expenses", value: y1.Expenses, sub: "Staff, overhead & variable", negative: true },
          { label: "Year 1 Operating Income", value: y1.OperatingIncome, sub: "Revenue minus expenses" },
          { label: "Year 1 Net Income", value: y1.NetIncome, sub: y1NetMargin ? `${y1NetMargin}% net margin` : "After tax" },
        ] as { label: string; value: number; sub: string; negative?: boolean }[]).map(card => (
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
        series={["revenue", "baseFees", "incentiveFees", "operatingIncome", "netIncome"]}
        title={`${companyName} Income Statement Trends (${projectionYears}-Year Projection)`}
        id="company-income-chart"
      />
    )}
    <ScrollReveal>
    <div ref={activeTab === 'income' ? tableRef : undefined} className="bg-card rounded-2xl p-6 shadow-sm border">
      <div>
        <h3 className="text-lg font-display text-foreground mb-4">{companyName} Income Statement</h3>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border">
              <TableHead className="sticky left-0 bg-muted text-foreground">Category</TableHead>
              {Array.from({ length: projectionYears }, (_, i) => (
                <TableHead key={i} className="text-right min-w-[100px] text-foreground">{getFiscalYear(i)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <IncomeRevenueRows
              financials={financials}
              properties={properties}
              global={global}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              propertyFinancials={propertyFinancials}
            />

            <IncomeExpenseRows
              financials={financials}
              properties={properties}
              global={global}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              propertyFinancials={propertyFinancials}
            />

            <TableRow>
              <TableCell className="sticky left-0 bg-card text-xs text-muted-foreground italic pl-6">
                <span className="flex items-center gap-1">
                  OpEx % of Revenue
                  <InfoTooltip text="Total Operating Expenses as a percentage of Total Revenue. Lower is better — indicates operational efficiency." />
                </span>
              </TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const totalExpenses = yearData.reduce((a, m) => a + m.totalExpenses, 0);
                const totalRevenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
                const pct = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0;
                return (
                  <TableCell key={y} className="text-right text-xs text-muted-foreground italic font-mono px-2">
                    {totalRevenue > 0 ? `${pct.toFixed(1)}%` : "—"}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow className="bg-muted font-semibold border-border">
              <TableCell className="sticky left-0 bg-muted text-foreground">
                <span className="flex items-center gap-1">
                  Operating Income (EBITDA)
                  <InfoTooltip text="Earnings Before Depreciation, Interest, and Tax. Revenue minus all operating expenses, before interest on funding instruments and income tax." />
                </span>
              </TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + (m.preTaxIncome + m.fundingInterestExpense), 0);
                return (
                  <TableCell key={y} className={`text-right font-mono ${total < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(total)}
                  </TableCell>
                );
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-ebitda"
              label={financials.some(m => m.totalVendorCost > 0) ? "= Gross Profit − Total Operating Expenses" : "= Total Revenue − Total Operating Expenses"}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              values={Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const hasVendorCosts = yearData.some(m => m.totalVendorCost > 0);
                const grossProfit = yearData.reduce((a, m) => a + m.grossProfit, 0);
                const revenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
                const expenses = yearData.reduce((a, m) => a + m.totalExpenses, 0);
                return hasVendorCosts
                  ? `${formatMoney(grossProfit)} − ${formatMoney(expenses)}`
                  : `${formatMoney(revenue)} − ${formatMoney(expenses)}`;
              })}
            />
            {financials.some(m => m.fundingInterestExpense > 0) && (
              <>
                <TableRow>
                  <TableCell className="sticky left-0 bg-card pl-6 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Interest Expense
                      <InfoTooltip text="Monthly simple interest accrued on outstanding funding principal. Calculated as: Outstanding Principal × Annual Rate ÷ 12. This is a non-cash expense when interest accrues only, or a cash expense when paid out." />
                    </span>
                  </TableCell>
                  {Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    const total = yearData.reduce((a, m) => a + m.fundingInterestExpense, 0);
                    return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
                  })}
                </TableRow>
                <FormulaRow
                  rowKey="formula-interest-expense"
                  label={`= Outstanding Principal × ${((global.fundingInterestRate ?? 0) * 100).toFixed(1)}% ÷ 12 (monthly)`}
                  projectionYears={projectionYears}
                  expandedRows={expandedRows}
                  toggleRow={toggleRow}
                  values={Array.from({ length: projectionYears }, (_, y) => {
                    const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                    const total = yearData.reduce((a, m) => a + m.fundingInterestExpense, 0);
                    return formatMoney(total);
                  })}
                />
              </>
            )}
            <TableRow className={financials.some(m => m.fundingInterestExpense > 0) ? "bg-muted/50 font-medium" : "hidden"}>
              <TableCell className="sticky left-0 bg-muted/50 text-foreground">Pre-Tax Income</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + m.preTaxIncome, 0);
                return (
                  <TableCell key={y} className={`text-right font-mono ${total < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(total)}
                  </TableCell>
                );
              })}
            </TableRow>
            <TableRow>
              <TableCell className="sticky left-0 bg-card pl-6 text-muted-foreground">Tax</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + m.companyIncomeTax, 0);
                return <TableCell key={y} className="text-right text-muted-foreground font-mono">({formatMoney(total)})</TableCell>;
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-tax"
              label={`= ${((global.companyTaxRate ?? 0) * 100).toFixed(0)}% × ${financials.some(m => m.fundingInterestExpense > 0) ? 'Pre-Tax Income' : 'Operating Income'}`}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              values={Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const preTaxIncome = yearData.reduce((a, m) => a + m.preTaxIncome, 0);
                const rate = ((global.companyTaxRate ?? 0) * 100).toFixed(0);
                return `${rate}% × ${formatMoney(preTaxIncome)}`;
              })}
            />
            <TableRow className="bg-primary/10 font-bold">
              <TableCell className="sticky left-0 bg-primary/10">Net Income</TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const total = yearData.reduce((a, m) => a + m.netIncome, 0);
                return (
                  <TableCell key={y} className={`text-right font-mono ${total < 0 ? 'text-destructive' : ''}`}>
                    {formatMoney(total)}
                  </TableCell>
                );
              })}
            </TableRow>
            <FormulaRow
              rowKey="formula-netIncome"
              label={financials.some(m => m.fundingInterestExpense > 0) ? "= Operating Income − Interest Expense − Tax" : "= Operating Income − Tax"}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              values={Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const ebitda = yearData.reduce((a, m) => a + (m.preTaxIncome + m.fundingInterestExpense), 0);
                const interest = yearData.reduce((a, m) => a + m.fundingInterestExpense, 0);
                const tax = yearData.reduce((a, m) => a + m.companyIncomeTax, 0);
                return interest > 0
                  ? `${formatMoney(ebitda)} − ${formatMoney(interest)} − ${formatMoney(tax)}`
                  : `${formatMoney(ebitda)} − ${formatMoney(tax)}`;
              })}
            />
            <TableRow>
              <TableCell className="sticky left-0 bg-card text-muted-foreground">
                <span className="flex items-center gap-1">
                  Net Margin
                  <InfoTooltip text="Net Income as a percentage of Total Revenue. Measures overall profitability after all expenses and taxes." />
                </span>
              </TableCell>
              {Array.from({ length: projectionYears }, (_, y) => {
                const yearData = financials.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
                const netIncome = yearData.reduce((a, m) => a + m.netIncome, 0);
                const totalRevenue = yearData.reduce((a, m) => a + m.totalRevenue, 0);
                const margin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;
                return (
                  <TableCell key={y} className={`text-right text-muted-foreground font-mono ${margin < 0 ? 'text-destructive' : ''}`}>
                    {margin.toFixed(1)}%
                  </TableCell>
                );
              })}
            </TableRow>
          </TableBody>
        </Table>
        </div>
      </div>
    </div>
    </ScrollReveal>
    </div>
  );
}
