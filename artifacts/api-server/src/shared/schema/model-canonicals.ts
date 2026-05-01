/**
 * Model Constants — Canonical Authority Layer (DB-backed)
 *
 * This table holds the *canonical* authority-dictated value for each
 * (constantKey, country, countrySubdivision) tuple. It is the new source of
 * truth for governed financial constants per the `constants-vs-defaults`
 * skill: when an authority publishes a value (IRS, GAAP, country tax agency,
 * Damodaran CRP table, etc.), it lives in this table — admins can update it
 * without a deploy.
 *
 * Resolution order at runtime (see `shared/get-effective-constant.ts`):
 *
 *   manual override > analyst override > DB canonical row at locality
 *     > DB canonical at country level > DB canonical at universal
 *     > TS factory fallback (last-resort only when no DB row found)
 *
 * Locality:
 *   - `country = NULL`     → universal constant (e.g. daysPerMonth)
 *   - `country = 'United States'`, `subdivision = NULL`        → country-level
 *   - `country = 'United States'`, `subdivision = 'Florida'`   → state-level
 *
 * Distinct from `model_constant_overrides`:
 *   - This table holds the *baseline* every property starts from.
 *   - Override table holds *departures* from baseline keyed by source.
 *
 * Seed lives in `script/seed-model-constants.ts` and is idempotent: it
 * mirrors `COUNTRY_DEFAULTS` and `US_STATE_DEFAULTS` from
 * `shared/countryDefaults.ts` plus universal scalars from
 * `shared/constants.ts`.
 */

import { pgTable, text, integer, timestamp, jsonb, date, index, unique } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./auth";

export const modelConstants = pgTable("model_constants", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // Identity
  constantKey: text("constant_key").notNull(),           // e.g. "taxRate", "depreciationYears"
  country: text("country"),                              // NULL = universal
  countrySubdivision: text("country_subdivision"),       // NULL = country-level; else state name

  // Value (jsonb for number | string | bool | array)
  value: jsonb("value").notNull().$type<unknown>(),

  // Provenance — what authority publishes this value
  unit: text("unit"),                                    // "%", "years", "days", "$"
  authoritySource: text("authority_source").notNull(),   // e.g. "IRS Publication 946, IRC §168(e)(2)(A)"
  authorityRef: text("authority_ref"),                   // citation URL or document id
  effectiveFrom: date("effective_from"),                 // when the authority's value started applying
  notes: text("notes"),                                  // free-form context (e.g. "USD-indexed economy")

  // Audit
  lastEditedBy: integer("last_edited_by").references(() => users.id, { onDelete: "set null" }),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_mc_key_country_subdivision").on(
    table.constantKey,
    table.country,
    table.countrySubdivision,
  ),
  index("idx_mc_key_country").on(table.constantKey, table.country),
]);

// Manual zod schema (consistent with model_constant_overrides convention).
export const insertModelConstantSchema = z.object({
  constantKey: z.string().min(1),
  country: z.string().nullable().optional(),
  countrySubdivision: z.string().nullable().optional(),
  value: z.unknown(),
  unit: z.string().nullable().optional(),
  authoritySource: z.string().min(1),
  authorityRef: z.string().nullable().optional(),
  effectiveFrom: z.string().nullable().optional(),  // ISO date string
  notes: z.string().nullable().optional(),
  lastEditedBy: z.number().int().nullable().optional(),
});

export type ModelConstant = typeof modelConstants.$inferSelect;
export type InsertModelConstant = z.infer<typeof insertModelConstantSchema>;
