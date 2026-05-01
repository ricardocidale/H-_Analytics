// UNWIRED — blocking on: PUT /api/admin/specialists/:id/runtime disabled per
// specialists-are-dev-defined-only.md (admin-cleanup-specialist-readonly, 2026-05-01).
// This schema validated per-Specialist runtime JSON blobs on the write path.
// Delete or rewire once a new admin-tunable runtime surface replaces the editor.
import { z } from "zod";
import { PHOTO_ENHANCER_STYLES } from "../../../server/services/photo-enhancer-pipeline.js";

/**
 * Photo Enhancer runtime config — mirrors the clamps in
 * `server/jobs/specialist-photos-batch.ts#parseBatchScheduleConfig`.
 * Source of truth for the WRITE path. The read-time parser remains the
 * tolerant path until phase-6c-c collapses them.
 */
export const PhotoEnhancerRuntimeConfigSchema = z
  .object({
    scheduledStyle: z.enum(PHOTO_ENHANCER_STYLES).optional(),
    scheduledPrompt: z.string().max(2_000).optional(),
    batchSchedule: z
      .object({
        enabled: z.boolean(),
        intervalHours: z.number().int().min(1).max(24 * 7),
        maxPerCycle: z.number().int().min(1).max(50),
        style: z.enum(PHOTO_ENHANCER_STYLES),
        prompt: z.string().max(2_000),
        propertyIds: z.array(z.number().int().positive()).nullable(),
        targetMode: z.enum(["explicit", "all"]),
      })
      .partial()
      .optional(),
  })
  .strict();

/**
 * Server-side registry: specialistId → Zod schema for runtimeConfig.
 * Specialists with no entry fall through to a generic size+depth-capped
 * record validator in the PUT route. Add a Specialist here when its
 * evaluator starts reading runtimeConfig fields.
 */
export const SPECIALIST_RUNTIME_SCHEMAS: Readonly<
  Record<string, z.ZodType<Record<string, unknown>>>
> = {
  "photos.photo-enhancer": PhotoEnhancerRuntimeConfigSchema,
};
