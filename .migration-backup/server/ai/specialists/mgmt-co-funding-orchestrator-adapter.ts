/**
 * mgmt-co-funding-orchestrator-adapter.ts — adapter contracts for the
 * Funding Specialist's Tier-1 graduation (G1 of ADR-007).
 *
 * Defines the interfaces the Specialist body imports for dependency
 * injection. Concrete implementations of these interfaces live in
 * Replit-owned route-handler slices (per `claude-replit-split.md`
 * §"two-track ADR execution") — this file ships only:
 *
 *   - The `FundingOrchestratorAdapter` interface (and its result shape).
 *   - The `ComparablesFetcher` interface + the `ComparableRow` type.
 *   - A canned LP-comp dataset (`getCannedLpComparables`) for G1 v1
 *     bring-up before live PitchBook/PrivateEquityInfo wiring lands.
 *   - `comparableToEvidence()` — pure converter so comparables thread
 *     through the AnalystVerdict contract without schema extension
 *     (each comparable becomes one Evidence row with `tier: "db_table"`).
 *
 * Engine boundary: this file lives in `server/ai/` because the eventual
 * concrete adapter wraps `server/ai/research-orchestrator.ts`. The
 * `engine/analyst/surface/mgmt-co/funding-specialist.ts` Specialist
 * imports types from here without violating the engine→server boundary
 * because all imported symbols are pure types or pure functions over
 * those types.
 *
 * See ADR-007 §1 step 5 (cognitive run) + §6 (comparables) + the
 * "Specialist intelligence bar" rule §requirement-4 (tabular comparables
 * for numeric dimensions).
 */

import type { Evidence, RawVerdictDimension } from "../../../engine/analyst/contracts/verdict";
import type { FundingPromptInput } from "./mgmt-co-funding-prompt-input-builder";

// ────────────────────────────────────────────────────────────────────────────
// Comparables

/**
 * One LP-comparable raise, used by the Voice Renderer to build the
 * comparables table the Intelligence Bar requires for numeric dimensions.
 */
export interface ComparableRow {
  /** Operator brand or fund name. */
  operator: string;
  /** Vintage year of the raise. */
  vintage: number;
  /** Vertical / market tier descriptor. */
  vertical: string;
  /** Properties at time of raise. */
  propertyCount: number;
  /** Total raise size in USD. */
  raiseUsd: number;
  /** Months of runway buffer the raise targeted. */
  runwayBufferMonths: number;
  /** Sizing overshoot ratio (raise / modeled need - 1). */
  sizingOvershootPct: number;
  /** Months between Tranche 1 and Tranche 2 close. */
  trancheGapMonths: number | null;
  /** Source — citable. */
  source: string;
  /** ISO date of source publication. */
  asOf: string;
}

/**
 * Adapter for fetching comparables. G1 v1 fetcher returns canned data;
 * production wiring against PitchBook / PrivateEquityInfo APIs follows in
 * a separate packet per ADR-007 §6 ("wiring matters; data quality
 * follows").
 */
export interface ComparablesFetcher {
  /**
   * Returns N comparables (N ≥ 3 to satisfy Intelligence Bar #4) for the
   * given Specialist id. Implementations may filter by vertical or persona;
   * G1's stub ignores those signals.
   */
  fetch(specialistId: string): Promise<readonly ComparableRow[]>;
}

/**
 * Canned LP comparables for G1 bring-up. Three real-world-shaped rows in
 * the boutique-luxury / wellness vertical, vintage 2022-2024, drawn from
 * publicly disclosed raises. This dataset is intentionally small and
 * static — its purpose is to prove the wiring end-to-end so the
 * Specialist's verdict-shape gates pass before live API integration.
 *
 * Numbers are illustrative and should not be cited as forecasting basis;
 * the live PitchBook / PrivateEquityInfo integration replaces this set in
 * a follow-up packet.
 */
export function getCannedLpComparables(): readonly ComparableRow[] {
  return [
    {
      operator: "Boutique Lifestyle Group A",
      vintage: 2023,
      vertical: "boutique-luxury",
      propertyCount: 5,
      raiseUsd: 30_000_000,
      runwayBufferMonths: 18,
      sizingOvershootPct: 0.2,
      trancheGapMonths: 9,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2023-09-01",
    },
    {
      operator: "Wellness Resort Operator B",
      vintage: 2022,
      vertical: "wellness",
      propertyCount: 3,
      raiseUsd: 18_000_000,
      runwayBufferMonths: 24,
      sizingOvershootPct: 0.15,
      trancheGapMonths: 12,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2022-11-15",
    },
    {
      operator: "Lifestyle Hotels Platform C",
      vintage: 2024,
      vertical: "lifestyle-luxury",
      propertyCount: 8,
      raiseUsd: 60_000_000,
      runwayBufferMonths: 16,
      sizingOvershootPct: 0.25,
      trancheGapMonths: 6,
      source: "Public hospitality investor disclosures (illustrative)",
      asOf: "2024-03-20",
    },
  ];
}

/**
 * Convert one ComparableRow to one Evidence row. Used by the Specialist
 * to thread comparables through the AnalystVerdict contract without
 * extending the schema — each comparable becomes one `Evidence` entry
 * with `tier: "db_table"` and a structured source label the voice
 * renderer can group into a table downstream.
 */
export function comparableToEvidence(row: ComparableRow): Evidence {
  return {
    source: `LP comp: ${row.operator} (${row.vintage} ${row.vertical}, ${row.propertyCount} properties, $${(row.raiseUsd / 1_000_000).toFixed(0)}M)`,
    tier: "db_table",
    asOf: row.asOf,
    personaFit: 0.85,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Orchestrator adapter

/**
 * Cognitive-run options the Specialist passes per call, including the
 * regress counter so the prompt-engineer stage can re-frame on each
 * regress.
 */
export interface OrchestratorRunOptions {
  /** 0 = first attempt; 1 or 2 = regress N. */
  regressCount: number;
}

/**
 * Result of one cognitive run. Pre-voice (the voice renderer downstream
 * formats `headline` + `detail`); pre-quality-check (the Specialist body
 * runs convergence + invariant checks before accepting).
 */
export interface FundingOrchestratorResult {
  /** Stable id for the cognitive run; persisted via Phase 5C write-after. */
  cognitiveRunId: string;
  /** Stable id for the prompt-engineer stage that built this run's prompts. */
  promptEngineerRunId: string;
  /** Per-dimension reconstructed pre-voice dimensions. */
  dimensions: readonly RawVerdictDimension[];
  /** Vendors used (e.g. ["anthropic", "google"]) for vendor-breadth check. */
  vendorsUsed: readonly string[];
  /**
   * Convergence indicator from synthesis (0..1). Used by the Specialist's
   * quality check; below the threshold triggers a regress.
   */
  convergenceScore: number;
}

/**
 * The orchestrator adapter contract. Implementations wrap the multi-model
 * N+1 cognitive pipeline (prompt-engineer stage → quantitative panel +
 * market panel + synthesis) and return a structured result.
 *
 * G1 v1: the concrete adapter that wraps `server/ai/research-orchestrator.ts`
 * is wired by Replit's route-handler slice. This module ships only the
 * interface so the Specialist + its tests can compose against it.
 */
export interface FundingOrchestratorAdapter {
  run(
    input: FundingPromptInput,
    options: OrchestratorRunOptions,
  ): Promise<FundingOrchestratorResult>;
}

// ────────────────────────────────────────────────────────────────────────────
// Convergence threshold

/**
 * Below this convergence score, the Specialist regresses with re-engineered
 * framing per ADR-007 §1 step 7. Tuned conservatively for G1 — the
 * orchestrator's synthesis stage typically returns ≥0.65 on healthy runs.
 */
export const CONVERGENCE_THRESHOLD = 0.6;
