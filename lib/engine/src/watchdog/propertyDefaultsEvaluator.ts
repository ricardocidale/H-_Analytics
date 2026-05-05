/**
 * propertyDefaultsEvaluator — pure deterministic evaluator for the Analyst
 * watchdog on the Property Defaults surface (Admin → Model Defaults →
 * Property Underwriting tab).
 *
 * Compares the admin's saved property-underwriting defaults against cached
 * benchmark ranges (`DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS`) and returns an
 * Analyst-voice verdict + reasoning + preset action buttons.
 * No I/O, no side effects — wholly deterministic.
 *
 * Four dimensions covered (all rate-based fractions):
 *   1. eventExpenseRate       — event/banquet cost as fraction of event revenue
 *   2. otherExpenseRate       — other/ancillary cost as fraction of other revenue
 *   3. utilitiesVariableSplit — fraction of utilities that vary with occupancy
 *   4. salesCommissionRate    — blended distribution/OTA commission fraction
 *
 * Mirrors `companyEvaluator.ts` and `overheadEvaluator.ts` in shape so the
 * save-tab plumbing, dialog UI, and action-button contract stay identical.
 */
import type { PropertyDefaultsBenchmarks } from "@norfolk/shared/constants-property-defaults-benchmarks";
import type { WatchdogResult, WatchdogSeverity, WatchdogAction } from "./capitalRaiseEvaluator";

export interface PropertyDefaultsInputs {
  /** Event/banquet cost as a fraction of event revenue (e.g. 0.65 = 65%). */
  eventExpenseRate?: number | null;
  /** Other/ancillary cost as a fraction of other revenue (e.g. 0.60 = 60%). */
  otherExpenseRate?: number | null;
  /** Fraction of total utilities treated as variable (occupancy-dependent). */
  utilitiesVariableSplit?: number | null;
  /** Blended distribution/OTA commission as a fraction of total revenue. */
  salesCommissionRate?: number | null;
}

interface DimensionFinding {
  severity: WatchdogSeverity;
  bullet: string;
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

export function evaluatePropertyDefaults(
  inputs: PropertyDefaultsInputs,
  benchmarks: PropertyDefaultsBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Event expense rate — banquet/event cost ratio.
  {
    const v = inputs.eventExpenseRate;
    const b = benchmarks.eventExpenseRate;
    const cls = classify(v, b.low, b.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "eventExpenseRate",
        bullet: `Event expense rate of ${fmtPct(v!)} is below the ${fmtPct(b.low)}–${fmtPct(b.high)} boutique-luxury range — a very low cost ratio may understate staffing and food cost in the event P&L; new properties will seed an optimistic event margin.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "eventExpenseRate",
        bullet: `Event expense rate of ${fmtPct(v!)} exceeds the ${fmtPct(b.low)}–${fmtPct(b.high)} band — high event cost ratios erode the ancillary revenue contribution; new properties will seed a conservative event P&L.`,
      });
    }
  }

  // 2. Other expense rate — other/ancillary revenue cost ratio.
  {
    const v = inputs.otherExpenseRate;
    const b = benchmarks.otherExpenseRate;
    const cls = classify(v, b.low, b.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "otherExpenseRate",
        bullet: `Other expense rate of ${fmtPct(v!)} sits below the ${fmtPct(b.low)}–${fmtPct(b.high)} range — an unusually lean cost ratio for ancillary revenue; confirm the default reflects your operator's actual departmental structure.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "otherExpenseRate",
        bullet: `Other expense rate of ${fmtPct(v!)} runs above the ${fmtPct(b.low)}–${fmtPct(b.high)} band — new properties will seed with a high other-revenue cost ratio that may suppress total GOP margin across the portfolio.`,
      });
    }
  }

  // 3. Utilities variable split — fraction variable vs. fixed.
  {
    const v = inputs.utilitiesVariableSplit;
    const b = benchmarks.utilitiesVariableSplit;
    const cls = classify(v, b.low, b.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "utilitiesVariableSplit",
        bullet: `Utilities variable split of ${fmtPct(v!)} is below the ${fmtPct(b.low)}–${fmtPct(b.high)} range — treating most utilities as fixed understates the occupancy-driven cost swing; the engine will under-model utilities at high occupancy.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "utilitiesVariableSplit",
        bullet: `Utilities variable split of ${fmtPct(v!)} exceeds the ${fmtPct(b.low)}–${fmtPct(b.high)} band — treating nearly all utilities as variable overstates the occupancy link; base-load costs (mechanical, lighting) are fixed regardless of occupancy.`,
      });
    }
  }

  // 4. Sales commission rate — blended distribution/OTA commission.
  {
    const v = inputs.salesCommissionRate;
    const b = benchmarks.salesCommissionRate;
    const cls = classify(v, b.low, b.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "salesCommissionRate",
        bullet: `Sales commission rate of ${fmtPct(v!)} sits below the ${fmtPct(b.low)}–${fmtPct(b.high)} range — a very low blended rate may understate the cost of OTA and channel distribution; new properties will seed with an optimistic distribution margin.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "alert",
        targetField: "salesCommissionRate",
        bullet: `Sales commission rate of ${fmtPct(v!)} exceeds the ${fmtPct(b.high)} boutique-luxury ceiling — a high blended commission materially erodes RevPAR net; LPs will notice the distribution drag in the property P&L.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Property underwriting defaults sit inside the ranges I'd expect for this operator type.",
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
      label: "Adjust property defaults",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the property underwriting defaults have a gap I'd want to walk through before you save."
    : "Worth a second look — the property underwriting defaults drift from what I'd usually recommend at this stage.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}
