import type { PropertyAuditInput } from "../financialAuditor";
import {
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEPRECIATION_YEARS,
  MONTHS_PER_YEAR,
} from "../constants";

export interface TestCase {
  name: string;
  property: Partial<PropertyAuditInput>;
  expectedMonthlyRoomRevenue: number;
  expectedAnnualDepreciation: number;
  expectedMonthlyPayment: number;
  expectedTotalRevenue?: number;
  expectedGOP?: number;
  expectedBaseFee?: number;
  expectedIncentiveFee?: number;
  expectedNOI?: number;
  expectedNetIncome?: number;
  expectedCashFlow?: number;
}

export function computeMonthlyPL(tc: TestCase) {
  const roomRev = tc.expectedMonthlyRoomRevenue;
  const revShareEvents = tc.property.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS;
  const revShareFB = tc.property.revShareFB ?? DEFAULT_REV_SHARE_FB;
  const revShareOther = tc.property.revShareOther ?? DEFAULT_REV_SHARE_OTHER;
  const ancillaryShare = revShareEvents + revShareFB + revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const totalRev = roomRev / roomShareOfTotal;
  const eventsRev = totalRev * revShareEvents;
  const fbRev = totalRev * revShareFB;
  const otherRev = totalRev * revShareOther;

  const totalPropertyValue = (tc.property.purchasePrice ?? 0) + (tc.property.buildingImprovements ?? 0);

  const varExpenses =
    roomRev * (tc.property.costRateRooms ?? DEFAULT_COST_RATE_ROOMS) +
    fbRev * (tc.property.costRateFB ?? DEFAULT_COST_RATE_FB) +
    eventsRev * DEFAULT_EVENT_EXPENSE_RATE +
    otherRev * DEFAULT_OTHER_EXPENSE_RATE +
    totalRev * (tc.property.costRateMarketing ?? DEFAULT_COST_RATE_MARKETING) +
    totalRev * ((tc.property.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) * DEFAULT_UTILITIES_VARIABLE_SPLIT);

  const expenseInsurance = (totalPropertyValue / MONTHS_PER_YEAR) * (tc.property.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE);

  const fixedExpenses =
    totalRev * (tc.property.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN) +
    totalRev * (tc.property.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS) +
    totalRev * (tc.property.costRateIT ?? DEFAULT_COST_RATE_IT) +
    totalRev * ((tc.property.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES) * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT)) +
    expenseInsurance +
    totalRev * (tc.property.costRateOther ?? DEFAULT_COST_RATE_OTHER);

  const totalOpEx = varExpenses + fixedExpenses;
  const gop = totalRev - totalOpEx;
  const baseFee = totalRev * (tc.property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE);
  const incentiveFee = Math.max(0, gop * (tc.property.incentiveManagementFeeRate ?? DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE));
  const agop = gop - baseFee - incentiveFee;
  const expenseTaxes = (totalPropertyValue / MONTHS_PER_YEAR) * (tc.property.costRateTaxes ?? DEFAULT_COST_RATE_TAXES);
  const noi = agop - expenseTaxes;
  const ffeFee = totalRev * (tc.property.costRateFFE ?? DEFAULT_COST_RATE_FFE);
  const anoi = noi - ffeFee;

  const landPct = tc.property.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT;
  const depBasis = (tc.property.purchasePrice ?? 0) * (1 - landPct) + (tc.property.buildingImprovements ?? 0);
  const monthlyDep = depBasis / DEPRECIATION_YEARS / MONTHS_PER_YEAR;

  let interest = 0;
  if (tc.property.type === "Financed") {
    const ltv = tc.property.acquisitionLTV || DEFAULT_LTV;
    const loan = totalPropertyValue * ltv;
    interest = loan * (DEFAULT_INTEREST_RATE / MONTHS_PER_YEAR);
  }

  const taxableIncome = anoi - interest - monthlyDep;
  const incomeTax = taxableIncome > 0 ? taxableIncome * (tc.property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE) : 0;
  const netIncome = anoi - interest - monthlyDep - incomeTax;
  const cashFlow = anoi - tc.expectedMonthlyPayment - incomeTax;

  return { totalRev, gop, baseFee, incentiveFee, noi, anoi, netIncome, cashFlow };
}

export const KNOWN_VALUE_TEST_CASES: TestCase[] = [
  {
    name: "Simple 10-Room Hotel Test",
    property: {
      roomCount: 10,
      startAdr: 100,
      startOccupancy: 0.70,
      maxOccupancy: 0.70,
      purchasePrice: 1000000,
      buildingImprovements: 200000,
      type: "Financed",
      acquisitionLTV: 0.75,
    },
    expectedMonthlyRoomRevenue: 21350,
    expectedAnnualDepreciation: 34545.45,
    expectedMonthlyPayment: 7552.77,
  },
  {
    name: "All-Cash Acquisition Test",
    property: {
      roomCount: 20,
      startAdr: 150,
      startOccupancy: 0.65,
      maxOccupancy: 0.80,
      purchasePrice: 2000000,
      buildingImprovements: 500000,
      type: "All Cash",
    },
    expectedMonthlyRoomRevenue: 59475,
    expectedAnnualDepreciation: 72727.27,
    expectedMonthlyPayment: 0,
  },
  {
    name: "Full P&L Chain Test",
    property: {
      roomCount: 15,
      startAdr: 200,
      startOccupancy: 0.60,
      maxOccupancy: 0.85,
      purchasePrice: 1500000,
      buildingImprovements: 0,
      type: "All Cash",
    },
    expectedMonthlyRoomRevenue: 54900,
    expectedAnnualDepreciation: 40909.09,
    expectedMonthlyPayment: 0,
  },
  {
    name: "High-LTV Financed Test",
    property: {
      roomCount: 25,
      startAdr: 300,
      startOccupancy: 0.50,
      maxOccupancy: 0.90,
      purchasePrice: 5000000,
      buildingImprovements: 1000000,
      type: "Financed",
      acquisitionLTV: 0.80,
    },
    expectedMonthlyRoomRevenue: 114375,
    expectedAnnualDepreciation: 172727.27,
    expectedMonthlyPayment: 40281.43,
  },
  {
    name: "Mid-Size Financed Test",
    property: {
      roomCount: 12,
      startAdr: 175,
      startOccupancy: 0.55,
      maxOccupancy: 0.80,
      purchasePrice: 1800000,
      buildingImprovements: 300000,
      type: "Financed",
      acquisitionLTV: 0.70,
    },
    expectedMonthlyRoomRevenue: 35227.5,
    expectedAnnualDepreciation: 60000,
    expectedMonthlyPayment: 12336.19,
  },
  {
    name: "Boutique Luxury Test",
    property: {
      roomCount: 8,
      startAdr: 500,
      startOccupancy: 0.45,
      maxOccupancy: 0.75,
      purchasePrice: 3000000,
      buildingImprovements: 500000,
      type: "All Cash",
    },
    expectedMonthlyRoomRevenue: 54900,
    expectedAnnualDepreciation: 100000,
    expectedMonthlyPayment: 0,
  },
];
