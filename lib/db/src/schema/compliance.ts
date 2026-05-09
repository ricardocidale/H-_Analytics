/**
 * Vito compliance agent tables.
 *
 * `vito_runs` — one row per audit scan (append-only).
 * `compliance_violations` — one row per unique violation, upserted on
 * violationFingerprint so the table stays compact and merges across
 * repeated scans.
 */
import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "./auth";

// ---------------------------------------------------------------------------
// vito_runs
// ---------------------------------------------------------------------------

export const vitoRuns = pgTable("vito_runs", {
  id: serial("id").primaryKey(),
  /** Trigger source for this audit scan. */
  trigger: text("trigger").notNull(),
  /** "runtime" — skip full-mode passes; "full" — all passes including source scan. */
  mode: text("mode").notNull().default("runtime"),
  passesCompleted: integer("passes_completed").notNull().default(0),
  blockCount: integer("block_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  advisoryCount: integer("advisory_count").notNull().default(0),
  infoCount: integer("info_count").notNull().default(0),
  /** Overall audit outcome — "ok" | "warn" | "error". */
  status: text("status").notNull().default("ok"),
  notes: text("notes"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VitoRun = typeof vitoRuns.$inferSelect;

export const insertVitoRunSchema = createInsertSchema(vitoRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertVitoRun = z.infer<typeof insertVitoRunSchema>;

// ---------------------------------------------------------------------------
// compliance_violations
// ---------------------------------------------------------------------------

export const complianceViolations = pgTable(
  "compliance_violations",
  {
    id: serial("id").primaryKey(),
    /** sha256(violationType + ":" + file + ":" + description) */
    violationFingerprint: text("violation_fingerprint").notNull(),
    /**
     * Category of violation:
     *   "integration_identifier" — model/API string literal in source
     *   "magic_number"           — raw numeric literal or wrong-file constant
     *   "admin_resources_drift"  — llm_slot / resolver mismatch
     *   "kb_gap"                 — financial constant with no KB entry
     */
    violationType: text("violation_type").notNull(),
    /** "block" | "warning" | "advisory" | "info" */
    severity: text("severity").notNull(),
    file: text("file").notNull(),
    lineHint: integer("line_hint"),
    description: text("description").notNull(),
    suggestedFix: text("suggested_fix"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    lastRunId: integer("last_run_id").references(() => vitoRuns.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at"),
    acceptedNote: text("accepted_note"),
  },
  (table) => [
    unique("compliance_violations_fingerprint_unique").on(table.violationFingerprint),
    index("compliance_violations_severity_status_idx").on(
      table.severity,
      table.resolvedAt,
      table.acceptedAt,
    ),
  ],
);

export type ComplianceViolation = typeof complianceViolations.$inferSelect;

export const insertComplianceViolationSchema = createInsertSchema(complianceViolations).omit({
  id: true,
  firstSeenAt: true,
  lastSeenAt: true,
});
export type InsertComplianceViolation = z.infer<typeof insertComplianceViolationSchema>;
