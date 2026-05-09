/**
 * Admin Resources control-plane contracts.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Doctrine: replit.md "Resources sidebar section (NEW, canonical SoT)" block
 *           (LOCKED 2026-04-21).
 *
 * Resources are the single canonical source of truth for APIs, Sources,
 * Tables, Benchmarks, and Models app-wide. Specialists declare what they
 * need via AssignmentRef (in `engine/analyst/registry/specialist-catalog.ts`);
 * the catalog-sync job materializes those declarations into the
 * `specialist_assignments` join table at deploy. Admins edit Resources in
 * the canonical Resources pages; Specialist pages render assignments
 * read-only with a health dot + Test button.
 *
 * P1 scope: contracts only (Zod schemas + types).
 * P2 scope (this file, below): Drizzle tables for canonical persistence:
 *   - admin_resources                — canonical row, one per (kind, slug)
 *   - admin_resource_versions        — append-only edit history for rollback
 *   - audit_break_glass_overrides    — super-admin time-boxed reroutes
 *   - specialist_assignments         — materialized catalog → DB join table
 */

import { z } from "zod/v4";
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

// ────────────────────────────────────────────────────────────────────────────
// ResourceKind — sibling categories at the canonical layer.
// ────────────────────────────────────────────────────────────────────────────

export const RESOURCE_KINDS = [
  "api",
  "source",
  "table",
  "benchmark",
  "model",
  "llm_slot",
  "mcp",
  "search_url",
  "research_prompt",
  "parameter",
] as const;
export type ResourceKind = typeof RESOURCE_KINDS[number];
export const ResourceKindSchema = z.enum(RESOURCE_KINDS);

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  api: "APIs",
  source: "Sources",
  table: "Tables",
  benchmark: "Benchmarks",
  model: "Models",
  llm_slot: "LLM Slots",
  mcp: "MCPs",
  search_url: "Research URLs",
  research_prompt: "Research Prompts",
  parameter: "Parameters",
};

// ────────────────────────────────────────────────────────────────────────────
// ResourceSlug — single shared kebab-case schema. Used by BOTH
// AssignmentRefSchema (what a Specialist declares) and ResourceRecordSchema
// (what the canonical row stores) so the catalog-sync resolution is
// guaranteed to match without ad-hoc normalization.
// ────────────────────────────────────────────────────────────────────────────

export const RESOURCE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
export const ResourceSlugSchema = z
  .string()
  .min(2)
  .regex(RESOURCE_SLUG_PATTERN, {
    message: "Resource slug must be kebab-case (lowercase letters, digits, dashes; no leading/trailing dash)",
  });

// ────────────────────────────────────────────────────────────────────────────
// AssignmentRef — what a Specialist declares it needs.
//
// Refs point at canonical resources by stable `slug` (NOT row id — the catalog
// is git-reviewable code; slugs survive DB rebuilds). The catalog-sync job
// (P2) resolves slugs to admin_resources rows at deploy time and materializes
// the link into specialist_assignments.
// ────────────────────────────────────────────────────────────────────────────

export const AssignmentRefSchema = z.object({
  kind: ResourceKindSchema,
  slug: ResourceSlugSchema,
  role: z.string().min(1).optional(),
  required: z.boolean().default(true),
});
export type AssignmentRef = z.infer<typeof AssignmentRefSchema>;

export function assignmentRefKey(ref: AssignmentRef): string {
  return `${ref.kind}:${ref.slug}:${ref.role ?? ""}`;
}

// ────────────────────────────────────────────────────────────────────────────
// ResourceRecord — the canonical row shape that admin_resources will store
// (P2 builds the Drizzle table). Defined here so P1 callers can type-check
// against the eventual storage contract without waiting for P2.
//
// Secrets NEVER live in `config`. Use `secretRef` (a key into the project's
// existing secret store) and resolve at runtime in the consuming module.
// ────────────────────────────────────────────────────────────────────────────

export const ResourceHealthStatusSchema = z.enum([
  "green",
  "amber",
  "red",
  "gray",
]);
export type ResourceHealthStatus = z.infer<typeof ResourceHealthStatusSchema>;

export const ResourceRecordSchema = z.object({
  id: z.string().min(1),
  kind: ResourceKindSchema,
  slug: ResourceSlugSchema,
  displayName: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
  secretRef: z.string().optional(),
  version: z.number().int().min(1),
  lastHealthStatus: ResourceHealthStatusSchema,
  lastCheckedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResourceRecord = z.infer<typeof ResourceRecordSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Probe profile config — describes how the health checker tests a resource.
// One profile per ResourceKind (P3 implements the runtime; P1 just types it).
// ────────────────────────────────────────────────────────────────────────────

export const ProbeProfileSchema = z.object({
  kind: ResourceKindSchema,
  ttlSeconds: z.number().int().min(1),
  maxCostUsd: z.number().min(0).default(0.001),
  rateLimitPerMinute: z.number().int().min(1).default(6),
});
export type ProbeProfile = z.infer<typeof ProbeProfileSchema>;

// ════════════════════════════════════════════════════════════════════════════
// P2 — DRIZZLE TABLES (canonical persistence for the Resources control plane)
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
// admin_resources — canonical row, one per (kind, slug). Secrets live in
// secret_ref (a key into the project secret store), never in config.
// ────────────────────────────────────────────────────────────────────────────

export const adminResources = pgTable(
  "admin_resources",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    kind: text("kind").notNull(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    config: jsonb("config").notNull().$type<Record<string, unknown>>().default({}),
    secretRef: text("secret_ref"),
    version: integer("version").notNull().default(1),
    lastHealthStatus: text("last_health_status").notNull().default("gray"),
    lastCheckedAt: timestamp("last_checked_at"),
    // Pietro scheduler: max API calls per day for rate-limited sources. null = unlimited.
    dailyRequestBudget: integer("daily_request_budget"),
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("admin_resources_kind_slug_uniq").on(t.kind, t.slug),
    // FK indexes (Task #971): support ON DELETE SET NULL cascades from users.
    index("admin_resources_created_by_user_idx").on(t.createdByUserId),
    index("admin_resources_updated_by_user_idx").on(t.updatedByUserId),
  ],
);

// ────────────────────────────────────────────────────────────────────────────
// Per-kind probe profiles (P3). TTL drives the freshness band on read:
// "green" is served ONLY if the last successful check is within ttlSeconds;
// past TTL falls back to "amber" even when the last result was OK.
// rateLimitPerMinute caps user-driven Test-button presses per (admin, resource).
// maxCostUsd is a budget guard — probes that would cost more must short-circuit.
// ────────────────────────────────────────────────────────────────────────────

export const PROBE_PROFILES: Record<ResourceKind, { ttlSeconds: number; rateLimitPerMinute: number; maxCostUsd: number }> = {
  api: { ttlSeconds: 60, rateLimitPerMinute: 6, maxCostUsd: 0.001 },
  source: { ttlSeconds: 300, rateLimitPerMinute: 6, maxCostUsd: 0.001 },
  model: { ttlSeconds: 300, rateLimitPerMinute: 4, maxCostUsd: 0.001 },
  table: { ttlSeconds: 3600, rateLimitPerMinute: 6, maxCostUsd: 0.001 },
  benchmark: { ttlSeconds: 3600, rateLimitPerMinute: 6, maxCostUsd: 0.001 },
  // LLM slot rows are pure configuration — no external service to probe.
  llm_slot: { ttlSeconds: 86400, rateLimitPerMinute: 1, maxCostUsd: 0 },
  // Pietro external sources: MCPs have same TTL as source (5 min).
  mcp: { ttlSeconds: 300, rateLimitPerMinute: 6, maxCostUsd: 0.001 },
  // Research catalog entries: URLs are long-lived (1 h), prompts are static (24 h).
  search_url: { ttlSeconds: 3600, rateLimitPerMinute: 6, maxCostUsd: 0 },
  research_prompt: { ttlSeconds: 86400, rateLimitPerMinute: 1, maxCostUsd: 0 },
  // Parameter rows are pure configuration — no external service to probe.
  parameter: { ttlSeconds: 86400, rateLimitPerMinute: 1, maxCostUsd: 0 },
};

export const ProbeStatusSchema = z.enum(["ok", "fail", "skipped"]);
export type ProbeStatus = z.infer<typeof ProbeStatusSchema>;

/**
 * Pure freshness derivation. Last check + TTL → user-facing dot color.
 *   - green: last check ok AND within TTL
 *   - amber: last check ok BUT past TTL (stale)
 *   - red:   last check failed
 *   - gray:  never checked
 */
export function deriveHealthStatus(args: {
  lastStatus: ProbeStatus | null;
  lastCheckedAt: Date | null;
  kind: ResourceKind;
  now?: Date;
}): ResourceHealthStatus {
  if (!args.lastStatus || !args.lastCheckedAt) return "gray";
  if (args.lastStatus === "fail") return "red";
  if (args.lastStatus === "skipped") return "amber";
  const now = args.now ?? new Date();
  const ageMs = now.getTime() - args.lastCheckedAt.getTime();
  const ttlMs = PROBE_PROFILES[args.kind].ttlSeconds * 1000;
  return ageMs <= ttlMs ? "green" : "amber";
}

export const insertAdminResourceSchema = z.object({
  kind: ResourceKindSchema,
  slug: ResourceSlugSchema,
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  secretRef: z.string().min(1).nullable().optional(),
  dailyRequestBudget: z.number().int().nonnegative().nullable().optional(),
});

export type AdminResourceRow = typeof adminResources.$inferSelect;
export type InsertAdminResource = z.infer<typeof insertAdminResourceSchema>;

// ────────────────────────────────────────────────────────────────────────────
// admin_resource_versions — append-only edit history for rollback.
// Every PUT to admin_resources writes a version row first, then bumps
// admin_resources.version. Rollback re-applies a past version as a NEW
// version (history is never rewritten).
// ────────────────────────────────────────────────────────────────────────────

export const adminResourceVersions = pgTable(
  "admin_resource_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => adminResources.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description"),
    config: jsonb("config").notNull().$type<Record<string, unknown>>().default({}),
    secretRef: text("secret_ref"),
    changeSummary: text("change_summary"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("admin_resource_versions_resource_version_uniq").on(t.resourceId, t.version),
    index("admin_resource_versions_resource_idx").on(t.resourceId),
  ],
);

export type AdminResourceVersionRow = typeof adminResourceVersions.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// audit_break_glass_overrides — super-admin time-boxed assignment reroutes.
// The default (steady-state) wiring is the catalog. An override re-points a
// single (specialist_id, kind, slug, role) tuple to a different resource for
// `expires_at - created_at`. After expiry it is silently ignored on read.
// override_resource_id is nullable so an override can also represent
// "unassign/disable until expiry" for incident triage.
// ────────────────────────────────────────────────────────────────────────────

export const auditBreakGlassOverrides = pgTable(
  "audit_break_glass_overrides",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    assignmentKind: text("assignment_kind").notNull(),
    assignmentSlug: text("assignment_slug").notNull(),
    assignmentRole: text("assignment_role"),
    overrideResourceId: integer("override_resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdByUserId: integer("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
    revokedByUserId: integer("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("break_glass_specialist_idx").on(t.specialistId),
    // FK indexes (Task #971): support cascades from admin_resources / users.
    index("break_glass_override_resource_idx").on(t.overrideResourceId),
    index("break_glass_created_by_user_idx").on(t.createdByUserId),
    index("break_glass_revoked_by_user_idx").on(t.revokedByUserId),
  ],
);

export const insertBreakGlassOverrideSchema = z.object({
  specialistId: z.string().min(1),
  assignmentKind: ResourceKindSchema,
  assignmentSlug: ResourceSlugSchema,
  assignmentRole: z.string().min(1).nullable().optional(),
  overrideResourceId: z.number().int().positive().nullable().optional(),
  reason: z.string().min(8, "Break-glass reason must be at least 8 characters"),
  expiresAt: z.coerce.date(),
  createdByUserId: z.number().int().positive(),
});

export type BreakGlassOverrideRow = typeof auditBreakGlassOverrides.$inferSelect;
export type InsertBreakGlassOverride = z.infer<typeof insertBreakGlassOverrideSchema>;

// ────────────────────────────────────────────────────────────────────────────
// resource_health_checks (P3) — append-only probe history. The latest row per
// resource_id is the authoritative health record; the rest is audit trail.
// We intentionally do NOT collapse history into the parent row alone, because:
//   - "How often did this fail this week?" needs the timeline
//   - The audit story for who pressed Test (and what came back) lives here
// ────────────────────────────────────────────────────────────────────────────

export const resourceHealthChecks = pgTable(
  "resource_health_checks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => adminResources.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").notNull(),       // ok | fail | skipped
    latencyMs: integer("latency_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }), // null = scheduler
    checkedAt: timestamp("checked_at").defaultNow().notNull(),
  },
  (t) => [
    index("resource_health_checks_resource_idx").on(t.resourceId),
    // FK index (Task #971): support ON DELETE SET NULL cascades from users.
    index("resource_health_checks_triggered_by_user_idx").on(t.triggeredByUserId),
  ],
);

export type ResourceHealthCheckRow = typeof resourceHealthChecks.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// specialist_assignments — DB materialization of the catalog declarations.
// Refreshed by `server/jobs/catalog-sync.ts`. Read-only from the app's
// perspective (Specialist UI surfaces it but never edits it).
// resource_id is nullable so unresolved slugs are still recorded (and surface
// as red dots in the UI) instead of silently dropped.
// ────────────────────────────────────────────────────────────────────────────

export const specialistAssignments = pgTable(
  "specialist_assignments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    assignmentKind: text("assignment_kind").notNull(),
    assignmentSlug: text("assignment_slug").notNull(),
    assignmentRole: text("assignment_role"),
    required: boolean("required").notNull().default(true),
    resourceId: integer("resource_id").references(() => adminResources.id, { onDelete: "set null" }),
    materializedAt: timestamp("materialized_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("specialist_assignments_uniq").on(
      t.specialistId,
      t.assignmentKind,
      t.assignmentSlug,
      t.assignmentRole,
    ),
    index("specialist_assignments_specialist_idx").on(t.specialistId),
    index("specialist_assignments_resource_idx").on(t.resourceId),
  ],
);

export type SpecialistAssignmentRow = typeof specialistAssignments.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// specialist_research_quality_snapshots — lightweight per-Specialist quality
// store powering the Intelligence transparency hub (Task #500).
//
// One row per (specialistId) is the "current" snapshot; older rows are kept
// as history (queried by changedAt DESC). The score is a 0–100 blend of:
//   - probe health of required resources       (weight 35)
//   - missing required-fields penalty          (weight 20)
//   - run freshness                            (weight 15)
//   - data availability (has any run yet)      (weight 10)
//   - confidence (run reliability + self-reported)
//                                              (weight 20)
// `gaps` is an array of { code, label, severity } objects describing the
// most actionable issues (max ~6). `signals` records the raw inputs so the
// formula stays auditable in code review without re-querying every source.
// The canonical implementation (with a per-signal explanation block) lives
// in `server/ai/research-quality.ts` — keep these weights in sync.
// ────────────────────────────────────────────────────────────────────────────

export const specialistResearchQualitySnapshots = pgTable(
  "specialist_research_quality_snapshots",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    score: integer("score").notNull(),
    gaps: jsonb("gaps").notNull().$type<QualityGap[]>().default([]),
    signals: jsonb("signals").notNull().$type<Record<string, unknown>>().default({}),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (t) => [
    index("specialist_quality_specialist_idx").on(t.specialistId),
  ],
);

export type QualityGapSeverity = "info" | "warning" | "critical";
export interface QualityGap {
  code: string;
  label: string;
  severity: QualityGapSeverity;
}

export type SpecialistResearchQualitySnapshotRow =
  typeof specialistResearchQualitySnapshots.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// resource_specialist_connections (Task #496) — admin-editable many-to-many
// link between an admin_resources row (any kind) and a "target" — either a
// specific Specialist (`specialist:<id>`) or the Analyst itself (`analyst`).
//
// This is intentionally separate from `specialist_assignments` (which is the
// catalog-driven, code-only declaration). The catalog stays the source of
// truth for runtime wiring; this table layers the admin-editable surface
// that powers the Sources tab on the Specialist & Analyst pages and the
// "Connected to" column in the Resources area. On first migration the join
// rows are seeded from `specialist_assignments` so existing wiring shows up
// immediately.
// ────────────────────────────────────────────────────────────────────────────

export const ANALYST_CONNECTION_TARGET = "analyst" as const;
export const SPECIALIST_TARGET_PREFIX = "specialist:" as const;

export const ConnectionTargetSchema = z
  .string()
  .min(1)
  .refine(
    (v) => v === ANALYST_CONNECTION_TARGET || v.startsWith(SPECIALIST_TARGET_PREFIX),
    {
      message: `target must be "${ANALYST_CONNECTION_TARGET}" or start with "${SPECIALIST_TARGET_PREFIX}"`,
    },
  );
export type ConnectionTarget = z.infer<typeof ConnectionTargetSchema>;

export const resourceSpecialistConnections = pgTable(
  "resource_specialist_connections",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    resourceId: integer("resource_id")
      .notNull()
      .references(() => adminResources.id, { onDelete: "cascade" }),
    target: text("target").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("resource_specialist_connections_uniq").on(t.resourceId, t.target),
    index("resource_specialist_connections_target_idx").on(t.target),
  ],
);

export type ResourceSpecialistConnectionRow =
  typeof resourceSpecialistConnections.$inferSelect;

/**
 * Visible groups in the Sources tab. Tables, APIs/Links, Bulk sources, and
 * Uploaded files are the four "source" categories users care about. Models
 * and Benchmarks are intentionally excluded — they have their own dedicated
 * pages in the Resources area.
 */
export const SOURCE_GROUPS = ["tables", "apis", "uploaded-files", "bulk-sources"] as const;
export type SourceGroup = typeof SOURCE_GROUPS[number];

export const SOURCE_GROUP_LABELS: Record<SourceGroup, string> = {
  tables: "Tables",
  apis: "APIs / Links",
  "uploaded-files": "Uploaded files",
  "bulk-sources": "Bulk sources",
};

/**
 * Bucket a resource into one of the four Sources tab groups, or `null` when
 * it belongs to a kind (model/benchmark) that lives elsewhere in the UI.
 *
 * Uploaded files are surfaced as `kind = "source"` rows tagged with
 * `config.uploadedFile === true`. This convention avoids inventing a new
 * resource kind while keeping the per-card status semantics consistent.
 */
export function bucketResourceForSourcesTab(row: {
  kind: string;
  config?: Record<string, unknown> | null;
}): SourceGroup | null {
  switch (row.kind) {
    case "table":
      return "tables";
    case "api":
    case "mcp":
    case "search_url":
      return "apis";
    case "source": {
      const cfg = row.config ?? {};
      return cfg["uploadedFile"] === true ? "uploaded-files" : "bulk-sources";
    }
    case "research_prompt":
      return "bulk-sources";
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// API response shapes — explicit so secret material never leaks. Every route
// that returns a Resource MUST go through `toResourcePublicView`.
// ────────────────────────────────────────────────────────────────────────────

export const ResourcePublicViewSchema = z.object({
  id: z.number().int(),
  kind: ResourceKindSchema,
  slug: ResourceSlugSchema,
  displayName: z.string(),
  description: z.string().nullable(),
  config: z.record(z.string(), z.unknown()),
  hasSecret: z.boolean(),
  version: z.number().int().min(1),
  lastHealthStatus: ResourceHealthStatusSchema,
  lastCheckedAt: z.string().nullable(),
  dailyRequestBudget: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResourcePublicView = z.infer<typeof ResourcePublicViewSchema>;

/**
 * Convert an admin_resources row into the public API shape. Drops `secretRef`
 * (replaced by the boolean `hasSecret`) so secret keys cannot accidentally
 * leak through any list/detail endpoint.
 */
export function toResourcePublicView(row: AdminResourceRow, now: Date = new Date()): ResourcePublicView {
  // Stale-green guard: re-derive freshness on every read so a denormalized
  // parent.lastHealthStatus="green" can never leak past its TTL window.
  // (red/amber/gray are non-degrading and pass through unchanged.)
  const kind = row.kind as ResourceKind;
  const storedBand = row.lastHealthStatus as ResourceHealthStatus;
  let band: ResourceHealthStatus = storedBand;
  const profile = PROBE_PROFILES[kind];
  if (storedBand === "green" && row.lastCheckedAt && profile) {
    const ageMs = now.getTime() - row.lastCheckedAt.getTime();
    const ttlMs = profile.ttlSeconds * 1000;
    if (ageMs > ttlMs) band = "amber";
  }
  return {
    id: row.id,
    kind,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    config: row.config ?? {},
    hasSecret: typeof row.secretRef === "string" && row.secretRef.length > 0,
    version: row.version,
    lastHealthStatus: band,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    dailyRequestBudget: row.dailyRequestBudget ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
