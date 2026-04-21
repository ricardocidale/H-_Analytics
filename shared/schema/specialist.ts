/**
 * Specialist registry contracts.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Doctrine: replit.md "AI Research sidebar section" + "Specialist page tab
 *           catalog" blocks (LOCKED 2026-04-21).
 *
 * The Specialist catalog (`engine/analyst/registry/specialist-catalog.ts`)
 * is the single source of truth for: which Specialists exist, what subject
 * each belongs to (sidebar grouping), what page tabs each renders
 * (capabilities), and what canonical Resources each is wired to
 * (assignmentRefs).
 *
 * The catalog is git-reviewable code. Adding/removing a Specialist or
 * changing its assignments requires a code edit + PR + deploy. A super-
 * admin-only audited time-boxed break-glass override (P2) exists for
 * incident reroute.
 *
 * P1 scope: types + the catalog declaration. No DB persistence yet (P2
 * adds the materialization job and the specialist_assignments join table).
 */

import { z } from "zod";
import {
  AssignmentRefSchema,
  assignmentRefKey,
  type AssignmentRef,
} from "./admin-resource";

// ────────────────────────────────────────────────────────────────────────────
// Subject — top-level grouping inside AI Research's collapsible 2-level tree.
// ────────────────────────────────────────────────────────────────────────────

export const SUBJECTS = [
  "mgmt-co",
  "property",
  "photos",
  "portfolio-ops",
] as const;
export type Subject = typeof SUBJECTS[number];
export const SubjectSchema = z.enum(SUBJECTS);

export const SUBJECT_LABELS: Record<Subject, string> = {
  "mgmt-co": "Management Company",
  property: "Property",
  photos: "Photos",
  "portfolio-ops": "Portfolio Ops",
};

// ────────────────────────────────────────────────────────────────────────────
// Specialist letter — stable display identifier. Survives renaming the real
// name. Letters are assigned in registration order; do NOT reshuffle when
// adding new Specialists (append at the next free letter).
// ────────────────────────────────────────────────────────────────────────────

export const SPECIALIST_LETTERS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
] as const;
export type SpecialistLetter = typeof SPECIALIST_LETTERS[number];
export const SpecialistLetterSchema = z.enum(SPECIALIST_LETTERS);

// ────────────────────────────────────────────────────────────────────────────
// SpecialistCapability — declares which tabs the Specialist's page renders.
// A page renders a tab iff the Specialist declares the matching capability.
// ────────────────────────────────────────────────────────────────────────────

export const SPECIALIST_CAPABILITIES = [
  "required-fields",
  "llm-config",
  "resource-assignments",
  "runtime",
  "audit",
  "per-resource-overrides",
] as const;
export type SpecialistCapability = typeof SPECIALIST_CAPABILITIES[number];
export const SpecialistCapabilitySchema = z.enum(SPECIALIST_CAPABILITIES);

export const CAPABILITY_LABELS: Record<SpecialistCapability, string> = {
  "required-fields": "Required Fields",
  "llm-config": "LLM Config",
  "resource-assignments": "Resource Assignments",
  runtime: "Runtime / Triggers",
  audit: "Audit",
  "per-resource-overrides": "Per-Resource Overrides",
};

// ────────────────────────────────────────────────────────────────────────────
// SpecialistDefinition — the single registry entry per Specialist.
// ────────────────────────────────────────────────────────────────────────────

export const SpecialistDefinitionSchema = z
  .object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/, {
      message: "Specialist id must be dotted-kebab-case (e.g. mgmt-co.funding)",
    }),
    letter: SpecialistLetterSchema,
    realName: z.string().min(1),
    subject: SubjectSchema,
    capabilities: z.array(SpecialistCapabilitySchema).min(1),
    assignmentRefs: z.array(AssignmentRefSchema),
    status: z.enum(["built", "needs-page", "stub"]),
  })
  .refine(
    (def) => new Set(def.capabilities).size === def.capabilities.length,
    { message: "Specialist capabilities must be unique" },
  )
  .refine(
    (def) => {
      const seen = new Set<string>();
      for (const ref of def.assignmentRefs) {
        const key = assignmentRefKey(ref);
        if (seen.has(key)) return false;
        seen.add(key);
      }
      return true;
    },
    { message: "Specialist assignmentRefs must be unique by (kind, slug, role)" },
  );
export type SpecialistDefinition = z.infer<typeof SpecialistDefinitionSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Display helpers
// ────────────────────────────────────────────────────────────────────────────

export function specialistDisplayLabel(def: SpecialistDefinition): string {
  return `Specialist ${def.letter} — ${def.realName}`;
}

export function specialistHasCapability(
  def: SpecialistDefinition,
  capability: SpecialistCapability,
): boolean {
  return def.capabilities.includes(capability);
}

export function assignmentRefsByKind(
  def: SpecialistDefinition,
): Map<AssignmentRef["kind"], AssignmentRef[]> {
  const out = new Map<AssignmentRef["kind"], AssignmentRef[]>();
  for (const ref of def.assignmentRefs) {
    const existing = out.get(ref.kind) ?? [];
    existing.push(ref);
    out.set(ref.kind, existing);
  }
  return out;
}
