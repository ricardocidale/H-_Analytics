/**
 * Forward-verify: plug the breakeven ADR returned by the reverse-solve back
 * into the engine and confirm Year-1 ANOI ≈ annualDebtService.
 *
 * This guards the central invariant of the breakeven panel: the numbers we
 * show must match what the engine would actually produce if a user dialed the
 * inputs to the breakeven point.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine.js";
import type { PropertyInput, GlobalInput } from "../../client/src/lib/financial/types.js";
import { computeBreakevenTargets } from "../../calc/analysis/breakeven-targets.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";

function sumFirstYear<T extends Record<string, unknown>>(rows: T[], field: keyof T): number {
  let total = 0;
  const limit = Math.min(MONTHS_PER_YEAR, rows.length);
  for (let i = 0; i < limit; i++) {
    const v = rows[i][field];
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2026-01-01",
    roomCount: 100,
    // Stabilized Year-1 setup: ramp completes at month 0 so seasonality and
    // ramp don't smear the slope estimate.
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyRampMonths: 0,
    occupancyGrowthStep: 0,
    purchasePrice: 12_000_000,
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.065,
    acquisitionTermYears: 30,
    costRateRooms: 0.25,
    costRateFB: 0.30,
    costRateAdmin: 0.08,
    costRateMarketing: 0.05,
    costRatePropertyOps: 0.06,
    costRateUtilities: 0.04,
    costRateTaxes: 0.05,
    costRateIT: 0.02,
    costRateFFE: 0.04,
    costRateOther: 0.02,
    costRateInsurance: 0.02,
    revShareEvents: 0.15,
    revShareFB: 0.20,
    revShareOther: 0.05,
    ...overrides,
  };
}

function makeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2026-01-01",
    inflationRate: 0.03,
    marketingRate: 0.02,
    ...overrides,
  };
}

describe("Breakeven Targets — forward verification against the engine", () => {
  it("plugging breakeven ADR back into the engine produces ANOI ≈ debt service", () => {
    const prop = makeProperty();
    const global = makeGlobal();
    const months = 24;

    // Base run.
    const baseRows = generatePropertyProForma(prop, global, months);
    const baseAnoi = sumFirstYear(baseRows, "anoi");
    const annualDS = sumFirstYear(baseRows, "debtPayment");
    expect(annualDS).toBeGreaterThan(0);

    // Slope via +10 % ADR perturbation.
    const perturbedProp: PropertyInput = { ...prop, startAdr: prop.startAdr * 1.10 };
    const perturbedRows = generatePropertyProForma(perturbedProp, global, months);
    const perturbedAnoi = sumFirstYear(perturbedRows, "anoi");
    const slope = (perturbedAnoi - baseAnoi) / 0.10;

    // Reverse-solve for breakeven ADR.
    const out = computeBreakevenTargets({
      currentAdr: prop.startAdr,
      currentOccupancy: prop.maxOccupancy,
      currentGoingInCap: baseAnoi / prop.purchasePrice,
      currentDebtRate: prop.acquisitionInterestRate as number,
      currentTerminalCap: 0.085,
      baseAnoiAnnual: baseAnoi,
      anoiSlopePerRevenueScale: slope,
      annualDebtService: annualDS,
      loanAmount: prop.purchasePrice * (prop.acquisitionLTV as number),
      termMonths: (prop.acquisitionTermYears as number) * MONTHS_PER_YEAR,
      purchasePrice: prop.purchasePrice,
    });
    const breakevenAdr = out.rows.find((r) => r.key === "adr")!.breakeven;
    expect(breakevenAdr).not.toBeNull();

    // Forward-verify: rerun the engine with startAdr = breakevenAdr.
    // Year-1 ANOI should land within $1 of annualDS (linear-revenue model is
    // exact in the stabilized Year-1 regime where ramp/seasonality are off).
    const verifyProp: PropertyInput = { ...prop, startAdr: breakevenAdr! };
    const verifyRows = generatePropertyProForma(verifyProp, global, months);
    const verifyAnoi = sumFirstYear(verifyRows, "anoi");

    expect(verifyAnoi).toBeCloseTo(annualDS, 0);
  });

  it("breakeven Occupancy plugged back produces ANOI ≈ debt service", () => {
    const prop = makeProperty();
    const global = makeGlobal();
    const months = 24;

    const baseRows = generatePropertyProForma(prop, global, months);
    const baseAnoi = sumFirstYear(baseRows, "anoi");
    const annualDS = sumFirstYear(baseRows, "debtPayment");

    const perturbedProp: PropertyInput = {
      ...prop,
      startAdr: prop.startAdr * 1.10, // revenue scale via ADR — same slope
    };
    const perturbedRows = generatePropertyProForma(perturbedProp, global, months);
    const perturbedAnoi = sumFirstYear(perturbedRows, "anoi");
    const slope = (perturbedAnoi - baseAnoi) / 0.10;

    const out = computeBreakevenTargets({
      currentAdr: prop.startAdr,
      currentOccupancy: prop.maxOccupancy,
      currentGoingInCap: baseAnoi / prop.purchasePrice,
      currentDebtRate: prop.acquisitionInterestRate as number,
      currentTerminalCap: 0.085,
      baseAnoiAnnual: baseAnoi,
      anoiSlopePerRevenueScale: slope,
      annualDebtService: annualDS,
      loanAmount: prop.purchasePrice * (prop.acquisitionLTV as number),
      termMonths: (prop.acquisitionTermYears as number) * MONTHS_PER_YEAR,
      purchasePrice: prop.purchasePrice,
    });
    const breakevenOcc = out.rows.find((r) => r.key === "occupancy")!.breakeven;
    expect(breakevenOcc).not.toBeNull();

    const verifyProp: PropertyInput = {
      ...prop,
      startOccupancy: breakevenOcc!,
      maxOccupancy: breakevenOcc!,
    };
    const verifyRows = generatePropertyProForma(verifyProp, global, months);
    const verifyAnoi = sumFirstYear(verifyRows, "anoi");

    // Tolerance: within 0.5 % of annualDS — occupancy scaling has slightly
    // different fee/cost interactions than ADR scaling.
    expect(Math.abs(verifyAnoi - annualDS) / Math.max(annualDS, 1)).toBeLessThan(0.005);
  });
});
