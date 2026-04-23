/**
 * Shared Photo Enhancer pipeline.
 *
 * This is the one and only funnel for Replicate-style renders / OpenAI
 * image generation in the portal. Both entry points use it:
 *
 *   - POST /api/specialists/photo-enhancer/run     (admin specialist console)
 *   - POST /api/generate-property-image            (legacy album/branding path)
 *
 * Converging on this function guarantees:
 *   - Shared rate-limit bucket ("generate-image") so clients can't bypass
 *     the cap by switching routes.
 *   - Consistent OpenAI fallback when a Replicate style fails.
 *   - A `research_runs` row per attempt, stamped with
 *     `metadata.specialistId = "photos.photo-enhancer"`, so the per-
 *     Specialist Calls tab and the per-property album call-log surface
 *     render jobs regardless of which route produced them.
 *   - One object-storage upload path and one cost-logging pattern.
 *
 * Callers wrap HTTP concerns (auth, req/res shape) — this module handles
 * generation, persistence, and telemetry only.
 */
import {
  replicateService,
  isStyleEnabled,
  getDefaultImageSize,
  type ReplicateStyleKey,
} from "../integrations/replicate";
import { generateImageBuffer } from "../replit_integrations/image/client";
import { getStorageProvider } from "../providers/storage";
import { logApiCost, unitCost } from "../middleware/cost-logger";
import { storage } from "../storage";
import { logger } from "../logger";

export const PHOTO_ENHANCER_SPECIALIST_ID = "photos.photo-enhancer";

export const PHOTO_ENHANCER_STYLES = [
  "standard",
  "architectural-exterior",
  "interior-design",
  "renovation-concept",
  "photo-upscale",
  "virtual-staging",
  "background-remove",
  "photo-to-render",
] as const;
export type PhotoEnhancerStyle = (typeof PHOTO_ENHANCER_STYLES)[number];

export interface PhotoEnhancerInput {
  userId?: number;
  prompt: string;
  style: PhotoEnhancerStyle;
  beforeImageUrl?: string;
  propertyId?: number;
  originatedFrom: "album" | "specialist-page" | "legacy";
  route: string;
}

export interface PhotoEnhancerOutput {
  objectPath: string;
  imageData: string;
  isAiGenerated: true;
  style: string;
  usedFallback: boolean;
  fallbackNotice?: string;
  specialistRunId: number;
}

export class PhotoEnhancerStyleDisabledError extends Error {
  constructor(public readonly style: string) {
    super(`Style "${style}" is currently disabled by admin`);
    this.name = "PhotoEnhancerStyleDisabledError";
  }
}

/**
 * Run one render attempt. Creates a research_runs row, performs generation
 * (with OpenAI fallback for Replicate styles), uploads the resulting image
 * to object storage, and stamps the run completed. Never swallows
 * generation errors — on failure the research_runs row is marked failed
 * and the error rethrown so the caller can map it to an HTTP status.
 */
export async function runPhotoEnhancerPipeline(
  input: PhotoEnhancerInput,
): Promise<PhotoEnhancerOutput> {
  const { prompt, style, beforeImageUrl, propertyId, originatedFrom, userId, route } = input;

  if (style && style !== "standard") {
    const enabled = await isStyleEnabled(style);
    if (!enabled) {
      throw new PhotoEnhancerStyleDisabledError(style);
    }
  }

  const isReplicateStyle = style && style !== "standard";
  const adminSize = (await getDefaultImageSize()) as
    | "1024x1024"
    | "1024x1536"
    | "1536x1024"
    | "auto";

  const startedAt = Date.now();
  const runRecord = await storage.createResearchRun({
    entityType: propertyId ? "property" : "specialist-run",
    entityId: propertyId ?? 0,
    tier: 1,
    status: "running",
    modelPrimary: isReplicateStyle ? `replicate:${style}` : "openai:gpt-image-1",
    metadata: {
      specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
      style,
      propertyId: propertyId ?? null,
      originatedFrom,
      hasSourcePhoto: !!beforeImageUrl,
      route,
    },
  });

  let imageBuffer: Buffer;
  let usedFallback = false;
  try {
    if (isReplicateStyle) {
      try {
        imageBuffer = await replicateService.generateImage(
          style as ReplicateStyleKey,
          prompt,
          beforeImageUrl,
        );
        try {
          logApiCost({
            timestamp: new Date().toISOString(),
            service: "replicate",
            model: style,
            operation: "image-gen",
            estimatedCostUsd: unitCost("replicate-image"),
            durationMs: Date.now() - startedAt,
            userId,
            route,
          });
        } catch (e: unknown) {
          logger.warn(
            `Failed to log API cost: ${e instanceof Error ? e.message : String(e)}`,
            "photo-enhancer-pipeline",
          );
        }
      } catch (replicateError: unknown) {
        logger.warn(
          `Replicate generation failed, falling back: ${replicateError instanceof Error ? replicateError.message : replicateError}`,
          "photo-enhancer-pipeline",
        );
        imageBuffer = await generateImageBuffer(prompt, adminSize);
        usedFallback = true;
        try {
          logApiCost({
            timestamp: new Date().toISOString(),
            service: "openai",
            model: "gpt-image-1",
            operation: "image-gen-fallback",
            estimatedCostUsd: unitCost("gpt-image-1"),
            durationMs: Date.now() - startedAt,
            userId,
            route,
          });
        } catch (e: unknown) {
          logger.warn(
            `Failed to log API cost: ${e instanceof Error ? e.message : String(e)}`,
            "photo-enhancer-pipeline",
          );
        }
      }
    } else {
      imageBuffer = await generateImageBuffer(prompt, adminSize);
      try {
        logApiCost({
          timestamp: new Date().toISOString(),
          service: "openai",
          model: "gpt-image-1",
          operation: "image-gen",
          estimatedCostUsd: unitCost("gpt-image-1"),
          durationMs: Date.now() - startedAt,
          userId,
          route,
        });
      } catch (e: unknown) {
        logger.warn(
          `Failed to log API cost: ${e instanceof Error ? e.message : String(e)}`,
          "photo-enhancer-pipeline",
        );
      }
    }
  } catch (genError: unknown) {
    const message = genError instanceof Error ? genError.message : "Image generation failed";
    await storage
      .updateResearchRun(runRecord.id, {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: message.slice(0, 1000),
      })
      .catch(() => undefined);
    throw genError;
  }

  let objectPath: string;
  const finalStyle = usedFallback ? "standard" : style || "standard";
  try {
    const storageProvider = getStorageProvider();
    objectPath = await storageProvider.uploadBuffer(
      `generated/${Date.now()}`,
      imageBuffer,
      "image/png",
    );

    await storage.updateResearchRun(runRecord.id, {
      status: "completed",
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      metadata: {
        specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
        style,
        finalStyle,
        propertyId: propertyId ?? null,
        originatedFrom,
        hasSourcePhoto: !!beforeImageUrl,
        usedFallback,
        objectPath,
        route,
      },
    });
  } catch (postError: unknown) {
    const message = postError instanceof Error ? postError.message : "Post-generation failure";
    await storage
      .updateResearchRun(runRecord.id, {
        status: "failed",
        completedAt: new Date(),
        durationMs: Date.now() - startedAt,
        error: message.slice(0, 1000),
      })
      .catch(() => undefined);
    throw postError;
  }

  // Phase 4 (Task #454) — stamp observed-missing so the Catalog Calibration
  // dashboard can tell "F has run recently" apart from "F has never run on
  // this install." Best-effort.
  try {
    await storage.recordObservedMissingFields(PHOTO_ENHANCER_SPECIALIST_ID, []);
  } catch (telErr: unknown) {
    logger.warn(
      `Photo-enhancer observed-missing stamp failed: ${telErr instanceof Error ? telErr.message : telErr}`,
      "photo-enhancer-pipeline",
    );
  }

  return {
    objectPath,
    imageData: imageBuffer.toString("base64"),
    isAiGenerated: true,
    style: finalStyle,
    usedFallback,
    fallbackNotice: usedFallback
      ? "Using standard generation — specialized rendering unavailable"
      : undefined,
    specialistRunId: runRecord.id,
  };
}
