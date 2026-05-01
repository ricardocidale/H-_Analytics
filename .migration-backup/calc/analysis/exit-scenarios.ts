/**
 * calc/analysis/exit-scenarios.ts — Multi-scenario exit horizon analysis.
 *
 * PURPOSE:
 * For a single property, project how a sale at four candidate hold horizons
 * (3 / 5 / 7 / 10 years) would settle out under three NOI-growth scenarios
 * (pessimistic, base, optimistic). Surfaces the items an investor needs to
 * judge "should I plan to exit, and when?":
 *
 *   • Sale Price                 = terminal NOI / exit cap rate
 *   • Selling Costs (itemized)   = broker + transfer/doc tax + prepayment
 *                                  penalty + FF&E disposition
 *   • Loan Balance               = real amortization balance at horizon year
 *                                  (not an estimate)
 *   • Total Cash Invested        = initial equity + sum of any years where
 *                                  cash flow to investors went negative
 *   • Profit / Loss              = cumulative cash returned − cash invested
 *   • Annualized ROI             = (cash_returned / cash_invested)^(1/H) − 1
 *   • Breakeven Hold Period      = smallest H where profit/loss ≥ 0
 *   • Early-Exit Risk            = realized loss at year 3 if any scenario's
 *                                  breakeven exceeds 5 years
 *   • Terminal-vs-Cumulative-Cost area chart series per scenario.
 *
 * SCOPE LIMITS (Task #807):
 *   We do NOT change the exit-valuation or hold-vs-sell math itself, do NOT
 *   introduce new appreciation assumptions to the engine, and do NOT model
 *   refinance-then-hold here. We only present what already exists, projected
 *   forward under three transparent NOI-growth assumptions.
 */

import type { LoanCalculation, GlobalLoanParams, LoanParams } from "../../engine/debt/loanCalculations";
import {
  calculateLoanParams,
  calculateRefinanceParams,
  getOutstandingDebtAtYear,
} from "../../engine/debt/loanCalculations";
import { US_STATE_DEFAULTS } from "../../shared/countryDefaults";
import {
  DEFAULT_COMMISSION_RATE,
  DEFAULT_EXIT_CAP_RATE,
} from "../../shared/constants";
import { dPow } from "../shared/decimal";

/** A scenario name + the NOI growth rate used to roll NOI past year-1. */
export interface ExitScenarioAssumption {
  key: "pessimistic" | "base" | "optimistic";
  label: string;
  /** Annual NOI growth rate applied to year-1 NOI to project terminal NOI. */
  noiGrowthRate: number;
}

/** Itemized selling-cost breakdown used at every horizon. Sums to total. */
export interface SellingCostBreakdown {
  /** Broker/sale commission = grossSale × dispositionCommission. */
  brokerCommission: number;
  /** Transfer / documentary stamp tax (jurisdiction-keyed). */
  transferTax: number;
  /** Prepayment / defeasance penalty (only if loan still outstanding). */
  prepaymentPenalty: number;
  /** FF&E disposition cost (estimate of removing/disposing furniture). */
  ffeDisposition: number;
  /** Sum of all four lines above. */
  total: number;
  /** Echoes the rates used so the UI can label them. */
  rates: {
    brokerRate: number;
    transferTaxRate: number;
    prepaymentPenaltyRate: number;
    ffeDispositionRate: number;
  };
}

/** Per-horizon outcome under one scenario. */
export interface ExitHorizonResult {
  /** Hold horizon in years (3 / 5 / 7 / 10). */
  horizonYears: number;
  /** Projected terminal NOI at year `horizonYears`. */
  terminalNoi: number;
  /** Gross sale price = terminalNoi / exitCapRate. */
  salePrice: number;
  /** Itemized selling-cost breakdown. */
  sellingCosts: SellingCostBreakdown;
  /** Outstanding loan balance from amortization at horizon year. */
  loanBalance: number;
  /** Net proceeds = salePrice − sellingCosts.total − loanBalance. */
  netProceeds: number;
  /** Initial equity + cumulative negative annual CF up to horizon. */
  totalCashInvested: number;
  /** Cumulative positive annual CF up to horizon + netProceeds. */
  totalCashReturned: number;
  /** totalCashReturned − totalCashInvested. */
  profitLoss: number;
  /** ((totalCashReturned/totalCashInvested)^(1/H) − 1); 0 if undefined. */
  annualizedRoi: number;
}

/** Series points for the per-scenario terminal-value-vs-cumulative-cost chart. */
export interface TerminalVsCostPoint {
  year: number;
  terminalValue: number;
  cumulativeCost: number;
}

/** The bundle of results for one scenario. */
export interface ExitScenarioResult {
  scenario: ExitScenarioAssumption;
  horizons: ExitHorizonResult[];
  /**
   * Smallest hold year where profit/loss first becomes ≥ 0. Capped at the
   * projection ceiling (default 30). `null` when the scenario never breaks
   * even within that ceiling.
   */
  breakevenYears: number | null;
  /**
   * Series across the projection ceiling for charting "terminal value at
   * sale" against "cumulative cost basis".
   */
  chartSeries: TerminalVsCostPoint[];
}

/** Top-level callout shown when at least one scenario is slow to break even. */
export interface EarlyExitRisk {
  triggered: boolean;
  /** Worst (most negative) profit/loss across all scenarios at year 3. */
  worstYear3Loss: number;
  /** Scenario key that produced `worstYear3Loss`. */
  worstScenarioKey: ExitScenarioAssumption["key"];
  /** Plain-English message for the UI; empty string when not triggered. */
  message: string;
}

/** Inputs for {@link computeExitScenarios}. */
export interface ExitScenariosInput {
  /** Property record (drizzle row shape — only loan/exit fields are read). */
  property: LoanParams & {
    country?: string | null;
    stateProvince?: string | null;
    buildingImprovements?: number | null;
    operatingReserve?: number | null;
    preOpeningCosts?: number | null;
    willRefinance?: string | null;
    /** Drives the default-scenario triplet when `scenarios` is not provided. */
    adrGrowthRate?: number | null;
  };
  /** Global assumptions used by `calculateLoanParams`. */
  global: GlobalLoanParams;
  /** Engine-projected annual NOI series (index 0 = year 1). */
  yearlyNoi: number[];
  /**
   * Engine-projected annual net-cash-flow-to-investors series (index 0 = year 1).
   * Negative entries are folded into `totalCashInvested`; positives into
   * `totalCashReturned`. The engine includes the initial equity outflow as a
   * negative entry in the acquisition year, so we strip that here and let the
   * scenario layer track it explicitly via `LoanCalculation.equityInvested`.
   */
  netCashFlowToInvestors: number[];
  /** Acquisition year (0-indexed from model start). */
  acquisitionYear: number;
  /** Hold horizons to evaluate. Default: [3, 5, 7, 10]. */
  horizons?: number[];
  /**
   * Three NOI-growth assumptions. Default: derived from
   * `property.adrGrowthRate ?? 0.03` with ±2pp shocks for pess/opt.
   */
  scenarios?: [ExitScenarioAssumption, ExitScenarioAssumption, ExitScenarioAssumption];
  /** Maximum year used when searching for breakeven and charting. Default 30. */
  ceilingYears?: number;
}

/** Top-level output of {@link computeExitScenarios}. */
export interface ExitScenariosOutput {
  scenarios: ExitScenarioResult[];
  earlyExitRisk: EarlyExitRisk;
  /** The horizons evaluated, echoed back for the UI. */
  horizonsEvaluated: number[];
  /** Acquisition year (0-indexed); echoed for chart x-axis labels. */
  acquisitionYear: number;
}

/* ------------------------------------------------------------------------- */
/* Jurisdiction-keyed selling-cost rate lookup.                              */
/*                                                                           */
/* These are conservative defaults and intentionally tiny. The point of this */
/* table is to produce a *named, sourced* line item per jurisdiction rather  */
/* than a hand-wave 1.0% catch-all — so the UI can show which rate fired.    */
/* Authoritative rates live in admin Constants in the long run.              */
/* ------------------------------------------------------------------------- */

/** FF&E disposition cost share of grossSale used across all jurisdictions. */
const FFE_DISPOSITION_RATE_DEFAULT = 0.005;
/** Catch-all transfer/stamp tax for jurisdictions without an explicit row. */
const TRANSFER_TAX_RATE_DEFAULT_NON_US = 0.005;
/** Weighted national US transfer + recording fees average. */
const TRANSFER_TAX_RATE_US_NATIONAL_AVG = 0.0075;
/** Mexico ISAI national average. */
const TRANSFER_TAX_RATE_MEXICO = 0.02;
/** Netherlands overdrachtsbelasting (commercial 2024). */
const TRANSFER_TAX_RATE_NETHERLANDS = 0.108;
/** UK SDLT commercial top band. */
const TRANSFER_TAX_RATE_UK = 0.05;
/** France droits de mutation. */
const TRANSFER_TAX_RATE_FRANCE = 0.058;
/** Spain ITP average autonomous community rate. */
const TRANSFER_TAX_RATE_SPAIN = 0.07;

/** US state transfer/recording-fee rates (per state). */
const STATE_TRANSFER_TAX_FLORIDA = 0.007;
const STATE_TRANSFER_TAX_NEW_YORK = 0.014;
const STATE_TRANSFER_TAX_CALIFORNIA = 0.0011;
const STATE_TRANSFER_TAX_TEXAS = 0.0;
const STATE_TRANSFER_TAX_HAWAII = 0.0125;
const STATE_TRANSFER_TAX_WASHINGTON = 0.0128;
const STATE_TRANSFER_TAX_PENNSYLVANIA = 0.02;
const STATE_TRANSFER_TAX_ILLINOIS = 0.0075;
const STATE_TRANSFER_TAX_MASSACHUSETTS = 0.00456;
const STATE_TRANSFER_TAX_COLORADO = 0.0001;

interface JurisdictionRates {
  /** Real-estate transfer / documentary-stamp tax as fraction of grossSale. */
  transferTaxRate: number;
  /** FF&E disposition cost as fraction of grossSale. */
  ffeDispositionRate: number;
  /** Source label for the UI tooltip. */
  source: string;
}

const DEFAULT_JURISDICTION_RATES: JurisdictionRates = {
  transferTaxRate: TRANSFER_TAX_RATE_DEFAULT_NON_US,
  ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
  source: "Default (non-US)",
};

const COUNTRY_JURISDICTION_RATES: Record<string, JurisdictionRates> = {
  "United States": {
    transferTaxRate: TRANSFER_TAX_RATE_US_NATIONAL_AVG,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "US national avg (state transfer + recording fees)",
  },
  Mexico: {
    transferTaxRate: TRANSFER_TAX_RATE_MEXICO,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "Mexico ISAI (Impuesto sobre Adquisición de Inmuebles)",
  },
  Netherlands: {
    transferTaxRate: TRANSFER_TAX_RATE_NETHERLANDS,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "Netherlands overdrachtsbelasting (commercial)",
  },
  "United Kingdom": {
    transferTaxRate: TRANSFER_TAX_RATE_UK,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "UK SDLT (commercial top band)",
  },
  France: {
    transferTaxRate: TRANSFER_TAX_RATE_FRANCE,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "France droits de mutation",
  },
  Spain: {
    transferTaxRate: TRANSFER_TAX_RATE_SPAIN,
    ffeDispositionRate: FFE_DISPOSITION_RATE_DEFAULT,
    source: "Spain ITP (avg autonomous community rate)",
  },
};

const US_STATE_TRANSFER_TAX: Record<string, number> = {
  Florida: STATE_TRANSFER_TAX_FLORIDA,
  "New York": STATE_TRANSFER_TAX_NEW_YORK,
  California: STATE_TRANSFER_TAX_CALIFORNIA,
  Texas: STATE_TRANSFER_TAX_TEXAS,
  Hawaii: STATE_TRANSFER_TAX_HAWAII,
  Washington: STATE_TRANSFER_TAX_WASHINGTON,
  Pennsylvania: STATE_TRANSFER_TAX_PENNSYLVANIA,
  Illinois: STATE_TRANSFER_TAX_ILLINOIS,
  Massachusetts: STATE_TRANSFER_TAX_MASSACHUSETTS,
  Colorado: STATE_TRANSFER_TAX_COLORADO,
};

function lookupJurisdictionRates(
  country?: string | null,
  state?: string | null,
): JurisdictionRates {
  const countryRow = (country && COUNTRY_JURISDICTION_RATES[country]) || DEFAULT_JURISDICTION_RATES;
  // For US we let the state row override transferTaxRate (recording + state tax)
  if (country === "United States" && state && US_STATE_TRANSFER_TAX[state] !== undefined && US_STATE_DEFAULTS[state]) {
    return {
      ...countryRow,
      transferTaxRate: US_STATE_TRANSFER_TAX[state]!,
      source: `${state} state transfer/recording`,
    };
  }
  return countryRow;
}

/* ------------------------------------------------------------------------- */
/* Helpers.                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Project a yearly NOI series under one scenario.
 * Year 1 NOI is the engine's year-1 NOI (anchor). Subsequent years compound
 * at `noiGrowthRate`. Beyond `yearlyNoi.length`, this drives the projection.
 * Within `yearlyNoi.length`, we keep engine NOI for the *base* scenario but
 * apply a relative shock for pess/opt so the curves diverge consistently.
 */
function projectScenarioNoi(
  yearlyNoi: number[],
  scenario: ExitScenarioAssumption,
  baseGrowth: number,
  ceilingYears: number,
): number[] {
  const out: number[] = [];
  const n = Math.max(ceilingYears, yearlyNoi.length);
  if (n === 0 || yearlyNoi.length === 0) return out;
  const anchor = yearlyNoi[0]!;
  const isBase = scenario.key === "base";
  for (let y = 1; y <= n; y++) {
    let value: number;
    if (isBase && y <= yearlyNoi.length) {
      value = yearlyNoi[y - 1]!;
    } else if (y <= yearlyNoi.length) {
      // Relative shock vs base curve: keep engine's shape, shift the slope.
      const shockMultiplier = dPow(
        (1 + scenario.noiGrowthRate) / Math.max(1e-6, 1 + baseGrowth),
        y - 1,
      );
      value = yearlyNoi[y - 1]! * shockMultiplier;
    } else {
      // Beyond the engine projection: compound from the *scenario's* last
      // in-engine value (out[length-1]) — NOT from the unshocked engine NOI.
      // This preserves continuity at the engine/extrapolation boundary so
      // long-horizon breakeven calcs don't see a discontinuity.
      const lastScenarioVal = out[out.length - 1]!;
      const beyondGrowth = isBase ? baseGrowth : scenario.noiGrowthRate;
      value = lastScenarioVal * (1 + beyondGrowth);
    }
    out.push(Math.max(0, value));
  }
  // Anchor first year for scenarios that diverged at the start (pess/opt with
  // y=1 still uses anchor since shockMultiplier is 1).
  if (out.length > 0 && yearlyNoi.length > 0) {
    out[0] = isBase ? anchor : anchor; // y=1 anchor is identical for all scenarios
  }
  return out;
}

/**
 * Project the annual cash-flow-to-investors series for a scenario.
 * We don't have a per-year cash-flow model that responds to NOI changes,
 * so we apply the same NOI-relative scaling factor (NOI_scenario / NOI_base)
 * to the engine's per-year netCashFlowToInvestors. This keeps the directional
 * sensitivity intact without re-running the engine.
 */
function projectScenarioCashFlow(
  baseCashFlow: number[],
  baseNoi: number[],
  scenarioNoi: number[],
  ceilingYears: number,
  acquisitionYear: number,
): number[] {
  const out: number[] = [];
  for (let y = 0; y < Math.max(ceilingYears, baseCashFlow.length); y++) {
    if (y < baseCashFlow.length) {
      // Strip the initial equity outflow stamped into the acquisition year by
      // the engine — the scenario layer accounts for equity explicitly via
      // LoanCalculation.equityInvested.
      const baseVal = baseCashFlow[y]!;
      const baseNoiY = baseNoi[y] ?? 0;
      const scenarioNoiY = scenarioNoi[y] ?? baseNoiY;
      const ratio = baseNoiY > 0 ? scenarioNoiY / baseNoiY : 1;
      out.push(baseVal * ratio);
    } else {
      // Past projection: extrapolate last engine cash flow at scenario growth.
      const last = baseCashFlow[baseCashFlow.length - 1] ?? 0;
      const lastNoi = baseNoi[baseNoi.length - 1] ?? 1;
      const scenarioY = scenarioNoi[y] ?? lastNoi;
      const ratio = lastNoi > 0 ? scenarioY / lastNoi : 1;
      out.push(last * ratio);
    }
    void acquisitionYear; // referenced for callers; kept for future extensions
  }
  return out;
}

/** Step-down prepayment penalty: 5% in year 1, declining 1pp/yr, 0 from year 6. */
function prepaymentPenaltyRate(yearsHeld: number, hasOutstandingDebt: boolean): number {
  if (!hasOutstandingDebt) return 0;
  const stepDown = Math.max(0, 0.05 - 0.01 * Math.max(0, yearsHeld - 1));
  return stepDown;
}

function buildSellingCosts(
  grossSale: number,
  brokerRate: number,
  transferTaxRate: number,
  prepaymentPenaltyRate: number,
  loanBalance: number,
  ffeDispositionRate: number,
): SellingCostBreakdown {
  const brokerCommission = grossSale * brokerRate;
  const transferTax = grossSale * transferTaxRate;
  // Penalty is charged on the outstanding balance, not the sale price.
  const prepaymentPenalty = loanBalance * prepaymentPenaltyRate;
  const ffeDisposition = grossSale * ffeDispositionRate;
  const total = brokerCommission + transferTax + prepaymentPenalty + ffeDisposition;
  return {
    brokerCommission,
    transferTax,
    prepaymentPenalty,
    ffeDisposition,
    total,
    rates: { brokerRate, transferTaxRate, prepaymentPenaltyRate, ffeDispositionRate },
  };
}

/**
 * Compute one horizon's outcome under one scenario.
 * The "yearsHeld" is the number of years between acquisition and sale; the
 * model year used to look up amortization is `acquisitionYear + yearsHeld - 1`.
 */
function computeHorizon(
  yearsHeld: number,
  scenarioNoi: number[],
  scenarioCashFlow: number[],
  loan: LoanCalculation,
  refi: ReturnType<typeof calculateRefinanceParams>,
  acquisitionYear: number,
  exitCapRate: number,
  brokerRate: number,
  jurisdiction: JurisdictionRates,
): ExitHorizonResult {
  const noiYearIndex = Math.min(scenarioNoi.length - 1, Math.max(0, yearsHeld - 1));
  const terminalNoi = scenarioNoi[noiYearIndex] ?? 0;
  const salePrice = exitCapRate > 0 ? terminalNoi / exitCapRate : 0;

  // Loan balance at end of (acquisitionYear + yearsHeld - 1)
  const debtYear = acquisitionYear + yearsHeld - 1;
  const loanBalance = getOutstandingDebtAtYear(loan, refi, debtYear);

  const penaltyRate = prepaymentPenaltyRate(yearsHeld, loanBalance > 0);
  const sellingCosts = buildSellingCosts(
    salePrice,
    brokerRate,
    jurisdiction.transferTaxRate,
    penaltyRate,
    loanBalance,
    jurisdiction.ffeDispositionRate,
  );

  const netProceeds = salePrice - sellingCosts.total - loanBalance;

  // Cash flow accumulation across the hold period.
  let cumulativePositive = 0;
  let cumulativeNegative = 0; // signed (negative)
  const startIdx = acquisitionYear;
  const endIdx = Math.min(scenarioCashFlow.length, acquisitionYear + yearsHeld);
  for (let i = startIdx; i < endIdx; i++) {
    const cf = scenarioCashFlow[i] ?? 0;
    if (cf >= 0) cumulativePositive += cf;
    else cumulativeNegative += cf;
  }

  // Underwater exit: when sale proceeds don't cover selling costs + debt
  // payoff, the investor brings cash to the closing table. That close
  // shortfall is real invested capital and must be counted — clamping
  // netProceeds at zero would silently understate the loss.
  const closeShortfall = netProceeds < 0 ? -netProceeds : 0;
  const proceedsReturned = netProceeds > 0 ? netProceeds : 0;

  const totalCashInvested = loan.equityInvested + Math.abs(cumulativeNegative) + closeShortfall;
  const totalCashReturned = cumulativePositive + proceedsReturned;
  const profitLoss = totalCashReturned - totalCashInvested;
  const annualizedRoi = totalCashInvested > 0 && totalCashReturned > 0 && yearsHeld > 0
    ? dPow(totalCashReturned / totalCashInvested, 1 / yearsHeld) - 1
    : 0;

  return {
    horizonYears: yearsHeld,
    terminalNoi,
    salePrice,
    sellingCosts,
    loanBalance,
    netProceeds,
    totalCashInvested,
    totalCashReturned,
    profitLoss,
    annualizedRoi,
  };
}

/**
 * Find the (possibly fractional) hold period H in [1, ceiling] at which the
 * scenario's cumulative profit/loss first becomes non-negative. Linearly
 * interpolates between the two adjacent integer-year horizons that bracket
 * the sign change so the UI can show "6.4 years" instead of rounding up to
 * the next full year. Returns null if breakeven never occurs within the
 * ceiling.
 */
function findBreakeven(
  scenarioNoi: number[],
  scenarioCashFlow: number[],
  loan: LoanCalculation,
  refi: ReturnType<typeof calculateRefinanceParams>,
  acquisitionYear: number,
  exitCapRate: number,
  brokerRate: number,
  jurisdiction: JurisdictionRates,
  ceilingYears: number,
): number | null {
  let prevPL: number | null = null;
  for (let h = 1; h <= ceilingYears; h++) {
    const r = computeHorizon(
      h,
      scenarioNoi,
      scenarioCashFlow,
      loan,
      refi,
      acquisitionYear,
      exitCapRate,
      brokerRate,
      jurisdiction,
    );
    if (r.profitLoss >= 0) {
      if (prevPL === null || prevPL >= 0) return h; // no negative bracket → integer
      const span = r.profitLoss - prevPL;
      if (span <= 0) return h;
      const frac = -prevPL / span; // ∈ (0, 1]
      return h - 1 + frac;
    }
    prevPL = r.profitLoss;
  }
  return null;
}

/**
 * Build the per-year terminal-value-vs-cumulative-cost series for charting.
 * `terminalValue` = salePrice − sellingCosts − loanBalance + cumulativePositiveCF.
 * `cumulativeCost` = totalCashInvested.
 */
function buildChartSeries(
  scenarioNoi: number[],
  scenarioCashFlow: number[],
  loan: LoanCalculation,
  refi: ReturnType<typeof calculateRefinanceParams>,
  acquisitionYear: number,
  exitCapRate: number,
  brokerRate: number,
  jurisdiction: JurisdictionRates,
  ceilingYears: number,
): TerminalVsCostPoint[] {
  const out: TerminalVsCostPoint[] = [];
  for (let h = 1; h <= ceilingYears; h++) {
    const r = computeHorizon(
      h,
      scenarioNoi,
      scenarioCashFlow,
      loan,
      refi,
      acquisitionYear,
      exitCapRate,
      brokerRate,
      jurisdiction,
    );
    out.push({
      year: h,
      terminalValue: r.totalCashReturned,
      cumulativeCost: r.totalCashInvested,
    });
  }
  return out;
}

/**
 * Default ±2pp NOI-growth shock applied to derive Pessimistic / Optimistic
 * scenarios from the property's base growth rate.
 */
const DEFAULT_SCENARIO_SHOCK_PCT = 0.02;

/**
 * Default scenario triplet derived from a property's existing growth rate.
 * Kept here (and not in the UI) so the calc layer is reproducible from
 * just the inputs.
 */
export function defaultScenarios(
  baseGrowth: number,
): [ExitScenarioAssumption, ExitScenarioAssumption, ExitScenarioAssumption] {
  return [
    { key: "pessimistic", label: "Pessimistic", noiGrowthRate: baseGrowth - DEFAULT_SCENARIO_SHOCK_PCT },
    { key: "base", label: "Base", noiGrowthRate: baseGrowth },
    { key: "optimistic", label: "Optimistic", noiGrowthRate: baseGrowth + DEFAULT_SCENARIO_SHOCK_PCT },
  ];
}

/**
 * Default horizons. Centralized so server and UI agree.
 */
export const DEFAULT_EXIT_HORIZONS: readonly number[] = [3, 5, 7, 10];

/**
 * Top-level: compute the full exit-scenarios bundle for a property.
 */
export function computeExitScenarios(input: ExitScenariosInput): ExitScenariosOutput {
  const {
    property,
    global,
    yearlyNoi,
    netCashFlowToInvestors,
    acquisitionYear,
  } = input;

  const horizons = (input.horizons ?? DEFAULT_EXIT_HORIZONS).slice();
  const ceilingYears = input.ceilingYears ?? 30;

  const baseGrowth = property.adrGrowthRate ?? 0.03;
  const scenarios = input.scenarios ?? defaultScenarios(baseGrowth);

  // Loan setup is shared across scenarios (the loan doesn't change with NOI).
  const loan = calculateLoanParams(property, global);
  const refi = calculateRefinanceParams(property, global, loan, yearlyNoi, Math.max(yearlyNoi.length, ceilingYears));

  const exitCapRate = property.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
  const brokerRate = property.dispositionCommission ?? global.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const jurisdiction = lookupJurisdictionRates(property.country, property.stateProvince);

  // Engine cashflows include initial equity outflow at acquisitionYear; strip
  // it so we don't double-count equity (totalCashInvested already adds it).
  const cashFlowStripped = netCashFlowToInvestors.slice();
  if (cashFlowStripped[acquisitionYear] !== undefined) {
    cashFlowStripped[acquisitionYear] = (cashFlowStripped[acquisitionYear] ?? 0) + loan.equityInvested;
  }

  const scenarioResults: ExitScenarioResult[] = scenarios.map((scn) => {
    const scnNoi = projectScenarioNoi(yearlyNoi, scn, baseGrowth, ceilingYears);
    const scnCf = projectScenarioCashFlow(cashFlowStripped, yearlyNoi, scnNoi, ceilingYears, acquisitionYear);

    const horizonResults = horizons.map((h) =>
      computeHorizon(h, scnNoi, scnCf, loan, refi, acquisitionYear, exitCapRate, brokerRate, jurisdiction),
    );

    const breakevenYears = findBreakeven(
      scnNoi, scnCf, loan, refi, acquisitionYear, exitCapRate, brokerRate, jurisdiction, ceilingYears,
    );

    const chartSeries = buildChartSeries(
      scnNoi, scnCf, loan, refi, acquisitionYear, exitCapRate, brokerRate, jurisdiction, ceilingYears,
    );

    return {
      scenario: scn,
      horizons: horizonResults,
      breakevenYears,
      chartSeries,
    };
  });

  // Early-exit risk: per the spec, the callout fires whenever ANY scenario's
  // breakeven exceeds 5 years (or never breaks even within the ceiling).
  // The reported `worstYear3Loss` is informational — it describes how bad an
  // early forced exit could look, but it does NOT gate whether the callout
  // shows. (A scenario can have a long breakeven and still post a small
  // year-3 gain on paper; the user still deserves the warning.)
  const breakevenOver5 = scenarioResults.some(
    (s) => s.breakevenYears === null || s.breakevenYears > 5,
  );

  // Find the worst profit/loss at year 3 across scenarios (informational).
  let worstYear3PL = 0;
  let worstScenarioKey: ExitScenarioAssumption["key"] = "pessimistic";
  let foundAny = false;
  for (const s of scenarioResults) {
    const yr3 = s.horizons.find((h) => h.horizonYears === 3);
    if (!yr3) continue;
    if (!foundAny || yr3.profitLoss < worstYear3PL) {
      worstYear3PL = yr3.profitLoss;
      worstScenarioKey = s.scenario.key;
      foundAny = true;
    }
  }

  // Per spec: always state the year-3 realized P/L for the worst scenario, so
  // users can size the early-exit downside even when the year-3 number happens
  // to be a (small) gain on paper.
  const yr3Direction = worstYear3PL < 0 ? "loss" : "gain";
  const yr3AmountStr = formatLossSentenceAmount(Math.abs(worstYear3PL));
  const message = breakevenOver5
    ? `At least one scenario takes more than 5 years to break even — a forced exit at year 3 under the ${worstScenarioKey} scenario would realize a ${yr3Direction} of approximately ${yr3AmountStr}.`
    : "";

  const earlyExitRisk: EarlyExitRisk = {
    triggered: breakevenOver5,
    worstYear3Loss: worstYear3PL,
    worstScenarioKey,
    message,
  };

  return {
    scenarios: scenarioResults,
    earlyExitRisk,
    horizonsEvaluated: horizons,
    acquisitionYear,
  };
}

function formatLossSentenceAmount(absAmount: number): string {
  if (absAmount >= 1_000_000) return `$${(absAmount / 1_000_000).toFixed(1)}M`;
  if (absAmount >= 1_000) return `$${(absAmount / 1_000).toFixed(0)}K`;
  return `$${Math.round(absAmount).toLocaleString()}`;
}
