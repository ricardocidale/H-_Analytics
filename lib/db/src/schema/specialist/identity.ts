/**
 * Specialist identity overrides — admin-editable humanName + gender per
 * Specialist, plus the append-only audit history.
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
// Phase 3 — Admin-editable Specialist identity (humanName + gender)
//
// The catalog is the factory default. Admins may override per Specialist
// without a code deploy via the SpecialistPage Identity tab. The override
// row is single-row-per-specialistId; absence ⇒ catalog wins. The orchestrator
// "gustavo" (ORCHESTRATOR_SPECIALIST_ID) is editable through the same routes (its catalog default lives in
// `engine/analyst/identity.ts`, not the SPECIALIST_CATALOG).
//
// Audit trail lives in `specialist_identity_override_versions` — a focused
// append-only table. Every PUT/DELETE writes a snapshot row so the audit
// footer can render "Last edited by X on Y" and (eventually) a diff view.
// ════════════════════════════════════════════════════════════════════════════

export const specialistIdentityOverrides = pgTable(
  "specialist_identity_overrides",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    humanName: text("human_name"),
    gender: text("gender").$type<"male" | "female" | "neutral">(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("specialist_identity_overrides_uniq").on(t.specialistId),
  ],
);
export type SpecialistIdentityOverrideRow = typeof specialistIdentityOverrides.$inferSelect;

export const specialistIdentityOverrideVersions = pgTable(
  "specialist_identity_override_versions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    specialistId: text("specialist_id").notNull(),
    /** "upsert" when a value was set/changed, "reset" when cleared. */
    action: text("action").notNull(),
    prevHumanName: text("prev_human_name"),
    prevGender: text("prev_gender"),
    nextHumanName: text("next_human_name"),
    nextGender: text("next_gender"),
    changeSummary: text("change_summary"),
    changedByUserId: integer("changed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => [
    index("specialist_identity_versions_specialist_idx").on(t.specialistId),
  ],
);
export type SpecialistIdentityOverrideVersionRow = typeof specialistIdentityOverrideVersions.$inferSelect;

export const SpecialistGenderSchema = z.enum(["male", "female", "neutral"]);
export type SpecialistGender = z.infer<typeof SpecialistGenderSchema>;

/**
 * Identity-override patch. Each field is independently nullable: `null`
 * clears that field's override (factory default wins), a string/enum value
 * sets it. `undefined` is rejected by the route — admins always submit both
 * fields explicitly so the audit row records both sides of the diff.
 */
export const updateSpecialistIdentitySchema = z.object({
  humanName: z.string().min(1).max(40).nullable(),
  gender: SpecialistGenderSchema.nullable(),
  changeSummary: z.string().max(500).optional(),
});
export type UpdateSpecialistIdentityInput = z.infer<typeof updateSpecialistIdentitySchema>;

export const SpecialistIdentityPublicViewSchema = z.object({
  specialistId: z.string(),
  /** Catalog factory defaults — never change at runtime. */
  catalog: z.object({
    humanName: z.string(),
    gender: SpecialistGenderSchema,
  }),
  /** Admin override (null when no override exists). */
  override: z
    .object({
      // .min(1) mirrors `updateSpecialistIdentitySchema` so a stray empty
      // string in the table (manual SQL, future migration drift) is
      // rejected on read instead of silently rendering "In effect: " with
      // no name in the admin header. The route layer must canonicalize
      // "" → null on write to keep this contract honest.
      humanName: z.string().min(1).nullable(),
      gender: SpecialistGenderSchema.nullable(),
      updatedByUserId: z.number().int().nullable(),
      updatedAt: z.string(),
    })
    .nullable(),
  /** Effective values used by UI/logger (override-when-present, catalog otherwise). */
  resolved: z.object({
    humanName: z.string(),
    gender: SpecialistGenderSchema,
    /** Per-field provenance so the UI can render "(default)" vs "(custom)". */
    source: z.object({
      humanName: z.enum(["override", "catalog"]),
      gender: z.enum(["override", "catalog"]),
    }),
  }),
});
export type SpecialistIdentityPublicView = z.infer<typeof SpecialistIdentityPublicViewSchema>;

export const SpecialistIdentityHistoryEntrySchema = z.object({
  id: z.number().int(),
  action: z.enum(["upsert", "reset"]),
  prevHumanName: z.string().nullable(),
  prevGender: SpecialistGenderSchema.nullable(),
  nextHumanName: z.string().nullable(),
  nextGender: SpecialistGenderSchema.nullable(),
  changeSummary: z.string().nullable(),
  changedByUserId: z.number().int().nullable(),
  changedAt: z.string(),
});
export type SpecialistIdentityHistoryEntry = z.infer<typeof SpecialistIdentityHistoryEntrySchema>;
