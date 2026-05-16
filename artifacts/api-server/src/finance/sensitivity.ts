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
import { withModelConstants } from "./apply-model-constants";
import { computeIRR } from "@analytics/returns/irr";
import { computeBreakevenTargets } from "@calc/analysis/breakeven-targets";
import { aggregateUnifiedByYear } from "@engine/aggregation/yearlyAggregator";
import { storage } from "../storage";
import { resolveDefault } from "../defaults";
import type { PropertyInput, GlobalInput } from "@engine/types";
import type { LoanParams, GlobalLoanParams } from "@engine/debt/loanCalculations";
import { propertyEquityInvested } from "@engine/debt/equityCalculations";
import {
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  MONTHS_PER_YEAR,
} from "@shared/constants";
import type {
  SensitivityScenarioResult,
  SensitivityTornadoItem,
  SensitivityTornadoVariable,
  SensitivityHeatMapCell,
  SensitivityResponse,
  SensitivityBreakevenBundle,
} from "@shared/sensitivity-types";

interface ResolvedDefaults {
  exitCapRate: number;
  commissionRate: number;
}

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
  resolved: ResolvedDefaults,
): SensitivityScenarioResult {
  let totalRevenue = 0;
  let totalNOI = 0;
  let totalCashFlow = 0;
  let totalExitValue = 0;
  let totalInitialEquity = 0;

  // Canonical per-year net-cash-flow-to-investors, summed across all properties.
  // This uses the same vector convention as aggregateUnifiedByYear / the client
  // InvestmentAnalysis tab: equity is deducted in its acquisition year (not
  // prepended at T=0), and exit proceeds are added in the final year.
  // Using a shared aggregator eliminates the previous N+1 vs N element mismatch
  // and ensures sensitivity IRR is computed identically to portfolio IRR.
  const netFlowsByYear: number[] = new Array(projectionYears).fill(0);

  for (const prop of properties) {
    const baseInterestRate =
      (prop.acquisitionInterestRate ?? global.debtAssumptions?.interestRate ?? 0.065);

    // Compute the scenario-adjusted exit cap rate once per property so it can
    // be stamped onto adjProp before passing to aggregateUnifiedByYear.
    const baseCapRate = prop.exitCapRate ?? global.exitCapRate ?? resolved.exitCapRate;
    const adjCapRate  = Math.max(0.01, baseCapRate + (overrides.exitCapRate ?? 0) / 100);

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
      // Stamp the scenario-adjusted exit cap rate so aggregateUnifiedByYear
      // picks it up (property.exitCapRate takes precedence over global).
      exitCapRate: adjCapRate,
      // Use the admin-resolved commission rate as the authoritative fallback
      // when the property has no per-property override.
      dispositionCommission: prop.dispositionCommission ?? resolved.commissionRate,
    };

    const adjGlobal: GlobalInput = {
      ...global,
      inflationRate: Math.max(0, global.inflationRate + (overrides.inflation ?? 0) / 100),
      fixedCostEscalationRate: Math.max(
        0,
        (global.fixedCostEscalationRate ?? global.inflationRate) +
          (overrides.expenseGrowth ?? 0) / 100,
      ),
    };

    const financials = generatePropertyProForma(adjProp, adjGlobal, projectionMonths);

    // Accumulate display-level totals from raw monthly data.
    for (const m of financials) {
      totalRevenue  += m.revenueTotal;
      totalNOI      += m.noi;
      totalCashFlow += m.cashFlow;
    }

    // Use the canonical aggregator to get the net-cash-flow-to-investors series.
    // This handles equity placement at acquisition year, annualizedNOI-based exit,
    // and refinancing proceeds — matching the client's computation exactly.
    const unified = aggregateUnifiedByYear(
      financials,
      adjProp as unknown as LoanParams,
      adjGlobal as unknown as GlobalLoanParams,
      projectionYears,
    );

    for (let y = 0; y < projectionYears; y++) {
      netFlowsByYear[y] += unified.yearlyCF[y]?.netCashFlowToInvestors ?? 0;
    }

    totalExitValue  += unified.yearlyCF[projectionYears - 1]?.exitValue ?? 0;
    totalInitialEquity += propertyEquityInvested(prop);
  }

  // IRR: use netCashFlowToInvestors[] directly — equity is already embedded
  // as a negative outflow in each property's acquisition year, matching the
  // N-element convention used by InvestmentAnalysis.tsx and build-payload.ts.
  const irrResult = totalInitialEquity > 0 ? computeIRR(netFlowsByYear, 1) : null;
  const irr = irrResult?.irr_periodic ?? 0;
  const avgNOIMargin = totalRevenue > 0 ? (totalNOI / totalRevenue) * 100 : 0;

  // MOIC (equity multiple): total distributions / initial equity invested.
  // Standard real-estate PE definition — denominator is ONLY the upfront equity
  // check written, regardless of whether any mid-period years are negative.
  // netFlowsByYear already nets out equity in the acquisition year; adding it
  // back recovers total gross distributions (= sum(ATCF) + refi + exit).
  const totalCashReturned = netFlowsByYear.reduce((s, v) => s + v, 0);
  const equityMultipleValue = totalInitialEquity > 0
    ? (totalCashReturned + totalInitialEquity) / totalInitialEquity
    : 0;

  return { totalRevenue, totalNOI, totalCashFlow, avgNOIMargin, exitValue: totalExitValue, irr, equityMultipleValue };
}

// ─── Breakeven Targets bundle (single-property reverse solve) ─────────────────

/** Perturbation magnitude for the ADR/Occ/RevPAR slope estimate (10 %). */
const BREAKEVEN_REVENUE_PERTURBATION = 0.10;
/**
 * Exit-cap samples used to bracket IRR = 0 for the terminal-cap reverse solve.
 * Values are absolute decimals; range is wide enough to bracket most deals.
 */
const BREAKEVEN_TERMINAL_CAP_SAMPLES = [0.04, 0.07, 0.10, 0.15, 0.22] as const;

/** Sum the first N months of any numeric field on MonthlyFinancials. */
function sumFirstYear<T>(rows: readonly T[], field: keyof T): number {
  let total = 0;
  const limit = Math.min(MONTHS_PER_YEAR, rows.length);
  for (let i = 0; i < limit; i++) {
    const v = rows[i][field] as unknown;
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

/**
 * Compute the breakeven targets bundle for the selected single property.
 * Returns null when the panel is not applicable (no debt, missing data, etc.).
 */
function computeBreakevenBundle(
  prop: PropertyInput,
  global: GlobalInput,
  projectionYears: number,
  projectionMonths: number,
  resolved: ResolvedDefaults,
): SensitivityBreakevenBundle | null {
  // Year-1 base ANOI and debt service from the un-shocked engine run.
  const baseRows = generatePropertyProForma(prop, global, projectionMonths);
  const baseAnoiAnnual = sumFirstYear(baseRows, "anoi");
  const annualDebtService = sumFirstYear(baseRows, "debtPayment");

  // No debt → DSCR is undefined and the panel has no meaning.
  if (annualDebtService <= 0) return null;

  // Slope: re-run with ADR scaled by +10 %; ANOI delta divided by the
  // perturbation gives ΔANOI per unit revenue scale.
  const perturbedProp: PropertyInput = {
    ...prop,
    startAdr: prop.startAdr * (1 + BREAKEVEN_REVENUE_PERTURBATION),
  };
  const perturbedRows = generatePropertyProForma(perturbedProp, global, projectionMonths);
  const perturbedAnoi = sumFirstYear(perturbedRows, "anoi");
  const anoiSlopePerRevenueScale =
    (perturbedAnoi - baseAnoiAnnual) / BREAKEVEN_REVENUE_PERTURBATION;

  // IRR samples for terminal-cap reverse solve. Each sample re-uses the
  // existing single-property runScenario logic with an absolute exit-cap
  // override expressed as a delta (in percentage points) from the current cap.
  const currentTerminalCap = prop.exitCapRate ?? global.exitCapRate ?? resolved.exitCapRate;
  const irrSamples = BREAKEVEN_TERMINAL_CAP_SAMPLES.map((cap) => {
    const deltaPp = (cap - currentTerminalCap) * 100;
    const result = runScenario(
      [prop],
      global,
      { exitCapRate: deltaPp },
      projectionMonths,
      projectionYears,
      resolved,
    );
    return { exitCap: cap, irr: result.irr };
  });

  // Loan inputs for PMT inversion. Falls back to GA/constants when missing.
  const ltv = (prop.acquisitionLTV as number | null) ?? 0;
  const loanAmount = prop.purchasePrice * ltv;
  const termYears =
    (prop.acquisitionTermYears as number | null) ?? DEFAULT_TERM_YEARS;
  const termMonths = termYears * MONTHS_PER_YEAR;
  const currentDebtRate =
    (prop.acquisitionInterestRate as number | null) ??
    global.debtAssumptions?.interestRate ??
    DEFAULT_INTEREST_RATE;

  // Year-1 stabilized ADR and occupancy. ADR averages may differ from startAdr
  // when ramp/seasonality applies; use the engine's reported revenue numbers
  // to stay consistent with the slope calculation above.
  const currentAdr = prop.startAdr;
  const currentOccupancy = prop.maxOccupancy;
  const currentGoingInCap =
    prop.purchasePrice > 0 ? baseAnoiAnnual / prop.purchasePrice : 0;
  if (currentGoingInCap <= 0) return null;

  const result = computeBreakevenTargets({
    currentAdr,
    currentOccupancy,
    currentGoingInCap,
    currentDebtRate,
    currentTerminalCap,
    baseAnoiAnnual,
    anoiSlopePerRevenueScale,
    annualDebtService,
    loanAmount,
    termMonths,
    purchasePrice: prop.purchasePrice,
    irrSamples,
  });

  return result;
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

  // Overlay admin-governed Model Constants (e.g. daysPerMonth) on top of the
  // DB row before the engine sees it. Single authoritative source.
  const globalInput = (await withModelConstants(rawGlobal)) as unknown as GlobalInput;
  const projectionYears = (rawGlobal.projectionYears as number | null) ?? 10;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;

  // Resolve admin-managed defaults once (DB overlay → TS constant fallback).
  // runScenario is sync and called 40× per request (base + 14 tornado + 25 heatmap),
  // so the awaited resolution lives here, not inside the hot loop.
  const resolved: ResolvedDefaults = {
    exitCapRate:
      (await resolveDefault<number>("mc.tax_exit.exitCapRate")) ?? DEFAULT_EXIT_CAP_RATE,
    commissionRate:
      (await resolveDefault<number>("mc.tax_exit.commissionRate")) ?? DEFAULT_COMMISSION_RATE,
  };

  // Base run
  const base = runScenario(targetProps, globalInput, {}, projectionMonths, projectionYears, resolved);

  // Tornado: one pass per variable × 2 shocks — derive both chart types simultaneously
  const tornado: SensitivityTornadoItem[] = [];
  const tornadoVariables: SensitivityTornadoVariable[] = [];

  for (const v of SENSITIVITY_VARIABLES) {
    const upResult   = runScenario(targetProps, globalInput, { [v.id]: v.swingPct },  projectionMonths, projectionYears, resolved);
    const downResult = runScenario(targetProps, globalInput, { [v.id]: -v.swingPct }, projectionMonths, projectionYears, resolved);

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
        resolved,
      );
      // Audit Task #967 — read true MOIC from runScenario (computed via
      // `computeEquityMultiple`). Previous code computed NOI margin
      // (totalNOI / totalRevenue) here and mislabelled it as the equity
      // multiple, which was wrong by an order of magnitude.
      cells.push({
        row: ri, col: ci,
        rowLabel: rowLabels[ri], colLabel: colLabels[ci],
        irrValue:             result.irr,
        noiValue:             result.totalNOI,
        equityMultipleValue: result.equityMultipleValue,
      });
    }
  }

  // ── Breakeven bundle (single property only) ─────────────────────────────────
  // Multi-property roll-up is intentionally out of scope: each property has its
  // own debt structure and cap rates, so a portfolio-level breakeven is
  // ill-defined. Single-property selection unlocks the panel.
  const breakeven =
    propertyId !== "all" && targetProps.length === 1
      ? computeBreakevenBundle(
          targetProps[0],
          globalInput,
          projectionYears,
          projectionMonths,
          resolved,
        )
      : null;

  return {
    base,
    tornado,
    tornadoVariables,
    heatmap: { cells, rowLabels, colLabels },
    breakeven,
    projectionYears,
    computedAt: new Date().toISOString(),
  };
}

