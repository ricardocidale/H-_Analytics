/**
 * Task #433 — Engine evaluator for the Photos & Renders specialist
 * (`photos.photo-enhancer`, persona Fernanda).
 *
 * The Photo Enhancer doesn't emit a verdict the way Constants / mgmt-co
 * specialists do — its "output" is a render written to object storage and
 * a `research_runs` row tagged with the specialist id. This evaluator is
 * the engine-side dispatch entry point so the scheduler (and any future
 * orchestrator step that wants to drive Photos & Renders) can hand it a
 * batch of property ids without touching the HTTP layer.
 *
 * Contract: every dispatched call honors the admin's mutable config from
 * `specialist_configs` — `promptTemplate`, `modelResourceId`, and any
 * `runtimeConfig` knobs are loaded once per dispatch and applied to every
 * property in the batch (so a single scheduler tick uses one consistent
 * snapshot rather than re-reading per property and racing an admin edit
 * mid-batch).
 *
 * Errors are scoped per-property: a failure on property #3 does not abort
 * the batch — it logs, marks the run failed, and the loop continues. The
 * returned summary lets the scheduler decide warn-vs-error.
 */

import { storage } from "@server/storage";
import { logger } from "@server/logger";
import {
  PHOTO_ENHANCER_SPECIALIST_ID,
  PHOTO_ENHANCER_STYLES,
  PhotoEnhancerStyleDisabledError,
  PhotoEnhancerInvalidSourceUrlError,
  runPhotoEnhancerPipeline,
  type PhotoEnhancerStyle,
} from "@server/services/photo-enhancer-pipeline";

const SOURCE = "photos.photo-enhancer:evaluator";

export interface PhotoEnhancerEvaluatorInput {
  /** When omitted, the evaluator is being invoked for a single ad-hoc render */
  propertyIds?: number[];
  /** Optional explicit style — falls back to runtimeConfig.scheduledStyle, else "standard". */
  style?: PhotoEnhancerStyle;
  /** Caller-supplied prompt — combined with the admin promptTemplate. */
  prompt?: string;
  /** Required: tags the research_runs row + the per-call rate-limit decision. */
  originatedFrom: "scheduled-batch" | "specialist-page" | "album" | "legacy";
  /** Route string for telemetry (e.g. "scheduler:specialist-photos-batch"). */
  route: string;
  /** Optional acting user id for cost-log attribution. */
  userId?: number;
  /** Per-property optional source URL — only sensible when `propertyIds.length === 1`. */
  beforeImageUrl?: string;
}

export interface PhotoEnhancerPerPropertyResult {
  propertyId: number;
  status: "succeeded" | "failed" | "skipped";
  specialistRunId?: number;
  objectPath?: string;
  usedFallback?: boolean;
  /** Truncated error message when status === "failed" */
  error?: string;
  /** When status === "skipped" — explains why (e.g. "style-disabled") */
  reason?: string;
}

export interface PhotoEnhancerBatchSummary {
  specialistId: typeof PHOTO_ENHANCER_SPECIALIST_ID;
  considered: number;
  succeeded: number;
  failed: number;
  skipped: number;
  /** Style honored for the batch (post-config-merge). */
  style: PhotoEnhancerStyle;
  /** Whether the admin promptTemplate was non-empty at dispatch time. */
  promptTemplateApplied: boolean;
  /** Resolved model assignment id from `specialist_configs.modelResourceId`. */
  modelResourceId: number | null;
  perProperty: PhotoEnhancerPerPropertyResult[];
}

function isPhotoEnhancerStyle(value: unknown): value is PhotoEnhancerStyle {
  return typeof value === "string"
    && (PHOTO_ENHANCER_STYLES as readonly string[]).includes(value);
}

/**
 * Resolve the merged dispatch context: which style + prompt-template +
 * model-assignment to honor for this batch. Caller-provided values win
 * over runtimeConfig defaults; runtimeConfig wins over the hardcoded
 * "standard" fallback.
 */
async function resolveDispatchContext(input: PhotoEnhancerEvaluatorInput): Promise<{
  style: PhotoEnhancerStyle;
  prompt: string;
  promptTemplate: string;
  modelResourceId: number | null;
}> {
  const config = await storage.getSpecialistConfig(PHOTO_ENHANCER_SPECIALIST_ID);
  const runtime = (config?.runtimeConfig ?? {}) as Record<string, unknown>;

  const callerStyle = input.style;
  const runtimeStyleRaw = runtime.scheduledStyle;
  const style: PhotoEnhancerStyle = callerStyle
    ?? (isPhotoEnhancerStyle(runtimeStyleRaw) ? runtimeStyleRaw : "standard");

  const callerPrompt = input.prompt ?? "";
  const runtimePrompt = typeof runtime.scheduledPrompt === "string" ? runtime.scheduledPrompt : "";
  const prompt = callerPrompt || runtimePrompt;

  return {
    style,
    prompt,
    promptTemplate: config?.promptTemplate ?? "",
    modelResourceId: config?.modelResourceId ?? null,
  };
}

/**
 * Dispatch the Photo Enhancer specialist across a list of properties. When
 * `propertyIds` is empty the evaluator runs a single property-less render
 * (originatedFrom must NOT be "scheduled-batch" in that case — schedulers
 * always supply a property list).
 */
export async function evaluatePhotoEnhancerSpecialist(
  input: PhotoEnhancerEvaluatorInput,
): Promise<PhotoEnhancerBatchSummary> {
  const ctx = await resolveDispatchContext(input);
  const ids = (input.propertyIds ?? []).slice();

  // Run-with-no-properties is allowed for ad-hoc dispatch only — keeps a
  // scheduler with an empty target list from silently producing renders
  // that aren't tied to any property record.
  if (ids.length === 0 && input.originatedFrom === "scheduled-batch") {
    return {
      specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
      considered: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      style: ctx.style,
      promptTemplateApplied: !!ctx.promptTemplate.trim(),
      modelResourceId: ctx.modelResourceId,
      perProperty: [],
    };
  }

  const targets: Array<number | undefined> = ids.length === 0 ? [undefined] : ids;
  const perProperty: PhotoEnhancerPerPropertyResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let idx = 0; idx < targets.length; idx += 1) {
    const propertyId = targets[idx];
    try {
      const result = await runPhotoEnhancerPipeline({
        userId: input.userId,
        prompt: ctx.prompt,
        style: ctx.style,
        // Per-property source-URL only honored when targeting a single
        // explicit property — guards against a stale URL fanning out
        // across an unrelated batch.
        beforeImageUrl: ids.length === 1 ? input.beforeImageUrl : undefined,
        propertyId,
        originatedFrom: input.originatedFrom,
        route: input.route,
        promptTemplate: ctx.promptTemplate,
        modelResourceId: ctx.modelResourceId,
      });
      succeeded += 1;
      perProperty.push({
        propertyId: propertyId ?? 0,
        status: "succeeded",
        specialistRunId: result.specialistRunId,
        objectPath: result.objectPath,
        usedFallback: result.usedFallback,
      });
    } catch (err: unknown) {
      // Style-disabled is a config decision, not a bug — surface it as a
      // skip so the scheduler can warn (not error) when the only blocker
      // is an admin-toggled style.
      if (err instanceof PhotoEnhancerStyleDisabledError) {
        skipped += 1;
        perProperty.push({
          propertyId: propertyId ?? 0,
          status: "skipped",
          reason: `style-disabled:${err.style}`,
        });
        // No point hammering the rest of the batch — the same style is
        // disabled for every property in this dispatch. Index off the
        // ORIGINAL target position (`idx`), NOT off `perProperty.length`,
        // because the latter grows with every push and would skip rows
        // and stamp `0` for the trailing entries.
        for (let j = idx + 1; j < targets.length; j += 1) {
          const remainingId = targets[j] ?? 0;
          skipped += 1;
          perProperty.push({
            propertyId: remainingId,
            status: "skipped",
            reason: `style-disabled:${err.style}`,
          });
        }
        break;
      }
      const msg = err instanceof Error ? err.message : String(err);
      failed += 1;
      perProperty.push({
        propertyId: propertyId ?? 0,
        status: "failed",
        error: msg.slice(0, 500),
      });
      // SSRF rejections are a per-input issue; everything else gets logged
      // for operator visibility.
      if (!(err instanceof PhotoEnhancerInvalidSourceUrlError)) {
        logger.warn(
          `Photo Enhancer batch failure on property ${propertyId ?? "(none)"}: ${msg}`,
          SOURCE,
        );
      }
    }
  }

  return {
    specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
    considered: targets.length,
    succeeded,
    failed,
    skipped,
    style: ctx.style,
    promptTemplateApplied: !!ctx.promptTemplate.trim(),
    modelResourceId: ctx.modelResourceId,
    perProperty,
  };
}
