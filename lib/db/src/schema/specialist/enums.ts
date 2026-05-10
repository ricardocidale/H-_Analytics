/**
 * Specialist enums — Subject, SpecialistLetter, SpecialistCapability.
 *
 * Split from `lib/db/src/schema/specialist.ts` (task #1361). See the barrel at
 * `../specialist.ts` for the full doctrine doc-comment.
 */

import { z } from "zod/v4";

// ────────────────────────────────────────────────────────────────────────────
// Subject — top-level grouping inside AI Research's collapsible 2-level tree.
// ────────────────────────────────────────────────────────────────────────────

export const SUBJECTS = [
  "mgmt-co",
  "property",
  "photos",
  "portfolio-ops",
  "constants",
  "resources",
] as const;
export type Subject = typeof SUBJECTS[number];
export const SubjectSchema = z.enum(SUBJECTS);

export const SUBJECT_LABELS: Record<Subject, string> = {
  "mgmt-co": "Management Company",
  property: "Property",
  photos: "Photos",
  "portfolio-ops": "Portfolio Ops",
  constants: "Constants & Authority Sources",
  resources: "Resource Builder",
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
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
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
