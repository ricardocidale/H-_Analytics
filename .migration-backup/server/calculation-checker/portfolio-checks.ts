import { MONTHS_PER_YEAR } from "@shared/constants";
import type { CheckResult, CheckerProperty, EngineMonthlyResult } from "./types";
import { check } from "./gaap-checks";
import { sumServerPortfolioTotals } from "./helpers";
import { checkFeeZeroSum } from "../../calc/validation/data-integrity";

export function runCompanyChecks(
  properties: CheckerProperty[],
  allEngineCalcs: EngineMonthlyResult[][],
  _projectionMonths: number,
): CheckResult[] {
  const companyChecks: CheckResult[] = [];
  if (properties.length === 0) return companyChecks;

  let totalPropertyFeesPaid = 0;
  for (const calc of allEngineCalcs) {
    for (const m of calc ?? []) {
      totalPropertyFeesPaid += m.feeBase + m.feeIncentive;
    }
  }

  const { feeBase: serverTotalFeeBase, feeIncentive: serverTotalFeeIncentive } =
    sumServerPortfolioTotals(allEngineCalcs);
  const companyFeesReceivable = serverTotalFeeBase + serverTotalFeeIncentive;

  const feeZeroSum = checkFeeZeroSum({
    propertyFeesPaid: totalPropertyFeesPaid,
    companyFeesReceived: companyFeesReceivable,
    rounding_policy: { precision: 2, bankers_rounding: false },
  });
  companyChecks.push(check(
    "Fee Zero-Sum (Intercompany Elimination)",
    "Consolidated",
    "ASC 810",
    `Management fees paid by properties = fees receivable by management company; diff = $${feeZeroSum.difference}`,
    companyFeesReceivable,
    totalPropertyFeesPaid,
    "critical"
  ));

  return companyChecks;
}

export function runConsolidatedChecks(
  properties: CheckerProperty[],
  allEngineCalcs: EngineMonthlyResult[][],
): CheckResult[] {
  const consolidatedChecks: CheckResult[] = [];
  if (properties.length <= 1) return consolidatedChecks;

  const actualYear1RoomRevenue = allEngineCalcs.reduce(
    (s, calc) => s + (calc ?? []).slice(0, MONTHS_PER_YEAR).reduce((s2, m) => s2 + m.revenueRooms, 0), 0
  );

  let directYear1RoomRevenue = 0;
  for (let pi = 0; pi < properties.length; pi++) {
    const calc = allEngineCalcs[pi] ?? [];
    const opMonths = calc.slice(0, MONTHS_PER_YEAR).filter((m) => m.revenueRooms > 0);
    directYear1RoomRevenue += opMonths.reduce((s, m) => s + m.revenueRooms, 0);
  }

  consolidatedChecks.push(check(
    "Portfolio Room Revenue Aggregation",
    "Consolidated",
    "ASC 810",
    "Sum of individual property room revenues = portfolio room revenue total",
    directYear1RoomRevenue,
    actualYear1RoomRevenue,
    "critical"
  ));

  return consolidatedChecks;
}
