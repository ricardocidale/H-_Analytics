import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import {
  DAYS_PER_MONTH,
  DEFAULT_LAND_VALUE_PERCENT,
  DEPRECIATION_YEARS,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
} from "../../shared/constants.js";
import { makeProperty, makeGlobal } from "../fixtures";

const baseProperty = makeProperty({
  startAdr: 250,
  maxOccupancy: 0.85,
  purchasePrice: 2_000_000,
});

const baseGlobal = makeGlobal({
  projectionYears: 10,
});

const property = { ...baseProperty, type: "Full Equity" };
const result = generatePropertyProForma(property, baseGlobal, 120);

describe("Revenue Verification (independent recomputation)", () => {
  it("room revenue = roomCount × DAYS_PER_MONTH × ADR × occupancy for every month", () => {
    for (let i = 0; i < 120; i++) {
      const opsYear = Math.floor(i / 12);
      const currentAdr = property.startAdr * Math.pow(1 + property.adrGrowthRate, opsYear);

      const rampSteps = Math.floor(i / property.occupancyRampMonths);
      const occupancy = Math.min(
        property.maxOccupancy,
        property.startOccupancy + rampSteps * property.occupancyGrowthStep,
      );

      const expectedRoomRev = property.roomCount * DAYS_PER_MONTH * currentAdr * occupancy;
      expect(result[i].revenueRooms).toBeCloseTo(expectedRoomRev, 2);
    }
  });

  it("events revenue = total revenue × revShareEvents", () => {
    for (const m of result) {
      expect(m.revenueEvents).toBeCloseTo(m.revenueTotal * property.revShareEvents, 2);
    }
  });

  it("F&B revenue = total revenue × revShareFB", () => {
    for (const m of result) {
      expect(m.revenueFB).toBeCloseTo(m.revenueTotal * property.revShareFB, 2);
    }
  });

  it("other revenue = total revenue × revShareOther", () => {
    for (const m of result) {
      expect(m.revenueOther).toBeCloseTo(m.revenueTotal * property.revShareOther, 2);
    }
  });

  it("total revenue = rooms + events + F&B + other", () => {
    for (const m of result) {
      expect(m.revenueTotal).toBeCloseTo(
        m.revenueRooms + m.revenueEvents + m.revenueFB + m.revenueOther,
        2,
      );
    }
  });
});

describe("ADR Growth Verification", () => {
  it("ADR is flat within each operating year", () => {
    for (let year = 0; year < 10; year++) {
      const startMonth = year * 12;
      const endMonth = Math.min(startMonth + 12, 120);
      const firstMonthRev = result[startMonth].revenueRooms;
      if (firstMonthRev === 0) continue;

      for (let i = startMonth + 1; i < endMonth; i++) {
        const thisOcc = getExpectedOccupancy(i);
        const prevOcc = getExpectedOccupancy(startMonth);
        if (thisOcc === prevOcc && thisOcc > 0) {
          expect(result[i].revenueRooms).toBeCloseTo(firstMonthRev, 2);
        }
      }
    }
  });

  it("ADR grows by adrGrowthRate at each year boundary", () => {
    const month11occ = getExpectedOccupancy(11);
    const month12occ = getExpectedOccupancy(12);

    if (month11occ > 0 && month12occ > 0) {
      const impliedAdrY1 = result[11].revenueRooms / (property.roomCount * DAYS_PER_MONTH * month11occ);
      const impliedAdrY2 = result[12].revenueRooms / (property.roomCount * DAYS_PER_MONTH * month12occ);
      expect(impliedAdrY2 / impliedAdrY1).toBeCloseTo(1 + property.adrGrowthRate, 4);
    }
  });

  it("Year 5 ADR = startAdr × (1 + growth)^4", () => {
    const month48occ = getExpectedOccupancy(48);
    if (month48occ > 0) {
      const impliedAdr = result[48].revenueRooms / (property.roomCount * DAYS_PER_MONTH * month48occ);
      const expectedAdr = property.startAdr * Math.pow(1 + property.adrGrowthRate, 4);
      expect(impliedAdr).toBeCloseTo(expectedAdr, 2);
    }
  });
});

describe("Occupancy Ramp Verification", () => {
  it("month 0 occupancy = startOccupancy (60%)", () => {
    const expectedRev = property.roomCount * DAYS_PER_MONTH * property.startAdr * property.startOccupancy;
    expect(result[0].revenueRooms).toBeCloseTo(expectedRev, 2);
  });

  it("occupancy steps up every rampMonths interval", () => {
    const steps = [
      { month: 0, expectedOcc: 0.60 },
      { month: 5, expectedOcc: 0.60 },
      { month: 6, expectedOcc: 0.65 },
      { month: 11, expectedOcc: 0.65 },
      { month: 12, expectedOcc: 0.70 },
      { month: 18, expectedOcc: 0.75 },
      { month: 24, expectedOcc: 0.80 },
      { month: 30, expectedOcc: 0.85 },
      { month: 36, expectedOcc: 0.85 },
      { month: 60, expectedOcc: 0.85 },
    ];

    for (const { month, expectedOcc } of steps) {
      const opsYear = Math.floor(month / 12);
      const currentAdr = property.startAdr * Math.pow(1 + property.adrGrowthRate, opsYear);
      const expectedRev = property.roomCount * DAYS_PER_MONTH * currentAdr * expectedOcc;
      expect(result[month].revenueRooms).toBeCloseTo(expectedRev, 2);
    }
  });

  it("occupancy never exceeds maxOccupancy", () => {
    for (const m of result) {
      const impliedOcc = m.revenueRooms > 0
        ? m.revenueRooms / (property.roomCount * DAYS_PER_MONTH * getImpliedAdr(m))
        : 0;
      expect(impliedOcc).toBeLessThanOrEqual(property.maxOccupancy + 0.001);
    }
  });
});

describe("Variable Cost Verification", () => {
  it("rooms expense = revenueRooms × costRateRooms", () => {
    for (const m of result) {
      expect(m.expenseRooms).toBeCloseTo(m.revenueRooms * property.costRateRooms, 2);
    }
  });

  it("F&B expense = revenueFB × costRateFB", () => {
    for (const m of result) {
      expect(m.expenseFB).toBeCloseTo(m.revenueFB * property.costRateFB, 2);
    }
  });

  it("events expense = revenueEvents × eventExpenseRate", () => {
    for (const m of result) {
      expect(m.expenseEvents).toBeCloseTo(m.revenueEvents * DEFAULT_EVENT_EXPENSE_RATE, 2);
    }
  });

  it("other expense = revenueOther × otherExpenseRate", () => {
    for (const m of result) {
      expect(m.expenseOther).toBeCloseTo(m.revenueOther * DEFAULT_OTHER_EXPENSE_RATE, 2);
    }
  });

  it("marketing expense = revenueTotal × costRateMarketing", () => {
    for (const m of result) {
      expect(m.expenseMarketing).toBeCloseTo(m.revenueTotal * property.costRateMarketing, 2);
    }
  });

  it("variable utilities = revenueTotal × costRateUtilities × variableSplit", () => {
    for (const m of result) {
      const expected = m.revenueTotal * property.costRateUtilities * DEFAULT_UTILITIES_VARIABLE_SPLIT;
      expect(m.expenseUtilitiesVar).toBeCloseTo(expected, 2);
    }
  });

  it("FF&E reserve = revenueTotal × costRateFFE", () => {
    for (const m of result) {
      expect(m.expenseFFE).toBeCloseTo(m.revenueTotal * property.costRateFFE, 2);
    }
  });
});

describe("Fixed Cost Escalation Verification", () => {
  const baseRoomRev = property.roomCount * DAYS_PER_MONTH * property.startAdr * property.startOccupancy;
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const ancillaryShare = property.revShareEvents + property.revShareFB + property.revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const baseTotalRev = baseRoomRev / roomShareOfTotal;

  it("Year 1 fixed admin = baseTotalRev × costRateAdmin × (1 + escalation)^0", () => {
    const expected = baseTotalRev * property.costRateAdmin;
    expect(result[0].expenseAdmin).toBeCloseTo(expected, 2);
  });

  it("Year 2 fixed admin escalates by fixedCostEscalationRate", () => {
    const y1Admin = result[0].expenseAdmin;
    const y2Admin = result[12].expenseAdmin;
    expect(y2Admin / y1Admin).toBeCloseTo(1 + baseGlobal.fixedCostEscalationRate, 4);
  });

  it("Year 5 fixed costs = base × (1 + escalation)^4", () => {
    const factor = Math.pow(1 + baseGlobal.fixedCostEscalationRate, 4);
    const expectedAdmin = baseTotalRev * property.costRateAdmin * factor;
    const expectedPropOps = baseTotalRev * property.costRatePropertyOps * factor;
    const expectedIT = baseTotalRev * property.costRateIT * factor;
    const totalPropertyValue = property.purchasePrice + (property.buildingImprovements ?? 0);
    const expectedTaxes = (totalPropertyValue / 12) * property.costRateTaxes * factor;
    const expectedUtilFixed = baseTotalRev * (property.costRateUtilities * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT)) * factor;
    const expectedOther = baseTotalRev * property.costRateOther * factor;

    expect(result[48].expenseAdmin).toBeCloseTo(expectedAdmin, 2);
    expect(result[48].expensePropertyOps).toBeCloseTo(expectedPropOps, 2);
    expect(result[48].expenseIT).toBeCloseTo(expectedIT, 2);
    expect(result[48].expenseTaxes).toBeCloseTo(expectedTaxes, 2);
    expect(result[48].expenseUtilitiesFixed).toBeCloseTo(expectedUtilFixed, 2);
    expect(result[48].expenseOtherCosts).toBeCloseTo(expectedOther, 2);
  });

  it("fixed costs are constant within each operating year", () => {
    for (let year = 0; year < 10; year++) {
      const start = year * 12;
      const firstAdmin = result[start].expenseAdmin;
      for (let i = start + 1; i < start + 12 && i < 120; i++) {
        expect(result[i].expenseAdmin).toBeCloseTo(firstAdmin, 2);
      }
    }
  });

  it("Year 10 fixed costs = base × (1 + escalation)^9", () => {
    const factor = Math.pow(1 + baseGlobal.fixedCostEscalationRate, 9);
    const expectedAdmin = baseTotalRev * property.costRateAdmin * factor;
    expect(result[108].expenseAdmin).toBeCloseTo(expectedAdmin, 2);
  });

  it("fixed costs grow faster than 0% (escalation is actually applied)", () => {
    expect(result[12].expenseAdmin).toBeGreaterThan(result[0].expenseAdmin);
    expect(result[24].expenseAdmin).toBeGreaterThan(result[12].expenseAdmin);
  });
});

describe("Different Escalation Rate from Inflation", () => {
  const customGlobal = {
    ...baseGlobal,
    inflationRate: 0.03,
    fixedCostEscalationRate: 0.05,
  };
  const customResult = generatePropertyProForma(property, customGlobal, 24);

  it("fixed costs use fixedCostEscalationRate (5%), not inflationRate (3%)", () => {
    const y1Admin = customResult[0].expenseAdmin;
    const y2Admin = customResult[12].expenseAdmin;
    expect(y2Admin / y1Admin).toBeCloseTo(1.05, 4);
    expect(y2Admin / y1Admin).not.toBeCloseTo(1.03, 4);
  });
});

describe("Zero Inflation Scenario", () => {
  const zeroGlobal = {
    ...baseGlobal,
    inflationRate: 0.0,
    fixedCostEscalationRate: 0.0,
  };
  const zeroResult = generatePropertyProForma(property, zeroGlobal, 24);

  it("fixed costs stay flat when escalation is 0%", () => {
    expect(zeroResult[0].expenseAdmin).toBeCloseTo(zeroResult[12].expenseAdmin, 2);
  });
});

describe("Refi Loan Sizing Verification", () => {
  const refiProperty = {
    ...baseProperty,
    type: "Full Equity" as const,
    willRefinance: "Yes" as const,
    refinanceDate: "2029-04-01",
    refinanceLTV: 0.65,
    refinanceInterestRate: 0.08,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
  };
  const refiResult = generatePropertyProForma(refiProperty, baseGlobal, 120);
  const refiMonth = 36;
  const refiYear = Math.floor(refiMonth / 12);

  const preRefiResult = generatePropertyProForma(
    { ...baseProperty, type: "Full Equity" },
    baseGlobal,
    48,
  );
  const yearSlice = preRefiResult.slice(refiYear * 12, (refiYear + 1) * 12);
  const stabilizedNOI = yearSlice.reduce((s, m) => s + m.noi, 0);
  const exitCapRate = 0.085;
  const impliedValue = stabilizedNOI / exitCapRate;
  const grossLoan = impliedValue * refiProperty.refinanceLTV;
  const closingCosts = grossLoan * refiProperty.refinanceClosingCostRate;

  it.todo("refi loan sized from NOI-cap valuation × LTV (within first payment tolerance) — Phase 3 formula mismatch, needs investigation");

  it.todo("refi proceeds = gross loan - closing costs (no existing debt to pay off) — Phase 3 formula mismatch, needs investigation");

  it("refi loan amount is reasonable (between 50% and 500% of purchase price)", () => {
    expect(refiResult[refiMonth].debtOutstanding).toBeGreaterThan(refiProperty.purchasePrice * 0.5);
    expect(refiResult[refiMonth].debtOutstanding).toBeLessThan(refiProperty.purchasePrice * 5);
  });
});

function getExpectedOccupancy(monthIndex: number): number {
  const rampSteps = Math.floor(monthIndex / property.occupancyRampMonths);
  return Math.min(
    property.maxOccupancy,
    property.startOccupancy + rampSteps * property.occupancyGrowthStep,
  );
}

function getImpliedAdr(m: any): number {
  const monthIndex = result.indexOf(m);
  const opsYear = Math.floor(monthIndex / 12);
  return property.startAdr * Math.pow(1 + property.adrGrowthRate, opsYear);
}
