/**
 * server/finance/sensitivity.ts — Server-side sensitivity analysis computation.
 *
 * Runs the tornado chart (7 variables × 2 shocks = 14 engine runs) and heatmap
 * (5×5 occupancy × ADR grid = 25 runs) entirely on the server, returning
 * pre-shaped data to the client.
 *
 * The client keeps only the 2 interactive slider runs (base + adjusted) local
 * for responsiveness. All static analysis computation moves here.
 */

import { generatePropertyProForma } from "./core/property-pipeline";
import { computeIRR } from "../../analytics/returns/irr.js";
import { storage } from "../storage";
import type { PropertyInput, GlobalInput } from "@engine/types";
import {
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_FIXED_COST_ESCALATION_RATE,
  MONTHS_PER_YEAR,
} from "@shared/constants";
import type {
  SensitivityScenarioResult,
  SensitivityTornadoItem,
  SensitivityTornadoVariable,
  SensitivityHeatMapCell,
  SensitivityResponse,
} from "@shared/sensitivity-types";

export type {
  SensitivityScenarioResult,
  SensitivityTornadoItem,
  SensitivityTornadoVariable,
  SensitivityHeatMapCell,
  SensitivityResponse,
};

// ─── Overrides shape (mirrors client SensitivityAnalysis.tsx) ─────────────────

interface ScenarioOverrides {
  occupancy?: number;
  adrGrowth?: number;
  expenseGrowth?: number;
  exitCapRate?: number;
  inflation?: number;
  interestRate?: number;
  insuranceRate?: number;
}

// ─── Core computation ─────────────────────────────────────────────────────────

function runScenario(
  properties: PropertyInput[],
  global: GlobalInput,
  overrides: ScenarioOverrides,
  projectionMonths: number,
  projectionYears: number,
): SensitivityScenarioResult {
  let totalRevenue = 0;
  let totalNOI = 0;
  let totalCashFlow = 0;
  let exitValue = 0;
  let totalInitialEquity = 0;
  const annualCashFlows: number[] = new Array(projectionYears).fill(0);

  for (const prop of properties) {
    const baseInterestRate =
      (prop.acquisitionInterestRate ?? global.debtAssumptions?.interestRate ?? 0.065);

    const adjProp: PropertyInput = {
      ...prop,
      maxOccupancy: Math.min(1, Math.max(0.1, prop.maxOccupancy + (overrides.occupancy ?? 0) / 100)),
      startOccupancy: Math.min(
        Math.min(1, Math.max(0.1, prop.maxOccupancy + (overrides.occupancy ?? 0) / 100)),
        prop.startOccupancy,
      ),
      adrGrowthRate: Math.max(0, prop.adrGrowthRate + (overrides.adrGrowth ?? 0) / 100),
      acquisitionInterestRate: Math.max(0.005, baseInterestRate + (overrides.interestRate ?? 0) / 100),
      costRateInsurance: Math.max(
        0,
        (prop.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE) + (overrides.insuranceRate ?? 0) / 100,
      ),
    };

    const adjGlobal: GlobalInput = {
      ...global,
      inflationRate: Math.max(0, global.inflationRate + (overrides.inflation ?? 0) / 100),
      fixedCostEscalationRate: Math.max(
        0,
        (global.fixedCostEscalationRate ?? DEFAULT_FIXED_COST_ESCALATION_RATE) +
          (overrides.expenseGrowth ?? 0) / 100,
      ),
    };

    const financials = generatePropertyProForma(adjProp, adjGlobal, projectionMonths);

    for (let i = 0; i < financials.length; i++) {
      const m = financials[i];
      totalRevenue  += m.revenueTotal;
      totalNOI      += m.noi;
      totalCashFlow += m.cashFlow;
      const yearIdx  = Math.floor(i / MONTHS_PER_YEAR);
      if (yearIdx < projectionYears) annualCashFlows[yearIdx] += m.cashFlow;
    }

    const lastYearNOI = financials.slice(-12).reduce((s, m) => s + m.noi, 0);
    const capRate = Math.max(
      0.01,
      (prop.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) +
        (overrides.exitCapRate ?? 0) / 100,
    );
    const commissionRate = prop.dispositionCommission ?? DEFAULT_COMMISSION_RATE;
    const grossExit = lastYearNOI / capRate;
    const netExit   = grossExit * (1 - commissionRate);
    const debtAtExit = financials[financials.length - 1]?.debtOutstanding ?? 0;
    exitValue += Math.max(0, netExit - debtAtExit);

    const ltv = (prop.acquisitionLTV as number | null) ?? 0;
    totalInitialEquity += prop.purchasePrice * (1 - ltv);
  }

  const irrFlows = [-totalInitialEquity, ...annualCashFlows];
  irrFlows[irrFlows.length - 1] += exitValue;
  const irrResult = totalInitialEquity > 0 ? computeIRR(irrFlows, 1) : null;
  const irr = irrResult?.irr_periodic ?? 0;
  const avgNOIMargin = totalRevenue > 0 ? (totalNOI / totalRevenue) * 100 : 0;

  return { totalRevenue, totalNOI, totalCashFlow, avgNOIMargin, exitValue, irr };
}

// ─── Sensitivity variables (mirrors client SensitivityAnalysis.tsx) ───────────

interface SensitivityVar {
  id: keyof ScenarioOverrides;
  label: string;
  unit: string;
  swingPct: number;
}

const SENSITIVITY_VARIABLES: SensitivityVar[] = [
  { id: "occupancy",     label: "Max Occupancy",       unit: "%",  swingPct: 10 },
  { id: "adrGrowth",    label: "ADR Growth Rate",      unit: "%",  swingPct: 3 },
  { id: "expenseGrowth",label: "Expense Escalation",   unit: "%",  swingPct: 3 },
  { id: "exitCapRate",  label: "Exit Cap Rate",         unit: "%",  swingPct: 2 },
  { id: "inflation",    label: "Inflation Rate",        unit: "%",  swingPct: 3 },
  { id: "interestRate", label: "Interest Rate",         unit: "%",  swingPct: 2 },
  { id: "insuranceRate",label: "Insurance Rate",        unit: "%",  swingPct: 3 },
];

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function computeSensitivityAnalysis(
  userId: number,
  propertyId: number | "all",
): Promise<SensitivityResponse> {
  const [rawProperties, rawGlobal] = await Promise.all([
    storage.getAllProperties(userId),
    storage.getGlobalAssumptions(userId),
  ]);

  if (!rawGlobal) throw new Error("No global assumptions found");

  const allProps = (rawProperties as unknown as (PropertyInput & { id?: number; isActive?: boolean })[])
    .filter(p => p.isActive !== false);
  const targetProps = propertyId === "all"
    ? allProps
    : allProps.filter(p => p.id === propertyId);

  if (!targetProps.length) {
    if (propertyId !== "all") {
      throw new Error("Property is inactive or not found");
    }
    throw new Error("No matching properties found");
  }

  const globalInput = rawGlobal as unknown as GlobalInput;
  const projectionYears = (rawGlobal.projectionYears as number | null) ?? 10;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;

  // Base run
  const base = runScenario(targetProps, globalInput, {}, projectionMonths, projectionYears);

  // Tornado: one pass per variable × 2 shocks — derive both chart types simultaneously
  const tornado: SensitivityTornadoItem[] = [];
  const tornadoVariables: SensitivityTornadoVariable[] = [];

  for (const v of SENSITIVITY_VARIABLES) {
    const upResult   = runScenario(targetProps, globalInput, { [v.id]: v.swingPct },  projectionMonths, projectionYears);
    const downResult = runScenario(targetProps, globalInput, { [v.id]: -v.swingPct }, projectionMonths, projectionYears);

    const irrUpDelta   = (upResult.irr   - base.irr)   * 100;
    const irrDownDelta = (downResult.irr  - base.irr)   * 100;
    const noiBase      = Math.abs(base.totalNOI) || 1;
    const noiUpDelta   = ((upResult.totalNOI   - base.totalNOI) / noiBase) * 100;
    const noiDownDelta = ((downResult.totalNOI - base.totalNOI) / noiBase) * 100;

    const upLabel   = `+${v.swingPct}${v.unit === "%" ? "pp" : ""}`;
    const downLabel = `-${v.swingPct}${v.unit === "%" ? "pp" : ""}`;

    tornado.push({
      name:       v.label,
      variableId: v.id,
      irrPositive:  Math.max(irrUpDelta, irrDownDelta),
      irrNegative:  Math.min(irrUpDelta, irrDownDelta),
      irrSpread:    Math.abs(irrUpDelta - irrDownDelta),
      noiPositive:  Math.max(noiUpDelta, noiDownDelta),
      noiNegative:  Math.min(noiUpDelta, noiDownDelta),
      noiSpread:    Math.abs(noiUpDelta - noiDownDelta),
      upLabel,
      downLabel,
    });

    tornadoVariables.push({
      name:          v.label,
      variableId:    v.id,
      upsideIrr:     upResult.irr,
      downsideIrr:   downResult.irr,
      upsideNoi:     upResult.totalNOI,
      downsideNoi:   downResult.totalNOI,
      upsideLabel:   upLabel,
      downsideLabel: downLabel,
    });
  }

  // Sort tornado by IRR spread descending
  tornado.sort((a, b) => b.irrSpread - a.irrSpread);
  // tornadoVariables stays aligned with tornado sort
  const sortedVarIds = tornado.map(t => t.variableId);
  tornadoVariables.sort((a, b) => sortedVarIds.indexOf(a.variableId) - sortedVarIds.indexOf(b.variableId));

  // Heatmap: 5×5 occupancy × ADR grid
  const occupancyShocks = [-10, -5, 0, 5, 10];
  const adrShocks       = [-10, -5, 0, 5, 10];
  const rowLabels = occupancyShocks.map(s => `${s >= 0 ? "+" : ""}${s}% Occ`);
  const colLabels = adrShocks.map(s => `${s >= 0 ? "+" : ""}${s}% ADR`);
  const cells: SensitivityHeatMapCell[] = [];

  for (let ri = 0; ri < occupancyShocks.length; ri++) {
    for (let ci = 0; ci < adrShocks.length; ci++) {
      const result = runScenario(
        targetProps,
        globalInput,
        { occupancy: occupancyShocks[ri], adrGrowth: adrShocks[ci] / 2 },
        projectionMonths,
        projectionYears,
      );
      const equityMultipleValue = result.totalRevenue > 0
        ? result.totalNOI / result.totalRevenue
        : 0;
      cells.push({
        row: ri, col: ci,
        rowLabel: rowLabels[ri], colLabel: colLabels[ci],
        irrValue:             result.irr,
        noiValue:             result.totalNOI,
        equityMultipleValue,
      });
    }
  }

  return {
    base,
    tornado,
    tornadoVariables,
    heatmap: { cells, rowLabels, colLabels },
    projectionYears,
    computedAt: new Date().toISOString(),
  };
}
