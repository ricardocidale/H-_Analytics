import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

export const costantinoFindings = pgTable(
  "costantino_findings",
  {
    findingId: uuid("finding_id").primaryKey().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
    description: text("description").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: integer("resolved_by").references(() => users.id, { onDelete: "set null" }),
    evidence: jsonb("evidence").notNull().$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    index("costantino_findings_target_idx").on(t.targetKind, t.targetId),
    index("costantino_findings_detected_at_idx").on(t.detectedAt.desc()),
    index("costantino_findings_open_idx")
      .on(t.resolvedAt)
      .where(sql`${t.resolvedAt} IS NULL`),
  ],
);

export type CostantinoFinding = typeof costantinoFindings.$inferSelect;
export type NewCostantinoFinding = typeof costantinoFindings.$inferInsert;
