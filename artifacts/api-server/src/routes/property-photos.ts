import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireAdmin, checkPropertyAccess, getAuthUser } from "../auth";
import { insertPropertyPhotoSchema, updatePropertyPhotoSchema } from "@workspace/db";
import { logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import { fetchWithTimeout } from "../lib/fetch-with-timeout";
import { z } from "zod";
import { processExistingPhoto, processImage } from "../image/pipeline";
import { logger } from "../logger";
import { isApiRateLimited } from "../auth";
import { isAutoEnhanceEnabled } from "../integrations/replicate";
import {
  HTTP_201_CREATED,
  HTTP_204_NO_CONTENT,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
  HTTP_413_PAYLOAD_TOO_LARGE,
  HTTP_429_TOO_MANY_REQUESTS,
} from "../constants";

async function autoEnhancePhoto(photoId: number, imageUrl: string, imageDataBase64: string | null, propertyId?: number) {
  let sourceBuffer: Buffer;
  if (imageDataBase64) {
    sourceBuffer = Buffer.from(imageDataBase64, "base64");
  } else if (imageUrl.startsWith("https://")) {
    const url = new URL(imageUrl);
    const allowedHosts = ["objectstorage.replit.com", "replitusercontent.com", "storage.googleapis.com"];
    const isAllowed = allowedHosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`));
    if (!isAllowed) {
      logger.warn(`Auto-enhance: blocked fetch to untrusted host ${url.hostname} for photo ${photoId}`, "property-photos");
      return;
    }
    const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
    if (!imgRes.ok) {
      logger.warn(`Auto-enhance: could not fetch source image for photo ${photoId}`, "property-photos");
      return;
    }
    const contentLength = Number(imgRes.headers.get("content-length") ?? 0);
    if (contentLength > 20 * 1024 * 1024) {
      logger.warn(`Auto-enhance: image too large (${contentLength} bytes) for photo ${photoId}`, "property-photos");
      return;
    }
    sourceBuffer = Buffer.from(await imgRes.arrayBuffer());
  } else {
    logger.info(`Auto-enhance: skipping photo ${photoId} — no resolvable source`, "property-photos");
    return;
  }

  const sharp = (await import("sharp")).default;
  const metadata = await sharp(sourceBuffer).metadata();
  const maxDim = 2048;
  let resizedBuffer = sourceBuffer;
  if ((metadata.width && metadata.width > maxDim) || (metadata.height && metadata.height > maxDim)) {
    resizedBuffer = await sharp(sourceBuffer)
      .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
  }

  const base64Source = resizedBuffer.toString("base64");
  const dataUri = `data:image/png;base64,${base64Source}`;

  const { replicateService } = await import("../integrations/replicate");

  const enhancedBuffer = await replicateService.generateImage(
    "photo-upscale",
    "luxury real estate photography, professional color correction, perfect exposure, sharp details, HDR quality, ultra photo realistic architectural render",
    dataUri
  );

  const enhancedBase64 = enhancedBuffer.toString("base64");

  let variantsUpdate: Record<string, unknown> = {};
  try {
    const result = await processImage(enhancedBuffer, { propertyId: propertyId ?? 0, photoId }, "image/png");
    if (result) {
      variantsUpdate = { variants: result.variants };
    }
  } catch (e: unknown) {
    logger.warn(`Auto-enhance: failed to regenerate variants for photo ${photoId}: ${e instanceof Error ? e.message : String(e)}`, "property-photos");
  }

  await storage.updatePropertyPhoto(photoId, {
    enhancedImageData: enhancedBase64,
    ...variantsUpdate,
  });

  logger.info(`Auto-enhance completed for photo ${photoId}`, "property-photos");
}

export function register(app: Express) {
  // GET /api/property-photos/:id/image — legacy serving endpoint.
  // Photos historically stored base64 blobs in Postgres (image_data column).
  // Phase B (Apr 22 2026) migrated all blobs to /objects/property-photos/<id>.png
  // in Replit Object Storage. This endpoint now:
  //   1. Redirects to the bucket URL (preferred path for cached refs).
  //   2. Falls back to streaming inline base64 if a row still has image_data
  //      (defensive — should not happen post-migration).
  app.get("/api/property-photos/:id/image", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-016" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-017" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-018" });
      }
      if (photo.imageUrl?.startsWith("/objects/")) {
        return res.redirect(302, photo.imageUrl);
      }
      // Defensive redirect: if the row's canonical imageUrl is *anywhere else*
      // (e.g. `/api/media/photo-N.png`, an https:// thumbnail, etc.) and is not
      // self-referential, follow it. This unbreaks any stale cached reference
      // — including `properties.image_url` cached as `/api/property-photos/<id>/image`
      // pointing at a row whose binary has since been moved to `/api/media/...`
      // — without depending on a one-off backfill having already run.
      const selfPath = `/api/property-photos/${photoId}/image`;
      if (photo.imageUrl && photo.imageUrl !== selfPath) {
        return res.redirect(302, photo.imageUrl);
      }
      if (photo.imageData) {
        const buffer = Buffer.from(photo.imageData, "base64");
        res.set({
          "Content-Type": "image/png",
          "Content-Length": buffer.length,
          "Cache-Control": "private, max-age=86400",
        });
        return res.send(buffer);
      }
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Image not found", code: "PHOT-019" });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve photo", error, "PHOT-001");
    }
  });

  // GET /api/properties/:id/photos — list all photos for a property
  app.get("/api/properties/:id/photos", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PHOT-020" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-021" });
      }
      const photos = await storage.getPropertyPhotos(propertyId);
      res.json(photos);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch property photos", error, "PHOT-002");
    }
  });

  // POST /api/properties/:id/photos — add a photo to the album
  app.post("/api/properties/:id/photos", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PHOT-022" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-023" });
      }

      const MAX_IMAGE_DATA_BYTES = 10 * 1024 * 1024; // 10 MB original ≈ 13.3 MB base64
      if (typeof req.body.imageData === "string" && req.body.imageData.length > Math.ceil(MAX_IMAGE_DATA_BYTES * 4 / 3)) {
        return res.status(HTTP_413_PAYLOAD_TOO_LARGE).json({ error: "Image too large. Maximum size is 10 MB.", code: "PHOT-024" });
      }

      const parsed = insertPropertyPhotoSchema.safeParse({
        ...req.body,
        propertyId,
      });
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      const photo = await storage.addPropertyPhoto(parsed.data);

      const shouldProcess = !req.body.skipProcessing;
      const shouldAutoEnhance = !req.body.skipEnhancement;

      (async () => {
        if (shouldProcess) {
          try {
            const result = await processExistingPhoto(photo.imageUrl, propertyId, photo.id);
            if (result) {
              await storage.updatePropertyPhoto(photo.id, { variants: result.variants });
            }
          } catch (err: unknown) {
            logger.error(`Background image processing failed for photo ${photo.id}: ${err instanceof Error ? err.message : String(err)}`, "property-photos");
          }
        }

        if (shouldAutoEnhance) {
          const adminAutoEnhance = await isAutoEnhanceEnabled();
          if (!adminAutoEnhance) {
            logger.info(`Auto-enhance skipped for photo ${photo.id} — disabled by admin`, "property-photos");
            return;
          }
          try {
            await autoEnhancePhoto(photo.id, photo.imageUrl, photo.imageData ?? null, propertyId);
          } catch (err: unknown) {
            logger.error(`Auto-enhance failed for photo ${photo.id}: ${err instanceof Error ? err.message : String(err)}`, "property-photos");
          }
        }
      })();

      res.status(HTTP_201_CREATED).json(photo);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to add property photo", error, "PHOT-003");
    }
  });

  // PATCH /api/properties/:id/photos/:photoId — update caption or sort order
  app.patch("/api/properties/:id/photos/:photoId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid ID", code: "PHOT-025" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-026" });
      }
      const parsed = updatePropertyPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      const existingPhoto = await storage.getPhotoById(photoId);
      if (!existingPhoto || existingPhoto.propertyId !== propertyId) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found for this property", code: "PHOT-027" });
      }

      const photo = await storage.updatePropertyPhoto(photoId, parsed.data);
      if (!photo) return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-028" });
      res.json(photo);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property photo", error, "PHOT-004");
    }
  });

  app.delete("/api/properties/:id/photos/:photoId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid ID", code: "PHOT-029" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-030" });
      }
      const existingPhoto = await storage.getPhotoById(photoId);
      if (!existingPhoto || existingPhoto.propertyId !== propertyId) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found for this property", code: "PHOT-031" });
      }

      const photos = await storage.getPropertyPhotos(propertyId);
      const user = getAuthUser(req);
      if (photos.length <= 1 && user.role !== "admin") {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Cannot delete the last photo — admin required", code: "PHOT-032" });
      }

      await storage.deletePropertyPhoto(photoId);
      res.status(HTTP_204_NO_CONTENT).send();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete property photo", error, "PHOT-005");
    }
  });

  // POST /api/properties/:id/photos/:photoId/set-hero — set as hero image
  app.post("/api/properties/:id/photos/:photoId/set-hero", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid ID", code: "PHOT-033" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-034" });
      }
      await storage.setHeroPhoto(propertyId, photoId);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to set hero photo", error, "PHOT-006");
    }
  });

  // PUT /api/properties/:id/photos/reorder — bulk reorder photos
  app.put("/api/properties/:id/photos/reorder", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PHOT-035" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-036" });
      }
      const schema = z.object({ orderedIds: z.array(z.number()) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      await storage.reorderPhotos(propertyId, parsed.data.orderedIds);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reorder photos", error, "PHOT-007");
    }
  });

  // POST /api/properties/:id/photos/move — admin: move or copy selected photos to another property
  app.post("/api/properties/:id/photos/move", requireAdmin, async (req, res) => {
    try {
      const sourcePropertyId = parseRouteId(req.params.id);
      if (!sourcePropertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PHOT-037" });
      const user = getAuthUser(req);
      if (!(await checkPropertyAccess(user, sourcePropertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-038" });
      }

      const schema = z.object({
        photoIds: z.array(z.number().int().positive()).min(1),
        destinationPropertyId: z.number().int().positive(),
        mode: z.enum(["move", "copy"]).default("move"),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }
      const { photoIds, destinationPropertyId, mode } = parsed.data;

      if (destinationPropertyId === sourcePropertyId) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Destination must be a different property", code: "PHOT-039" });
      }
      if (!(await checkPropertyAccess(user, destinationPropertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied to destination property", code: "PHOT-040" });
      }

      // Ensure all photo ids actually belong to source
      for (const pid of photoIds) {
        const p = await storage.getPhotoById(pid);
        if (!p || p.propertyId !== sourcePropertyId) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: `Photo ${pid} does not belong to source property`, code: "PHOT-041" });
        }
      }

      const result = mode === "copy"
        ? await storage.copyPhotos(photoIds, destinationPropertyId)
        : await storage.movePhotos(photoIds, destinationPropertyId);

      res.json({ success: true, mode, count: result.length, photos: result });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to move photos", error, "PHOT-008");
    }
  });

  const pendingEnhancements = new Map<number, string>();

  app.get("/api/property-photos/:id/enhanced-image", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-042" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-043" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-044" });
      }
      if (!photo.enhancedImageData) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Enhanced image not found", code: "PHOT-045" });
      }
      const buffer = Buffer.from(photo.enhancedImageData, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve enhanced photo", error, "PHOT-009");
    }
  });

  app.get("/api/property-photos/:id/enhanced-preview", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-046" });
      const pending = pendingEnhancements.get(photoId);
      if (!pending) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "No pending enhancement preview", code: "PHOT-047" });
      }
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-048" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-049" });
      }
      const buffer = Buffer.from(pending, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "no-store",
      });
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve enhanced preview", error, "PHOT-010");
    }
  });

  app.post("/api/property-photos/:id/enhance", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-050" });
      const user = getAuthUser(req);

      if (isApiRateLimited(user.id, "enhance-photo", 3)) {
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded. Try again in a minute.", code: "PHOT-051" });
      }

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-052" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-053" });
      }

      // ── Test-mode bypass (opt-in via env) ───────────────────────────
      // Set PHOTO_ENHANCE_TEST_MODE=1 to short-circuit BOTH the
      // source-resolution requirement AND the Replicate call, writing
      // a deterministic synthetic preview instead. This lets CI
      // exercise the full enhance → preview → accept/reject contract
      // even for photos stored in object storage (where we don't have
      // a publicly fetchable URL inside the test container) and
      // without spending Replicate quota or relying on network
      // availability. The bypass is dev-only: it is ignored whenever
      // NODE_ENV === "production".
      const bypassActive =
        process.env.NODE_ENV !== "production" && process.env.PHOTO_ENHANCE_TEST_MODE === "1";

      let enhancedBase64: string;
      if (bypassActive) {
        const sharpForSynth = (await import("sharp")).default;
        const synthBuffer = await sharpForSynth({
          create: {
            width: 64,
            height: 64,
            channels: 3,
            background: { r: 16, g: 185, b: 129 },
          },
        }).png().toBuffer();
        enhancedBase64 = synthBuffer.toString("base64");
        logger.info(`Enhance: PHOTO_ENHANCE_TEST_MODE=1 — synthesized preview for photo ${photoId}`, "property-photos");
      } else {
        let sourceBuffer: Buffer;
        if (photo.imageData) {
          sourceBuffer = Buffer.from(photo.imageData, "base64");
        } else if (photo.imageUrl.startsWith("http")) {
          const enhUrl = new URL(photo.imageUrl);
          const allowedHosts = ["objectstorage.replit.com", "replitusercontent.com", "storage.googleapis.com"];
          const isAllowed = allowedHosts.some(h => enhUrl.hostname === h || enhUrl.hostname.endsWith(`.${h}`));
          if (!isAllowed) {
            return res.status(HTTP_400_BAD_REQUEST).json({ error: "Cannot resolve source image for enhancement", code: "PHOT-054" });
          }
          const imgRes = await fetchWithTimeout(photo.imageUrl, undefined, 30_000);
          if (!imgRes.ok) {
            return res.status(HTTP_400_BAD_REQUEST).json({ error: "Failed to fetch source image", code: "PHOT-055" });
          }
          sourceBuffer = Buffer.from(await imgRes.arrayBuffer());
        } else {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: "Cannot resolve source image for enhancement", code: "PHOT-056" });
        }

        const sharp = (await import("sharp")).default;
        const metadata = await sharp(sourceBuffer).metadata();
        const maxDim = 2048;
        let resizedBuffer = sourceBuffer;
        if ((metadata.width && metadata.width > maxDim) || (metadata.height && metadata.height > maxDim)) {
          resizedBuffer = await sharp(sourceBuffer)
            .resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true })
            .png()
            .toBuffer();
        }

        const base64Source = resizedBuffer.toString("base64");
        const dataUri = `data:image/png;base64,${base64Source}`;

        const { replicateService } = await import("../integrations/replicate");
        const enhancedBuffer = await replicateService.generateImage(
          "photo-upscale",
          "luxury real estate photography, professional color correction, perfect exposure, sharp details, HDR quality",
          dataUri
        );
        enhancedBase64 = enhancedBuffer.toString("base64");
      }

      pendingEnhancements.set(photoId, enhancedBase64);

      setTimeout(() => pendingEnhancements.delete(photoId), 10 * 60_000);

      res.json({
        success: true,
        previewUrl: `/api/property-photos/${photoId}/enhanced-preview`,
        photoId,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to enhance photo", error, "PHOT-011");
    }
  });

  app.post("/api/property-photos/:id/enhance/accept", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-057" });
      const user = getAuthUser(req);

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-058" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-059" });
      }

      const pending = pendingEnhancements.get(photoId);
      if (!pending) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "No pending enhancement to accept", code: "PHOT-060" });
      }

      const enhancedBuffer = Buffer.from(pending, "base64");

      let variantsUpdate: Record<string, unknown> = {};
      try {
        const result = await processImage(enhancedBuffer, { propertyId: photo.propertyId, photoId }, "image/png");
        if (result) {
          variantsUpdate = { variants: result.variants };
        }
      } catch (e: unknown) {
        logger.warn(`Failed to regenerate variants from enhanced photo ${photoId}: ${(e instanceof Error ? e.message : String(e))}`, "property-photos");
      }

      await storage.updatePropertyPhoto(photoId, {
        enhancedImageData: pending,
        ...variantsUpdate,
      });
      pendingEnhancements.delete(photoId);

      res.json({ success: true, photoId });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to accept enhancement", error, "PHOT-012");
    }
  });

  app.post("/api/property-photos/:id/enhance/reject", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-061" });
      const user = getAuthUser(req);

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-062" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-063" });
      }

      pendingEnhancements.delete(photoId);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reject enhancement", error, "PHOT-013");
    }
  });

  app.delete("/api/property-photos/:id/enhanced", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid photo ID", code: "PHOT-064" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "Photo not found", code: "PHOT-065" });
      }

      const user = getAuthUser(req);
      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PHOT-066" });
      }

      await storage.updatePropertyPhoto(photoId, { enhancedImageData: null });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to remove enhanced photo", error, "PHOT-014");
    }
  });

  app.post("/api/admin/batch-enhance", requireAdmin, async (_req, res) => {
    try {
      const properties = await storage.getAllPropertiesAdmin();
      const queue: Array<{ photoId: number; imageUrl: string; imageData: string | null; propertyId: number }> = [];

      for (const prop of properties) {
        const photos = await storage.getPropertyPhotos(prop.id);
        for (const photo of photos) {
          if (!photo.enhancedImageData) {
            queue.push({
              photoId: photo.id,
              imageUrl: photo.imageUrl,
              imageData: photo.imageData,
              propertyId: prop.id,
            });
          }
        }
      }

      logger.info(`Batch enhance: ${queue.length} photos queued for processing`, "property-photos");

      res.json({
        success: true,
        queued: queue.length,
        message: `Processing ${queue.length} photos in background`,
      });

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      (async () => {
        let completed = 0;
        let failed = 0;
        const maxRetries = 2;
        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          let success = false;
          for (let attempt = 0; attempt <= maxRetries && !success; attempt++) {
            try {
              if (attempt > 0) {
                logger.info(`Batch enhance: retrying photo ${item.photoId} (attempt ${attempt + 1})`, "property-photos");
                await delay(15_000);
              }
              await autoEnhancePhoto(item.photoId, item.imageUrl, item.imageData, item.propertyId);
              completed++;
              success = true;
              logger.info(`Batch enhance: ${completed}/${queue.length} done (photo ${item.photoId})`, "property-photos");
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              if (attempt === maxRetries) {
                failed++;
                logger.error(`Batch enhance: photo ${item.photoId} failed after ${maxRetries + 1} attempts: ${msg}`, "property-photos");
              }
            }
          }
          if (i < queue.length - 1) {
            await delay(12_000);
          }
        }
        logger.info(`Batch enhance complete: ${completed} succeeded, ${failed} failed out of ${queue.length}`, "property-photos");
      })();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to start batch enhancement", error, "PHOT-015");
    }
  });
}
