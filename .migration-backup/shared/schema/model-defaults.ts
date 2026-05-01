/**
 * Model Defaults — DB-backed seed values for the Steady State → Defaults page.
 *
 * Per `docs/architecture/STEADY-STATE.md` §7 (Defaults locked tree) and §3
 * (cascade rule), Defaults are the admin-set seed values that become a user's
 * starting assumptions on first save. They are distinct from `model_constants`
 * (authority-published) and from a user's `scenarios` (saved snapshots).
 *
 * Storage decision (Q1 — locked Apr 20, 2026): pure DB-backed table, no TS
 * factory fallback. Day-zero values arrive via a seed migration; admin owns
 * every value from that point forward.
 *
 * Locality scoping (Q2 — locked): all rows are universal at MVP — every
 * scope column defaults to NULL meaning "applies to any locality / business
 * type / size band." Scope columns exist now so when the Analyst learns enough
 * to specialize defaults per (country, state, business type, size), we add
 * rows without a schema migration. Resolution at read time: most-specific
 * matching row wins; falls back to the universal row.
 *
 * Save semantics (Q3 — locked): governed at the UI layer; this table holds
 * the seed value, the pending Analyst proposal (if any), and full provenance.
 * Save granularity (per-tab vs per-page) is a UI grouping decision per card.
 *
 * Analyst-proposes / admin-disposes (Q5 — locked): the `proposed_*` columns
 * carry the latest Analyst proposal. Admin acceptance fires a card Save which
 * copies `proposed_value` → `value`, sets `last_set_source = 'analyst_accepted'`,
 * and clears the `proposed_*` fields. A "Pending Proposals" queue is just
 * `SELECT * FROM model_defaults WHERE proposed_value IS NOT NULL`.
 */

import { sql } from "drizzle-orm";
import { pgTable, text, integer, real, timestamp, jsonb, index, unique, check } from "drizzle-orm/pg-core";
import { z } from "zod";
import { users } from "./auth";

export const modelDefaults = pgTable("model_defaults", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // Identity — dotted path, e.g. "mc.funding.baseRaiseSize" or "property.template.startAdr"
  defaultKey: text("default_key").notNull(),

  // UI grouping (drives Steady State → Defaults page tabs and cards)
  category: text("category").notNull(),                    // 'management_company' | 'property' | 'macro' | 'market'
  subTab: text("sub_tab").notNull(),                       // e.g. 'funding', 'revenue', 'compensation', 'template', 'macro', 'market'
  cardKey: text("card_key").notNull(),                     // e.g. 'capital_raise_terms', 'fee_structure'

  // Forward-compat scope (NULL = universal at this dimension; most-specific row wins at resolve time)
  country: text("country"),                                // e.g. 'United States'
  countrySubdivision: text("country_subdivision"),         // e.g. 'Florida'
  businessType: text("business_type"),                     // e.g. 'luxury' | 'upper-upscale'
  sizeBand: text("size_band"),                             // e.g. 'small' | 'medium' | 'large'

  // The current value (source of truth for the user's first-visit composition)
  value: jsonb("value").notNull().$type<unknown>(),
  unit: text("unit"),                                      // '%', 'years', '$', 'months'
  label: text("label"),                                    // human-readable field label for UI

  // Pending Analyst proposal (NULL when nothing pending) — drives both the
  // inline yellow-range card UI and the global Pending Proposals queue (Q4 + Q5).
  proposedValue: jsonb("proposed_value").$type<unknown>(),
  proposedRangeLow: jsonb("proposed_range_low").$type<unknown>(),
  proposedRangeHigh: jsonb("proposed_range_high").$type<unknown>(),
  proposedAuthority: text("proposed_authority"),           // citation
  proposedReferenceUrl: text("proposed_reference_url"),
  proposedConviction: real("proposed_conviction"),         // 0..1
  proposedResearchRunId: integer("proposed_research_run_id"),
  proposedAt: timestamp("proposed_at", { withTimezone: true }),

  // Provenance for the current value
  lastSetBy: integer("last_set_by").references(() => users.id, { onDelete: "set null" }),
  lastSetAt: timestamp("last_set_at", { withTimezone: true }).defaultNow().notNull(),
  lastSetReason: text("last_set_reason"),                  // optional admin note
  lastSetSource: text("last_set_source").notNull(),        // 'seed' | 'manual' | 'analyst_accepted'

  // Audit
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_model_defaults_key_scope").on(
    table.defaultKey,
    table.country,
    table.countrySubdivision,
    table.businessType,
    table.sizeBand,
  ),
  index("idx_model_defaults_grouping").on(table.category, table.subTab, table.cardKey),
  index("idx_model_defaults_pending").on(table.proposedValue),
  check(
    "model_defaults_last_set_source_check",
    sql`${table.lastSetSource} IN ('seed', 'manual', 'analyst_accepted')`,
  ),
]);

export const insertModelDefaultSchema = z.object({
  defaultKey: z.string().min(1),
  category: z.enum(["management_company", "property", "macro", "market"]),
  subTab: z.string().min(1),
  cardKey: z.string().min(1),
  country: z.string().nullable().optional(),
  countrySubdivision: z.string().nullable().optional(),
  businessType: z.string().nullable().optional(),
  sizeBand: z.string().nullable().optional(),
  value: z.unknown(),
  unit: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  proposedValue: z.unknown().nullable().optional(),
  proposedRangeLow: z.unknown().nullable().optional(),
  proposedRangeHigh: z.unknown().nullable().optional(),
  proposedAuthority: z.string().nullable().optional(),
  proposedReferenceUrl: z.string().nullable().optional(),
  proposedConviction: z.number().min(0).max(1).nullable().optional(),
  proposedResearchRunId: z.number().int().nullable().optional(),
  proposedAt: z.date().nullable().optional(),
  lastSetBy: z.number().int().nullable().optional(),
  lastSetReason: z.string().nullable().optional(),
  lastSetSource: z.enum(["seed", "manual", "analyst_accepted"]),
});

export type ModelDefault = typeof modelDefaults.$inferSelect;
export type InsertModelDefault = z.infer<typeof insertModelDefaultSchema>;
