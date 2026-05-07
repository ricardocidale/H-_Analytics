/**
 * compensationEvaluator — pure deterministic evaluator for the Analyst
 * watchdog on the Compensation tab of Company Assumptions.
 *
 * Compares the user's saved Compensation-tab assumptions against cached
 * benchmark ranges (`DEFAULT_COMPENSATION_BENCHMARKS`) and returns an
 * Analyst-voice verdict + reasoning + preset action buttons. No I/O, no
 * side effects — wholly deterministic.
 *
 * Five dimensions covered:
 *   1. Partner comp Year 1 (USD/yr)        — under = lean founders, over = early dilution
 *   2. Partner comp Year 10 (USD/yr)       — terminal trajectory check
 *   3. Partner count Year 1                — founding team size
 *   4. Staff salary (USD/yr)               — talent retention vs. burn
 *   5. Tier-3 FTE                          — max-scale staffing model
 *
 * Mirrors `revenueEvaluator.ts` in shape so the save-tab plumbing, dialog
 * UI, and action-button contract stay identical across tabs.
 */
import type { CompensationBenchmarks } from "@norfolk/shared/constants-compensation-benchmarks";
import type { WatchdogResult, WatchdogSeverity, WatchdogAction } from "./capitalRaiseEvaluator";

export interface CompensationInputs {
  /** Year 1 total management compensation (annual USD). */
  partnerCompYear1?: number | null;
  /** Year 10 total management compensation (annual USD). */
  partnerCompYear10?: number | null;
  /** Year 1 partner headcount. */
  partnerCountYear1?: number | null;
  /** Average annual salary per FTE (USD). */
  staffSalary?: number | null;
  /** Tier-3 FTE count (max-scale staffing model). */
  staffTier3Fte?: number | null;
}

interface DimensionFinding {
  severity: WatchdogSeverity;
  bullet: string;
  /** Form field this finding points the user at. */
  targetField?: string;
}

const escalate = (a: WatchdogSeverity, b: WatchdogSeverity): WatchdogSeverity => {
  if (a === "alert" || b === "alert") return "alert";
  if (a === "warn" || b === "warn") return "warn";
  return "ok";
};

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtFte = (n: number) => `${n.toFixed(1)} FTE`;
const fmtCount = (n: number) => `${n.toFixed(0)}`;

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

export function evaluateCompensation(
  inputs: CompensationInputs,
  benchmarks: CompensationBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Partner comp Year 1 — too low = founders under-paying themselves
  //    (retention risk); too high = early-stage dilution & LP pushback.
  {
    const v = inputs.partnerCompYear1;
    const cls = classify(v, benchmarks.partnerCompYear1.low, benchmarks.partnerCompYear1.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "partnerCompYear1",
        bullet: `Year 1 management compensation of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.partnerCompYear1.low)}–${fmtUsd(benchmarks.partnerCompYear1.high)} band — lean founder draws can read as commitment, but they also flag retention risk.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "alert",
        targetField: "partnerCompYear1",
        bullet: `Year 1 management compensation of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.partnerCompYear1.low)}–${fmtUsd(benchmarks.partnerCompYear1.high)} band — LPs will scrutinise that level of partner pay before fee revenue ramps.`,
      });
    }
  }

  // 2. Partner comp Year 10 — terminal trajectory.
  //    Too low = unrealistic for institutional scale; too high = optimistic mgmt-co revenue.
  {
    const v = inputs.partnerCompYear10;
    const cls = classify(v, benchmarks.partnerCompYear10.low, benchmarks.partnerCompYear10.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "partnerCompYear10",
        bullet: `Year 10 management compensation of ${fmtUsd(v!)} is below the ${fmtUsd(benchmarks.partnerCompYear10.low)}–${fmtUsd(benchmarks.partnerCompYear10.high)} terminal range — the trajectory may be too flat for an institutional-scale platform.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "partnerCompYear10",
        bullet: `Year 10 management compensation of ${fmtUsd(v!)} exceeds the ${fmtUsd(benchmarks.partnerCompYear10.low)}–${fmtUsd(benchmarks.partnerCompYear10.high)} terminal range — confirm that mgmt-co revenue supports the partner-comp share at scale.`,
      });
    }
  }

  // 3. Partner count Year 1 — founding team size.
  {
    const v = inputs.partnerCountYear1;
    const cls = classify(v, benchmarks.partnerCountYear1.low, benchmarks.partnerCountYear1.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "partnerCountYear1",
        bullet: `Year 1 partner count of ${fmtCount(v!)} is below the ${fmtCount(benchmarks.partnerCountYear1.low)}–${fmtCount(benchmarks.partnerCountYear1.high)} typical founding team — single-founder ops carry key-person risk that LPs will want priced.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "partnerCountYear1",
        bullet: `Year 1 partner count of ${fmtCount(v!)} is above the ${fmtCount(benchmarks.partnerCountYear1.low)}–${fmtCount(benchmarks.partnerCountYear1.high)} typical founding team — heavy founding cap-table dilutes incentive alignment.`,
      });
    }
  }

  // 4. Staff salary — talent retention vs. burn balance.
  {
    const v = inputs.staffSalary;
    const cls = classify(v, benchmarks.staffSalary.low, benchmarks.staffSalary.high);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "staffSalary",
        bullet: `Average staff salary of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.staffSalary.low)}–${fmtUsd(benchmarks.staffSalary.high)} hospitality market band — under-pricing labour usually breaks the assumption when retention slips.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "staffSalary",
        bullet: `Average staff salary of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.staffSalary.low)}–${fmtUsd(benchmarks.staffSalary.high)} band — confirm the role mix justifies the premium before it compounds with the FTE tiers.`,
      });
    }
  }

  // 5. Tier-3 FTE — max-scale staffing model. Too high inflates burn at scale;
  //    too low signals understaffed institutional ops.
  {
    const v = inputs.staffTier3Fte;
    const cls = classify(v, benchmarks.staffTier3Fte.low, benchmarks.staffTier3Fte.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "staffTier3Fte",
        bullet: `Tier-3 staffing of ${fmtFte(v!)} is below the ${fmtFte(benchmarks.staffTier3Fte.low)}–${fmtFte(benchmarks.staffTier3Fte.high)} band for an institutional-scale platform — the operating capacity may not match the portfolio assumption.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "staffTier3Fte",
        bullet: `Tier-3 staffing of ${fmtFte(v!)} is above the ${fmtFte(benchmarks.staffTier3Fte.low)}–${fmtFte(benchmarks.staffTier3Fte.high)} band — the FTE load at scale will compound staff-salary burn meaningfully.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Compensation plan sits inside the bands I'd expect for a boutique-luxury management company.",
      reasoning: [],
      suggestedActions: [],
    };
  }

  const severity = findings.reduce<WatchdogSeverity>((acc, f) => escalate(acc, f.severity), "ok");
  const reasoning = findings.slice(0, 4).map((f) => f.bullet);

  const adjustTarget =
    findings.find((f) => f.severity === "alert" && f.targetField)?.targetField ??
    findings.find((f) => f.targetField)?.targetField;

  const actions: WatchdogAction[] = [];
  if (adjustTarget) {
    actions.push({
      label: "Adjust compensation",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the compensation plan has a gap I'd want to walk through before you save."
    : "Worth a second look — the compensation plan drifts from what I'd usually recommend at this stage.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}
