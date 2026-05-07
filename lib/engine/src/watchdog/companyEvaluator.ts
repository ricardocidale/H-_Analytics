/**
 * companyEvaluator — pure deterministic evaluator for the Analyst watchdog
 * on the Company defaults surface (Admin → Model Defaults → Company tab).
 *
 * Compares the user's saved management-company defaults against cached
 * benchmark ranges (`DEFAULT_COMPANY_BENCHMARKS`) and returns an
 * Analyst-voice verdict + reasoning + preset action buttons.
 * No I/O, no side effects — wholly deterministic.
 *
 * Four dimensions covered (all rate-based):
 *   1. baseManagementFee          — % of total property revenue
 *   2. incentiveManagementFee     — % of Gross Operating Profit (GOP)
 *   3. companyTaxRate             — effective combined corporate tax rate
 *   4. costOfEquity               — WACC Re / DCF hurdle
 *
 * Mirrors `overheadEvaluator.ts` and `compensationEvaluator.ts` in shape so
 * the save-tab plumbing, dialog UI, and action-button contract stay identical.
 */
import type { CompanyBenchmarks } from "@norfolk/shared/constants-company-benchmarks";
import type { WatchdogResult, WatchdogSeverity, WatchdogAction } from "./capitalRaiseEvaluator";

export interface CompanyInputs {
  /** Base management fee as a fraction (e.g. 0.08 = 8% of revenue). */
  baseManagementFee?: number | null;
  /** Incentive management fee as a fraction (e.g. 0.10 = 10% of GOP). */
  incentiveManagementFee?: number | null;
  /** Effective combined corporate income tax rate as a fraction. */
  companyTaxRate?: number | null;
  /** Cost of equity / DCF Re as a fraction. */
  costOfEquity?: number | null;
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

export function evaluateCompany(
  inputs: CompanyInputs,
  benchmarks: CompanyBenchmarks,
): WatchdogResult {
  const findings: DimensionFinding[] = [];

  // 1. Base management fee — standard LP scrutiny range.
  {
    const v = inputs.baseManagementFee;
    const cls = classify(v, benchmarks.baseManagementFee.low, benchmarks.baseManagementFee.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "baseManagementFee",
        bullet: `Base fee of ${fmtPct(v!)} sits below the ${fmtPct(benchmarks.baseManagementFee.low)}–${fmtPct(benchmarks.baseManagementFee.high)} boutique-luxury operator range — confirm the fee structure still covers corporate overhead at projected portfolio revenue.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "baseManagementFee",
        bullet: `Base fee of ${fmtPct(v!)} runs above the ${fmtPct(benchmarks.baseManagementFee.low)}–${fmtPct(benchmarks.baseManagementFee.high)} band — LPs will compare to branded operators; a premium needs a matching value proposition.`,
      });
    }
  }

  // 2. Incentive management fee — GOP-based performance alignment.
  {
    const v = inputs.incentiveManagementFee;
    const cls = classify(v, benchmarks.incentiveManagementFee.low, benchmarks.incentiveManagementFee.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "incentiveManagementFee",
        bullet: `Incentive fee of ${fmtPct(v!)} is below the ${fmtPct(benchmarks.incentiveManagementFee.low)}–${fmtPct(benchmarks.incentiveManagementFee.high)} band — a low GOP kicker reduces alignment signals; LPs often read it as the operator not backing their own performance projections.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "incentiveManagementFee",
        bullet: `Incentive fee of ${fmtPct(v!)} runs above the ${fmtPct(benchmarks.incentiveManagementFee.low)}–${fmtPct(benchmarks.incentiveManagementFee.high)} band — at the high end, LPs will model the operator earning more in good years than the equity sponsor net of promote; be ready for that question.`,
      });
    }
  }

  // 3. Company tax rate — effective combined rate, not statutory.
  {
    const v = inputs.companyTaxRate;
    const cls = classify(v, benchmarks.companyTaxRate.low, benchmarks.companyTaxRate.high);
    if (cls === "below") {
      findings.push({
        severity: "warn",
        targetField: "companyTaxRate",
        bullet: `Tax rate of ${fmtPct(v!)} is below the US federal floor of ${fmtPct(benchmarks.companyTaxRate.low)} — verify the company is structured and domiciled to justify a sub-federal rate before this lands in an LP data room.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "companyTaxRate",
        bullet: `Tax rate of ${fmtPct(v!)} exceeds the ${fmtPct(benchmarks.companyTaxRate.high)} combined-rate benchmark — confirm the blended state + federal computation; over-accruing tax understates distributable cash.`,
      });
    }
  }

  // 4. Cost of equity — WACC Re / DCF hurdle. Too low → misleads IRR
  //    comps; too high → unfairly discounts future cash flows.
  {
    const v = inputs.costOfEquity;
    const cls = classify(v, benchmarks.costOfEquity.low, benchmarks.costOfEquity.high);
    if (cls === "below") {
      findings.push({
        severity: "alert",
        targetField: "costOfEquity",
        bullet: `Cost of equity of ${fmtPct(v!)} sits below the ${fmtPct(benchmarks.costOfEquity.low)}–${fmtPct(benchmarks.costOfEquity.high)} hospitality range — a low Re inflates the DCF and WACC; institutional LPs will re-underwrite with their own hurdle and your projected returns will look materially weaker.`,
      });
    } else if (cls === "above") {
      findings.push({
        severity: "warn",
        targetField: "costOfEquity",
        bullet: `Cost of equity of ${fmtPct(v!)} is above the ${fmtPct(benchmarks.costOfEquity.low)}–${fmtPct(benchmarks.costOfEquity.high)} band — a high Re is conservative but make sure it's consistent with the IRR target in the business plan.`,
      });
    }
  }

  if (findings.length === 0) {
    return {
      severity: "ok",
      verdict: "Company fee structure and financial defaults sit inside the ranges I'd expect for this operator type.",
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
      label: "Adjust company defaults",
      kind: "adjust",
      targetField: adjustTarget,
    });
  }
  actions.push({ label: "Got it", kind: "ack" });
  actions.push({ label: "Save Anyway", kind: "save_anyway" });

  const verdict = severity === "alert"
    ? "Hold on — the company defaults have a gap I'd want to walk through before you save."
    : "Worth a second look — the company defaults drift from what I'd usually recommend at this stage.";

  return { severity, verdict, reasoning, suggestedActions: actions };
}
