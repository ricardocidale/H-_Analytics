/**
 * overheadEvaluator — pure deterministic evaluator for the Analyst watchdog
 * on the Overhead tab of Company Assumptions.
 *
 * Compares the user's saved Overhead-tab assumptions against cached benchmark
 * ranges (`DEFAULT_OVERHEAD_BENCHMARKS`) and returns an Analyst-voice verdict
 * + reasoning + preset action buttons. No I/O, no side effects — wholly
 * deterministic.
 *
 * Six dimensions covered (all USD):
 *   Fixed (annual, escalate at CPI):
 *     1. Office lease            — corporate office rent + utilities
 *     2. Professional services   — legal + accounting + audit
 *     3. Tech infrastructure     — corporate tech (cloud, security, IT support)
 *     4. Business insurance      — D&O / E&O / cyber for the ManCo
 *   Variable per-property (× active property count):
 *     5. Travel cost per client  — site visits, owner meetings, brand audits
 *     6. IT licensing per client — PMS, RM, channel manager, accounting integration
 *
 * Mirrors `compensationEvaluator.ts` and `revenueEvaluator.ts` in shape so the
 * save-tab plumbing, dialog UI, and action-button contract stay identical
 * across tabs.
 */
import type { OverheadBenchmarks } from "@norfolk/shared/constants-overhead-benchmarks";
import type { WatchdogResult, WatchdogSeverity, WatchdogAction } from "./capitalRaiseEvaluator";

export interface OverheadInputs {
  /** Annual office lease + utilities (USD). */
  officeLeaseStart?: number | null;
  /** Annual legal + accounting + audit (USD). */
  professionalServicesStart?: number | null;
  /** Annual corporate tech infrastructure (USD). */
  techInfraStart?: number | null;
  /** Annual business insurance — D&O/E&O/cyber for the ManCo (USD). */
  businessInsuranceStart?: number | null;
  /** Annual travel cost per managed property (USD). */
  travelCostPerClient?: number | null;
  /** Annual IT/licensing cost per managed property (USD). */
  itLicensePerClient?: number | null;
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

export function evaluateOverhead(
  inputs: OverheadInputs,
  benchmarks: OverheadBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Office lease — too low usually means founders are working out of a
  //    co-working space or home office (LPs notice); too high signals
  //    over-investment in real estate vs. portfolio scale.
  {
    const v = inputs.officeLeaseStart;
    const cls = classify(v, benchmarks.officeLeaseStart.low, benchmarks.officeLeaseStart.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "officeLeaseStart",
        bullet: `Office lease of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.officeLeaseStart.low)}–${fmtUsd(benchmarks.officeLeaseStart.high)} corporate-office band — fine if you're operating remote-first, but LPs will ask where the team meets.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "officeLeaseStart",
        bullet: `Office lease of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.officeLeaseStart.low)}–${fmtUsd(benchmarks.officeLeaseStart.high)} band — confirm the office footprint matches the portfolio scale before LPs flag it as overhead bloat.`,
      });
    }
  }

  // 2. Professional services — under-budgeting legal/audit is the classic
  //    early-stage trap; over-spending often signals undisciplined retainers.
  {
    const v = inputs.professionalServicesStart;
    const cls = classify(v, benchmarks.professionalServicesStart.low, benchmarks.professionalServicesStart.high);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "professionalServicesStart",
        bullet: `Professional services of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.professionalServicesStart.low)}–${fmtUsd(benchmarks.professionalServicesStart.high)} band — under-budgeting legal + audit is the classic early-stage trap and tends to break the assumption when the first audit lands.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "professionalServicesStart",
        bullet: `Professional services of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.professionalServicesStart.low)}–${fmtUsd(benchmarks.professionalServicesStart.high)} band — confirm the retainer mix justifies the premium before it compounds.`,
      });
    }
  }

  // 3. Tech infrastructure — corporate-level (distinct from per-property IT).
  {
    const v = inputs.techInfraStart;
    const cls = classify(v, benchmarks.techInfraStart.low, benchmarks.techInfraStart.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "techInfraStart",
        bullet: `Tech infrastructure of ${fmtUsd(v!)} is below the ${fmtUsd(benchmarks.techInfraStart.low)}–${fmtUsd(benchmarks.techInfraStart.high)} band — corporate-level cloud + cybersecurity tends to scale faster than founders model in Year 1.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "techInfraStart",
        bullet: `Tech infrastructure of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.techInfraStart.low)}–${fmtUsd(benchmarks.techInfraStart.high)} band — verify the corporate IT load distinct from per-property licensing isn't double-counted.`,
      });
    }
  }

  // 4. Business insurance — D&O / E&O / cyber. Under-insured ManCo is
  //    a personal-liability exposure for partners; LPs scrutinise this.
  {
    const v = inputs.businessInsuranceStart;
    const cls = classify(v, benchmarks.businessInsuranceStart.low, benchmarks.businessInsuranceStart.high);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "businessInsuranceStart",
        bullet: `Business insurance of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.businessInsuranceStart.low)}–${fmtUsd(benchmarks.businessInsuranceStart.high)} band — under-insured D&O/E&O/cyber leaves partners personally exposed and LPs will ask why.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "businessInsuranceStart",
        bullet: `Business insurance of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.businessInsuranceStart.low)}–${fmtUsd(benchmarks.businessInsuranceStart.high)} band — confirm the policy stack isn't carrying coverage the operator can rely on at the property level.`,
      });
    }
  }

  // 5. Travel cost per client — scales with portfolio.
  {
    const v = inputs.travelCostPerClient;
    const cls = classify(v, benchmarks.travelCostPerClient.low, benchmarks.travelCostPerClient.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "travelCostPerClient",
        bullet: `Travel cost per client of ${fmtUsd(v!)} sits below the ${fmtUsd(benchmarks.travelCostPerClient.low)}–${fmtUsd(benchmarks.travelCostPerClient.high)} band — light site-visit budgets usually mask either remote-first ops or thin owner relationships.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "travelCostPerClient",
        bullet: `Travel cost per client of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.travelCostPerClient.low)}–${fmtUsd(benchmarks.travelCostPerClient.high)} band — at portfolio scale this compounds; confirm the site-visit cadence justifies the premium.`,
      });
    }
  }

  // 6. IT licensing per client — PMS + RM + channel manager + accounting.
  {
    const v = inputs.itLicensePerClient;
    const cls = classify(v, benchmarks.itLicensePerClient.low, benchmarks.itLicensePerClient.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "itLicensePerClient",
        bullet: `IT licensing per client of ${fmtUsd(v!)} is below the ${fmtUsd(benchmarks.itLicensePerClient.low)}–${fmtUsd(benchmarks.itLicensePerClient.high)} band — boutique-luxury operators usually carry richer revenue-management + channel tooling than this implies.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "itLicensePerClient",
        bullet: `IT licensing per client of ${fmtUsd(v!)} runs above the ${fmtUsd(benchmarks.itLicensePerClient.low)}–${fmtUsd(benchmarks.itLicensePerClient.high)} band — verify the per-property tech stack isn't overlapping with corporate tech infrastructure.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Overhead plan sits inside the bands I'd expect for a boutique-luxury management company.",
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
      label: "Adjust overhead",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the overhead plan has a gap I'd want to walk through before you save."
    : "Worth a second look — the overhead plan drifts from what I'd usually recommend at this stage.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}
