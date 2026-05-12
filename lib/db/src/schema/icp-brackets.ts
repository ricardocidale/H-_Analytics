/**
 * schema/icp-brackets.ts — ICP Bracket Catalog
 *
 * Task #1409 — replaces the per-company ~70-field ICP with a small shared
 * catalog of 3–5 reusable customer-property archetypes. Each Management
 * Company stores a weighted bracket mix (weights sum to 1.0) in
 * global_assumptions.bracket_mix pointing at rows in this table.
 *
 * Doctrine (from requirements.md R1–R4):
 *   - Brackets are shared across all Management Companies (not scoped per company).
 *   - customer_type drives service consumption: 'hotel' → all service lines,
 *     'str' → marketing/branding/performance-bonus only (R8/R9/R10).
 *   - service_consumption_profile is the machine-readable consumption rule:
 *     'full' | 'str_only'.
 *   - target_adr_band_low/high captures the revenue-side signal per R6.
 *   - comp_set_names stores the comp brand names that characterize the bracket (R4).
 */

import { pgTable, integer, text, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

// ── Table ────────────────────────────────────────────────────────────────────

export const icpBrackets = pgTable("icp_brackets", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  archetypeLabel: text("archetype_label").notNull(),
  customerType: text("customer_type").notNull(),                 // 'hotel' | 'str'
  serviceConsumptionProfile: text("service_consumption_profile").notNull(), // 'full' | 'str_only'
  targetAdrBandLow: real("target_adr_band_low"),
  targetAdrBandHigh: real("target_adr_band_high"),
  compSetNames: jsonb("comp_set_names").$type<string[]>(),
  description: text("description"),
  sourceNote: text("source_note"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type IcpBracket = typeof icpBrackets.$inferSelect;
export type InsertIcpBracket = typeof icpBrackets.$inferInsert;

// ── Bracket mix entry (per-company, stored in global_assumptions.bracket_mix) ──

export const BracketMixEntrySchema = z.object({
  bracketSlug: z.string(),
  weight: z.number().min(0).max(1),
});

export const BracketMixSchema = z.array(BracketMixEntrySchema);

export type BracketMixEntry = z.infer<typeof BracketMixEntrySchema>;
export type BracketMix = BracketMixEntry[];

// ── Customer type enum ────────────────────────────────────────────────────────

export const ICP_CUSTOMER_TYPES = ["hotel", "str"] as const;
export type IcpCustomerType = typeof ICP_CUSTOMER_TYPES[number];

// ── Service consumption profiles ─────────────────────────────────────────────

export const ICP_SERVICE_CONSUMPTION_PROFILES = ["full", "str_only"] as const;
export type IcpServiceConsumptionProfile = typeof ICP_SERVICE_CONSUMPTION_PROFILES[number];
