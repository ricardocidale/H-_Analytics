/**
 * assumption-guardrails.ts — Deterministic plausibility bands for every
 * numeric assumption surfaced by a range badge in H+ Analytics.
 *
 * Owns the data Fabio (`lib/engine/src/analyst/minions/fabio.ts`) reads to
 * decide the green/amber/red **range-quality dot** at the edge of every
 * range value chip and to decide whether a user-entered value falls "out
 * of range". Per the range-badge contract memorized in `replit.md`
 * (2026-05-11):
 *
 *   - The dot reflects whether the *range itself* is plausible per the
 *     DB-stored guardrails (e.g. cost of equity outliers ∉ [6%, 25%]).
 *   - When the user's value falls outside the range, a separate terse
 *     "out of range" chip is rendered.
 *
 * Surfaced read-only under Admin → AI → Intelligence → Knowledge &
 * Resources → Tables. Updated only through code seed; never written to
 * by the front-of-app.
 *
 * Unit convention:
 *   - For percentage assumptions stored as decimal fractions of revenue
 *     (cost_pct_revenue, markup_pct_revenue, …), guardrail low/high are
 *     also decimal fractions. e.g. low=0.005 = 0.5% of revenue.
 *   - `unit` is a free-text label so future non-percentage assumptions
 *     (e.g. cap rate, room counts) can use the same table.
 */
import {
  pgTable,
  integer,
  text,
  doublePrecision,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const assumptionGuardrails = pgTable(
  "assumption_guardrails",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    // Canonical assumption key, e.g.
    //   "vendor_passthrough_cost.marketing"
    //   "mgmt_co_markup_factor.reservations"
    //   "wacc.cost_of_equity"
    assumptionKey: text("assumption_key").notNull(),
    // Plausibility low bound (inclusive). Values strictly below this are
    // "out of range red" per Fabio.
    low: doublePrecision("low").notNull(),
    // Plausibility high bound (inclusive). Values strictly above this are
    // "out of range red" per Fabio.
    high: doublePrecision("high").notNull(),
    // Optional narrower "in-band" target where Fabio returns "green".
    // When null Fabio derives a green band as the inner 50% of [low, high].
    targetLow: doublePrecision("target_low"),
    targetHigh: doublePrecision("target_high"),
    // Free-text unit label, e.g. "fraction_of_revenue", "fraction", "USD".
    unit: text("unit").notNull(),
    // Short human-readable rationale for the bounds — surfaced in the
    // Knowledge & Resources read-only card.
    rationale: text("rationale"),
    // Source citation (publisher or methodology name); nullable when the
    // bound is engineered from internal calibration.
    source: text("source"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("assumption_guardrails_key_uniq").on(t.assumptionKey),
  ],
);

export type AssumptionGuardrailRow = typeof assumptionGuardrails.$inferSelect;
export type InsertAssumptionGuardrail = typeof assumptionGuardrails.$inferInsert;
