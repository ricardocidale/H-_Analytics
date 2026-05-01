/**
 * ConsolidatedBalanceSheet — Refactored with shared row components
 *
 * Uses BalanceSheetSection, BalanceSheetLineItem, ExpandableBalanceSheetLineItem,
 * BalanceSheetFormulaRow, GrandTotalRow, and SpacerRow from financial-table-rows
 * for consistent visual language with accordion detail breakdowns.
 *
 * ASC 720-15: Pre-opening costs are expensed as incurred (not capitalized).
 * They reduce Retained Earnings on Day 0.
 */

import { useState } from "react";
import { Property } from "@shared/schema";
import { MonthlyFinancials, getFiscalYearForModelYear, formatMoney } from "@/lib/financialEngine";
import { GlobalResponse } from "@/lib/api";
import {
  PROJECTION_YEARS,
  MONTHS_PER_YEAR,
} from "@/lib/constants";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import {
  TableShell,
  BalanceSheetSection,
  BalanceSheetLineItem,
  ExpandableBalanceSheetLineItem,
  BalanceSheetFormulaRow,
  GrandTotalRow,
  SpacerRow,
} from "@/components/financial-table";

interface Props {
  properties: Property[];
  global: GlobalResponse;
  allProFormas: { property: Property; data: MonthlyFinancials[] }[];
  year: number;
  propertyIndex?: number;
}

export function ConsolidatedBalanceSheet({ properties, global, allProFormas, year, propertyIndex }: Props) {
  const _projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
  const displayYear = global.modelStartDate
    ? getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, year)
    : 2026 + year;

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  const isExpanded = (key: string) => !!expandedRows[key];

  const propertiesToShow = propertyIndex !== undefined
    ? [{ prop: properties[propertyIndex], idx: propertyIndex }]
    : properties.map((prop, idx) => ({ prop, idx }));

  let totalPropertyValue = 0;
  let totalAccumulatedDepreciation = 0;
  let totalCashReserves = 0;
  let totalDebtOutstanding = 0;
  let totalInitialEquity = 0;
  let totalRetainedEarnings = 0;
  let totalCumulativeCashFlow = 0;
  let totalRefinanceProceeds = 0;
  let totalPreOpeningCosts = 0;
  let totalDeferredFinancingCosts = 0;

  const perPropertyData: {
    name: string;
    propertyValue: number;
    accDep: number;
    cashReserve: number;
    operatingCashFlow: number;
    refiProceeds: number;
    debtOutstanding: number;
    equityInvested: number;
    netIncome: number;
    preOpeningCosts: number;
    deferredFinancingCosts: number;
  }[] = [];

  propertiesToShow.forEach(({ prop, idx }) => {
    const proForma = allProFormas[idx]?.data || [];
    const monthsToInclude = year * MONTHS_PER_YEAR;
    const relevantMonths = proForma.slice(0, monthsToInclude);

    const acqYear = acquisitionYearIndex(prop.acquisitionDate, prop.operationsStartDate, global.modelStartDate);

    if (year < acqYear) {
      return;
    }

    const totalPropValue = prop.purchasePrice + prop.buildingImprovements;
    totalPropertyValue += totalPropValue;

    const accDepForProp = relevantMonths.reduce((sum, m) => sum + m.depreciationExpense, 0);
    totalAccumulatedDepreciation += accDepForProp;

    const operatingReserve = prop.operatingReserve ?? 0;
    totalCashReserves += operatingReserve;

    const preOpening = prop.preOpeningCosts ?? 0;
    totalPreOpeningCosts += preOpening;

    const equityInvested = propertyEquityInvested(prop);
    totalInitialEquity += equityInvested;

    const lastMonthIdx = monthsToInclude - 1;
    const debtOutstanding = lastMonthIdx >= 0 && lastMonthIdx < proForma.length
      ? proForma[lastMonthIdx].debtOutstanding
      : 0;
    totalDebtOutstanding += debtOutstanding;

    let cumulativeInterest = 0;
    let cumulativePrincipal = 0;
    let refiProceedsReceived = 0;
    let deferredFinancingCosts = 0;

    for (let m = 0; m < relevantMonths.length; m++) {
      cumulativeInterest += relevantMonths[m].interestExpense;
      cumulativePrincipal += relevantMonths[m].principalPayment;
      refiProceedsReceived += relevantMonths[m].refinancingProceeds;

      if (relevantMonths[m].refinancingProceeds > 0) {
        const debtBefore = m > 0 ? relevantMonths[m - 1].debtOutstanding : 0;
        const debtAfter = relevantMonths[m].debtOutstanding;
        const principalInRefiMonth = relevantMonths[m].principalPayment;
        const newLoanAmount = debtAfter + principalInRefiMonth;
        const refiClosingCosts = newLoanAmount - debtBefore - relevantMonths[m].refinancingProceeds;
        if (refiClosingCosts > 0) {
          deferredFinancingCosts += refiClosingCosts;
        }
      }
    }
    totalRefinanceProceeds += refiProceedsReceived;
    totalDeferredFinancingCosts += deferredFinancingCosts;

    const netIncome = relevantMonths.reduce((sum, m) => sum + m.netIncome, 0);
    totalRetainedEarnings += netIncome;

    const cumulativeANOI = relevantMonths.reduce((sum, m) => sum + m.anoi, 0);
    const incomeTax = relevantMonths.reduce((sum, m) => sum + m.incomeTax, 0);
    const cumulativeDebtService = cumulativeInterest + cumulativePrincipal;
    const operatingCashFlow = cumulativeANOI - cumulativeDebtService - incomeTax;
    totalCumulativeCashFlow += operatingCashFlow;

    perPropertyData.push({
      name: prop.name,
      propertyValue: totalPropValue,
      accDep: accDepForProp,
      cashReserve: operatingReserve,
      operatingCashFlow,
      refiProceeds: refiProceedsReceived,
      debtOutstanding,
      equityInvested,
      netIncome,
      preOpeningCosts: preOpening,
      deferredFinancingCosts,
    });
  });

  const totalCash = totalCashReserves + totalCumulativeCashFlow + totalRefinanceProceeds;
  const netPropertyValue = totalPropertyValue - totalAccumulatedDepreciation;
  const totalAssets = netPropertyValue + totalCash + totalDeferredFinancingCosts;
  const totalLiabilities = totalDebtOutstanding;
  const adjustedRetainedEarnings = totalRetainedEarnings - totalPreOpeningCosts;
  const totalEquity = totalInitialEquity + adjustedRetainedEarnings;

  const balanceSheetVariance = totalAssets - (totalLiabilities + totalEquity);
  const isUnbalanced = Math.abs(balanceSheetVariance) > 1;

  const title = propertyIndex !== undefined
    ? `Balance Sheet — ${properties[propertyIndex]?.name}`
    : "Consolidated Balance Sheet";

  const showMultipleProperties = perPropertyData.length > 1;

  return (
    <TableShell
      title={title}
      subtitle={`As of December 31, ${displayYear}`}
      columns={["Amount"]}
      stickyLabel="Account"
    >
      {/* ── Assets ── */}
      <BalanceSheetSection label="ASSETS" colSpan={2} />

      <BalanceSheetLineItem label="Current Assets" indent={1} bold />
      <ExpandableBalanceSheetLineItem
        label="Cash & Cash Equivalents"
        amount={totalCash}
        indent={2}
        tooltip="Cash = Operating Reserves + Cumulative Operating Cash Flow + Refinancing Proceeds"
        expanded={isExpanded("cash")}
        onToggle={() => toggle("cash")}
      >
        <BalanceSheetFormulaRow label="Operating Reserves (Day 0)" amount={totalCashReserves} />
        <BalanceSheetFormulaRow label="Cumulative Operating Cash Flow (ANOI − Debt Service − Tax)" amount={totalCumulativeCashFlow} />
        {totalRefinanceProceeds !== 0 && (
          <BalanceSheetFormulaRow label="Refinancing Proceeds" amount={totalRefinanceProceeds} />
        )}
        {showMultipleProperties && perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}: reserve ${formatMoney(p.cashReserve)} + ops CF ${formatMoney(p.operatingCashFlow)}${p.refiProceeds ? ` + refi ${formatMoney(p.refiProceeds)}` : ''}`} amount={p.cashReserve + p.operatingCashFlow + p.refiProceeds} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <BalanceSheetLineItem label="Total Current Assets" amount={totalCash} indent={1} bold isSubtotal />

      <SpacerRow colSpan={2} />

      <BalanceSheetLineItem label="Fixed Assets" indent={1} bold />
      <ExpandableBalanceSheetLineItem
        label="Property, Plant & Equipment"
        amount={totalPropertyValue}
        indent={2}
        tooltip="Purchase Price + Building Improvements for each property"
        expanded={isExpanded("ppe")}
        onToggle={() => toggle("ppe")}
      >
        {perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}`} amount={p.propertyValue} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <ExpandableBalanceSheetLineItem
        label="Less: Accumulated Depreciation"
        amount={-totalAccumulatedDepreciation}
        indent={2}
        tooltip="Cumulative straight-line depreciation (ASC 360) over building basis / 39 years"
        expanded={isExpanded("accDep")}
        onToggle={() => toggle("accDep")}
      >
        {perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}`} amount={-p.accDep} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <BalanceSheetLineItem label="Net Fixed Assets" amount={netPropertyValue} indent={1} bold isSubtotal />

      {totalDeferredFinancingCosts > 0 && (
        <>
          <SpacerRow colSpan={2} />
          <BalanceSheetLineItem label="Other Assets" indent={1} bold />
          <ExpandableBalanceSheetLineItem
            label="Deferred Financing Costs"
            amount={totalDeferredFinancingCosts}
            indent={2}
            tooltip="Refinancing closing costs capitalized as a deferred asset per ASC 835-30. Equals new loan amount minus old balance minus net cash proceeds."
            expanded={isExpanded("deferredFC")}
            onToggle={() => toggle("deferredFC")}
          >
            {perPropertyData.filter(p => p.deferredFinancingCosts > 0).map((p, i) => (
              <BalanceSheetFormulaRow key={i} label={`  ${p.name}`} amount={p.deferredFinancingCosts} />
            ))}
          </ExpandableBalanceSheetLineItem>
        </>
      )}

      <SpacerRow colSpan={2} />

      <BalanceSheetLineItem label="TOTAL ASSETS" amount={totalAssets} isTotal />

      <SpacerRow colSpan={2} height="h-4" />

      {/* ── Liabilities ── */}
      <BalanceSheetSection label="LIABILITIES" colSpan={2} />

      <BalanceSheetLineItem label="Long-Term Liabilities" indent={1} bold />
      <ExpandableBalanceSheetLineItem
        label="Mortgage Notes Payable"
        amount={totalDebtOutstanding}
        indent={2}
        tooltip="Remaining principal balance on acquisition and refinancing loans"
        expanded={isExpanded("debt")}
        onToggle={() => toggle("debt")}
      >
        {perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}`} amount={p.debtOutstanding} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <BalanceSheetLineItem label="TOTAL LIABILITIES" amount={totalLiabilities} isTotal />

      <SpacerRow colSpan={2} height="h-4" />

      {/* ── Equity ── */}
      <BalanceSheetSection label="EQUITY" colSpan={2} />

      <ExpandableBalanceSheetLineItem
        label="Paid-In Capital"
        amount={totalInitialEquity}
        indent={1}
        tooltip="Total equity invested = Total Project Cost − Acquisition Loan. Includes purchase price, improvements, pre-opening costs, and operating reserves."
        expanded={isExpanded("equity")}
        onToggle={() => toggle("equity")}
      >
        {perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}`} amount={p.equityInvested} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <ExpandableBalanceSheetLineItem
        label="Retained Earnings"
        amount={adjustedRetainedEarnings}
        indent={1}
        tooltip="Cumulative GAAP Net Income minus pre-opening costs (ASC 720-15 requires expensing pre-opening costs as incurred)"
        expanded={isExpanded("retained")}
        onToggle={() => toggle("retained")}
      >
        <BalanceSheetFormulaRow label="Cumulative Net Income (from operations)" amount={totalRetainedEarnings} />
        {totalPreOpeningCosts > 0 && (
          <BalanceSheetFormulaRow label="Less: Pre-Opening Costs Expensed (ASC 720-15)" amount={-totalPreOpeningCosts} />
        )}
        {showMultipleProperties && perPropertyData.map((p, i) => (
          <BalanceSheetFormulaRow key={i} label={`  ${p.name}: NI ${formatMoney(p.netIncome)}${p.preOpeningCosts ? ` − pre-open ${formatMoney(p.preOpeningCosts)}` : ''}`} amount={p.netIncome - p.preOpeningCosts} />
        ))}
      </ExpandableBalanceSheetLineItem>
      <BalanceSheetLineItem label="TOTAL EQUITY" amount={totalEquity} isTotal />

      <SpacerRow colSpan={2} />

      {/* ── Grand Total ── */}
      <GrandTotalRow label="TOTAL LIABILITIES & EQUITY" values={[totalLiabilities + totalEquity]} />

      <SpacerRow colSpan={2} />

      {totalAssets > 0 && (
        <>
          <tr>
            <td className="px-4 py-0.5 text-xs text-muted-foreground italic pl-6">Debt-to-Assets Ratio</td>
            <td className="px-4 py-0.5 text-right font-mono text-xs text-muted-foreground italic">
              {(totalLiabilities / totalAssets * 100).toFixed(1)}%
            </td>
          </tr>
          <tr>
            <td className="px-4 py-0.5 text-xs text-muted-foreground italic pl-6">Equity-to-Assets Ratio</td>
            <td className="px-4 py-0.5 text-right font-mono text-xs text-muted-foreground italic">
              {(totalEquity / totalAssets * 100).toFixed(1)}%
            </td>
          </tr>
        </>
      )}

      {isUnbalanced && (
        <tr>
          <td colSpan={2} className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
            <span className="text-destructive text-xs font-medium">
              Balance sheet does not balance — Assets {formatMoney(totalAssets)} ≠ L+E {formatMoney(totalLiabilities + totalEquity)} (variance: {formatMoney(balanceSheetVariance)})
            </span>
          </td>
        </tr>
      )}
    </TableShell>
  );
}
