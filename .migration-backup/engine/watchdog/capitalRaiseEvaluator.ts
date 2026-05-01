/**
 * capitalRaiseEvaluator — pure deterministic evaluator for the Analyst
 * watchdog on the Funding tab of Company Assumptions.
 *
 * Compares the user's saved Funding-tab assumptions against cached benchmark
 * ranges and returns an Analyst-voice verdict + reasoning + preset action
 * buttons. No I/O, no side effects — wholly deterministic.
 *
 * Five dimensions covered (one for each benchmark range):
 *   1. Runway buffer (months)        — too short = under-raised, too long = over-raised
 *   2. Sizing overshoot (%)          — total raise vs. modeled need
 *   3. Tranche gap (months)          — Tranche 1 → Tranche 2 spacing
 *   4. Revenue ramp delay (months)   — months until properties hit stable rev
 *   5. Burn flex-down headroom (%)   — % of plan burn user could trim if needed
 */
import type { AnalystWatchdogBenchmarks as CapitalRaiseBenchmarks } from "@shared/schema";

export type WatchdogSeverity = "ok" | "warn" | "alert";
export type WatchdogActionKind = "adjust" | "save_anyway" | "ack";

export interface WatchdogAction {
  label: string;
  kind: WatchdogActionKind;
  /** Optional field name the "adjust" action should scroll to/focus. */
  targetField?: string;
}

export interface WatchdogResult {
  severity: WatchdogSeverity;
  /** Single-sentence Analyst-voice headline. */
  verdict: string;
  /** 2–4 supporting bullets in Analyst voice. */
  reasoning: string[];
  /** Preset clickable action buttons (no free text). */
  suggestedActions: WatchdogAction[];
}

/**
 * Inputs the evaluator reads from the saved global assumptions snapshot.
 * All values are optional so the evaluator can run on partial inputs (the
 * absence of a value is treated as "no signal" for that dimension, not an
 * alert).
 */
export interface CapitalRaiseInputs {
  /** Months of runway buffer past the company ops start date. */
  runwayBufferMonths?: number | null;
  /** Total raise size as a fraction above modeled funding need (0.20 = 20% over). */
  sizingOvershootPct?: number | null;
  /** Months between Tranche 1 and Tranche 2 close dates. */
  trancheGapMonths?: number | null;
  /** Months until the portfolio hits stable revenue. */
  revenueRampDelayMonths?: number | null;
  /** Burn flex-down headroom as a fraction of plan burn. */
  burnFlexDownPct?: number | null;
}

interface DimensionFinding {
  severity: WatchdogSeverity;
  bullet: string;
  /** Form field this finding points the user at (used by the Adjust action). */
  targetField?: string;
}

const escalate = (a: WatchdogSeverity, b: WatchdogSeverity): WatchdogSeverity => {
  if (a === "alert" || b === "alert") return "alert";
  if (a === "warn" || b === "warn") return "warn";
  return "ok";
};

const fmtMonths = (n: number) => `${n.toFixed(0)} mo`;
const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`;

function classify(
  value: number | null | undefined,
  low: number,
  high: number,
): "below" | "in" | "above" | "missing" {
  if (value == null || !Number.isFinite(value)) return "missing";
  if (value < low) return "below";
  if (value > high) return "above";
  return "in";
}

export function evaluateCapitalRaise(
  inputs: CapitalRaiseInputs,
  benchmarks: CapitalRaiseBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Runway buffer
  {
    const v = inputs.runwayBufferMonths;
    const cls = classify(v, benchmarks.runwayBufferMonthsLow, benchmarks.runwayBufferMonthsHigh);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "capitalRaise1Amount",
        bullet: `Runway buffer is ${fmtMonths(v!)} — below the ${fmtMonths(benchmarks.runwayBufferMonthsLow)}–${fmtMonths(benchmarks.runwayBufferMonthsHigh)} cushion I'd want before the next milestone.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "capitalRaise1Amount",
        bullet: `Runway buffer is ${fmtMonths(v!)} — that's a longer cushion than the ${fmtMonths(benchmarks.runwayBufferMonthsLow)}–${fmtMonths(benchmarks.runwayBufferMonthsHigh)} I usually see; you may be over-raising.`,
      });
    }
  }

  // 2. Sizing overshoot
  {
    const v = inputs.sizingOvershootPct;
    const cls = classify(v, benchmarks.sizingOvershootPctLow, benchmarks.sizingOvershootPctHigh);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "capitalRaise2Amount",
        bullet: `Sizing overshoot of ${fmtPct(v!)} sits below my ${fmtPct(benchmarks.sizingOvershootPctLow)}–${fmtPct(benchmarks.sizingOvershootPctHigh)} guidance — there's little slack for slippage.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "capitalRaise2Amount",
        bullet: `Sizing overshoot of ${fmtPct(v!)} is above the ${fmtPct(benchmarks.sizingOvershootPctLow)}–${fmtPct(benchmarks.sizingOvershootPctHigh)} guidance — extra dilution worth justifying.`,
      });
    }
  }

  // 3. Tranche gap
  {
    const v = inputs.trancheGapMonths;
    const cls = classify(v, benchmarks.trancheGapMonthsLow, benchmarks.trancheGapMonthsHigh);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "capitalRaise2Date",
        bullet: `Tranche gap of ${fmtMonths(v!)} is tighter than the ${fmtMonths(benchmarks.trancheGapMonthsLow)}–${fmtMonths(benchmarks.trancheGapMonthsHigh)} window — Tranche 2 may close before milestones de-risk it.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "alert",
        targetField: "capitalRaise2Date",
        bullet: `Tranche gap of ${fmtMonths(v!)} exceeds the ${fmtMonths(benchmarks.trancheGapMonthsLow)}–${fmtMonths(benchmarks.trancheGapMonthsHigh)} window — risk of running dry between tranches.`,
      });
    }
  }

  // 4. Revenue ramp delay
  {
    const v = inputs.revenueRampDelayMonths;
    const cls = classify(v, benchmarks.revenueRampDelayMonthsLow, benchmarks.revenueRampDelayMonthsHigh);
    if (cls === "above") {
      findings.push({
        severity: "alert",
        bullet: `Revenue ramp delay of ${fmtMonths(v!)} is longer than the ${fmtMonths(benchmarks.revenueRampDelayMonthsLow)}–${fmtMonths(benchmarks.revenueRampDelayMonthsHigh)} I expect — burn extends before revenue catches up.`,
      });
    } else if (cls === "below") {
      findings.push({
        severity: "warn",
        bullet: `Revenue ramp delay of ${fmtMonths(v!)} is faster than my ${fmtMonths(benchmarks.revenueRampDelayMonthsLow)}–${fmtMonths(benchmarks.revenueRampDelayMonthsHigh)} expectation — make sure the ramp assumption is grounded.`,
      });
    }
  }

  // 5. Burn flex-down
  {
    const v = inputs.burnFlexDownPct;
    const cls = classify(v, benchmarks.burnFlexDownPctLow, benchmarks.burnFlexDownPctHigh);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        bullet: `Burn flex-down headroom of ${fmtPct(v!)} sits below the ${fmtPct(benchmarks.burnFlexDownPctLow)}–${fmtPct(benchmarks.burnFlexDownPctHigh)} cushion — limited room to extend runway if revenue slips.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        bullet: `Burn flex-down headroom of ${fmtPct(v!)} is unusually high — confirm the plan burn isn't already padded.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Funding plan looks well within the range I'd expect.",
      reasoning: [],
      suggestedActions: [],
    };
  }

  const severity = findings.reduce<WatchdogSeverity>((acc, f) => escalate(acc, f.severity), "ok");
  const reasoning = findings.slice(0, 4).map((f) => f.bullet);

  // Find the most actionable adjust target — prefer the first alert, else first warn.
  const adjustTarget =
    findings.find((f) => f.severity === "alert" && f.targetField)?.targetField ??
    findings.find((f) => f.targetField)?.targetField;

  const actions: WatchdogAction[] = [];
  if (adjustTarget) {
    actions.push({
      label: adjustTarget === "capitalRaise1Amount"
        ? "Adjust Capital Raise 1"
        : adjustTarget === "capitalRaise2Amount" || adjustTarget === "capitalRaise2Date"
          ? "Adjust Capital Raise 2"
          : "Adjust funding plan",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the funding plan has a gap I'd want to walk through before you save."
    : "Worth a second look — the funding plan drifts from what I'd usually recommend.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}

/**
 * Stub evaluator used by the 5 non-Funding tabs. Always returns "ok" — exists
 * so the Save → evaluate → maybe-show-dialog plumbing is exercised
 * identically across all tabs and a future task can swap each stub for a real
 * benchmark-backed evaluator.
 */
export function evaluateStub(): WatchdogResult {
  return {
    severity: "ok",
    verdict: "No watchdog rules configured for this tab yet.",
    reasoning: [],
    suggestedActions: [],
  };
}
