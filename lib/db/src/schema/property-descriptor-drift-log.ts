// Property Descriptor Drift Log (Plan 2026-05-13-002, Unit U1).
//
// Append-only event log. Every divergence between a typed descriptor column
// and its mirror in `descriptors_purchased` / `descriptors_improved` JSONB
// detected after a property write produces one row per drifted field. The
// 14-day clean-window query gates Unit U8 (drop dual-write + drop deprecated
// typed columns) — until the count over a sliding 14-day window is zero, U8
// cannot proceed.
//
// Drift records do NOT carry user/session attribution: the goal is to spot
// write-paths that bypass `buildDescriptorDualWritePatch`, not to audit
// individual operators. The `propertyId` + `fieldKey` + `createdAt` triple is
// enough to triage which code path produced the divergence.

import {
  pgTable,
  bigserial,
  integer,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { properties } from "./properties";

export const PROPERTY_DESCRIPTOR_DRIFT_SIDES = ["purchased", "improved"] as const;
export type PropertyDescriptorDriftSide =
  (typeof PROPERTY_DESCRIPTOR_DRIFT_SIDES)[number];

export const propertyDescriptorDriftLog = pgTable(
  "property_descriptor_drift_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    propertyId: integer("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    fieldKey: text("field_key").notNull(),
    side: text("side").notNull(),
    typedValue: jsonb("typed_value"),
    jsonbValue: jsonb("jsonb_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    createdAtIdx: index("property_descriptor_drift_log_created_at_idx").on(
      table.createdAt,
    ),
    propertyIdIdx: index("property_descriptor_drift_log_property_id_idx").on(
      table.propertyId,
    ),
  }),
);

export type PropertyDescriptorDriftLogRow =
  typeof propertyDescriptorDriftLog.$inferSelect;
export type InsertPropertyDescriptorDriftLog =
  typeof propertyDescriptorDriftLog.$inferInsert;

/**
 * Result shape of the clean-window probe consumed by Unit U8's cleanup gate.
 * `count = 0` AND `lastSeenAt = null` is the green-light condition (no drift
 * observed in the requested window).
 */
export interface DescriptorDriftWindowSummary {
  count: number;
  lastSeenAt: Date | null;
}
