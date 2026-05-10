/**
 * Specialist recommendation telemetry — promote vs ignore events plus the
 * per-(specialistId, fieldKey) appearance counters.
 *
 * Split from `lib/db/src/schema/specialist.ts` (task #1361). See the barrel at
 * `../specialist.ts` for the full doctrine doc-comment.
 */

import { z } from "zod/v4";
import {
  pgTable,
  text,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "../auth";

// ════════════════════════════════════════════════════════════════════════════
// Phase 4 — Specialist recommendation telemetry (promote vs ignore)
//
// The Required Fields tab surfaces `lastObservedMissing` candidate-field keys
// as one-click promote-to-Recommended / promote-to-Hard-required actions.
// Until now, the only signal was a side effect on `field_requirements` (a
// successful promote bumped the toggle). Ignored recommendations left no
// trace, so we couldn't tell whether a key is being ignored on purpose vs
// the admin simply hasn't seen the page yet.
//
// This table is append-only telemetry: every promote action AND every
// explicit "Ignore" action writes one row. Aggregating by (specialistId,
// fieldKey) yields the promote-vs-ignore ratio that calibrates whether
// the catalog should declare a key "recommended" by default in a future
// release.
// ════════════════════════════════════════════════════════════════════════════

export const SPECIALIST_RECOMMENDATION_ACTIONS = [
  "promote-recommended",
  "promote-hard",
  "ignore",
] as const;
export type SpecialistRecommendationAction =
  typeof SPECIALIST_RECOMMENDATION_ACTIONS[number];
export const SpecialistRecommendationActionSchema = z.enum(
  SPECIALIST_RECOMMENDATION_ACTIONS,
);

export const specialistRecommendationEvents = pgTable(
  "specialist_recommendation_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    fieldKey: text("field_key").notNull(),
    action: text("action").$type<SpecialistRecommendationAction>().notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (t) => [
    index("specialist_rec_events_specialist_idx").on(t.specialistId),
  ],
);
export type SpecialistRecommendationEventRow =
  typeof specialistRecommendationEvents.$inferSelect;

export const recordRecommendationEventSchema = z.object({
  fieldKey: z.string().min(1).max(100),
  action: SpecialistRecommendationActionSchema,
});
export type RecordRecommendationEventInput = z.infer<
  typeof recordRecommendationEventSchema
>;

// ════════════════════════════════════════════════════════════════════════════
// Task #438 — Per-(specialistId, fieldKey) appearance counters.
//
// `lastObservedMissing` only tells us "what was missing on the last run". To
// help admins spot perennial offenders ("this field has been recommended N
// times, never promoted") we need a rolling counter that is bumped every
// time a candidate field appears in the observed-missing list.
//
// Promotion ANNOTATES the counter: `lastPromotedAt` is set and `appearances`
// is reset to 0 so the count reads "since last promotion". The row is
// preserved (not deleted) so the annotation survives a future demote.
// ════════════════════════════════════════════════════════════════════════════

export const specialistRecommendationCounters = pgTable(
  "specialist_recommendation_counters",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    fieldKey: text("field_key").notNull(),
    /**
     * Number of Specialist runs in which this candidate field appeared in
     * the observed-missing list since the last promotion (or ever, if the
     * field has never been promoted). Reset to 0 by a promote action.
     */
    appearances: integer("appearances").notNull().default(0),
    /** First time this counter row was created. */
    firstObservedAt: timestamp("first_observed_at").defaultNow().notNull(),
    /** Most recent run that observed this field as missing. */
    lastObservedAt: timestamp("last_observed_at").defaultNow().notNull(),
    /** Last admin promotion of this field (annotation, null = never). */
    lastPromotedAt: timestamp("last_promoted_at"),
  },
  (t) => [
    uniqueIndex("specialist_rec_counters_uniq").on(t.specialistId, t.fieldKey),
    index("specialist_rec_counters_specialist_idx").on(t.specialistId),
  ],
);
export type SpecialistRecommendationCounterRow =
  typeof specialistRecommendationCounters.$inferSelect;
