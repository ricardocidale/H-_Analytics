import { pgTable, text, real, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pipelinePolicies = pgTable("pipeline_policies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  policyKey: text("policy_key").notNull().unique(),
  tier: integer("tier").notNull().default(0),
  isEnabled: boolean("is_enabled").notNull().default(true),
  stalenessThresholdHours: integer("staleness_threshold_hours").default(168),
  maxConcurrentRuns: integer("max_concurrent_runs").default(3),
  dailyTokenBudget: integer("daily_token_budget").default(100000),
  monthlyTokenBudget: integer("monthly_token_budget").default(2000000),
  relaxationMaxLevel: integer("relaxation_max_level").default(5),
  minEvidenceScore: real("min_evidence_score").default(0.3),
  minCompCount: integer("min_comp_count").default(3),
  autoRefreshIntervalHours: integer("auto_refresh_interval_hours"),
  /** Global N+1 orchestrator model defaults (P6e). FK → admin_resources ON DELETE SET NULL. */
  analystAModelResourceId: integer("analyst_a_model_resource_id"),
  analystBModelResourceId: integer("analyst_b_model_resource_id"),
  synthesisModelResourceId: integer("synthesis_model_resource_id"),
  fallbackModelResourceId: integer("fallback_model_resource_id"),
}, (t) => [
  index("pipeline_policies_analyst_a_model_idx").on(t.analystAModelResourceId),
  index("pipeline_policies_analyst_b_model_idx").on(t.analystBModelResourceId),
  index("pipeline_policies_synthesis_model_idx").on(t.synthesisModelResourceId),
  index("pipeline_policies_fallback_model_idx").on(t.fallbackModelResourceId),
]);

export const insertPipelinePolicySchema = createInsertSchema(pipelinePolicies).pick({
  policyKey: true, tier: true, isEnabled: true, stalenessThresholdHours: true,
  maxConcurrentRuns: true, dailyTokenBudget: true, monthlyTokenBudget: true,
  relaxationMaxLevel: true, minEvidenceScore: true, minCompCount: true,
  autoRefreshIntervalHours: true,
  analystAModelResourceId: true, analystBModelResourceId: true,
  synthesisModelResourceId: true, fallbackModelResourceId: true,
});
export type PipelinePolicy = typeof pipelinePolicies.$inferSelect;
export type InsertPipelinePolicy = z.infer<typeof insertPipelinePolicySchema>;

export const scheduledResearchWorkflows = pgTable("scheduled_research_workflows", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  workflowKey: text("workflow_key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  researchType: text("research_type").notNull().default("global"),
  frequencyHours: integer("frequency_hours").notNull().default(168),
  promptInstructions: text("prompt_instructions"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastRunStatus: text("last_run_status").default("pending"),
  lastRunDurationMs: integer("last_run_duration_ms"),
  lastRunError: text("last_run_error"),
  priority: integer("priority").notNull().default(5),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("scheduled_research_workflows_enabled_idx").on(table.isEnabled),
  index("scheduled_research_workflows_next_run_idx").on(table.nextRunAt),
  // Task #972: scheduler picker (WHERE is_enabled = true AND next_run_at <= NOW()
  // ORDER BY priority) — see getStaleScheduledWorkflows(); partial keeps the
  // index ~the size of the enabled subset.
  index("scheduled_research_workflows_due_idx")
    .on(table.nextRunAt, table.priority)
    .where(sql`${table.isEnabled} = true`),
]);

export const insertScheduledResearchWorkflowSchema = createInsertSchema(scheduledResearchWorkflows).pick({
  workflowKey: true, name: true, description: true, researchType: true,
  frequencyHours: true, promptInstructions: true, isEnabled: true,
  lastRunAt: true, nextRunAt: true, lastRunStatus: true,
  lastRunDurationMs: true, lastRunError: true, priority: true,
});
export type ScheduledResearchWorkflow = typeof scheduledResearchWorkflows.$inferSelect;
export type InsertScheduledResearchWorkflow = z.infer<typeof insertScheduledResearchWorkflowSchema>;
