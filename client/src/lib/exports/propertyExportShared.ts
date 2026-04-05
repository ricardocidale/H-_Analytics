import { type ExportRowMeta, buildBrandPalette, type ThemeColor } from "@/lib/exports/exportStyles";
import { MONTHS_PER_YEAR, DEPRECIATION_YEARS } from "@/lib/constants";
import { calculateLoanParams, type LoanParams, type GlobalLoanParams } from "@/lib/financial/loanCalculations";

export function resolveExportDepreciationYears(ctx: PropertyExportContext): number {
  return (ctx.property as any).depreciationYears ?? (ctx.global as any)?.depreciationYears ?? DEPRECIATION_YEARS;
}

export interface PropertyExportContext {
  property: any;
  global: any;
  yearlyDetails: any[];
  cashFlowData: any[];
  yearlyChartData: { year: string; Revenue: number; GOP: number; AGOP: number; NOI: number; ANOI: number; CashFlow: number }[];
  years: number;
  startYear: number;
  projectionYears: number;
  projectionMonths: number;
  fiscalYearStartMonth: number;
  financials: any[];
  activeTab: string;
  brandingData: { themeColors: Array<{ rank: number; name: string; hexCode: string; description?: string }> | null } | undefined;
  incomeChartRef: React.RefObject<HTMLDivElement | null>;
  cashFlowChartRef: React.RefObject<HTMLDivElement | null>;
  incomeTableRef: React.RefObject<HTMLDivElement | null>;
  cashFlowTableRef: React.RefObject<HTMLDivElement | null>;
}

export function getLoanCalcs(ctx: PropertyExportContext) {
  const loan = calculateLoanParams(ctx.property as LoanParams, ctx.global as GlobalLoanParams);
  const acqYear = Math.floor(loan.acqMonthsFromModelStart / MONTHS_PER_YEAR);
  const totalPropertyCost = (ctx.property as any).purchasePrice + ((ctx.property as any).buildingImprovements ?? 0) + ((ctx.property as any).preOpeningCosts ?? 0);
  return { loan, acqYear, totalPropertyCost };
}

export function getBrand(ctx: PropertyExportContext) {
  return buildBrandPalette(ctx.brandingData?.themeColors as ThemeColor[] | undefined);
}

export function computeCashFlowVectors(ctx: PropertyExportContext, loan: ReturnType<typeof calculateLoanParams>, acqYear: number, totalPropertyCost: number) {
  const { yearlyDetails, cashFlowData, years } = ctx;
  const cfo = yearlyDetails.map((yd, i) =>
    yd.revenueTotal - (yd.totalExpenses - yd.expenseFFE) - cashFlowData[i].interestExpense - cashFlowData[i].taxLiability
  );
  const cfi = cashFlowData.map((cf, i) => {
    const ffe = yearlyDetails[i].expenseFFE;
    const acqCost = i === acqYear ? totalPropertyCost : 0;
    return -acqCost - ffe + cf.exitValue;
  });
  const cff = cashFlowData.map((cf, i) => {
    const eqContrib = i === acqYear ? loan.equityInvested : 0;
    const loanProceeds = i === acqYear && loan.loanAmount > 0 ? loan.loanAmount : 0;
    return eqContrib + loanProceeds - cf.principalPayment + cf.refinancingProceeds;
  });
  const netChange = cfo.map((c, i) => c + cfi[i] + cff[i]);
  let runCash = 0;
  const openCash: number[] = [];
  const closeCash: number[] = [];
  for (let i = 0; i < years; i++) {
    openCash.push(runCash);
    runCash += netChange[i];
    closeCash.push(runCash);
  }
  return { cfo, cfi, cff, netChange, openCash, closeCash };
}

export function buildIncomeRows(ctx: PropertyExportContext, isShort: boolean): ExportRowMeta[] {
  const { yearlyDetails } = ctx;
  const rows: ExportRowMeta[] = [];
  if (!isShort) {
    rows.push({ category: "REVENUE", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Room Revenue", values: yearlyDetails.map(y => y.revenueRooms), indent: 1 });
    rows.push({ category: "Event Revenue", values: yearlyDetails.map(y => y.revenueEvents), indent: 1 });
    rows.push({ category: "F&B Revenue", values: yearlyDetails.map(y => y.revenueFB), indent: 1 });
    rows.push({ category: "Other Revenue", values: yearlyDetails.map(y => y.revenueOther), indent: 1 });
  }
  rows.push({ category: "Total Revenue", values: yearlyDetails.map(y => y.revenueTotal), isBold: true });
  if (!isShort) {
    rows.push({ category: "OPERATING EXPENSES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Room Expense", values: yearlyDetails.map(y => y.expenseRooms), indent: 1 });
    rows.push({ category: "F&B Expense", values: yearlyDetails.map(y => y.expenseFB), indent: 1 });
    rows.push({ category: "Event Expense", values: yearlyDetails.map(y => y.expenseEvents), indent: 1 });
    rows.push({ category: "Marketing", values: yearlyDetails.map(y => y.expenseMarketing), indent: 1 });
    rows.push({ category: "Property Ops", values: yearlyDetails.map(y => y.expensePropertyOps), indent: 1 });
    rows.push({ category: "Admin & General", values: yearlyDetails.map(y => y.expenseAdmin), indent: 1 });
    rows.push({ category: "IT", values: yearlyDetails.map(y => y.expenseIT), indent: 1 });
    rows.push({ category: "Utilities", values: yearlyDetails.map(y => y.expenseUtilitiesVar + y.expenseUtilitiesFixed), indent: 1 });
    rows.push({ category: "Other Expenses", values: yearlyDetails.map(y => y.expenseOther + y.expenseOtherCosts), indent: 1 });
  }
  rows.push({ category: "Total Operating Expenses", values: yearlyDetails.map(y => y.totalExpenses - y.expenseFFE - y.expenseTaxes), isBold: true });
  rows.push({ category: "Gross Operating Profit (GOP)", values: yearlyDetails.map(y => y.gop), isBold: true });
  if (!isShort) {
    rows.push({ category: "MANAGEMENT FEES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Base Fee", values: yearlyDetails.map(y => y.feeBase), indent: 1 });
    rows.push({ category: "Incentive Fee", values: yearlyDetails.map(y => y.feeIncentive), indent: 1 });
  }
  rows.push({ category: "Total Management Fees", values: yearlyDetails.map(y => y.feeBase + y.feeIncentive), isBold: true });
  rows.push({ category: "Adjusted GOP (AGOP)", values: yearlyDetails.map(y => y.agop), isBold: true });
  if (!isShort) {
    rows.push({ category: "FIXED CHARGES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Property Taxes", values: yearlyDetails.map(y => y.expenseTaxes), indent: 1 });
  }
  rows.push({ category: "Total Fixed Charges", values: yearlyDetails.map(y => y.expenseTaxes), isBold: true });
  rows.push({ category: "Net Operating Income (NOI)", values: yearlyDetails.map(y => y.noi), isBold: true });
  if (!isShort) {
    rows.push({ category: "FF&E Reserve", values: yearlyDetails.map(y => y.expenseFFE), indent: 1 });
  }
  rows.push({ category: "Adjusted NOI (ANOI)", values: yearlyDetails.map(y => y.anoi), isBold: true });
  return rows;
}

export function buildCashFlowRows(ctx: PropertyExportContext, cfo: number[], cfi: number[], cff: number[], netChange: number[], openCash: number[], closeCash: number[], acqYear: number, totalPropertyCost: number, loan: ReturnType<typeof calculateLoanParams>, isShort: boolean): ExportRowMeta[] {
  const { yearlyDetails, cashFlowData } = ctx;
  const rows: ExportRowMeta[] = [];
  if (!isShort) {
    rows.push({ category: "CASH FLOW FROM OPERATING ACTIVITIES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Cash Received from Guests & Clients", values: yearlyDetails.map(y => y.revenueTotal), isBold: true });
    rows.push({ category: "Guest Room Revenue", values: yearlyDetails.map(y => y.revenueRooms), indent: 1 });
    rows.push({ category: "Event & Venue Revenue", values: yearlyDetails.map(y => y.revenueEvents), indent: 1 });
    rows.push({ category: "Food & Beverage Revenue", values: yearlyDetails.map(y => y.revenueFB), indent: 1 });
    rows.push({ category: "Other Revenue (Spa/Experiences)", values: yearlyDetails.map(y => y.revenueOther), indent: 1 });
    rows.push({ category: "Cash Paid for Operating Expenses", values: yearlyDetails.map(y => -(y.totalExpenses - y.expenseFFE)) });
    rows.push({ category: "Less: Interest Paid", values: cashFlowData.map(y => -y.interestExpense) });
    rows.push({ category: "Less: Income Taxes Paid", values: cashFlowData.map(y => -y.taxLiability) });
  }
  rows.push({ category: "Net Cash from Operating Activities", values: cfo, isBold: true });
  if (!isShort) {
    rows.push({ category: "CASH FLOW FROM INVESTING ACTIVITIES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Property Acquisition", values: cashFlowData.map((_, i) => i === acqYear ? -totalPropertyCost : 0) });
    rows.push({ category: "FF&E Reserve / Capital Improvements", values: yearlyDetails.map(y => -y.expenseFFE) });
    rows.push({ category: "Sale Proceeds (Net Exit Value)", values: cashFlowData.map(y => y.exitValue) });
  }
  rows.push({ category: "Net Cash from Investing Activities", values: cfi, isBold: true });
  if (!isShort) {
    rows.push({ category: "CASH FLOW FROM FINANCING ACTIVITIES", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Equity Contribution", values: cashFlowData.map((_, i) => i === acqYear ? loan.equityInvested : 0) });
    rows.push({ category: "Loan Proceeds", values: cashFlowData.map((_, i) => i === acqYear && loan.loanAmount > 0 ? loan.loanAmount : 0) });
    rows.push({ category: "Less: Principal Repayments", values: cashFlowData.map(y => -y.principalPayment) });
    rows.push({ category: "Refinancing Proceeds", values: cashFlowData.map(y => y.refinancingProceeds) });
  }
  rows.push({ category: "Net Cash from Financing Activities", values: cff, isBold: true });
  rows.push({ category: "Net Increase (Decrease) in Cash", values: netChange, isBold: true });
  rows.push({ category: "Opening Cash Balance", values: openCash });
  rows.push({ category: "Closing Cash Balance", values: closeCash, isBold: true });
  if (!isShort) {
    rows.push({ category: "FREE CASH FLOW", values: yearlyDetails.map(() => 0), isHeader: true });
    rows.push({ category: "Net Cash from Operating Activities", values: cfo });
    rows.push({ category: "Less: Capital Expenditures (FF&E)", values: yearlyDetails.map(y => -y.expenseFFE) });
    rows.push({ category: "Free Cash Flow (FCF)", values: cfo.map((c, i) => c - yearlyDetails[i].expenseFFE), isBold: true });
    rows.push({ category: "Less: Principal Payments", values: cashFlowData.map(y => -y.principalPayment) });
    rows.push({ category: "Free Cash Flow to Equity (FCFE)", values: cfo.map((c, i) => c - yearlyDetails[i].expenseFFE - cashFlowData[i].principalPayment), isBold: true });
  }
  return rows;
}
