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

import { z } from "zod";
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
] as const;
export type ResourceKind = typeof RESOURCE_KINDS[number];
export const ResourceKindSchema = z.enum(RESOURCE_KINDS);

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  api: "APIs",
  source: "Sources",
  table: "Tables",
  benchmark: "Benchmarks",
  model: "Models",
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
    createdByUserId: integer("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("admin_resources_kind_slug_uniq").on(t.kind, t.slug),
    index("admin_resources_kind_idx").on(t.kind),
  ],
);

export const insertAdminResourceSchema = z.object({
  kind: ResourceKindSchema,
  slug: ResourceSlugSchema,
  displayName: z.string().min(1),
  description: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  secretRef: z.string().min(1).nullable().optional(),
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
    index("break_glass_expires_idx").on(t.expiresAt),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ResourcePublicView = z.infer<typeof ResourcePublicViewSchema>;

/**
 * Convert an admin_resources row into the public API shape. Drops `secretRef`
 * (replaced by the boolean `hasSecret`) so secret keys cannot accidentally
 * leak through any list/detail endpoint.
 */
export function toResourcePublicView(row: AdminResourceRow): ResourcePublicView {
  return {
    id: row.id,
    kind: row.kind as ResourceKind,
    slug: row.slug,
    displayName: row.displayName,
    description: row.description,
    config: row.config ?? {},
    hasSecret: typeof row.secretRef === "string" && row.secretRef.length > 0,
    version: row.version,
    lastHealthStatus: row.lastHealthStatus as ResourceHealthStatus,
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
