import { pgTable, text, real, integer, timestamp, jsonb, index, unique, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "../auth";
import { scenarios } from "../scenarios";

export const assumptionGuidance = pgTable("assumption_guidance", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  assumptionKey: text("assumption_key").notNull(),
  valueLow: real("value_low"),
  valueMid: real("value_mid"),
  valueHigh: real("value_high"),
  confidence: text("confidence"),
  sourceName: text("source_name"),
  sourceDate: text("source_date"),
  reasoning: text("reasoning"),
  comparableSet: jsonb("comparable_set").$type<Record<string, unknown>>(),
  relaxationLevel: integer("relaxation_level").default(0),
  researchRunId: integer("research_run_id"),
  /**
   * Set when a later research run replaces this guidance row's field.
   * Null means "current". Phase 5C will populate this on cache invalidation.
   * See ADR-004 — Verdict Cache.
   */
  supersededAt: timestamp("superseded_at"),
  /** Structured breakdown of range quality — explains WHY conviction is what it is */
  dataQuality: jsonb("data_quality").$type<{
    /** Number of independent sources that contributed to this range */
    sourceCount: number;
    /** Types of sources: "db_table" (pre-collected), "api" (live), "web" (Perplexity/Tavily), "estimated" (LLM) */
    sourceTypes: Array<"db_table" | "api" | "web" | "estimated">;
    /** Age of the most recent source data in days */
    dataAgeDays: number | null;
    /** How wide the range is as a percentage of the mid value — tighter = higher quality */
    rangeSpreadPct: number | null;
    /** Whether multiple sources agree on the range (true = converging, false = diverging) */
    sourcesConverge: boolean;
    /** 0-100 composite score: sourceCount × 25 + freshness × 25 + convergence × 25 + sourceType × 25 */
    qualityScore: number;
    /** Human-readable explanation */
    qualityNarrative: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("assumption_guidance_unique").on(table.scenarioId, table.entityType, table.entityId, table.assumptionKey),
  index("assumption_guidance_scenario_idx").on(table.scenarioId),
]);

export const insertAssumptionGuidanceSchema = createInsertSchema(assumptionGuidance).pick({
  scenarioId: true, entityType: true, entityId: true, assumptionKey: true,
  valueLow: true, valueMid: true, valueHigh: true, confidence: true,
  sourceName: true, sourceDate: true, reasoning: true, comparableSet: true,
  relaxationLevel: true, researchRunId: true, dataQuality: true,
});
export type AssumptionGuidance = typeof assumptionGuidance.$inferSelect;
export type InsertAssumptionGuidance = z.infer<typeof insertAssumptionGuidanceSchema>;

export const researchRuns = pgTable("research_runs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "set null" }),
  tier: integer("tier").notNull().default(0),
  status: text("status").notNull().default("pending"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  modelPrimary: text("model_primary"),
  modelSecondary: text("model_secondary"),
  modelSynthesis: text("model_synthesis"),
  tokensUsed: integer("tokens_used"),
  estimatedCost: real("estimated_cost"),
  error: text("error"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  /**
   * Verdict-cache lookup key — derived hash of (entityType, entityId,
   * scenarioId, fields, model knobs). Indexed for hot-path reads in
   * Phase 5B engine-client.ts. Nullable for back-compat with rows
   * written before Phase 5C populates it. See ADR-004 — Verdict Cache.
   */
  cacheKey: text("cache_key"),
  /** Hash of the input bundle used to compute cacheKey, for diagnostics. */
  cacheInputsHash: text("cache_inputs_hash"),
}, (table) => [
  index("research_runs_entity_idx").on(table.entityType, table.entityId),
  index("research_runs_status_idx").on(table.status),
  // Task #972: latest-successful-run for a Constants locality —
  // see getLatestSuccessfulRunForConstant(). WHERE entity_type = $1
  // AND status = $2 ORDER BY completed_at DESC LIMIT 1.
  index("research_runs_entity_status_completed_idx")
    .on(table.entityType, table.status, table.completedAt),
  index("research_runs_user_idx").on(table.userId),
  index("research_runs_scenario_idx").on(table.scenarioId),
  // Partial index — cacheKey is NULL for every row written before Phase 5C
  // populates it, and that NULL slice is the majority of the table for the
  // foreseeable future. Postgres indexes NULL values in btrees by default;
  // restricting the index to non-null rows keeps it ~the size of the actual
  // verdict-cache lookup set instead of the whole table.
  index("research_runs_cache_key_idx").on(table.cacheKey).where(sql`${table.cacheKey} IS NOT NULL`),
]);

/**
 * Per-user cooldown clock for the Interactive Analyst (POST /api/analyst/refresh).
 *
 * One row per user; `reservedAt` records when the most-recent run was reserved.
 * Reservation happens BEFORE the runner is invoked and is NOT released on
 * failure — see the file-level comment in server/routes/analyst-admin.ts for
 * the rationale (strict 60s budget per admin, even against flaky upstreams).
 *
 * This table replaces an earlier in-memory `Map<userId, timestamp>` so the
 * doctrine survives process restarts and is shared across app instances.
 */
export const analystCooldowns = pgTable("analyst_cooldowns", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  reservedAt: timestamp("reserved_at").notNull(),
});
export type AnalystCooldown = typeof analystCooldowns.$inferSelect;

export const insertResearchRunSchema = createInsertSchema(researchRuns).pick({
  userId: true, entityType: true, entityId: true, scenarioId: true,
  tier: true, status: true, completedAt: true, durationMs: true,
  modelPrimary: true, modelSecondary: true, modelSynthesis: true,
  tokensUsed: true, estimatedCost: true, error: true, metadata: true,
});
export type ResearchRun = typeof researchRuns.$inferSelect;
export type InsertResearchRun = z.infer<typeof insertResearchRunSchema>;

export const benchmarkSnapshots = pgTable("benchmark_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  snapshotKey: text("snapshot_key").notNull().unique(),
  category: text("category").notNull(),
  value: real("value"),
  source: text("source"),
  sourceUrl: text("source_url"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  staleness: text("staleness").default("fresh"),
  cadence: text("cadence").default("monthly"),
});

export const insertBenchmarkSnapshotSchema = createInsertSchema(benchmarkSnapshots).pick({
  snapshotKey: true, category: true, value: true, source: true,
  sourceUrl: true, staleness: true, cadence: true,
});
export type BenchmarkSnapshot = typeof benchmarkSnapshots.$inferSelect;
export type InsertBenchmarkSnapshot = z.infer<typeof insertBenchmarkSnapshotSchema>;

export const relaxationTraces = pgTable("relaxation_traces", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  researchRunId: integer("research_run_id").references(() => researchRuns.id, { onDelete: "cascade" }).notNull(),
  level: integer("level").notNull(),
  criteriaActive: jsonb("criteria_active").$type<Record<string, unknown>>(),
  compsFound: integer("comps_found").default(0),
  evidenceScore: real("evidence_score"),
  retained: jsonb("retained").$type<string[]>(),
  relaxed: jsonb("relaxed").$type<string[]>(),
}, (table) => [
  index("relaxation_traces_run_idx").on(table.researchRunId),
]);

export const insertRelaxationTraceSchema = createInsertSchema(relaxationTraces).pick({
  researchRunId: true, level: true, criteriaActive: true,
  compsFound: true, evidenceScore: true, retained: true, relaxed: true,
});
export type RelaxationTrace = typeof relaxationTraces.$inferSelect;
export type InsertRelaxationTrace = z.infer<typeof insertRelaxationTraceSchema>;

export const guidanceDecisions = pgTable("guidance_decisions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  assumptionGuidanceId: integer("assumption_guidance_id").references(() => assumptionGuidance.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  previousValue: real("previous_value"),
  newValue: real("new_value"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("guidance_decisions_user_idx").on(table.userId),
  index("guidance_decisions_guidance_idx").on(table.assumptionGuidanceId),
]);

export const insertGuidanceDecisionSchema = createInsertSchema(guidanceDecisions).pick({
  userId: true, assumptionGuidanceId: true, action: true,
  previousValue: true, newValue: true,
});
export type GuidanceDecision = typeof guidanceDecisions.$inferSelect;
export type InsertGuidanceDecision = z.infer<typeof insertGuidanceDecisionSchema>;

export const coverageSnapshots = pgTable("coverage_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  scenarioId: integer("scenario_id").references(() => scenarios.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  totalFields: integer("total_fields").notNull(),
  freshCount: integer("fresh_count").notNull().default(0),
  staleCount: integer("stale_count").notNull().default(0),
  missingCount: integer("missing_count").notNull().default(0),
  coveragePct: real("coverage_pct").notNull().default(0),
  snapshotDate: date("snapshot_date").defaultNow().notNull(),
}, (table) => [
  index("coverage_snapshots_scenario_idx").on(table.scenarioId),
]);

export const insertCoverageSnapshotSchema = createInsertSchema(coverageSnapshots).pick({
  scenarioId: true, entityType: true, entityId: true,
  totalFields: true, freshCount: true, staleCount: true, missingCount: true, coveragePct: true,
});
export type CoverageSnapshot = typeof coverageSnapshots.$inferSelect;
export type InsertCoverageSnapshot = z.infer<typeof insertCoverageSnapshotSchema>;
