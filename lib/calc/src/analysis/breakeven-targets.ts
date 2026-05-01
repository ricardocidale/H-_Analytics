/**
 * calc/analysis/breakeven-targets.ts — Reverse-solved hospitality breakeven thresholds.
 *
 * Inverse of the Sensitivity tornado: for each of six variables (ADR, Occupancy,
 * RevPAR, Going-In Cap, Debt Rate, Terminal Cap) computes the value at which
 * ANOI drops to annualDebtService × dscrFloor (or IRR crosses zero, for the
 * terminal cap). Returns Current, Breakeven, signed Gap (current − breakeven),
 * and a status badge.
 *
 * Pure module — no React/DOM/fetch/field-registry. Labels are the UI's job.
 */
import { assertFinite, dMul } from "../shared/decimal.js";
import { pmt } from "../shared/pmt.js";
import {
  BREAKEVEN_TARGET_DSCR_FLOOR,
  BREAKEVEN_PROXIMITY_RATIO,
} from "@shared/constants";

/** Identifier for each breakeven row. UI maps these to display labels. */
export type BreakevenRowKey =
  | "adr"
  | "occupancy"
  | "revpar"
  | "goingInCap"
  | "debtRate"
  | "terminalCap";

/** Status badge classification. `null` means the row could not be solved. */
export type BreakevenStatus = "above" | "below" | "close" | "unsolvable";

export interface BreakevenIrrSample {
  /** Exit cap rate the engine ran with. */
  exitCap: number;
  /** Resulting IRR (decimal, e.g. 0.18 for 18 %). */
  irr: number;
}

export interface BreakevenTargetsInput {
  /** Current Year-1 ADR ($). */
  currentAdr: number;
  /** Current Year-1 occupancy (decimal, 0–1). */
  currentOccupancy: number;
  /** Going-in cap rate at acquisition (decimal). */
  currentGoingInCap: number;
  /** Acquisition interest rate (annual decimal, e.g. 0.065). */
  currentDebtRate: number;
  /** Exit (terminal) cap rate (decimal). */
  currentTerminalCap: number;

  /**
   * Year-1 ANOI (Annual NOI − FF&E reserve) at the base scenario.
   * Caller is responsible for the NOI − FF&E reserve subtraction.
   */
  baseAnoiAnnual: number;
  /**
   * ΔANOI per unit change in revenue scale, measured at +10 % perturbation:
   *   slope = (ANOI(scale = 1.10) − ANOI(scale = 1.00)) / 0.10.
   * This single slope works for ADR, occupancy, and RevPAR shocks because
   * each of them scales revenue linearly in the engine's Year-1 stabilized
   * regime.
   */
  anoiSlopePerRevenueScale: number;

  /** Annual debt service ($) at the current debt assumptions. */
  annualDebtService: number;

  // ── Loan inputs (for breakeven debt-rate PMT inversion) ────────────────
  /** Outstanding loan balance ($) used in the rate solve. */
  loanAmount: number;
  /** Total amortization periods in months (e.g. 360 for 30 years). */
  termMonths: number;

  // ── Going-in cap inputs ────────────────────────────────────────────────
  /** Purchase price ($) used to imply going-in cap from breakeven NOI. */
  purchasePrice: number;

  // ── Terminal cap inputs ────────────────────────────────────────────────
  /** Optional IRR-vs-exit-cap samples for the terminal-cap reverse solve. */
  irrSamples?: BreakevenIrrSample[];

  // ── Configurable thresholds (defaulted from shared/constants) ──────────
  /** DSCR floor (default BREAKEVEN_TARGET_DSCR_FLOOR). */
  targetDscrFloor?: number;
  /** Relative gap below which status flips to "close" (default constant). */
  proximityRatio?: number;
}

export interface BreakevenRow {
  key: BreakevenRowKey;
  /** Current value in the row's native unit (rate as decimal, currency as $). */
  current: number;
  /** Breakeven value, or null if the threshold cannot be solved. */
  breakeven: number | null;
  /**
   * Signed gap = current − breakeven (same units as current/breakeven).
   * null when breakeven is null.
   */
  gap: number | null;
  status: BreakevenStatus;
  /** Reason string when status is "unsolvable" (helps tooltip / tests). */
  reason?: string;
}

export interface BreakevenTargetsOutput {
  rows: BreakevenRow[];
  /** Inputs echoed back for downstream rendering / debugging. */
  meta: {
    targetDscrFloor: number;
    proximityRatio: number;
    annualDebtService: number;
    baseAnoiAnnual: number;
  };
}

/**
 * Classify a row's status. Direction matters: for ADR/Occupancy/RevPAR/Debt-Rate-room
 * /Going-In-Cap, "current better than breakeven" depends on the variable's sign.
 *   - higherIsBetter = true (ADR, Occupancy, RevPAR): current > breakeven ⇒ above.
 *   - higherIsBetter = false (Going-In Cap, Debt Rate, Terminal Cap): current < breakeven ⇒ above.
 */
function classify(
  current: number,
  breakeven: number | null,
  higherIsBetter: boolean,
  proximityRatio: number,
): { status: BreakevenStatus; gap: number | null } {
  if (breakeven === null || !Number.isFinite(breakeven)) {
    return { status: "unsolvable", gap: null };
  }
  const gap = current - breakeven;
  if (current === 0) {
    // No meaningful proximity ratio; just sign.
    return {
      status: higherIsBetter
        ? gap > 0 ? "above" : gap < 0 ? "below" : "close"
        : gap < 0 ? "above" : gap > 0 ? "below" : "close",
      gap,
    };
  }
  const relative = Math.abs(gap) / Math.abs(current);
  if (relative <= proximityRatio) {
    return { status: "close", gap };
  }
  const better = higherIsBetter ? gap > 0 : gap < 0;
  return { status: better ? "above" : "below", gap };
}

/**
 * Solve revenue scale s such that baseAnoi + slope·(s − 1) = annualDS.
 * Returns null when slope is non-positive (revenue does not improve ANOI) or
 * non-finite — those scenarios cannot have a finite breakeven.
 */
function solveRevenueScale(
  baseAnoi: number,
  slope: number,
  annualDS: number,
): number | null {
  if (!Number.isFinite(slope) || slope <= 0) return null;
  if (!Number.isFinite(baseAnoi) || !Number.isFinite(annualDS)) return null;
  // s = 1 + (annualDS − baseAnoi) / slope. Slope > 0 already guarded above.
  const ratio = assertFinite((annualDS - baseAnoi) / slope, "breakeven.revenueScale");
  const s = 1 + ratio;
  // Negative scale means revenue would have to invert; treat as unsolvable.
  if (s <= 0) return null;
  return s;
}

/**
 * Bisect r ∈ [lo, hi] s.t. pmt(loan, r/12, n)·12 = targetAnnualPmt.
 * Returns null when the target is unreachable in the bracket.
 */
function solveBreakevenDebtRate(
  loanAmount: number,
  termMonths: number,
  targetAnnualPmt: number,
): number | null {
  if (!Number.isFinite(loanAmount) || loanAmount <= 0) return null;
  if (!Number.isFinite(termMonths) || termMonths <= 0) return null;
  if (!Number.isFinite(targetAnnualPmt) || targetAnnualPmt <= 0) return null;

  // At r = 0, payment = loanAmount / termMonths · 12. If even the zero-rate
  // payment exceeds the target, no positive rate can reach it. termMonths > 0
  // already guarded above.
  const zeroRateAnnual = assertFinite(
    (loanAmount / termMonths) * 12,
    "breakeven.zeroRate",
  );
  if (zeroRateAnnual > targetAnnualPmt) return null;

  let lo = 0;
  let hi = 0.25; // 25 % annual ceiling — far above any feasible market rate.
  // Sanity: payment at hi must exceed target; otherwise widen once.
  const pmtAtHi = dMul(pmt(loanAmount, hi / 12, termMonths), 12);
  if (!Number.isFinite(pmtAtHi) || pmtAtHi < targetAnnualPmt) {
    return null;
  }

  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    const annualPmt = dMul(pmt(loanAmount, mid / 12, termMonths), 12);
    if (!Number.isFinite(annualPmt)) return null;
    if (Math.abs(annualPmt - targetAnnualPmt) < 0.01) return mid;
    if (annualPmt < targetAnnualPmt) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Solve exitCap such that linearly-interpolated IRR(samples)(exitCap) = 0.
 * Samples must be sorted by exitCap; we sort defensively here.
 * Returns null when no two adjacent samples bracket IRR = 0.
 */
function solveBreakevenTerminalCap(
  samples: readonly BreakevenIrrSample[],
): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((a, b) => a.exitCap - b.exitCap);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!Number.isFinite(a.irr) || !Number.isFinite(b.irr)) continue;
    if ((a.irr >= 0 && b.irr <= 0) || (a.irr <= 0 && b.irr >= 0)) {
      // Linear interp: cap* = a.cap − a.irr · (b.cap − a.cap) / (b.irr − a.irr).
      const denom = b.irr - a.irr;
      if (denom === 0) return a.exitCap;
      const slope = assertFinite(
        (b.exitCap - a.exitCap) / denom,
        "breakeven.terminalCap",
      );
      return a.exitCap - dMul(a.irr, slope);
    }
  }
  return null;
}

export function computeBreakevenTargets(
  input: BreakevenTargetsInput,
): BreakevenTargetsOutput {
  const targetDscrFloor = input.targetDscrFloor ?? BREAKEVEN_TARGET_DSCR_FLOOR;
  const proximityRatio = input.proximityRatio ?? BREAKEVEN_PROXIMITY_RATIO;

  // ── 1. ADR / Occupancy / RevPAR — share the same revenue-scale solve ────
  const revScale = solveRevenueScale(
    input.baseAnoiAnnual,
    input.anoiSlopePerRevenueScale,
    input.annualDebtService,
  );

  const breakevenAdr = revScale === null ? null : dMul(input.currentAdr, revScale);
  const breakevenOcc = revScale === null ? null : dMul(input.currentOccupancy, revScale);
  // RevPAR breakeven uses the same scale; identity proven in module header.
  const currentRevPar = dMul(input.currentAdr, input.currentOccupancy);
  const breakevenRevPar = revScale === null ? null : dMul(currentRevPar, revScale);

  // ── 2. Going-In Cap — closed form using DSCR floor ──────────────────────
  // breakevenCap = (annualDS × dscrFloor) / purchasePrice
  // Interpretation: NOI must be at least DS × DSCR to satisfy the floor;
  // expressed as a cap on the purchase price, that is the minimum yield the
  // deal can tolerate.
  let breakevenGoingInCap: number | null;
  let goingInCapReason: string | undefined;
  if (input.purchasePrice <= 0 || !Number.isFinite(input.purchasePrice)) {
    breakevenGoingInCap = null;
    goingInCapReason = "Purchase price must be positive to imply a cap rate.";
  } else {
    const candidate = assertFinite(
      dMul(input.annualDebtService, targetDscrFloor) / input.purchasePrice,
      "breakeven.goingInCap",
    );
    if (candidate <= 0) {
      breakevenGoingInCap = null;
      goingInCapReason = "Annual debt service is zero or negative — no debt to service.";
    } else {
      breakevenGoingInCap = candidate;
    }
  }

  // ── 3. Debt Rate — PMT inversion against ANOI / DSCR floor ──────────────
  // Maximum annual payment we can afford = baseAnoi / dscrFloor. dscrFloor > 0
  // by constant definition; assertFinite catches any caller-supplied override
  // that happens to be NaN.
  const maxAnnualPmt = assertFinite(
    input.baseAnoiAnnual / targetDscrFloor,
    "breakeven.debtRate.affordable",
  );
  let breakevenDebtRate: number | null;
  let debtRateReason: string | undefined;
  if (!Number.isFinite(maxAnnualPmt) || maxAnnualPmt <= 0) {
    breakevenDebtRate = null;
    debtRateReason = "ANOI is zero or negative; no rate can satisfy the DSCR floor.";
  } else {
    breakevenDebtRate = solveBreakevenDebtRate(
      input.loanAmount,
      input.termMonths,
      maxAnnualPmt,
    );
    if (breakevenDebtRate === null) {
      debtRateReason = "ANOI cannot service the loan even at a zero interest rate.";
    }
  }

  // ── 4. Terminal Cap — IRR=0 interp from samples ────────────────────────
  let breakevenTerminalCap: number | null = null;
  let terminalCapReason: string | undefined;
  if (input.irrSamples && input.irrSamples.length >= 2) {
    breakevenTerminalCap = solveBreakevenTerminalCap(input.irrSamples);
    if (breakevenTerminalCap === null) {
      terminalCapReason = "IRR does not cross zero across the sampled exit caps.";
    } else if (breakevenTerminalCap <= 0) {
      breakevenTerminalCap = null;
      terminalCapReason = "Solved cap is non-positive.";
    }
  } else {
    terminalCapReason = "Terminal cap reverse solve requires at least two IRR samples.";
  }

  // ── Assemble rows ──────────────────────────────────────────────────────
  const adrCls = classify(input.currentAdr, breakevenAdr, true, proximityRatio);
  const occCls = classify(input.currentOccupancy, breakevenOcc, true, proximityRatio);
  const revparCls = classify(currentRevPar, breakevenRevPar, true, proximityRatio);
  // Going-In Cap: a higher current cap = higher Year-1 yield per dollar of
  // purchase price, so current > breakeven is the SAFE side.
  const goingInCls = classify(input.currentGoingInCap, breakevenGoingInCap, true, proximityRatio);
  const debtCls = classify(input.currentDebtRate, breakevenDebtRate, false, proximityRatio);
  const terminalCls = classify(input.currentTerminalCap, breakevenTerminalCap, false, proximityRatio);

  const adrReason = revScale === null
    ? "Revenue does not lift ANOI in the supplied slope; cannot solve."
    : undefined;

  const rows: BreakevenRow[] = [
    {
      key: "adr",
      current: input.currentAdr,
      breakeven: breakevenAdr,
      gap: adrCls.gap,
      status: adrCls.status,
      reason: adrReason,
    },
    {
      key: "occupancy",
      current: input.currentOccupancy,
      breakeven: breakevenOcc,
      gap: occCls.gap,
      status: occCls.status,
      reason: adrReason,
    },
    {
      key: "revpar",
      current: currentRevPar,
      breakeven: breakevenRevPar,
      gap: revparCls.gap,
      status: revparCls.status,
      reason: adrReason,
    },
    {
      key: "goingInCap",
      current: input.currentGoingInCap,
      breakeven: breakevenGoingInCap,
      gap: goingInCls.gap,
      status: goingInCls.status,
      reason: goingInCapReason,
    },
    {
      key: "debtRate",
      current: input.currentDebtRate,
      breakeven: breakevenDebtRate,
      gap: debtCls.gap,
      status: debtCls.status,
      reason: debtRateReason,
    },
    {
      key: "terminalCap",
      current: input.currentTerminalCap,
      breakeven: breakevenTerminalCap,
      gap: terminalCls.gap,
      status: terminalCls.status,
      reason: terminalCapReason,
    },
  ];

  return {
    rows,
    meta: {
      targetDscrFloor,
      proximityRatio,
      annualDebtService: input.annualDebtService,
      baseAnoiAnnual: input.baseAnoiAnnual,
    },
  };
}
