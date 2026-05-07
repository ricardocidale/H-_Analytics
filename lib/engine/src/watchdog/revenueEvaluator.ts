/**
 * revenueEvaluator — pure deterministic evaluator for the Analyst watchdog
 * on the Revenue tab of Company Assumptions.
 *
 * Compares the user's saved Revenue-tab assumptions against cached
 * benchmark ranges (`DEFAULT_REVENUE_BENCHMARKS`) and returns an
 * Analyst-voice verdict + reasoning + preset action buttons.
 * No I/O, no side effects — wholly deterministic.
 *
 * Five dimensions covered (one per benchmark range):
 *   1. Marketing rate (% of total revenue)        — too low = under-investing in CAC
 *   2. F&B revenue share (% of total revenue)     — band check
 *   3. Events revenue share (% of total revenue)  — band check
 *   4. Other revenue share (% of total revenue)   — band check
 *   5. Catering boost on F&B (additive uplift)    — too high = over-stretched assumption
 *
 * Mirrors `capitalRaiseEvaluator.ts` in shape so the save-tab plumbing,
 * dialog UI, and action-button contract stay identical across tabs.
 */
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import type { WatchdogResult, WatchdogSeverity, WatchdogAction } from "./capitalRaiseEvaluator";

export interface RevenueInputs {
  /** Sales & Marketing as % of total revenue (USALI Schedule 4). 0.04 = 4%. */
  marketingRate?: number | null;
  /** F&B revenue as % of total. */
  fbRevenueShare?: number | null;
  /** Events revenue as % of total. */
  eventsRevenueShare?: number | null;
  /** Other operated departments as % of total. */
  otherRevenueShare?: number | null;
  /** Catering boost on top of base F&B (additive uplift). */
  cateringBoostPct?: number | null;
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

const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

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

export function evaluateRevenue(
  inputs: RevenueInputs,
  benchmarks: RevenueBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Marketing rate — under-invest is an alert (luxury depends on direct-booking + brand spend);
  //    over-invest is a soft warn.
  {
    const v = inputs.marketingRate;
    const cls = classify(v, benchmarks.marketingRate.low, benchmarks.marketingRate.high);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "defaultCostRateMarketing",
        bullet: `Marketing at ${fmtPct(v!)} of revenue is below the ${fmtPct(benchmarks.marketingRate.low)}–${fmtPct(benchmarks.marketingRate.high)} band I'd expect for a boutique-luxury operator — direct-booking and brand spend usually need more headroom.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "defaultCostRateMarketing",
        bullet: `Marketing at ${fmtPct(v!)} of revenue runs above the ${fmtPct(benchmarks.marketingRate.low)}–${fmtPct(benchmarks.marketingRate.high)} band — worth confirming the program ROI justifies the spend.`,
      });
    }
  }

  // 2. F&B share — both extremes are warns; F&B mix shapes the cost structure heavily.
  {
    const v = inputs.fbRevenueShare;
    const cls = classify(v, benchmarks.fbRevenueShare.low, benchmarks.fbRevenueShare.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "defaultRevShareFb",
        bullet: `F&B at ${fmtPct(v!)} of revenue sits below the ${fmtPct(benchmarks.fbRevenueShare.low)}–${fmtPct(benchmarks.fbRevenueShare.high)} band for a full-service boutique — light F&B usually means a leaner operating model than the rest of the assumptions imply.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "defaultRevShareFb",
        bullet: `F&B at ${fmtPct(v!)} of revenue is above the ${fmtPct(benchmarks.fbRevenueShare.low)}–${fmtPct(benchmarks.fbRevenueShare.high)} band — make sure cost-of-goods and labor scale with the heavier F&B mix.`,
      });
    }
  }

  // 3. Events share — band check.
  {
    const v = inputs.eventsRevenueShare;
    const cls = classify(v, benchmarks.eventsRevenueShare.low, benchmarks.eventsRevenueShare.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "defaultRevShareEvents",
        bullet: `Events at ${fmtPct(v!)} of revenue is below the ${fmtPct(benchmarks.eventsRevenueShare.low)}–${fmtPct(benchmarks.eventsRevenueShare.high)} band typical for a destination property with active events programming.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "defaultRevShareEvents",
        bullet: `Events at ${fmtPct(v!)} of revenue is above the ${fmtPct(benchmarks.eventsRevenueShare.low)}–${fmtPct(benchmarks.eventsRevenueShare.high)} band — confirm the event-space capacity and bookings calendar support that mix.`,
      });
    }
  }

  // 4. Other revenue share — band check.
  {
    const v = inputs.otherRevenueShare;
    const cls = classify(v, benchmarks.otherRevenueShare.low, benchmarks.otherRevenueShare.high);
    if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "defaultRevShareOther",
        bullet: `Other revenue at ${fmtPct(v!)} is above the ${fmtPct(benchmarks.otherRevenueShare.low)}–${fmtPct(benchmarks.otherRevenueShare.high)} band — spa, retail, parking and similar lines rarely exceed that share for a boutique operator.`,
      });
    }
    // "below" is fine — many operators run no other revenue lines.
  }

  // 5. Catering boost — too high is an alert (compounds F&B and stretches credibility).
  {
    const v = inputs.cateringBoostPct;
    const cls = classify(v, benchmarks.cateringBoostPct.low, benchmarks.cateringBoostPct.high);
    if (cls === "above") {
      findings.push({
        severity: "alert",
        targetField: "defaultCateringBoostPct",
        bullet: `Catering boost of ${fmtPct(v!)} on F&B exceeds the ${fmtPct(benchmarks.cateringBoostPct.low)}–${fmtPct(benchmarks.cateringBoostPct.high)} uplift I'd defend — a number that high needs a signed catering pipeline behind it.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Revenue mix sits inside the bands I'd expect for a boutique-luxury operator.",
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
      label: "Adjust revenue mix",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the revenue mix has a gap I'd want to walk through before you save."
    : "Worth a second look — the revenue mix drifts from what I'd usually recommend for this persona.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}
