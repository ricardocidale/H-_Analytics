import { useState } from "react";
import { formatMoney } from "@/lib/financialEngine";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";
import {
  TableShell,
  SectionHeader,
  SubtotalRow,
  LineItem,
  GrandTotalRow,
  SpacerRow,
  MetricRow,
  MarginRow,
} from "@/components/financial-table";
import {
  calculateLoanParams,
  getAcquisitionYear,
} from "@/lib/financial/loanCalculations";
import { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";
import { aggregatePropertyByYear } from "@/lib/financial/yearlyAggregator";
import { computeCashFlowSections } from "@/lib/financial/cashFlowSections";
import { analyzeMonthlyCashPosition, type CashFlowStatementProps } from "./cash-flow-helpers";
import { CashFlowOperatingRows, CashFlowUSALIRows } from "./CashFlowOperatingRows";

export function YearlyCashFlowStatement({ data, property, global, years = 10, startYear = 2026 }: CashFlowStatementProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const yearlyData = aggregateCashFlowByYear(data, property, global, years);
  const yearlyDetails = aggregatePropertyByYear(data, years);

  const loan = calculateLoanParams(property, global);
  const equityInvested = loan.equityInvested;
  const acquisitionYear = getAcquisitionYear(loan);

  const operatingReserve = property.operatingReserve || 0;
  const cashAnalysis = analyzeMonthlyCashPosition(data, operatingReserve);

  const toggleSection = (section: string) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const colSpan = years + 1;
  const columns = yearlyData.map((y) => `FY ${startYear + y.year}`);

  const totalPropertyCost = property.purchasePrice + (property.buildingImprovements ?? 0) + property.preOpeningCosts;

  const sections = computeCashFlowSections(yearlyDetails, yearlyData, loan, acquisitionYear, totalPropertyCost, years);
  const { cashFromOperations, cashFromInvesting, cashFromFinancing, netChangeCash, openingCash, closingCash, fcf: fcfValues, fcfe: fcfeValues } = sections;

  const cocValues = yearlyData.map((y) =>
    equityInvested > 0 ? `${((y.atcf / equityInvested) * 100).toFixed(1)}%` : "-"
  );
  const cocHighlights = yearlyData.map((y) => {
    const cocReturn = equityInvested > 0 ? (y.atcf / equityInvested) * 100 : 0;
    return cocReturn > 0 ? "text-accent" : "text-muted-foreground";
  });

  const dscrValues = yearlyData.map((y) =>
    y.debtService > 0 ? `${(y.anoi / y.debtService).toFixed(2)}x` : "N/A"
  );
  const dscrHighlights = yearlyData.map((y) =>
    y.debtService > 0 && y.anoi / y.debtService < 1.25 ? "text-destructive" : undefined
  );

  const banner = !cashAnalysis.isAdequate ? (
    <div data-testid="banner-equity-warning" className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
      <IconAlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p data-testid="text-equity-warning-title" className="font-semibold text-destructive">Additional Equity Investment Required</p>
        <p className="text-muted-foreground mt-1">
          The current Operating Reserve of <span data-testid="text-current-reserve">{formatMoney(operatingReserve)}</span> is insufficient.
          Monthly cash position drops to <span data-testid="text-min-cash-position">{formatMoney(cashAnalysis.minCashPosition)}</span>
          {cashAnalysis.minCashMonth !== null && <> in month <span data-testid="text-min-cash-month">{cashAnalysis.minCashMonth}</span></>}.
        </p>
        <p className="text-muted-foreground mt-1">
          <span className="font-medium">Suggested:</span> Increase Operating Reserve to at least{' '}
          <span data-testid="text-suggested-reserve" className="font-semibold text-foreground">{formatMoney(cashAnalysis.suggestedReserve)}</span> in{' '}
          <span className="font-medium text-primary">Property Assumptions &rarr; Capital & Acquisition</span>.
        </p>
      </div>
    </div>
  ) : (
    <div data-testid="banner-cash-adequate" className="mt-3 p-3 bg-accent/10 border border-accent/30 rounded-lg flex items-start gap-3">
      <IconCheckCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
      <div className="text-sm">
        <p data-testid="text-cash-adequate-title" className="font-semibold text-accent">Cash Position Adequate</p>
        <p className="text-muted-foreground mt-1">
          The Operating Reserve of <span data-testid="text-current-reserve">{formatMoney(operatingReserve)}</span> covers all costs during ramp-up.
          {cashAnalysis.minCashMonth !== null && (
            <> Minimum cash position: <span data-testid="text-min-cash-position">{formatMoney(cashAnalysis.minCashPosition)}</span> (month <span data-testid="text-min-cash-month">{cashAnalysis.minCashMonth}</span>).</>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <TableShell
      title="Cash Flow Statement"
      subtitle="Statement of Cash Flows — ASC 230 Indirect Method"
      columns={columns}
      stickyLabel="Cash Flow Statement"
      banner={banner}
    >
      <CashFlowOperatingRows
        yearlyDetails={yearlyDetails}
        expanded={expanded}
        toggleSection={toggleSection}
        colSpan={colSpan}
        property={property}
      />

      <CashFlowUSALIRows
        yearlyDetails={yearlyDetails}
        expanded={expanded}
        toggleSection={toggleSection}
        colSpan={colSpan}
      />

      <SectionHeader
        label="Cash Adjustments"
        colSpan={colSpan}
        tooltip="Adjustments to convert USALI operating income to cash from operations (ASC 230)."
      />

      <LineItem
        label="Less: Interest Paid"
        values={yearlyData.map(y => y.interestExpense)}
        negate
        tooltip="Interest portion of debt service payments. Classified as operating under ASC 230."
      />

      <LineItem
        label="Less: Income Taxes Paid"
        values={yearlyData.map(y => y.taxLiability)}
        negate
        tooltip="Income tax on taxable income (ANOI − Interest − Depreciation). Only applies when taxable income is positive."
      />

      <SubtotalRow
        label="Net Cash from Operating Activities"
        values={cashFromOperations}
        tooltip="Total cash from day-to-day property operations — the most important cash flow metric. Unlike GAAP Net Income, this excludes non-cash items like depreciation. Positive CFO means the property generates cash; negative means it consumes cash."
        formula="CFO = Revenue − OpEx − Interest − Taxes"
      />
      <MarginRow label="% of Total Revenue" values={cashFromOperations} baseValues={yearlyDetails.map(y => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      <SectionHeader
        label="Cash Flow from Investing Activities"
        colSpan={colSpan}
        tooltip="Cash spent on property acquisition, renovation, and capital improvements (ASC 230)."
      />

      <LineItem
        label="Property Acquisition"
        values={yearlyData.map((_, i) => i === acquisitionYear ? totalPropertyCost : 0)}
        negate
        tooltip="Total property cost in acquisition year (purchase price + building improvements + pre-opening costs)."
      />

      <LineItem
        label="FF&E Reserve / Capital Improvements"
        values={yearlyDetails.map(y => y.expenseFFE)}
        negate
        tooltip="Furniture, fixtures & equipment reserve. Reclassified from operating to investing as a capital expenditure."
      />

      <LineItem
        label="Sale Proceeds (Net Exit Value)"
        values={yearlyData.map(y => y.exitValue)}
        tooltip="Property sale price minus property-specific disposition commission and outstanding loan payoff. Classified as investing per ASC 360."
      />

      <SubtotalRow
        label="Net Cash from Investing Activities"
        values={cashFromInvesting}
        tooltip="Net cash from investing activities = -(Acquisition + FF&E) + Sale Proceeds (ASC 230)."
      />

      <SpacerRow colSpan={colSpan} />

      <SectionHeader
        label="Cash Flow from Financing Activities"
        colSpan={colSpan}
        tooltip="Cash from equity contributions, debt financing, and capital returns (ASC 230)."
      />

      <LineItem
        label="Equity Contribution"
        values={yearlyData.map((_, i) => i === acquisitionYear ? equityInvested : 0)}
        tooltip="Initial equity invested by owners/investors, including operating reserve."
      />

      <LineItem
        label="Loan Proceeds"
        values={yearlyData.map((_, i) => i === acquisitionYear && loan.loanAmount > 0 ? loan.loanAmount : 0)}
        tooltip="Mortgage proceeds received at acquisition."
      />

      <LineItem
        label="Less: Principal Repayments"
        values={yearlyData.map(y => y.principalPayment)}
        negate
        tooltip="Principal portion of debt service. Reduces outstanding loan balance."
      />

      <LineItem
        label="Refinancing Proceeds"
        values={yearlyData.map(y => y.refinancingProceeds)}
        tooltip="Net cash-out from refinancing, after closing costs and payoff of existing loan."
      />

      <SubtotalRow
        label="Net Cash from Financing Activities"
        values={cashFromFinancing}
        tooltip="Net cash from financing activities = Equity + Loan Proceeds - Principal + Refinancing (ASC 230)."
      />

      <SpacerRow colSpan={colSpan} />

      <GrandTotalRow
        label="Net Increase (Decrease) in Cash"
        values={netChangeCash}
        tooltip="Operating + Investing + Financing = Net change in cash per ASC 230."
      />

      <LineItem label="Opening Cash Balance" values={openingCash} showZero />

      <SubtotalRow
        label="Closing Cash Balance"
        values={closingCash}
        positive
        bgColor="white"
        tooltip="Opening balance + Net change in cash. This should match the Balance Sheet cash position."
      />

      <SpacerRow colSpan={colSpan} />

      <SectionHeader
        label="Free Cash Flow"
        colSpan={colSpan}
        tooltip="Cash from Operations minus capital expenditures. Shows cash available before debt repayment."
      />

      <LineItem label="Net Cash from Operating Activities" values={cashFromOperations} showZero />

      <LineItem
        label="Less: Capital Expenditures (FF&E)"
        values={yearlyDetails.map(y => y.expenseFFE)}
        negate
        tooltip="FF&E reserve deducted from CFO to arrive at Free Cash Flow."
      />

      <SubtotalRow
        label="Free Cash Flow (FCF)"
        values={fcfValues}
        positive
        bgColor="rgba(var(--primary-rgb),0.08)"
        tooltip="Cash available after covering operations and capital maintenance. This is the property's discretionary cash — what's left to pay down debt, distribute to investors, or reinvest."
        formula="FCF = Operating Cash Flow − FF&E Reserve"
      />
      <MarginRow label="% of Total Revenue" values={fcfValues} baseValues={yearlyDetails.map(y => y.revenueTotal)} />

      <LineItem
        label="Less: Principal Payments"
        values={yearlyData.map(y => y.principalPayment)}
        negate
        tooltip="Principal portion of debt service. Reduces cash available to equity investors."
      />

      <SubtotalRow
        label="Free Cash Flow to Equity (FCFE)"
        values={fcfeValues}
        positive
        bgColor="rgba(var(--primary-rgb),0.08)"
        tooltip="The equity investor's bottom line — what's left after the property pays for operations, capital reserves, and debt service. This is the actual cash that can be distributed to investors."
        formula="FCFE = FCF − Principal Payments"
      />
      <MarginRow label="% of Total Revenue" values={fcfeValues} baseValues={yearlyDetails.map(y => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      <SectionHeader label="Key Metrics" colSpan={colSpan} />

      <MetricRow
        label="Cash-on-Cash Return"
        values={cocValues}
        highlights={cocHighlights}
        tooltip="Annual cash yield on your equity investment — similar to a dividend yield. A 10% CoC means you receive $10 in annual cash for every $100 invested. Excludes appreciation and exit value."
        formula="CoC = Annual Cash Flow ÷ Total Equity"
      />

      <MetricRow
        label="Debt Service Coverage Ratio"
        values={dscrValues}
        highlights={dscrHighlights}
        tooltip="How many times the property's operating income covers its debt payments. Lenders typically require 1.25× minimum. Below 1.0× means the property can't cover its debt from operations."
        formula="DSCR = ANOI ÷ Annual Debt Service"
      />
    </TableShell>
  );
}
