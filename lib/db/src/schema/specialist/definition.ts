/**
 * Specialist definition — registry entry shape, display helpers, and the
 * `SpecialistWorkflowOverrides` Tier-1 pipeline-policy override schema.
 *
 * Split from `lib/db/src/schema/specialist.ts` (task #1361). See the barrel at
 * `../specialist.ts` for the full doctrine doc-comment.
 */

import { z } from "zod/v4";
import {
  AssignmentRefSchema,
  assignmentRefKey,
  type AssignmentRef,
} from "../admin-resource";
import {
  SubjectSchema,
  SpecialistLetterSchema,
  SpecialistCapabilitySchema,
  type SpecialistCapability,
} from "./enums";

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
    /**
     * User-facing display name for sidebar labels and page headers. Defaults
     * to `realName` when absent. Set this when a marketing-quality name is
     * preferred over the engineering shorthand.
     */
    displayName: z.string().min(1).optional(),
    /**
     * Humanized first name for the Specialist persona. The orchestrator
     * (Gustavo) and the 12 Specialists use first names in narration and
     * activity logs to make the engine feel like a team rather than a
     * faceless pipeline. The persona is fixed in the catalog — admins
     * cannot rename a Specialist at runtime (that would corrupt the
     * activity-log narrative across the audit history).
     */
    humanName: z.string().min(1).max(40),
    /**
     * Persona gender. Used by `engine/analyst/identity.ts` and the log
     * prefix helper to drive pronoun selection in narration. The
     * orchestrator Gustavo is male; the 12 Specialists are female today.
     * `"neutral"` is reserved for future personas (a Specialist whose
     * persona prefers they/them, or an automated tool persona surfaced
     * in narration without a gendered pronoun).
     */
    gender: z.enum(["male", "female", "neutral"]),
    /**
     * 1–2 sentence plain-language description of what the agent does and the
     * value it delivers. Rendered under the Specialist page header and used
     * as the sidebar tooltip where supported.
     */
    description: z.string().min(1).max(400).optional(),
    subject: SubjectSchema,
    capabilities: z.array(SpecialistCapabilitySchema).min(1),
    assignmentRefs: z.array(AssignmentRefSchema),
    /**
     * Registry keys (from `shared/model-constants-registry.ts`) that this
     * Specialist owns. A Specialist owns a Constant iff it is the sole
     * authority allowed to write the corresponding `model_constant_overrides`
     * row with `source = 'analyst'`. The catalog enforces uniqueness — every
     * registry key has at most one owning Specialist (Phase 1 doctrine).
     *
     * Empty/omitted for non-Constants Specialists (e.g. mgmt-co, property,
     * photos, portfolio-ops). Required-but-empty is allowed; absence is
     * semantically the same as `[]`.
     */
    constantsOwned: z.array(z.string().min(1)).optional(),
    /**
     * Candidate fields the Specialist could require. Admins toggle these on or
     * off (and pick "hard-required" vs "recommended") on the Required Fields
     * tab. The catalog is the SOLE place where new candidates can appear —
     * admins cannot add free-form keys. Each entry pairs the field key (the
     * draft/payload key the form writes to) with a human label and the
     * "owning surface" so the roll-up page can group rows by surface.
     */
    candidateFields: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          surface: z.enum([
            "company-assumptions",
            "property-edit",
            "market-macro",
            "constants",
            "defaults",
          ]),
          /**
           * Catalog-locked hard-required marker. When `true`, this field is
           * hard-required for the Specialist to run AND admins cannot demote
           * it (or promote a non-locked field to "hard"). The minimum
           * requirements are a product/engineering decision and live here in
           * the catalog — the admin Required Fields UI renders these rows
           * read-only with a "Locked by catalog" hint, and the
           * `/field-toggles` endpoint rejects payloads that attempt to
           * change them.
           */
          lockedHard: z.boolean().optional(),
          /**
           * Optional sub-anchor inside the surface so the
           * `MissingRequiredFieldsPrompt` deep-link can land the user on the
           * exact tab/section. The frontend `resolveCandidateFieldNavTarget`
           * helper interprets this together with `surface` and the entity
           * context. Omitted = land at the surface root.
           */
          surfaceAnchor: z.string().min(1).max(80).optional(),
          /**
           * Optional verdict-field id this candidate corresponds to. When
           * present, the Specialist's `VerdictDimension.field` for this
           * dimension will use this value (the form-anchor id the Adjust
           * deep-link scrolls to) rather than `key` (the dispatch / payload
           * key that the required-fields gate evaluates against). When
           * absent, `key` is itself the verdict-field id (the common case —
           * payload key and form-anchor are the same string).
           *
           * Why this exists: a Specialist can legitimately gate on one key
           * and emit a verdict whose deep-link scrolls to a different field
           * id. For example, the Funding Specialist gates on
           * `runwayBufferMonths` (a numeric assumption in
           * `CapitalRaiseInputs`) but its Adjust deep-link points the user
           * at `capitalRaise1Amount` (the dollar-amount form input that
           * derives the buffer). The candidate-field parity test
           * (`tests/analyst/voice/field-registry-parity.test.ts`) reads
           * `verdictField ?? key` to decide whether a Specialist's tracked
           * verdict-field id is admin-promotable to required.
           */
          verdictField: z.string().min(1).max(120).optional(),
        }),
      )
      .optional(),
    /**
     * Prerequisite condition ids this Specialist may enforce. Each id MUST
     * appear in `engine/analyst/registry/prerequisites.ts`. Admins toggle
     * each on/off via the Required Fields tab. New conditions are added in
     * the library + here, never by admins.
     */
    prerequisites: z.array(z.string().min(1)).optional(),
    /**
     * Default cadence (in days) at which the scheduled Constants refresh job
     * (`server/jobs/specialist-constants-refresh.ts`) re-runs this Specialist
     * across every (constantKey × locality) row it owns. Authority sources
     * publish on different rhythms — IRS annually, central banks weekly /
     * monthly — so each Specialist declares its own cadence rather than
     * inheriting a global one. Omitted/`null` means "no scheduled refresh"
     * (admins still trigger refreshes on demand).
     */
    refreshCadenceDays: z.number().int().positive().optional(),
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

/** User-facing display name (falls back to realName). */
export function specialistDisplayName(def: SpecialistDefinition): string {
  return def.displayName ?? def.realName;
}

/**
 * Persona label used in narration and activity logs:
 *   "Helena (Tax Authority Research)"
 * The persona name comes from the catalog and never changes at runtime.
 */
export function specialistPersonaLabel(def: SpecialistDefinition): string {
  return `${def.humanName} (${specialistDisplayName(def)})`;
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

// ────────────────────────────────────────────────────────────────────────────
// SpecialistWorkflowOverrides — per-Specialist overrides for the Tier-1
// pipeline policy knobs. Mirrors the field set on the global Pipeline
// Policies form. Every field is independently nullable so a Specialist
// can override one knob (e.g. shorter staleness) without re-stating the
// rest. Absent / null ⇒ inherit the global default at resolution time.
// ────────────────────────────────────────────────────────────────────────────

export const SpecialistWorkflowOverridesSchema = z.object({
  stalenessThresholdHours: z.number().int().min(0).max(8760).nullable().optional(),
  maxConcurrentRuns: z.number().int().min(1).max(20).nullable().optional(),
  dailyTokenBudget: z.number().int().min(0).max(10_000_000).nullable().optional(),
  monthlyTokenBudget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  relaxationMaxLevel: z.number().int().min(0).max(5).nullable().optional(),
  minEvidenceScore: z.number().min(0).max(1).nullable().optional(),
  minCompCount: z.number().int().min(0).max(50).nullable().optional(),
  autoRefreshIntervalHours: z.number().int().min(1).max(8760).nullable().optional(),
});
export type SpecialistWorkflowOverrides = z.infer<typeof SpecialistWorkflowOverridesSchema>;

/** Workflow override field keys exposed to the UI banner / audit renderer. */
export const SPECIALIST_WORKFLOW_OVERRIDE_KEYS = [
  "stalenessThresholdHours",
  "maxConcurrentRuns",
  "dailyTokenBudget",
  "monthlyTokenBudget",
  "relaxationMaxLevel",
  "minEvidenceScore",
  "minCompCount",
  "autoRefreshIntervalHours",
] as const satisfies readonly (keyof SpecialistWorkflowOverrides)[];
