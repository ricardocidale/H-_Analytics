/**
 * schema/bracket-mix-dual-run-diffs.ts — Phase B / legacy diff log
 *
 * Phase B U2 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * One row per global-recompute event (R11). Records BOTH the Phase B value
 * (Hugo's aggregated mix) and the legacy property-level derivation value, so
 * operators can review divergence before flipping the prod feature flag.
 *
 * The dedicated diff table (rather than reusing an existing audit table)
 * is intentional: when Phase C teardown retires the legacy path, this
 * entire table can be dropped without coupling-cost on other audit
 * semantics. No retention policy in v1.
 */

import {
  pgTable,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import type { BracketMixData } from "./types/jsonb-shapes";
import { bracketMixRuns } from "./bracket-mix-runs";

export const bracketMixDualRunDiffs = pgTable(
  "bracket_mix_dual_run_diffs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    recomputeAt: timestamp("recompute_at").notNull().defaultNow(),
    /**
     * Hugo aggregator output for this recompute. NULL when Phase B side
     * threw (recorded in `notes`); legacy path still completes.
     */
    phaseBMix: jsonb("phase_b_mix").$type<BracketMixData>(),
    /**
     * Legacy property-level derivation output. NULL when legacy threw
     * (recorded in `notes`); Phase B side still completes.
     */
    legacyMix: jsonb("legacy_mix").$type<BracketMixData>(),
    /**
     * FK into bracket_mix_runs.id for the global_default run row produced
     * by Hugo this cycle. NULL when Phase B side threw and no run was
     * persisted.
     */
    phaseBRunId: integer("phase_b_run_id").references(() => bracketMixRuns.id, {
      onDelete: "set null",
    }),
    /** Free-form operator notes — error markers, manual overrides, etc. */
    notes: text("notes"),
  },
  (t) => [
    index("bracket_mix_dual_run_diffs_recompute_at_idx").on(t.recomputeAt),
  ],
);

export type BracketMixDualRunDiff = typeof bracketMixDualRunDiffs.$inferSelect;
export type InsertBracketMixDualRunDiff = typeof bracketMixDualRunDiffs.$inferInsert;
