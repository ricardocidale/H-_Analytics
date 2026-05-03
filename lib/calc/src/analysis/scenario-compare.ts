/**
 * calc/analysis/scenario-compare.ts — Side-by-side scenario comparison engine.
 *
 * PURPOSE:
 * Compares two model scenarios (baseline vs. alternative) across all key financial
 * metrics: IRR, equity multiple, NOI, cash flow, and exit value. This enables
 * "what-if" analysis — e.g., "What happens to returns if we assume 5% ADR growth
 * instead of 3%?" or "How does a 50 bps rate increase affect our IRR?"
 *
 * COMPARISON OUTPUTS:
 *
 * 1. SUMMARY METRICS:
 *    - irr_delta: Change in IRR in basis points (positive = improvement).
 *    - equity_multiple_delta: Change in equity multiple (e.g., +0.15×).
 *    - cumulative_noi_delta: Total NOI difference over the projection period.
 *    - exit_value_delta: Difference in terminal sale price.
 *
 * 2. YEARLY DELTAS:
 *    Year-by-year differences in revenue, NOI, net income, and cash balance.
 *    This shows WHEN the scenarios diverge and how the gap compounds over time.
 *
 * 3. RISK FLAGS:
 *    Automatically generated warnings when the alternative scenario introduces
 *    new risks not present in the baseline:
 *    - Negative cash in a year where the baseline was positive.
 *    - Negative NOI in a year where the baseline was positive.
 *    - IRR decrease exceeding 200 bps.
 *
 * 4. SENSITIVITY RANKING:
 *    If multiple assumptions changed simultaneously, this distributes the total
 *    IRR impact evenly across the changed assumptions (a rough approximation —
 *    true sensitivity analysis requires one-at-a-time variation).
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "scenario_compare" skill. The UI uses this
 * to power the scenario comparison view where users toggle between base case,
 * upside, and downside assumptions.
 */
import { roundCents, sumArray, pctChange } from "../shared/utils.js";

export interface ScenarioMetrics {
  total_revenue?: number[];
  gop?: number[];
  agop?: number[];
  noi: number[];
  anoi?: number[];
  net_income?: number[];
  ending_cash?: number[];
  irr: number;
  mirr?: number;
  equity_multiple?: number;
  average_dscr?: number;
  exit_value?: number;
}

export interface ScenarioCompareInput {
  baseline_label: string;
  alternative_label: string;
  assumption_changes?: Array<{
    field: string;
    baseline_value: string;
    alternative_value: string;
  }>;
  baseline_metrics: ScenarioMetrics;
  alternative_metrics: ScenarioMetrics;
}

export interface ScenarioCompareOutput {
  summary: {
    irr_delta: number;
    mirr_delta: number;
    irr_direction: "improved" | "worsened" | "unchanged";
    equity_multiple_delta: number;
    cumulative_noi_delta: number;
    cumulative_noi_pct_change: number;
    exit_value_delta: number;
  };
  yearly_deltas: Array<{
    year: number;
    revenue_delta: number;
    gop_delta?: number;
    agop_delta?: number;
    noi_delta: number;
    anoi_delta?: number;
    net_income_delta: number;
    cash_delta: number;
  }>;
  risk_flags: string[];
  sensitivity_ranking: Array<{
    assumption: string;
    impact_on_irr_bps: number;
  }>;
}

export function compareScenarios(input: ScenarioCompareInput): ScenarioCompareOutput {
  const b = input.baseline_metrics;
  const a = input.alternative_metrics;

  const irr_delta = Math.round((a.irr - b.irr) * 10000);
  const mirr_delta = Math.round(((a.mirr ?? 0) - (b.mirr ?? 0)) * 10000);

  let irr_direction: "improved" | "worsened" | "unchanged";
  if (Math.abs(irr_delta) < 1) irr_direction = "unchanged";
  else if (irr_delta > 0) irr_direction = "improved";
  else irr_direction = "worsened";

  const equity_multiple_delta = (a.equity_multiple ?? 0) - (b.equity_multiple ?? 0);
  const exit_value_delta = (a.exit_value ?? 0) - (b.exit_value ?? 0);

  const baseNOI = sumArray(b.noi);
  const altNOI = sumArray(a.noi);
  const cumulative_noi_delta = roundCents(altNOI - baseNOI);
  const cumulative_noi_pct_change = pctChange(baseNOI, altNOI);

  const years = Math.max(b.noi.length, a.noi.length);
  const yearly_deltas: Array<{
    year: number; revenue_delta: number; gop_delta: number; agop_delta: number;
    noi_delta: number; anoi_delta: number; net_income_delta: number; cash_delta: number;
  }> = [];
  const risk_flags: string[] = [];

  for (let y = 0; y < years; y++) {
    const bRev = b.total_revenue?.[y] ?? 0;
    const aRev = a.total_revenue?.[y] ?? 0;
    const bGOP = b.gop?.[y] ?? 0;
    const aGOP = a.gop?.[y] ?? 0;
    const bAGOP = b.agop?.[y] ?? 0;
    const aAGOP = a.agop?.[y] ?? 0;
    const bNOI = b.noi[y] ?? 0;
    const aNOI = a.noi[y] ?? 0;
    const bANOI = b.anoi?.[y] ?? 0;
    const aANOI = a.anoi?.[y] ?? 0;
    const bNI = b.net_income?.[y] ?? 0;
    const aNI = a.net_income?.[y] ?? 0;
    const bCash = b.ending_cash?.[y] ?? 0;
    const aCash = a.ending_cash?.[y] ?? 0;

    yearly_deltas.push({
      year: y + 1,
      revenue_delta: roundCents(aRev - bRev),
      gop_delta: roundCents(aGOP - bGOP),
      agop_delta: roundCents(aAGOP - bAGOP),
      noi_delta: roundCents(aNOI - bNOI),
      anoi_delta: roundCents(aANOI - bANOI),
      net_income_delta: roundCents(aNI - bNI),
      cash_delta: roundCents(aCash - bCash),
    });

    if (aCash < 0 && bCash >= 0) risk_flags.push(`Alternative scenario produces negative cash in Year ${y + 1}`);
    if (aNOI < 0 && bNOI >= 0) risk_flags.push(`Alternative scenario produces negative NOI in Year ${y + 1}`);
    if (aANOI < 0 && bANOI >= 0) risk_flags.push(`Alternative scenario produces negative ANOI in Year ${y + 1}`);
  }

  if (irr_delta < -200) risk_flags.push(`IRR decreased by ${Math.abs(irr_delta)} bps — significant downside risk`);

  const sensitivity_ranking: Array<{ assumption: string; impact_on_irr_bps: number }> = [];
  if (input.assumption_changes && input.assumption_changes.length > 0) {
    const perAssumptionImpact = Math.abs(irr_delta) / input.assumption_changes.length;
    for (const change of input.assumption_changes) {
      sensitivity_ranking.push({ assumption: change.field, impact_on_irr_bps: Math.round(perAssumptionImpact) });
    }
  }

  return {
    summary: {
      irr_delta, mirr_delta, irr_direction,
      equity_multiple_delta: Math.round(equity_multiple_delta * 10000) / 10000,
      cumulative_noi_delta, cumulative_noi_pct_change,
      exit_value_delta: roundCents(exit_value_delta),
    },
    yearly_deltas,
    risk_flags,
    sensitivity_ranking,
  };
}
