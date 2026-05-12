/**
 * self_test_logs — append-only log of every entity self-test execution.
 *
 * Task #1403: Unified self-test cadence (30d default) + Logs rename.
 *
 * One row per probe run. The scheduler writes here after every deterministic
 * or LLM-backed health check against any entity kind (admin_resources rows,
 * agents, specialists, minions, Rebecca). The latest row per (entity_kind,
 * entity_id) is the authoritative "last result"; the full history powers the
 * Self-tests tab in the Logs page.
 *
 * outcome:
 *   pass — probe completed without errors and all assertions passed
 *   warn — probe completed but one or more soft assertions failed (amber state)
 *   fail — probe failed hard (timeout, error, critical assertion failed)
 *
 * Secrets NEVER appear in probe_recipe_snapshot or raw_response — scrub before
 * persisting.
 */

import {
  pgTable,
  integer,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { adminResources } from "./admin-resource";
import { costantinoFindings } from "./costantino";

// ── Outcome enum ─────────────────────────────────────────────────────────────

export const SELF_TEST_OUTCOMES = ["pass", "warn", "fail"] as const;
export type SelfTestOutcome = typeof SELF_TEST_OUTCOMES[number];

// ── Table ────────────────────────────────────────────────────────────────────

export const selfTestLogs = pgTable(
  "self_test_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

    /** What kind of entity was probed: "admin_resource", "agent", "specialist", "minion", "rebecca". */
    entityKind: text("entity_kind").notNull(),

    /** Stable identifier for the entity within its kind.
     *  For admin_resources: the integer PK cast to text.
     *  For agents/specialists/minions: their catalog slug (e.g. "ana", "carlo").
     *  For rebecca: "rebecca".
     */
    entityId: text("entity_id").notNull(),

    /** Human-readable name at the time of the test (denormalized for log readability). */
    entityName: text("entity_name").notNull(),

    /** If entity_kind = "admin_resource", FK back to admin_resources for cascade deletes. */
    adminResourceId: integer("admin_resource_id").references(() => adminResources.id, { onDelete: "set null" }),

    /** pass | warn | fail */
    outcome: text("outcome").notNull().$type<SelfTestOutcome>(),

    /** Wall-clock ms the probe took from start to finish. */
    durationMs: integer("duration_ms"),

    /** Snapshot of the probe recipe used (sanitized — no secrets). */
    probeRecipeSnapshot: jsonb("probe_recipe_snapshot").$type<Record<string, unknown>>(),

    /** Raw response from the probe target (sanitized — no secrets, truncated to 64 KB). */
    rawResponse: jsonb("raw_response").$type<Record<string, unknown>>(),

    /** Optional human-readable summary of what the probe found (e.g. error message). */
    summary: text("summary"),

    /** If this test run opened or resolved a costantino_finding, link it here. */
    findingId: text("finding_id").references(() => costantinoFindings.findingId, { onDelete: "set null" }),

    /** When the probe ran (server-side clock, UTC). */
    ranAt: timestamp("ran_at").defaultNow().notNull(),
  },
  (t) => [
    index("self_test_logs_entity_idx").on(t.entityKind, t.entityId),
    index("self_test_logs_outcome_idx").on(t.outcome),
    index("self_test_logs_ran_at_idx").on(t.ranAt),
    index("self_test_logs_admin_resource_idx").on(t.adminResourceId),
    index("self_test_logs_finding_idx").on(t.findingId),
  ],
);

export type SelfTestLogRow = typeof selfTestLogs.$inferSelect;
export type InsertSelfTestLog = typeof selfTestLogs.$inferInsert;
