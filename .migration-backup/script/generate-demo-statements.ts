/**
 * generate-demo-statements.ts
 *
 * Standalone script that runs the financial engine against the repo's
 * seed data (SEED_INITIAL_PROPERTIES + SEED_GLOBAL_ASSUMPTIONS) and
 * produces a single Excel file with 6 sheets:
 *
 *   Company_IncomeStatement
 *   Company_CashFlow
 *   Company_BalanceSheet
 *   Portfolio_IncomeStatement
 *   Portfolio_CashFlow
 *   Portfolio_BalanceSheet
 *
 * The numbers are demo/seed (not live DB) but the structure is the same
 * as the real in-app exports. Open the file in Excel or paste individual
 * tables into a slide deck.
 *
 * Usage:
 *   npx tsx script/generate-demo-statements.ts
 *
 * Output:
 *   docs/exports/demo-statements.xlsx
 */
import * as XLSX from "xlsx";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { generateCompanyProForma } from "../engine/company/company-engine";
import { generatePropertyProForma } from "../engine/property/property-engine";
import type {
  PropertyInput,
  GlobalInput,
  CompanyMonthlyFinancials,
  MonthlyFinancials,
} from "../engine/types";
import { SEED_INITIAL_PROPERTIES, SEED_PROPERTY_DEFAULTS } from "../server/seeds/property-data";
import { SEED_GLOBAL_ASSUMPTIONS } from "../server/syncHelpers";

const OUT_DIR = "docs/exports";
const OUT_FILE = "demo-statements.xlsx";
const PROJECTION_YEARS = 10;
const MONTHS = PROJECTION_YEARS * 12;

// ──────────────────────────────────────────────────────────────────────────
// Build engine inputs from seed data

function buildPropertyInputs(): PropertyInput[] {
  return SEED_INITIAL_PROPERTIES.map((seed, i) => ({
    ...SEED_PROPERTY_DEFAULTS,
    ...seed,
    id: (i + 1).toString(),
  } as unknown as PropertyInput));
}

function buildGlobalInput(): GlobalInput {
  return {
    ...SEED_GLOBAL_ASSUMPTIONS,
    projectionYears: PROJECTION_YEARS,
  } as unknown as GlobalInput;
}

// ──────────────────────────────────────────────────────────────────────────
// Monthly → yearly aggregation

function monthlyToYearlyCompany(monthly: CompanyMonthlyFinancials[]) {
  const years: Record<number, ReturnType<typeof emptyCompanyYear>> = {};

  for (const m of monthly) {
    const y = Math.floor(m.monthIndex / 12) + 1;
    if (!years[y]) years[y] = emptyCompanyYear(y);
    const yr = years[y];
    yr.baseFeeRevenue += m.baseFeeRevenue;
    yr.incentiveFeeRevenue += m.incentiveFeeRevenue;
    yr.totalRevenue += m.totalRevenue;
    yr.totalVendorCost += m.totalVendorCost;
    yr.partnerCompensation += m.partnerCompensation;
    yr.staffCompensation += m.staffCompensation;
    yr.officeLease += m.officeLease;
    yr.professionalServices += m.professionalServices;
    yr.techInfrastructure += m.techInfrastructure;
    yr.businessInsurance += m.businessInsurance;
    yr.travelCosts += m.travelCosts;
    yr.itLicensing += m.itLicensing;
    yr.marketing += m.marketing;
    yr.miscOps += m.miscOps;
    yr.totalExpenses += m.totalExpenses;
    yr.fundingInterestExpense += m.fundingInterestExpense;
    yr.preTaxIncome += m.preTaxIncome;
    yr.companyIncomeTax += m.companyIncomeTax;
    yr.netIncome += m.netIncome;
    yr.capitalRaiseFunding += m.capitalRaiseFunding;
    yr.cashFlow += m.cashFlow;
    yr.endingCash = m.endingCash; // last-of-year
  }

  return Object.values(years);
}

function emptyCompanyYear(year: number) {
  return {
    year,
    baseFeeRevenue: 0,
    incentiveFeeRevenue: 0,
    totalRevenue: 0,
    totalVendorCost: 0,
    partnerCompensation: 0,
    staffCompensation: 0,
    officeLease: 0,
    professionalServices: 0,
    techInfrastructure: 0,
    businessInsurance: 0,
    travelCosts: 0,
    itLicensing: 0,
    marketing: 0,
    miscOps: 0,
    totalExpenses: 0,
    fundingInterestExpense: 0,
    preTaxIncome: 0,
    companyIncomeTax: 0,
    netIncome: 0,
    capitalRaiseFunding: 0,
    cashFlow: 0,
    endingCash: 0,
  };
}

function monthlyToYearlyProperty(monthly: MonthlyFinancials[]) {
  const years: Record<number, ReturnType<typeof emptyPropYear>> = {};

  for (const m of monthly) {
    const y = Math.floor(m.monthIndex / 12) + 1;
    if (!years[y]) years[y] = emptyPropYear(y);
    const yr = years[y];
    yr.revenueRooms += m.revenueRooms;
    yr.revenueFB += m.revenueFB;
    yr.revenueEvents += m.revenueEvents;
    yr.revenueOther += m.revenueOther;
    yr.revenueTotal += m.revenueTotal;
    yr.expenseRooms += m.expenseRooms;
    yr.expenseFB += m.expenseFB;
    yr.expenseEvents += m.expenseEvents;
    yr.expenseOther += m.expenseOther;
    yr.expenseMarketing += m.expenseMarketing;
    yr.expensePropertyOps += m.expensePropertyOps;
    yr.expenseAdmin += m.expenseAdmin;
    yr.expenseIT += m.expenseIT;
    yr.expenseUtilitiesVar += m.expenseUtilitiesVar;
    yr.expenseUtilitiesFixed += m.expenseUtilitiesFixed;
    yr.expenseTaxes += m.expenseTaxes;
    yr.expenseInsurance += m.expenseInsurance;
    yr.expenseOtherCosts += m.expenseOtherCosts;
    yr.expenseFFE += m.expenseFFE;
    yr.feeBase += m.feeBase;
    yr.feeIncentive += m.feeIncentive;
    yr.gop += m.gop;
    yr.noi += m.noi;
    yr.anoi += m.anoi;
    yr.interestExpense += m.interestExpense;
    yr.principalPayment += m.principalPayment;
    yr.depreciationExpense += m.depreciationExpense;
    yr.incomeTax += m.incomeTax;
    yr.netIncome += m.netIncome;
    yr.cashFlow += m.cashFlow;
    yr.endingCash = m.endingCash;
    yr.debtOutstanding = m.debtOutstanding;
    yr.propertyValue = m.propertyValue;
  }

  return Object.values(years);
}

function emptyPropYear(year: number) {
  return {
    year,
    revenueRooms: 0, revenueFB: 0, revenueEvents: 0, revenueOther: 0, revenueTotal: 0,
    expenseRooms: 0, expenseFB: 0, expenseEvents: 0, expenseOther: 0,
    expenseMarketing: 0, expensePropertyOps: 0, expenseAdmin: 0, expenseIT: 0,
    expenseUtilitiesVar: 0, expenseUtilitiesFixed: 0,
    expenseTaxes: 0, expenseInsurance: 0, expenseOtherCosts: 0, expenseFFE: 0,
    feeBase: 0, feeIncentive: 0,
    gop: 0, noi: 0, anoi: 0,
    interestExpense: 0, principalPayment: 0, depreciationExpense: 0, incomeTax: 0,
    netIncome: 0, cashFlow: 0, endingCash: 0,
    debtOutstanding: 0, propertyValue: 0,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Build the 6 statement tables

type Row = (string | number)[];

function companyIncomeStatement(years: ReturnType<typeof monthlyToYearlyCompany>): Row[] {
  const yearHeaders = years.map(y => `Year ${y.year}`);
  return [
    ["Income Statement — Management Company", ...yearHeaders],
    ["Base Management Fee Revenue", ...years.map(y => y.baseFeeRevenue)],
    ["Incentive Fee Revenue", ...years.map(y => y.incentiveFeeRevenue)],
    ["Total Revenue", ...years.map(y => y.totalRevenue)],
    ["", ...years.map(() => "")],
    ["Vendor / Service Costs", ...years.map(y => y.totalVendorCost)],
    ["Partner Compensation", ...years.map(y => y.partnerCompensation)],
    ["Staff Compensation", ...years.map(y => y.staffCompensation)],
    ["Office Lease", ...years.map(y => y.officeLease)],
    ["Professional Services", ...years.map(y => y.professionalServices)],
    ["Tech Infrastructure", ...years.map(y => y.techInfrastructure)],
    ["Business Insurance", ...years.map(y => y.businessInsurance)],
    ["Travel", ...years.map(y => y.travelCosts)],
    ["IT Licensing", ...years.map(y => y.itLicensing)],
    ["Marketing", ...years.map(y => y.marketing)],
    ["Misc Ops", ...years.map(y => y.miscOps)],
    ["Total Operating Expenses", ...years.map(y => y.totalExpenses)],
    ["", ...years.map(() => "")],
    ["Funding Interest Expense", ...years.map(y => y.fundingInterestExpense)],
    ["Pre-Tax Income", ...years.map(y => y.preTaxIncome)],
    ["Income Tax", ...years.map(y => y.companyIncomeTax)],
    ["Net Income", ...years.map(y => y.netIncome)],
  ];
}

function companyCashFlow(years: ReturnType<typeof monthlyToYearlyCompany>): Row[] {
  const yearHeaders = years.map(y => `Year ${y.year}`);
  return [
    ["Cash Flow Statement — Management Company", ...yearHeaders],
    ["Net Income", ...years.map(y => y.netIncome)],
    ["Add: Funding Interest Expense (non-cash for accrual period)", ...years.map(y => y.fundingInterestExpense)],
    ["Operating Cash Flow (approx)", ...years.map(y => y.netIncome + y.fundingInterestExpense)],
    ["", ...years.map(() => "")],
    ["Capital Raise Inflows", ...years.map(y => y.capitalRaiseFunding)],
    ["", ...years.map(() => "")],
    ["Net Cash Flow (period)", ...years.map(y => y.cashFlow)],
    ["Ending Cash Balance", ...years.map(y => y.endingCash)],
  ];
}

function companyBalanceSheet(
  years: ReturnType<typeof monthlyToYearlyCompany>,
  openingCash: number,
): Row[] {
  const yearHeaders = years.map(y => `Year ${y.year}`);
  let cumulativeNI = 0;
  let cumulativeRaise = 0;
  const retainedEarningsByYear: number[] = [];
  const totalRaiseByYear: number[] = [];
  for (const y of years) {
    cumulativeNI += y.netIncome;
    cumulativeRaise += y.capitalRaiseFunding;
    retainedEarningsByYear.push(cumulativeNI);
    totalRaiseByYear.push(cumulativeRaise);
  }

  return [
    ["Balance Sheet — Management Company", ...yearHeaders],
    ["ASSETS", ...yearHeaders.map(() => "")],
    ["Cash", ...years.map(y => y.endingCash)],
    ["Total Assets", ...years.map(y => y.endingCash)],
    ["", ...years.map(() => "")],
    ["LIABILITIES", ...yearHeaders.map(() => "")],
    ["Capital Raise (SAFE notes / convertible, carrying value)", ...totalRaiseByYear],
    ["Total Liabilities", ...totalRaiseByYear],
    ["", ...years.map(() => "")],
    ["EQUITY", ...yearHeaders.map(() => "")],
    ["Retained Earnings (cumulative Net Income)", ...retainedEarningsByYear],
    ["Opening Equity (founder contribution)", ...years.map(() => openingCash)],
    ["Total Equity", ...years.map((_, i) => retainedEarningsByYear[i] + openingCash)],
    ["", ...years.map(() => "")],
    ["Total Liabilities + Equity", ...years.map((_, i) => totalRaiseByYear[i] + retainedEarningsByYear[i] + openingCash)],
  ];
}

function portfolioIncomeStatement(years: ReturnType<typeof monthlyToYearlyProperty>[]): Row[] {
  // Aggregate across all properties' yearly data
  const yearCount = Math.max(...years.map(p => p.length));
  const yearHeaders = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`);
  const sum = (field: keyof ReturnType<typeof emptyPropYear>) =>
    Array.from({ length: yearCount }, (_, i) =>
      years.reduce((acc, p) => acc + ((p[i]?.[field] as number) ?? 0), 0)
    );

  return [
    ["Income Statement — Portfolio (all properties aggregated)", ...yearHeaders],
    ["Room Revenue", ...sum("revenueRooms")],
    ["F&B Revenue", ...sum("revenueFB")],
    ["Events Revenue", ...sum("revenueEvents")],
    ["Other Revenue", ...sum("revenueOther")],
    ["Total Revenue", ...sum("revenueTotal")],
    ["", ...yearHeaders.map(() => "")],
    ["Rooms COGS", ...sum("expenseRooms")],
    ["F&B COGS", ...sum("expenseFB")],
    ["Events COGS", ...sum("expenseEvents")],
    ["Other COGS", ...sum("expenseOther")],
    ["Marketing", ...sum("expenseMarketing")],
    ["Property Ops", ...sum("expensePropertyOps")],
    ["Admin & General", ...sum("expenseAdmin")],
    ["IT", ...sum("expenseIT")],
    ["Utilities (variable)", ...sum("expenseUtilitiesVar")],
    ["Utilities (fixed)", ...sum("expenseUtilitiesFixed")],
    ["Property Taxes", ...sum("expenseTaxes")],
    ["Insurance", ...sum("expenseInsurance")],
    ["Other Costs", ...sum("expenseOtherCosts")],
    ["FF&E Reserve", ...sum("expenseFFE")],
    ["", ...yearHeaders.map(() => "")],
    ["Base Management Fee", ...sum("feeBase")],
    ["Incentive Management Fee", ...sum("feeIncentive")],
    ["", ...yearHeaders.map(() => "")],
    ["GOP (Gross Operating Profit)", ...sum("gop")],
    ["NOI (Net Operating Income)", ...sum("noi")],
    ["ANOI (After-FF&E NOI)", ...sum("anoi")],
    ["Interest Expense", ...sum("interestExpense")],
    ["Depreciation", ...sum("depreciationExpense")],
    ["Income Tax", ...sum("incomeTax")],
    ["Net Income", ...sum("netIncome")],
  ];
}

function portfolioCashFlow(years: ReturnType<typeof monthlyToYearlyProperty>[]): Row[] {
  const yearCount = Math.max(...years.map(p => p.length));
  const yearHeaders = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`);
  const sum = (field: keyof ReturnType<typeof emptyPropYear>) =>
    Array.from({ length: yearCount }, (_, i) =>
      years.reduce((acc, p) => acc + ((p[i]?.[field] as number) ?? 0), 0)
    );

  return [
    ["Cash Flow Statement — Portfolio", ...yearHeaders],
    ["Net Income", ...sum("netIncome")],
    ["Add: Depreciation (non-cash)", ...sum("depreciationExpense")],
    ["Add: FF&E Reserve (cash retained)", ...sum("expenseFFE")],
    ["Operating Cash Flow (approx)", ...sum("netIncome").map((v, i) =>
      v + sum("depreciationExpense")[i] + sum("expenseFFE")[i])],
    ["", ...yearHeaders.map(() => "")],
    ["Less: Debt Principal Payment", ...sum("principalPayment")],
    ["", ...yearHeaders.map(() => "")],
    ["Net Period Cash Flow", ...sum("cashFlow")],
    ["Ending Cash (last month of year)", ...Array.from({ length: yearCount }, (_, i) =>
      years.reduce((acc, p) => acc + (p[i]?.endingCash ?? 0), 0))],
  ];
}

function portfolioBalanceSheet(years: ReturnType<typeof monthlyToYearlyProperty>[]): Row[] {
  const yearCount = Math.max(...years.map(p => p.length));
  const yearHeaders = Array.from({ length: yearCount }, (_, i) => `Year ${i + 1}`);
  const sum = (field: keyof ReturnType<typeof emptyPropYear>) =>
    Array.from({ length: yearCount }, (_, i) =>
      years.reduce((acc, p) => acc + ((p[i]?.[field] as number) ?? 0), 0)
    );

  const cumNI: number[] = [];
  let acc = 0;
  for (let i = 0; i < yearCount; i++) {
    acc += sum("netIncome")[i];
    cumNI.push(acc);
  }

  return [
    ["Balance Sheet — Portfolio (simplified)", ...yearHeaders],
    ["ASSETS", ...yearHeaders.map(() => "")],
    ["Cash (sum of ending cash across properties)", ...sum("endingCash")],
    ["Property Value (sum, net of depreciation)", ...sum("propertyValue")],
    ["Total Assets", ...yearHeaders.map((_, i) => sum("endingCash")[i] + sum("propertyValue")[i])],
    ["", ...yearHeaders.map(() => "")],
    ["LIABILITIES", ...yearHeaders.map(() => "")],
    ["Debt Outstanding (sum across properties)", ...sum("debtOutstanding")],
    ["Total Liabilities", ...sum("debtOutstanding")],
    ["", ...yearHeaders.map(() => "")],
    ["EQUITY", ...yearHeaders.map(() => "")],
    ["Retained Earnings (cumulative Net Income)", ...cumNI],
    ["Implied Contributed Equity", ...yearHeaders.map((_, i) =>
      (sum("endingCash")[i] + sum("propertyValue")[i]) - sum("debtOutstanding")[i] - cumNI[i])],
    ["Total Equity", ...yearHeaders.map((_, i) =>
      (sum("endingCash")[i] + sum("propertyValue")[i]) - sum("debtOutstanding")[i])],
  ];
}

// ──────────────────────────────────────────────────────────────────────────
// Main

function main() {
  console.log("Building engine inputs from seed data...");
  const properties = buildPropertyInputs();
  const global = buildGlobalInput();
  console.log(`  ${properties.length} properties, ${PROJECTION_YEARS} projection years, ${MONTHS} months`);

  console.log("\nRunning Property engine for each property...");
  const propertyMonthly = properties.map((p, i) => {
    try {
      return generatePropertyProForma(p, global, MONTHS);
    } catch (err) {
      console.error(`  Property #${i + 1} (${p.name}) failed: ${err}`);
      return [] as MonthlyFinancials[];
    }
  });
  const propertyYearly = propertyMonthly.map(monthlyToYearlyProperty);
  console.log(`  Generated ${propertyMonthly.reduce((a, m) => a + m.length, 0)} monthly records`);

  console.log("\nRunning Company engine...");
  const companyMonthly = generateCompanyProForma(properties, global, MONTHS);
  const companyYearly = monthlyToYearlyCompany(companyMonthly);
  console.log(`  Generated ${companyMonthly.length} company monthly records`);

  console.log("\nBuilding statement tables...");
  const companyIS = companyIncomeStatement(companyYearly);
  const companyCF = companyCashFlow(companyYearly);
  const companyBS = companyBalanceSheet(companyYearly, 0);
  const portfolioIS = portfolioIncomeStatement(propertyYearly);
  const portfolioCF = portfolioCashFlow(propertyYearly);
  const portfolioBS = portfolioBalanceSheet(propertyYearly);

  console.log("\nWriting XLSX...");
  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, rows: Row[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31)); // Excel max sheet name = 31 chars
  };
  addSheet("Company_IncomeStatement", companyIS);
  addSheet("Company_CashFlow", companyCF);
  addSheet("Company_BalanceSheet", companyBS);
  addSheet("Portfolio_IncomeStatement", portfolioIS);
  addSheet("Portfolio_CashFlow", portfolioCF);
  addSheet("Portfolio_BalanceSheet", portfolioBS);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const out = join(OUT_DIR, OUT_FILE);
  XLSX.writeFile(wb, out);

  console.log(`\n✓ Written: ${out}`);
  console.log(`  ${wb.SheetNames.length} sheets:`);
  for (const name of wb.SheetNames) console.log(`    - ${name}`);
  console.log("\nOpen in Excel / Numbers / Google Sheets. Copy tables into slide deck.");
  console.log("Numbers are based on the seed data in server/seeds/property-data.ts");
  console.log("and server/syncHelpers.ts — structure matches the app's live output.");
}

main();
