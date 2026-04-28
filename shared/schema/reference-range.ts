/**
 * reference_range — admin-editable, source-cited low/mid/high reference
 * ranges for tax tables, macro indicators, hospitality KPIs,
 * construction costs, financing terms, labor rates, risk premia, and
 * demand metrics.
 *
 * Phase 1 (this file): the table itself + read-only access. Edit UX,
 * Specialist tool wiring, Rebecca cross-namespace retrieval, deep-research
 * seed, and the staleness-driven refresh scheduler are sequenced as
 * Phases 2–6 in `.local/tasks/specialist-reference-ranges.md`.
 *
 * Doctrine:
 *   - One row = one (domain × metric × jurisdiction × year) reference range.
 *   - The jurisdiction columns descend from coarsest to finest:
 *     country (default `"GLOBAL"`) → subdivision → market.
 *     A best-match resolver picks the most specific row that satisfies
 *     a query (Phase 3); for Phase 1 we just store and surface them.
 *   - Provenance is mandatory in spirit: either `sourceId` (FK into
 *     `source_registry`, which carries trust + cadence + last-health-check)
 *     or a free-text `sourceName` + `sourceUrl` for sources that haven't
 *     graduated to the registry yet.
 *   - `details` is a typed JSON escape hatch for domain-specific extras
 *     (e.g. per-bracket tax thresholds, per-class depreciation lives,
 *     payment-shock scenarios). Anything that breaks the low/mid/high
 *     shape goes here so we don't widen the table for one edge case.
 *   - `archivedAt` is a soft-delete marker. The admin grid hides
 *     archived rows by default; deep-research seeds may resurrect them
 *     by clearing the field rather than re-inserting.
 */
import { pgTable, text, real, integer, timestamp, jsonb, date, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sourceRegistry } from "./intelligence-v2";

/** Categorical taxonomy. Drives the admin filter dropdown and the
 *  best-match resolver's domain-scoped search. */
export const REFERENCE_RANGE_DOMAINS = [
  "tax",          // corporate income, capital gains, withholding, hotel/tourism tax
  "macro",        // inflation, country risk premium, GDP growth, FX volatility
  "kpi",          // ADR, RevPAR, occupancy, cap-rate, GOP margin
  "construction", // cost-per-key, FF&E per key, PIP cost
  "financing",    // LTV, DSCR, interest spreads, equity multiple
  "labor",        // FTE per key, hospitality wage rates, benefits load
  "risk",         // insurance rate per $1k, hurricane premium, milestone-inspection cost
  "demand",       // RevPAR seasonality, length-of-stay, ADR premium per star
] as const;
export type ReferenceRangeDomain = typeof REFERENCE_RANGE_DOMAINS[number];

/** Operator's confidence in the row. Distinct from the Analyst Verdict
 *  qualityScore — this is the curator's call, not the renderer's. */
export const REFERENCE_RANGE_CONFIDENCES = ["high", "medium", "low"] as const;
export type ReferenceRangeConfidence = typeof REFERENCE_RANGE_CONFIDENCES[number];

export const referenceRanges = pgTable("reference_range", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),

  // ── Categorical taxonomy ────────────────────────────────────────────
  /** One of REFERENCE_RANGE_DOMAINS. Stored as text (not enum) so admins
   *  can introduce new domains via deep research without a schema push. */
  domain: text("domain").notNull(),
  /** Stable kebab-case key, e.g. "corporate-tax-rate", "adr-luxury",
   *  "cost-per-key-upper-upscale". Lookups join on (domain, metricKey). */
  metricKey: text("metric_key").notNull(),
  /** Human-readable name for the admin grid + Specialist citations. */
  label: text("label").notNull(),

  // ── Jurisdictional grain (coarse → fine) ────────────────────────────
  /** ISO-3166 alpha-2 (`"US"`, `"BR"`, ...) or the literal `"GLOBAL"`
   *  for rows that apply everywhere absent a more specific match. */
  country: text("country").notNull().default("GLOBAL"),
  /** State / province code. Nullable. */
  subdivision: text("subdivision"),
  /** City / MSA. Nullable. */
  market: text("market"),
  /** Hospitality segment, e.g. "luxury", "upper-upscale", "midscale". Nullable. */
  segment: text("segment"),
  /** Asset type, e.g. "hotel", "resort", "rental". Nullable. */
  propertyType: text("property_type"),

  // ── Time grain ──────────────────────────────────────────────────────
  /** Calendar year the range applies to. Authoritative dates (e.g. tax
   *  effective dates) ride on `effectiveFrom` / `effectiveUntil`. */
  year: integer("year").notNull(),
  effectiveFrom: date("effective_from"),
  effectiveUntil: date("effective_until"),

  // ── The range itself ────────────────────────────────────────────────
  low: real("low").notNull(),
  mid: real("mid").notNull(),
  high: real("high").notNull(),
  /** Free-text unit, e.g. "percent", "usd_per_key", "years", "bps",
   *  "usd_per_room_night". Specialists declare the unit they expect when
   *  calling `lookupReferenceRange` (Phase 3) and the lookup mismatches
   *  loudly. */
  unit: text("unit").notNull(),

  // ── Provenance ──────────────────────────────────────────────────────
  /** Preferred linkage — joins to source_registry which carries trust
   *  score, cadence, last-health-check, and rate limits. */
  sourceId: integer("source_id").references(() => sourceRegistry.id, { onDelete: "set null" }),
  /** Free-text fallback for sources that haven't graduated to the
   *  registry yet (e.g. a one-off tax authority bulletin). */
  sourceName: text("source_name"),
  sourceUrl: text("source_url"),
  /** One-line description of how the range was derived. Surfaces in the
   *  admin grid hover and in Specialist citations. */
  methodology: text("methodology"),
  confidence: text("confidence").notNull().default("medium"),

  /** Domain-specific structured extras — see file header. */
  details: jsonb("details").$type<Record<string, unknown>>(),

  // ── Lifecycle ───────────────────────────────────────────────────────
  /** Last time an admin or a deep-research seed re-confirmed the row's
   *  numbers against the source. Drives the staleness pill in the grid
   *  and (Phase 6) the refresh scheduler's eligibility check. */
  lastVerifiedAt: timestamp("last_verified_at"),
  /** Soft delete. Archived rows are hidden in the grid by default and
   *  ignored by the best-match resolver. */
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Hot path: best-match resolver narrows by (domain, metric, country, year).
  index("reference_range_lookup_idx").on(table.domain, table.metricKey, table.country, table.year),
  // Browse-by-jurisdiction in the admin grid.
  index("reference_range_jurisdiction_idx").on(table.country, table.subdivision, table.market),
  // Source attribution roll-ups.
  index("reference_range_source_idx").on(table.sourceId),
  // Staleness queries (Phase 6 scheduler).
  index("reference_range_verified_idx").on(table.lastVerifiedAt),
  // Best-effort dedup. Postgres treats NULL as distinct in unique
  // constraints, so two rows with the same (domain, metric, country,
  // year) but different NULL combinations on (subdivision, market,
  // segment, propertyType) will both be allowed. The Phase 2 admin
  // upsert path enforces strict dedup at write time.
  unique("reference_range_unique").on(
    table.domain, table.metricKey, table.country, table.subdivision, table.market,
    table.segment, table.propertyType, table.year,
  ),
]);

export const insertReferenceRangeSchema = createInsertSchema(referenceRanges).pick({
  domain: true, metricKey: true, label: true,
  country: true, subdivision: true, market: true, segment: true, propertyType: true,
  year: true, effectiveFrom: true, effectiveUntil: true,
  low: true, mid: true, high: true, unit: true,
  sourceId: true, sourceName: true, sourceUrl: true, methodology: true, confidence: true,
  details: true,
  lastVerifiedAt: true,
}).extend({
  domain: z.enum(REFERENCE_RANGE_DOMAINS),
  confidence: z.enum(REFERENCE_RANGE_CONFIDENCES).optional(),
}).refine((row) => row.low <= row.mid && row.mid <= row.high, {
  message: "reference_range requires low <= mid <= high",
  path: ["mid"],
});

export type ReferenceRange = typeof referenceRanges.$inferSelect;
export type InsertReferenceRange = z.infer<typeof insertReferenceRangeSchema>;
