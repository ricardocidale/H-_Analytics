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
import { generateImageBuffer } from "../image/client";
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { getStorageProvider } from "../providers/storage";
import { logApiCost, unitCost } from "../middleware/cost-logger";
import { storage } from "../storage";
import { logger } from "../logger";
import { isBlockedHostResolved } from "../routes/ssrf-guard";

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
  originatedFrom: "album" | "specialist-page" | "legacy" | "scheduled-batch";
  route: string;
  /**
   * Optional admin-edited prompt template from `specialist_configs.promptTemplate`.
   * If supplied, `{{prompt}}` and `{{style}}` tokens are substituted with the
   * runtime values; if no token is present the template is prepended to the
   * runtime prompt with a separating space. Empty string ⇒ ignored.
   */
  promptTemplate?: string | null;
  /**
   * Resolved `specialist_configs.modelResourceId` recorded into the
   * research_runs metadata so the call log shows which model assignment
   * was honored (the underlying generator selection still keys off
   * `style`, since renders use Replicate kinds + OpenAI fallback).
   */
  modelResourceId?: number | null;
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

export class PhotoEnhancerInvalidSourceUrlError extends Error {
  constructor(message = "Invalid source image URL") {
    super(message);
    this.name = "PhotoEnhancerInvalidSourceUrlError";
  }
}

/**
 * SSRF guard for `beforeImageUrl`. Replicate fetches this URL from their
 * infrastructure — blocking private/loopback/metadata hosts here prevents
 * admins from leaking internal URLs (object-storage presigned links,
 * file:// paths, etc.) into third-party logs, and closes the well-known
 * "specify 169.254.169.254 as source image" exfil vector.
 *
 * Rules:
 *   - Must parse as absolute URL.
 *   - Scheme must be https (or http for explicit Replit object-storage
 *     CDN reuse — kept to match existing album paths that hand back
 *     `/objects/...` style references via the hosting redirect).
 *   - Hostname must not resolve to a blocked IP (RFC1918, loopback,
 *     link-local, .internal, localhost, metadata endpoints).
 */
export async function assertSafeBeforeImageUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PhotoEnhancerInvalidSourceUrlError("beforeImageUrl is not a valid absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new PhotoEnhancerInvalidSourceUrlError(
      `beforeImageUrl scheme "${parsed.protocol}" is not allowed`,
    );
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) {
    throw new PhotoEnhancerInvalidSourceUrlError("beforeImageUrl has no hostname");
  }
  if (await isBlockedHostResolved(hostname)) {
    throw new PhotoEnhancerInvalidSourceUrlError(
      `beforeImageUrl points at a blocked host (${hostname})`,
    );
  }
}

/**
 * Run one render attempt. Creates a research_runs row, performs generation
 * (with OpenAI fallback for Replicate styles), uploads the resulting image
 * to object storage, and stamps the run completed. Never swallows
 * generation errors — on failure the research_runs row is marked failed
 * and the error rethrown so the caller can map it to an HTTP status.
 */
/**
 * Apply an admin-edited prompt template (from `specialist_configs.promptTemplate`)
 * to the runtime prompt. Supports `{{prompt}}` and `{{style}}` substitution; if
 * neither token is present, the template is prepended to the runtime prompt with
 * a single space separator. An empty/whitespace-only template is treated as
 * "no override" so admins can clear the field to disable templating.
 */
export function applyPhotoEnhancerPromptTemplate(
  template: string | null | undefined,
  runtimePrompt: string,
  style: string,
): string {
  const trimmed = (template ?? "").trim();
  if (!trimmed) return runtimePrompt;
  if (trimmed.includes("{{prompt}}") || trimmed.includes("{{style}}")) {
    return trimmed
      .split("{{prompt}}").join(runtimePrompt)
      .split("{{style}}").join(style);
  }
  if (!runtimePrompt) return trimmed;
  return `${trimmed} ${runtimePrompt}`;
}

export async function runPhotoEnhancerPipeline(
  input: PhotoEnhancerInput,
): Promise<PhotoEnhancerOutput> {
  const {
    style,
    beforeImageUrl,
    propertyId,
    originatedFrom,
    userId,
    route,
    promptTemplate,
    modelResourceId,
  } = input;
  const prompt = applyPhotoEnhancerPromptTemplate(promptTemplate, input.prompt, style);

  if (beforeImageUrl) {
    await assertSafeBeforeImageUrl(beforeImageUrl);
  }

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
  const { modelId: fallbackModelId } = await resolveLlmFor("image-generation-fallback");

  const startedAt = Date.now();
  // Trim user-supplied prompt before persistence so the research_runs metadata
  // never balloons. The full prompt is the admin's own text — keeping the
  // first 2k characters is plenty for the gallery (where it surfaces under
  // each thumbnail) without bloating row payloads if a script accidentally
  // pastes a wall of text. Same trim applied on the completion update so the
  // before/after metadata stays consistent.
  const persistedPrompt = (prompt ?? "").slice(0, 2000);
  const runRecord = await storage.createResearchRun({
    // userId persisted so the per-property album "Render history" section
    // (Task #439) can show "who triggered" each run by joining users.
    userId,
    entityType: propertyId ? "property" : "specialist-run",
    entityId: propertyId ?? 0,
    tier: 1,
    status: "running",
    modelPrimary: isReplicateStyle ? `replicate:${style}` : `openai:${fallbackModelId}`,
    metadata: {
      specialistId: PHOTO_ENHANCER_SPECIALIST_ID,
      style,
      propertyId: propertyId ?? null,
      originatedFrom,
      hasSourcePhoto: !!beforeImageUrl,
      // Persisted so the Photos & Renders gallery survives across sessions
      // and devices — the gallery rebuilds entirely from this metadata.
      prompt: persistedPrompt,
      sourceImageUrl: beforeImageUrl ?? null,
      route,
      modelResourceId: modelResourceId ?? null,
      promptTemplateApplied: !!(promptTemplate && promptTemplate.trim()),
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
            model: fallbackModelId,
            operation: "image-gen-fallback",
            estimatedCostUsd: unitCost(fallbackModelId),
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
          model: fallbackModelId,
          operation: "image-gen",
          estimatedCostUsd: unitCost(fallbackModelId),
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
        // Same prompt + source URL persisted on the create call. Mirrored
        // here so a row in any state (running, completed) carries the full
        // context the gallery needs — no need to JOIN to the create event.
        prompt: persistedPrompt,
        sourceImageUrl: beforeImageUrl ?? null,
        usedFallback,
        objectPath,
        route,
        modelResourceId: modelResourceId ?? null,
        promptTemplateApplied: !!(promptTemplate && promptTemplate.trim()),
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
