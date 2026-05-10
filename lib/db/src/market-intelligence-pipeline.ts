/**
 * Compute helpers for the Submarket Supply Pipeline + STR Restriction Trends
 * panels (Task #810).
 *
 * These functions are deliberately kept as pure data-in / data-out helpers so
 * they can be exercised from tests, the export pipeline, and the Risk
 * Specialist (Task #801) overlay without dragging in any UI / DB deps.
 */

import type {
  SubmarketSupplyProject,
  StrOrdinanceEvent,
  SupplyProjectStatus,
  StrDirection,
} from "./schema/intelligence/market-data";

// ─── Pipeline pressure scoring ───────────────────────────────────────────────

/**
 * Status-weighted contribution to the supply pressure denominator. Projects
 * already opened in the last 24 months count fully — they are real comp
 * supply already on the market. Under-construction projects are near-certain
 * to deliver, so weighted at 0.85. Planned projects historically deliver at
 * ~55% (CoStar pipeline-attainment studies), and announced (no permits / no
 * groundbreak) at ~30%.
 */
export const SUPPLY_STATUS_WEIGHT: Record<SupplyProjectStatus, number> = {
  opened_recent: 1.0,
  under_construction: 0.85,
  planned: 0.55,
  announced: 0.30,
};

export type PressureBand = "green" | "amber" | "red";

export interface PipelinePressureResult {
  /** Sum of status-weighted keys in the pipeline. */
  weightedNewKeys: number;
  /** Existing submarket inventory used in the denominator. */
  existingInventory: number;
  /** Pressure ratio = weightedNewKeys / max(existingInventory, 1). */
  pressureRatio: number;
  /** Pressure band — drives the red/amber/green gauge. */
  band: PressureBand;
  /** 0–100 score for sparkline rendering (clipped at 100). */
  score: number;
  /** Per-year forward delivery curve indexed by openingYear. */
  deliveryByYear: Record<number, number>;
}

/**
 * Compute pipeline pressure for a property's submarket.
 *
 * Pressure ratio buckets (calibrated to STR / smith-travel pressure bands):
 *   < 5%  → green  (negligible new supply)
 *   5–15% → amber  (manageable but worth watching)
 *   ≥ 15% → red    (material RevPAR pressure expected)
 */
export function computePipelinePressure(
  projects: readonly SubmarketSupplyProject[],
  existingInventory: number,
): PipelinePressureResult {
  const safeInventory = Math.max(existingInventory, 1);
  let weightedNewKeys = 0;
  const deliveryByYear: Record<number, number> = {};

  for (const p of projects) {
    const weight = SUPPLY_STATUS_WEIGHT[p.status as SupplyProjectStatus] ?? 0.5;
    const contribution = (p.keyCount ?? 0) * weight;
    weightedNewKeys += contribution;
    if (p.openingYear) {
      deliveryByYear[p.openingYear] = (deliveryByYear[p.openingYear] ?? 0) + (p.keyCount ?? 0);
    }
  }

  const pressureRatio = weightedNewKeys / safeInventory;
  const band: PressureBand = pressureRatio >= 0.15 ? "red" : pressureRatio >= 0.05 ? "amber" : "green";
  const score = Math.min(100, Math.round(pressureRatio * 400)); // 25% pressure ⇒ 100

  return {
    weightedNewKeys,
    existingInventory: safeInventory,
    pressureRatio,
    band,
    score,
    deliveryByYear,
  };
}

// ─── Modeled RevPAR drag at stabilization ────────────────────────────────────

export interface RevparDragResult {
  /** Drag as a decimal (0.07 = 7% haircut). */
  dragRate: number;
  /** Implied RevPAR after the drag is applied. */
  modeledRevpar: number;
  /** Dollar-impact line on RevPAR. */
  revparHaircut: number;
  /** Sentence-form summary the panel renders verbatim. */
  narrative: string;
}

/**
 * Modeled RevPAR drag at stabilization given a pipeline-pressure result.
 *
 * Heuristic anchored to industry rule-of-thumb: every 10% of pipeline
 * pressure (weighted-new-keys ÷ existing) translates to ~3% RevPAR haircut
 * at stabilization, capped at 25%. Calibrated against published CoStar /
 * STR submarket forecasts (2018-2024 hospitality cycle).
 */
export function computeRevparDrag(
  pressure: PipelinePressureResult,
  baselineRevpar: number,
): RevparDragResult {
  const rawDrag = pressure.pressureRatio * 0.30;
  const dragRate = Math.min(0.25, Math.max(0, rawDrag));
  const revparHaircut = baselineRevpar * dragRate;
  const modeledRevpar = baselineRevpar - revparHaircut;
  const pct = (dragRate * 100).toFixed(1);
  const narrative = dragRate < 0.005
    ? "Pipeline pressure is negligible — no material RevPAR drag expected."
    : `At stabilization, the modeled RevPAR drag from new supply is ~${pct}%, implying an ~$${revparHaircut.toFixed(0)} per-available-room haircut against a $${baselineRevpar.toFixed(0)} baseline.`;
  return { dragRate, modeledRevpar, revparHaircut, narrative };
}

// ─── STR trend direction ─────────────────────────────────────────────────────

export interface StrTrendResult {
  direction: StrDirection;
  /** Net direction score = tightening events − loosening events (window). */
  netScore: number;
  /** Number of events considered (within the lookback window). */
  consideredCount: number;
  /** Lookback window in months. */
  windowMonths: number;
  /** Most recent event in the window — the panel highlights this. */
  mostRecent: StrOrdinanceEvent | null;
  /** Sentence-form summary the badge tooltip renders. */
  narrative: string;
}

/**
 * Compute the STR trend direction for a locality.
 *
 * Looks at events in the trailing `windowMonths` (default 24) and tallies
 * tightening (+1) vs loosening (-1) signals. Court rulings count double in
 * whichever direction they ruled. Stable / informational events count zero.
 *
 * netScore > 0  → "tightening"
 * netScore < 0  → "loosening"
 * netScore = 0  → "stable"
 */
export function computeStrTrend(
  events: readonly StrOrdinanceEvent[],
  windowMonths = 24,
  now: Date = new Date(),
): StrTrendResult {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - windowMonths);
  const cutoffMs = cutoff.getTime();

  const inWindow = events.filter((e) => {
    const t = parseEventDate(e.eventDate);
    return t !== null && t >= cutoffMs;
  });

  let netScore = 0;
  for (const e of inWindow) {
    const weight = e.eventType === "court_ruling" || e.eventType === "ban" ? 2 : 1;
    if (e.direction === "tightening") netScore += weight;
    else if (e.direction === "loosening") netScore -= weight;
  }

  const direction: StrDirection = netScore > 0 ? "tightening" : netScore < 0 ? "loosening" : "stable";
  const sorted = [...inWindow].sort((a, b) => (parseEventDate(b.eventDate) ?? 0) - (parseEventDate(a.eventDate) ?? 0));
  const mostRecent = sorted[0] ?? null;

  const narrative = inWindow.length === 0
    ? `No STR ordinance activity in the trailing ${windowMonths} months — trend is stable by default.`
    : direction === "tightening"
      ? `STR rules trending tighter — ${inWindow.length} event(s) in the trailing ${windowMonths} months net to a tightening posture (score ${netScore}).`
      : direction === "loosening"
        ? `STR rules trending looser — ${inWindow.length} event(s) in the trailing ${windowMonths} months net to a loosening posture (score ${netScore}).`
        : `STR rules stable — ${inWindow.length} event(s) in the trailing ${windowMonths} months but tightening / loosening signals offset.`;

  return {
    direction,
    netScore,
    consideredCount: inWindow.length,
    windowMonths,
    mostRecent,
    narrative,
  };
}

/** Parse an event-date string. Accepts ISO ("2024-06-15"), partial year-quarter
 *  ("2024-Q3"), or year-month ("2024-06"). Returns ms-epoch or null. */
function parseEventDate(raw: string): number | null {
  if (!raw) return null;
  const qMatch = raw.match(/^(\d{4})-Q([1-4])$/i);
  if (qMatch) {
    const year = Number(qMatch[1]);
    const quarter = Number(qMatch[2]);
    const month = (quarter - 1) * 3;
    return new Date(Date.UTC(year, month, 1)).getTime();
  }
  const ymMatch = raw.match(/^(\d{4})-(\d{2})$/);
  if (ymMatch) {
    return new Date(Date.UTC(Number(ymMatch[1]), Number(ymMatch[2]) - 1, 1)).getTime();
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}
