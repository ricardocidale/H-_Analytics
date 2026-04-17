/**
 * Model Constant Overrides — Phase 1, Option B (TS factory + DB overlay)
 *
 * The factory baseline lives in TypeScript:
 *   - Universal constants:    `shared/constants.ts` (e.g. DAYS_PER_MONTH)
 *   - Country-keyed constants: `shared/countryDefaults.ts` (COUNTRY_DEFAULTS)
 *   - US state overlays:       `shared/countryDefaults.ts` (US_STATE_DEFAULTS)
 *
 * This table records ONLY genuine departures from the factory value.
 * Two write paths:
 *   1. Analyst regeneration  (source = 'analyst')  — research engine produced
 *      a value differing from factory; row stores the new value, the citation
 *      authority, and the research-run id.
 *   2. Manual admin override (source = 'manual')   — admin overrode in Admin
 *      UI; row stores override note explaining why; UI strongly discourages.
 *
 * Resolution at read time (see `getEffectiveConstant` in
 * `shared/get-effective-constant.ts`):
 *
 *   manual override > analyst override > factory (TS file)
 *
 * Locality:
 *   - `country = NULL`     → universal constant (e.g. daysPerMonth)
 *   - `country = 'United States'`, `subdivision = NULL`        → country-level
 *   - `country = 'United States'`, `subdivision = 'Florida'`   → state-level
 *
 * Invariant:  do NOT insert a row whose value equals the factory value at the
 * same locality. Keeps the table semantically clean — its presence means
 * "the model has departed from baseline here."
 */

import { sql } from "drizzle-orm";
import { pgTable, text, integer, timestamp, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./auth";

export const modelConstantOverrides = pgTable("model_constant_overrides", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // Identity
  constantKey: text("constant_key").notNull(),           // e.g. "depreciationYears"
  country: text("country"),                              // NULL = universal; else country name from COUNTRY_DEFAULTS
  countrySubdivision: text("country_subdivision"),       // NULL = country-level; else US state name from US_STATE_DEFAULTS

  // Value (jsonb to support number | string | bool | array)
  value: jsonb("value").notNull().$type<unknown>(),

  // Provenance
  source: text("source").notNull(),                      // 'analyst' | 'manual'
  authority: text("authority"),                          // e.g. "IRS Publication 946, IRC §168(e)(2)(A)"
  referenceUrl: text("reference_url"),                   // optional citation link
  researchRunId: integer("research_run_id"),             // FK-soft to intelligence_v2 research_runs (null when manual)
  overrideNote: text("override_note"),                   // required when source='manual'

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
}, (table) => [
  unique("uq_mco_key_country_subdivision").on(
    table.constantKey,
    table.country,
    table.countrySubdivision,
  ),
  index("idx_mco_key_country").on(table.constantKey, table.country),
  check("mco_source_check", sql`${table.source} IN ('analyst', 'manual')`),
]);

// Manual zod schema (drizzle-zod 0.7 has trouble inferring tables with `check` constraints).
export const insertModelConstantOverrideSchema = z.object({
  constantKey: z.string().min(1),
  country: z.string().nullable().optional(),
  countrySubdivision: z.string().nullable().optional(),
  value: z.unknown(),
  source: z.enum(["analyst", "manual"]),
  authority: z.string().nullable().optional(),
  referenceUrl: z.string().nullable().optional(),
  researchRunId: z.number().int().nullable().optional(),
  overrideNote: z.string().nullable().optional(),
  createdBy: z.number().int().nullable().optional(),
});

export type ModelConstantOverride = typeof modelConstantOverrides.$inferSelect;
export type InsertModelConstantOverride = z.infer<typeof insertModelConstantOverrideSchema>;
