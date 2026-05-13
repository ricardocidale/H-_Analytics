/**
 * schema/bracket-mix-runs.ts — provenance log for every Tiago Specialist run
 *
 * Phase B U2 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * One row per Specialist run (per peer, per Mgmt-Co override, or per global
 * default aggregation by Hugo). Pure audit table — values are never mutated
 * in place. The row id is the FK target for three pointers:
 *   - icp_peer_companies.last_research_run_id
 *   - global_assumptions.bracket_mix_override_run_id
 *   - bracket_mix_dual_run_diffs.phase_b_run_id
 *
 * The discriminator column `target_kind` avoids a join table:
 *   - 'peer'           → target_id = icp_peer_companies.id
 *   - 'company'        → target_id = global_assumptions.id (override run)
 *   - 'global_default' → target_id IS NULL (Hugo aggregator output)
 *
 * `provisional = true` means the run captured a cold-start equal-weight
 * fallback rather than evidence-grounded data (R4). Hugo writes this when
 * zero researched peers exist; in that case mix_value reflects the
 * equal-weight derivation rather than aggregated peer splits.
 */

import {
  pgTable,
  integer,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import type { BracketMixData } from "./types/jsonb-shapes";

export const bracketMixRuns = pgTable(
  "bracket_mix_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /**
     * 'peer' | 'company' | 'global_default'. Matched to target_id below.
     */
    targetKind: text("target_kind").notNull(),
    /**
     * FK into icp_peer_companies.id (when kind='peer'),
     * global_assumptions.id (when kind='company'),
     * or NULL (when kind='global_default').
     *
     * No FK constraint at the column level because the parent table differs
     * by discriminator; integrity is enforced at the route layer.
     */
    targetId: integer("target_id"),
    /** LLM model identifier (admin_resources slug) Tiago used for this run. */
    model: text("model"),
    /** Citations and sample-property bundle returned by Tiago. */
    sources: jsonb("sources"),
    /** The canonical BracketMixData this run produced — what the engine reads. */
    mixValue: jsonb("mix_value").$type<BracketMixData>().notNull(),
    /** Hugo's roster-size sum across active peers (NULL for non-aggregator runs). */
    rosterSizeEstimate: integer("roster_size_estimate"),
    runAt: timestamp("run_at").notNull().defaultNow(),
    /**
     * TRUE means the run captured a cold-start equal-weight fallback (R4)
     * rather than evidence-grounded peer aggregation. Engine read path treats
     * a provisional global_default as "no real data yet".
     */
    provisional: boolean("provisional").notNull().default(false),
  },
  (t) => [
    index("bracket_mix_runs_target_idx").on(t.targetKind, t.targetId),
    index("bracket_mix_runs_run_at_idx").on(t.runAt),
  ],
);

export type BracketMixRun = typeof bracketMixRuns.$inferSelect;
export type InsertBracketMixRun = typeof bracketMixRuns.$inferInsert;
