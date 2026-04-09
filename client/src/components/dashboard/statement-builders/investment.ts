import type { ExportRow, ExportData } from "../statementBuilders";
import type { DashboardFinancials } from "../types";
import type { Property } from "@shared/schema";
import { propertyEquityInvested } from "@/lib/financial/equityCalculations";
import { computeIRR } from "@analytics/returns/irr.js";
import { DEFAULT_EXIT_CAP_RATE, DEFAULT_PROPERTY_TAX_RATE, DEFAULT_INTEREST_RATE } from "@/lib/constants";
import { DEFAULT_COST_OF_EQUITY, DEFAULT_SAFE_DISCOUNT_RATE } from "@shared/constants";

export function generatePortfolioInvestmentData(
  financials: DashboardFinancials,
  properties: Property[],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
  summaryOnly = false,
  costOfEquity?: number,
): ExportData {
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
  const rows: ExportRow[] = [];
  const yc = financials.yearlyConsolidatedCache;
  const cf = financials.allPropertyYearlyCF;
  const totalRooms = properties.reduce((sum, p) => sum + p.roomCount, 0);

  rows.push({ category: "Investment Summary", values: years.map(() => 0), isHeader: true });
  rows.push({ category: "Total Initial Equity", values: years.map(() => financials.totalInitialEquity), indent: 1 });
  rows.push({ category: "Total Exit Value", values: years.map(() => financials.totalExitValue), indent: 1 });
  rows.push({ category: "Portfolio IRR (%)", values: years.map(() => financials.portfolioIRR), indent: 1, format: "percentage" });
  rows.push({ category: "Equity Multiple", values: years.map(() => financials.equityMultiple), indent: 1, format: "multiplier" });
  rows.push({ category: "Cash-on-Cash Return (%)", values: years.map(() => financials.cashOnCash / 100), indent: 1, format: "percentage" });
  rows.push({ category: "Total Properties", values: years.map(() => properties.length), indent: 1 });
  rows.push({ category: "Total Rooms", values: years.map(() => totalRooms), indent: 1 });

  const consolidatedRevenue = years.map((_, i) => yc[i]?.revenueTotal ?? 0);
  const consolidatedGOP = years.map((_, i) => yc[i]?.gop ?? 0);
  const consolidatedNOI = years.map((_, i) => yc[i]?.noi ?? 0);
  const consolidatedANOI = years.map((_, i) => yc[i]?.anoi ?? 0);
  const consolidatedNetIncome = years.map((_, i) => yc[i]?.netIncome ?? 0);
  const totalExpenses = years.map((_, i) => yc[i]?.totalExpenses ?? 0);
  const interestExpense = years.map((_, i) => yc[i]?.interestExpense ?? 0);
  const depreciation = years.map((_, i) => yc[i]?.depreciationExpense ?? 0);
  const incomeTax = years.map((_, i) => yc[i]?.incomeTax ?? 0);
  const feeBase = years.map((_, i) => yc[i]?.feeBase ?? 0);
  const feeIncentive = years.map((_, i) => yc[i]?.feeIncentive ?? 0);
  const ffE = years.map((_, i) => yc[i]?.expenseFFE ?? 0);
  const propertyTaxes = years.map((_, i) => yc[i]?.expenseTaxes ?? 0);

  const consolidatedCFO = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.cashFromOperations ?? 0), 0));
  const consolidatedFCF = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.freeCashFlow ?? 0), 0));
  const consolidatedFCFE = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.freeCashFlowToEquity ?? 0), 0));
  const consolidatedDS = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.debtService ?? 0), 0));
  const consolidatedPrincipal = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.principalPayment ?? 0), 0));
  const cumulativeFCFE = years.map((_, y) => {
    let cum = 0;
    for (let i = 0; i <= y; i++) cum += cf.reduce((sum, prop) => sum + (prop[i]?.freeCashFlowToEquity ?? 0), 0);
    return cum;
  });
  const consolidatedDSCR = years.map((_, y) => {
    const ds = cf.reduce((sum, prop) => sum + (prop[y]?.debtService ?? 0), 0);
    return ds > 0 ? consolidatedANOI[y] / ds : 0;
  });
  const capRate = years.map((_, i) => financials.totalExitValue > 0 ? consolidatedNOI[i] / financials.totalExitValue : 0);
  const opratio = years.map((_, i) => consolidatedRevenue[i] > 0 ? totalExpenses[i] / consolidatedRevenue[i] : 0);
  const wm = financials.weightedMetricsByYear;

  if (!summaryOnly) {
    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Revenue & Profitability", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "Total Revenue", values: consolidatedRevenue, indent: 1 });
    rows.push({ category: "Total Operating Expenses", values: totalExpenses, indent: 1 });
    rows.push({ category: "Gross Operating Profit (GOP)", values: consolidatedGOP, indent: 1 });
    rows.push({ category: "GOP Margin (%)", values: years.map((_, i) => consolidatedRevenue[i] > 0 ? consolidatedGOP[i] / consolidatedRevenue[i] : 0), indent: 1, format: "percentage" });
    rows.push({ category: "Property Taxes", values: propertyTaxes, indent: 1 });
    rows.push({ category: "Net Operating Income (NOI)", values: consolidatedNOI, indent: 1 });
    rows.push({ category: "NOI Margin (%)", values: years.map((_, i) => consolidatedRevenue[i] > 0 ? consolidatedNOI[i] / consolidatedRevenue[i] : 0), indent: 1, format: "percentage" });
    rows.push({ category: "Management Fees (Base)", values: feeBase, indent: 1 });
    rows.push({ category: "Management Fees (Incentive)", values: feeIncentive, indent: 1 });
    rows.push({ category: "FF&E Reserve", values: ffE, indent: 1 });
    rows.push({ category: "Adjusted NOI (ANOI)", values: consolidatedANOI, indent: 1 });

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Cash Flow Analysis", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "Cash from Operations (CFO)", values: consolidatedCFO, indent: 1 });
    rows.push({ category: "Free Cash Flow (FCF)", values: consolidatedFCF, indent: 1 });
    rows.push({ category: "Total Debt Service", values: consolidatedDS, indent: 1 });
    rows.push({ category: "  Principal Payments", values: consolidatedPrincipal, indent: 2 });
    rows.push({ category: "  Interest Expense", values: interestExpense, indent: 2 });
    rows.push({ category: "Free Cash Flow to Equity (FCFE)", values: consolidatedFCFE, indent: 1 });
    rows.push({ category: "Cumulative FCFE", values: cumulativeFCFE, indent: 1 });

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Below-the-Line Items", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "Interest Expense", values: interestExpense, indent: 1 });
    rows.push({ category: "Depreciation & Amortization", values: depreciation, indent: 1 });
    rows.push({ category: "Income Tax Provision", values: incomeTax, indent: 1 });
    rows.push({ category: "GAAP Net Income", values: consolidatedNetIncome, indent: 1 });

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Key Ratios & Returns", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "DSCR", values: consolidatedDSCR, indent: 1, format: "ratio" });
    rows.push({ category: "Cap Rate (%)", values: capRate, indent: 1, format: "percentage" });
    rows.push({ category: "Operating Expense Ratio (%)", values: opratio, indent: 1, format: "percentage" });
    rows.push({ category: "NOI per Room", values: years.map((_, i) => totalRooms > 0 ? consolidatedNOI[i] / totalRooms : 0), indent: 1 });
    rows.push({ category: "Revenue per Room", values: years.map((_, i) => totalRooms > 0 ? consolidatedRevenue[i] / totalRooms : 0), indent: 1 });

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Operating Metrics", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "ADR (Weighted Avg)", values: years.map((_, i) => wm[i]?.weightedADR ?? 0), indent: 1 });
    rows.push({ category: "Occupancy (%)", values: years.map((_, i) => wm[i]?.weightedOcc ?? 0), indent: 1, format: "percentage" });
    rows.push({ category: "RevPAR", values: years.map((_, i) => wm[i]?.revPAR ?? 0), indent: 1 });
    rows.push({ category: "Available Room Nights", values: years.map((_, i) => wm[i]?.totalAvailableRoomNights ?? 0), indent: 1 });
    rows.push({ category: "Sold Room Nights", values: years.map((_, i) => yc[i]?.soldRooms ?? 0), indent: 1 });

    const investorCF = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.netCashFlowToInvestors ?? 0), 0));
    const consolidatedATCF = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.atcf ?? 0), 0));
    const consolidatedBTCF = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.btcf ?? 0), 0));
    const consolidatedRefi = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.refinancingProceeds ?? 0), 0));
    const consolidatedExit = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.exitValue ?? 0), 0));
    const consolidatedTax = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.taxLiability ?? 0), 0));
    const consolidatedTaxableIncome = years.map((_, y) => cf.reduce((sum, prop) => sum + (prop[y]?.taxableIncome ?? 0), 0));

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Free Cash Flow to Investors", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "After-Tax Cash Flow (ATCF)", values: consolidatedATCF, indent: 1 });
    rows.push({ category: "Refinancing Proceeds", values: consolidatedRefi, indent: 1 });
    rows.push({ category: "Exit Proceeds", values: consolidatedExit, indent: 1 });
    rows.push({ category: "Net Cash Flow to Investors", values: investorCF, indent: 1, isBold: true });
    const cumulativeInvestorCF = years.map((_, y) => {
      let cum = 0;
      for (let i = 0; i <= y; i++) cum += investorCF[i];
      return cum;
    });
    rows.push({ category: "Cumulative Cash Flow", values: cumulativeInvestorCF, indent: 1, isBold: true });

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Operating Cash Flow Waterfall", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "Adjusted NOI (ANOI)", values: consolidatedANOI, indent: 1 });
    rows.push({ category: "Less: Debt Service", values: consolidatedDS.map(v => -v), indent: 1 });
    rows.push({ category: "Before-Tax Cash Flow (BTCF)", values: consolidatedBTCF, indent: 1, isBold: true });
    rows.push({ category: "Taxable Income", values: consolidatedTaxableIncome, indent: 2 });
    rows.push({ category: "Less: Income Tax", values: consolidatedTax.map(v => -v), indent: 2 });
    rows.push({ category: "After-Tax Cash Flow (ATCF)", values: consolidatedATCF, indent: 1, isBold: true });

    if (properties.length > 0 && cf.length > 0) {
      rows.push({ category: "", values: years.map(() => 0) });
      rows.push({ category: "Per-Property Returns", values: years.map(() => 0), isHeader: true });
      properties.forEach((prop, pi) => {
        const propCF = cf[pi] || [];
        const equity = propertyEquityInvested(prop);
        const exitVal = propCF[projectionYears - 1]?.exitValue ?? 0;
        const propATCF = years.map((_, y) => propCF[y]?.atcf ?? 0);
        const avgCF = propATCF.reduce((s, v) => s + v, 0) / projectionYears;
        const propCoC = equity > 0 ? (avgCF / equity) * 100 : 0;

        rows.push({ category: prop.name || `Property ${pi + 1}`, values: years.map(() => 0), isHeader: true, indent: 1 });
        rows.push({ category: "Equity Invested", values: years.map(() => equity), indent: 2 });
        rows.push({ category: "Annual ATCF", values: propATCF, indent: 2 });
        rows.push({ category: "Exit Value", values: years.map((_, y) => y === projectionYears - 1 ? exitVal : 0), indent: 2 });
        rows.push({ category: "Cash-on-Cash (%)", values: years.map(() => propCoC / 100), indent: 2, format: "percentage" });
      });

      rows.push({ category: "", values: years.map(() => 0) });
      rows.push({ category: "Property-Level IRR Analysis", values: years.map(() => 0), isHeader: true });
      properties.forEach((prop, pi) => {
        const propCF = cf[pi] || [];
        const equity = propertyEquityInvested(prop);
        const exitVal = propCF[projectionYears - 1]?.exitValue ?? 0;
        const cashFlows = propCF.map(r => r.netCashFlowToInvestors);
        const irr = computeIRR(cashFlows, 1).irr_periodic ?? 0;
        const yearlyATCF = years.map((_, y) => propCF[y]?.atcf ?? 0);
        const exitVal2 = propCF[projectionYears - 1]?.exitValue ?? 0;
        const totalDist = yearlyATCF.reduce((a, b) => a + b, 0) + exitVal2;
        const eqMult = equity > 0 ? totalDist / equity : 0;
        const taxRate = prop.taxRate ?? DEFAULT_PROPERTY_TAX_RATE;
        const exitCapRate = prop.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;

        rows.push({ category: prop.name || `Property ${pi + 1}`, values: years.map(() => 0), isHeader: true, indent: 1 });
        rows.push({ category: "Equity Investment", values: years.map(() => equity), indent: 2 });
        rows.push({ category: "Income Tax Rate (%)", values: years.map(() => taxRate), indent: 2, format: "percentage" });
        rows.push({ category: "Exit Cap Rate (%)", values: years.map(() => exitCapRate), indent: 2, format: "percentage" });
        rows.push({ category: "Exit Value", values: years.map(() => exitVal), indent: 2 });
        rows.push({ category: "Total Distributions", values: years.map(() => totalDist), indent: 2 });
        rows.push({ category: "Equity Multiple", values: years.map(() => eqMult), indent: 2, format: "multiplier" });
        rows.push({ category: "IRR (%)", values: years.map(() => irr), indent: 2, format: "percentage" });
      });
      rows.push({ category: "Portfolio Total", values: years.map(() => 0), isHeader: true, indent: 1 });
      rows.push({ category: "Total Equity", values: years.map(() => financials.totalInitialEquity), indent: 2 });
      rows.push({ category: "Total Exit Value", values: years.map(() => financials.totalExitValue), indent: 2 });
      rows.push({ category: "Portfolio IRR (%)", values: years.map(() => financials.portfolioIRR), indent: 2, format: "percentage" });
      rows.push({ category: "Portfolio Equity Multiple", values: years.map(() => financials.equityMultiple), indent: 2, format: "multiplier" });

      const baseCOE = costOfEquity ?? DEFAULT_COST_OF_EQUITY;
      rows.push({ category: "", values: years.map(() => 0) });
      rows.push({ category: "Discounted Cash Flow (DCF) Analysis", values: years.map(() => 0), isHeader: true });

      let portfolioDCFTotal = 0;
      let portfolioNPVTotal = 0;
      let portfolioEquityTotal = 0;
      let portfolioTotalCapital = 0;
      let portfolioWeightedWACC = 0;

      properties.forEach((prop, pi) => {
        const propCF = cf[pi] || [];
        const crp = (prop as Record<string, unknown>).countryRiskPremium as number ?? 0;
        const re = baseCOE + crp;
        const equity = propertyEquityInvested(prop);
        const isFullEquity = prop.type === "Full Equity";
        const debt = isFullEquity ? 0 : (prop.purchasePrice ?? 0) * (prop.acquisitionLTV ?? 0);
        const debtRate = prop.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE;
        const taxRate = prop.taxRate ?? DEFAULT_PROPERTY_TAX_RATE;
        const totalCapital = equity + debt;
        const ew = totalCapital > 0 ? equity / totalCapital : 1;
        const dw = totalCapital > 0 ? debt / totalCapital : 0;
        const wacc = (ew * re) + (dw * debtRate * (1 - taxRate));
        const discountRate = wacc > 0 ? wacc : DEFAULT_SAFE_DISCOUNT_RATE;

        const yearlyATCF = years.map((_, y) => propCF[y]?.atcf ?? 0);
        const exitValue = propCF[projectionYears - 1]?.exitValue ?? 0;
        const pvFactors = years.map((_, y) => 1 / Math.pow(1 + discountRate, y + 1));
        const pvCF = yearlyATCF.map((v, y) => v * pvFactors[y]);
        const pvTerminal = exitValue * pvFactors[projectionYears - 1];
        const dcfVal = pvCF.reduce((s, v) => s + v, 0) + pvTerminal;
        const npv = dcfVal - equity;
        const valueCr = equity > 0 ? (npv / equity) * 100 : 0;

        portfolioDCFTotal += dcfVal;
        portfolioNPVTotal += npv;
        portfolioEquityTotal += equity;
        portfolioTotalCapital += totalCapital;
        portfolioWeightedWACC += wacc * totalCapital;

        rows.push({ category: prop.name || `Property ${pi + 1}`, values: years.map(() => 0), isHeader: true, indent: 1 });
        rows.push({ category: "Country Risk Premium (%)", values: years.map(() => crp), indent: 2, format: "percentage" });
        rows.push({ category: "Cost of Equity (%)", values: years.map(() => re), indent: 2, format: "percentage" });
        rows.push({ category: "Equity Weight (E/V)", values: years.map(() => ew), indent: 2, format: "percentage" });
        rows.push({ category: "WACC (%)", values: years.map(() => wacc), indent: 2, format: "percentage" });
        rows.push({ category: "Equity Invested", values: years.map(() => equity), indent: 2 });
        rows.push({ category: "DCF Value", values: years.map(() => dcfVal), indent: 2 });
        rows.push({ category: "NPV", values: years.map(() => npv), indent: 2 });
        rows.push({ category: "Value Creation (%)", values: years.map(() => valueCr / 100), indent: 2, format: "percentage" });
        rows.push({ category: "Yearly ATCF", values: yearlyATCF, indent: 2 });
        rows.push({ category: "PV of Cash Flows", values: pvCF, indent: 2 });
        rows.push({ category: "PV of Terminal Value", values: years.map((_, y) => y === projectionYears - 1 ? pvTerminal : 0), indent: 2 });
      });

      const portWACC = portfolioTotalCapital > 0 ? portfolioWeightedWACC / portfolioTotalCapital : 0;
      const portValueCreation = portfolioEquityTotal > 0 ? (portfolioNPVTotal / portfolioEquityTotal) * 100 : 0;
      rows.push({ category: "Portfolio DCF Summary", values: years.map(() => 0), isHeader: true, indent: 1 });
      rows.push({ category: "Portfolio WACC (%)", values: years.map(() => portWACC), indent: 2, format: "percentage" });
      rows.push({ category: "DCF Portfolio Value", values: years.map(() => portfolioDCFTotal), indent: 2 });
      rows.push({ category: "Net Present Value (NPV)", values: years.map(() => portfolioNPVTotal), indent: 2 });
      rows.push({ category: "Value Creation (%)", values: years.map(() => portValueCreation / 100), indent: 2, format: "percentage" });
    }
  }

  return { years, rows };
}
