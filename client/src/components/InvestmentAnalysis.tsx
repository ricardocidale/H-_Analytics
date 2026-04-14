/**
 * InvestmentAnalysis.tsx — IRR and equity return analysis across the portfolio.
 *
 * Computes and displays investment-level returns for each property and
 * the portfolio as a whole:
 *
 *   • Equity Invested   — down payment + closing costs + renovation capex
 *   • Annual Cash Flow  — NOI minus debt service for each projection year
 *   • Exit Proceeds     — estimated sale price at exit cap rate minus
 *                         remaining loan balance and disposition costs
 *   • IRR               — Internal Rate of Return: the discount rate that
 *                         makes the NPV of all cash flows (equity out,
 *                         annual CF in, exit proceeds in) equal to zero.
 *                         A property-level IRR above the threshold
 *                         (typically 15-20%) is highlighted green.
 *   • Equity Multiple   — total distributions / total equity invested
 *
 * Uses the Newton-Raphson IRR solver from @analytics/returns/irr.js.
 * Rows are expandable to show per-property detail within a consolidated view.
 */
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatMoney, getFiscalYearForModelYear } from "@/lib/financialEngine";
import { PROJECTION_YEARS } from "@/lib/constants";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { computeIRR } from "@analytics/returns/irr.js";
import type { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";
import { FCFAnalysisTable } from "./investment/FCFAnalysisTable";
import { PropertyIRRTable } from "./investment/PropertyIRRTable";
import { DCFAnalysis } from "./investment/DCFAnalysis";

function calculateIRR(cashFlows: number[]): number {
  const result = computeIRR(cashFlows, 1);
  return result.irr_periodic ?? 0;
}

interface InvestmentAnalysisProps {
  properties: any[];
  allPropertyFinancials: any[];
  allPropertyYearlyCF: ReturnType<typeof aggregateCashFlowByYear>[];
  getPropertyYearly: (propIndex: number, yearIndex: number) => any;
  getYearlyConsolidated: (yearIndex: number) => any;
  global: any;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
}

export function InvestmentAnalysis({
  properties,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allPropertyFinancials,
  allPropertyYearlyCF,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getPropertyYearly,
  getYearlyConsolidated,
  global,
  expandedRows,
  toggleRow
}: InvestmentAnalysisProps) {
  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;

  const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
  const getFiscalYear = (yearIndex: number) => getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, yearIndex);

  const getPropertyAcquisitionYear = (prop: any): number =>
    acquisitionYearIndex(prop.acquisitionDate, prop.operationsStartDate, global.modelStartDate);

  const getPropertyInvestment = (prop: any): number =>
    propertyEquityInvested(prop);

  const getEquityInvestmentForYear = (yearIndex: number): number =>
    properties.reduce((sum, prop) => sum + (getPropertyAcquisitionYear(prop) === yearIndex ? getPropertyInvestment(prop) : 0), 0);

  const getPropertyExitValue = (propIndex: number): number => {
    const yearly = allPropertyYearlyCF[propIndex];
    return yearly?.[projectionYears - 1]?.exitValue ?? 0;
  };

  const getPropertyCashFlows = (propIndex: number): number[] => {
    const yearly = allPropertyYearlyCF[propIndex];
    if (!yearly) return [];
    return yearly.map(r => r.netCashFlowToInvestors);
  };

  const getConsolidatedYearlyDetails = (yearIndex: number) => {
    let totalNOI = 0, totalDebtService = 0, totalInterest = 0, totalPrincipal = 0;
    let totalDepreciation = 0, totalBTCF = 0, totalTaxableIncome = 0, totalTaxLiability = 0, totalATCF = 0;

    allPropertyYearlyCF.forEach(propYearly => {
      const yr = propYearly[yearIndex];
      if (!yr) return;
      totalNOI += yr.noi;
      totalDebtService += yr.debtService;
      totalInterest += yr.interestExpense;
      totalPrincipal += yr.principalPayment;
      totalDepreciation += yr.depreciation;
      totalBTCF += yr.btcf;
      totalTaxableIncome += yr.taxableIncome;
      totalTaxLiability += yr.taxLiability;
      totalATCF += yr.atcf;
    });

    return {
      noi: totalNOI, debtService: totalDebtService, interestPortion: totalInterest,
      principalPortion: totalPrincipal, depreciation: totalDepreciation, btcf: totalBTCF,
      taxableIncome: totalTaxableIncome, taxLiability: totalTaxLiability, atcf: totalATCF
    };
  };

  const consolidatedFlowsIA = Array.from({ length: projectionYears }, (_, y) =>
    allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.netCashFlowToInvestors ?? 0), 0)
  );
  const portfolioIRRIA = calculateIRR(consolidatedFlowsIA);

  const totalInitialEquityIA = properties.reduce((sum, prop) => sum + getPropertyInvestment(prop), 0);
  const totalExitValueIA = allPropertyYearlyCF.reduce(
    (sum, yearly) => sum + (yearly[projectionYears - 1]?.exitValue ?? 0), 0
  );

  const totalCashReturnedIA = consolidatedFlowsIA.reduce((sum, cf) => sum + cf, 0);
  const midProjectionEquityIA = Array.from({ length: projectionYears }, (_, y) => getEquityInvestmentForYear(y + 1))
    .reduce((sum, eq) => sum + eq, 0);
  const equityMultipleIA = totalInitialEquityIA > 0 ? (totalCashReturnedIA + midProjectionEquityIA) / totalInitialEquityIA : 0;

  const operatingCashFlowsIA = Array.from({ length: projectionYears }, (_, y) =>
    allPropertyYearlyCF.reduce((sum, propYearly) => sum + (propYearly[y]?.atcf ?? 0), 0)
  );
  const avgAnnualCashFlowIA = operatingCashFlowsIA.reduce((sum, cf) => sum + cf, 0) / projectionYears;
  const cashOnCashIA = totalInitialEquityIA > 0 ? (avgAnnualCashFlowIA / totalInitialEquityIA) * 100 : 0;

  return (
    <>
      <div className="relative overflow-hidden rounded-lg p-6 mb-6">
        <div className="absolute inset-0 bg-background" />
        <div className="relative grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
            <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">
              Total Equity
              <InfoTooltip text="Total initial capital required from investors across all properties, including purchase price, improvements, pre-opening costs, and operating reserves (net of any financing)." manualSection="investment-returns" />
            </p>
            <div className="text-2xl font-bold text-foreground font-mono">{formatMoney(totalInitialEquityIA)}</div>
          </div>
          <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
            <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">
              Exit Value ({getFiscalYear(projectionYears - 1)})
              <InfoTooltip text={`Projected sale value of all properties at ${getFiscalYear(projectionYears - 1)}, calculated as NOI ÷ Exit Cap Rate, minus any outstanding debt at time of sale.`} manualSection="investment-returns" />
            </p>
            <div className="text-2xl font-bold text-primary font-mono">{formatMoney(totalExitValueIA)}</div>
          </div>
          <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
            <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">
              Equity Multiple
              <InfoTooltip text="Total cash returned divided by total equity invested. A 2.0x multiple means investors received $2 for every $1 invested." manualSection="investment-returns" manualLabel="MOIC formula in the Manual" />
            </p>
            <div className="text-2xl font-bold text-chart-1 font-mono">{equityMultipleIA.toFixed(2)}x</div>
          </div>
          <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
            <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">
              Avg Cash-on-Cash
              <InfoTooltip text="Average annual operating cash flow (excluding exit proceeds) as a percentage of total equity invested. Measures the annual yield on invested capital." />
            </p>
            <div className="text-2xl font-bold text-accent-pop font-mono">{cashOnCashIA.toFixed(1)}%</div>
          </div>
          <div className="bg-card rounded-lg p-5 border border-border shadow-sm">
            <p className="text-sm font-medium text-foreground/70 flex items-center mb-2">
              Portfolio IRR
              <InfoTooltip text="Internal Rate of Return — the annualized return that makes the net present value of all cash flows equal to zero." manualSection="investment-returns" manualLabel="IRR methodology in the Manual" />
            </p>
            <div className="text-2xl font-bold text-secondary font-mono">{(portfolioIRRIA * 100).toFixed(1)}%</div>
          </div>
        </div>
      </div>

      <FCFAnalysisTable
        properties={properties}
        allPropertyYearlyCF={allPropertyYearlyCF}
        getYearlyConsolidated={getYearlyConsolidated}
        projectionYears={projectionYears}
        getFiscalYear={getFiscalYear}
        getPropertyAcquisitionYear={getPropertyAcquisitionYear}
        getPropertyInvestment={getPropertyInvestment}
        getEquityInvestmentForYear={getEquityInvestmentForYear}
        getConsolidatedYearlyDetails={getConsolidatedYearlyDetails}
        getPropertyExitValue={getPropertyExitValue}
        consolidatedFlowsIA={consolidatedFlowsIA}
        totalExitValueIA={totalExitValueIA}
        expandedRows={expandedRows}
        toggleRow={toggleRow}
      />

      <PropertyIRRTable
        properties={properties}
        getPropertyInvestment={getPropertyInvestment}
        getPropertyExitValue={getPropertyExitValue}
        getPropertyCashFlows={getPropertyCashFlows}
        calculateIRR={calculateIRR}
        totalInitialEquityIA={totalInitialEquityIA}
        totalExitValueIA={totalExitValueIA}
        consolidatedFlowsIA={consolidatedFlowsIA}
        equityMultipleIA={equityMultipleIA}
        portfolioIRRIA={portfolioIRRIA}
        projectionYears={projectionYears}
        getFiscalYear={getFiscalYear}
      />

      <DCFAnalysis
        properties={properties}
        allPropertyYearlyCF={allPropertyYearlyCF}
        projectionYears={projectionYears}
        getFiscalYear={getFiscalYear}
        global={global}
        expandedRows={expandedRows}
        toggleRow={toggleRow}
      />
    </>
  );
}
