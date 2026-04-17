import { pgTable, integer, real, timestamp, text, jsonb, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./auth";

/**
 * analyst_watchdog_benchmarks — cached benchmark ranges that drive the
 * Analyst watchdog on the Funding tab of Company Assumptions.
 *
 * One row per user (singleton). Until the LLM refresh path lands, every row
 * is seeded from `DEFAULT_CAPITAL_RAISE_BENCHMARKS` in
 * `shared/constants-funding.ts` (see `getAnalystWatchdogBenchmarks` in
 * storage). Renamed from `capital_raise_benchmarks` to avoid colliding with
 * the per-dimension Analyst Tables admin schema in `intelligence.ts`.
 */
export const analystWatchdogBenchmarks = pgTable("analyst_watchdog_benchmarks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),

  runwayBufferMonthsLow: real("runway_buffer_months_low").notNull(),
  runwayBufferMonthsMid: real("runway_buffer_months_mid").notNull(),
  runwayBufferMonthsHigh: real("runway_buffer_months_high").notNull(),

  sizingOvershootPctLow: real("sizing_overshoot_pct_low").notNull(),
  sizingOvershootPctMid: real("sizing_overshoot_pct_mid").notNull(),
  sizingOvershootPctHigh: real("sizing_overshoot_pct_high").notNull(),

  trancheGapMonthsLow: real("tranche_gap_months_low").notNull(),
  trancheGapMonthsMid: real("tranche_gap_months_mid").notNull(),
  trancheGapMonthsHigh: real("tranche_gap_months_high").notNull(),

  revenueRampDelayMonthsLow: real("revenue_ramp_delay_months_low").notNull(),
  revenueRampDelayMonthsMid: real("revenue_ramp_delay_months_mid").notNull(),
  revenueRampDelayMonthsHigh: real("revenue_ramp_delay_months_high").notNull(),

  burnFlexDownPctLow: real("burn_flex_down_pct_low").notNull(),
  burnFlexDownPctMid: real("burn_flex_down_pct_mid").notNull(),
  burnFlexDownPctHigh: real("burn_flex_down_pct_high").notNull(),

  lastRefreshedAt: timestamp("last_refreshed_at"),
  refreshedBy: text("refreshed_by").notNull().default("stub"),
  sourceCount: integer("source_count").notNull().default(0),
  tokensUsed: integer("tokens_used").notNull().default(0),
  nPlusOneEvidence: jsonb("n_plus_one_evidence").$type<Array<Record<string, unknown>>>(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  unique("analyst_watchdog_benchmarks_user_uq").on(table.userId),
  index("analyst_watchdog_benchmarks_user_idx").on(table.userId),
]);

export const insertAnalystWatchdogBenchmarksSchema = createInsertSchema(analystWatchdogBenchmarks).omit({
  createdAt: true, updatedAt: true,
});
export type AnalystWatchdogBenchmarks = typeof analystWatchdogBenchmarks.$inferSelect;
export type InsertAnalystWatchdogBenchmarks = z.infer<typeof insertAnalystWatchdogBenchmarksSchema>;
