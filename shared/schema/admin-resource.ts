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
 * P1 scope: types only. No DB tables, no routes, no UI. Storage tables and
 * REST surface land in P2.
 */

import { z } from "zod";

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
