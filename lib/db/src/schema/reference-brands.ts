/**
 * reference_brands — curated reference brands for boutique/lifestyle
 * hospitality operators. Each row represents one real brand that serves
 * as a directional reference point — not an exact benchmark — for
 * understanding what a scaled boutique lifestyle operator can look like.
 *
 * Doctrine:
 *   - Populated and refreshed exclusively by the Analyst (LLM + web
 *     research). No manual edits. Full-replace on each refresh.
 *   - Wide variation across rows is intentional and expected: these brands
 *     span different niches (luxury adventure, co-living, micro-hotels,
 *     etc.), geographies, and scales.
 *   - Every row carries a `reference_disclaimer = true` flag signaling
 *     to consumers that the data is orientation-grade, not audit-grade.
 *   - `source_urls` is a JSONB array of URLs the Analyst cited when
 *     producing the row.
 */
import { pgTable, text, real, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { researchRuns } from "./intelligence-v2";

export const referenceBrands = pgTable("reference_brands", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // ── Brand identity ─────────────────────────────────────────────
  brandName: text("brand_name").notNull(),
  niche: text("niche"),
  positioningSummary: text("positioning_summary"),
  guestSegment: text("guest_segment"),

  // ── Scale ──────────────────────────────────────────────────────
  propertyCount: integer("property_count"),
  keyCountMin: integer("key_count_min"),
  keyCountMax: integer("key_count_max"),
  geographicFocus: text("geographic_focus"),

  // ── Key metrics (orientation-grade, not audit-grade) ───────────
  adrUsd: real("adr_usd"),
  occupancyPct: real("occupancy_pct"),
  revparUsd: real("revpar_usd"),
  revenueRangeLowUsd: real("revenue_range_low_usd"),
  revenueRangeHighUsd: real("revenue_range_high_usd"),

  // ── Ownership & acquisition context ───────────────────────────
  ownershipModel: text("ownership_model"),
  acquisitionContext: text("acquisition_context"),

  // ── Qualitative description ────────────────────────────────────
  description: text("description"),

  // ── Data governance ───────────────────────────────────────────
  /** Always true — signals this row is reference-only, not audit-grade. */
  referenceDisclaimer: boolean("reference_disclaimer").notNull().default(true),
  /** Calendar year the metric data applies to (may be null for brand-level info). */
  dataYear: integer("data_year"),
  /** URLs the Analyst cited when producing or verifying this row. */
  sourceUrls: jsonb("source_urls").$type<string[]>(),

  // ── Lifecycle ─────────────────────────────────────────────────
  lastRefreshedAt: timestamp("last_refreshed_at"),
  /** research_runs.id for the run that last replaced this row. */
  refreshedByRunId: integer("refreshed_by_run_id").references(() => researchRuns.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("reference_brands_name_idx").on(table.brandName),
  index("reference_brands_refreshed_idx").on(table.lastRefreshedAt),
  index("reference_brands_refreshed_by_run_id_idx").on(table.refreshedByRunId),
]);

export const insertReferenceBrandSchema = createInsertSchema(referenceBrands).pick({
  brandName: true,
  niche: true,
  positioningSummary: true,
  guestSegment: true,
  propertyCount: true,
  keyCountMin: true,
  keyCountMax: true,
  geographicFocus: true,
  adrUsd: true,
  occupancyPct: true,
  revparUsd: true,
  revenueRangeLowUsd: true,
  revenueRangeHighUsd: true,
  ownershipModel: true,
  acquisitionContext: true,
  description: true,
  referenceDisclaimer: true,
  dataYear: true,
  sourceUrls: true,
  lastRefreshedAt: true,
  refreshedByRunId: true,
});

export type ReferenceBrand = typeof referenceBrands.$inferSelect;
export type InsertReferenceBrand = z.infer<typeof insertReferenceBrandSchema>;
