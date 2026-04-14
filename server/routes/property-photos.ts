import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManagementAccess, requireAdmin, checkPropertyAccess , getAuthUser } from "../auth";
import { insertPropertyPhotoSchema, updatePropertyPhotoSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logAndSendError, parseRouteId } from "./helpers";
import { z } from "zod";
import { processExistingPhoto, processImage } from "../image/pipeline";
import { logger } from "../logger";
import { isApiRateLimited } from "../auth";

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
    const contentLength = Number(imgRes.headers.get("content-length") || 0);
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
  // GET /api/property-photos/:id/image — serve image binary stored in Neon DB.
  // imageUrl is set to this path when imageData is present, making images
  // persistent and independent of Replit Object Storage.
  app.get("/api/property-photos/:id/image", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo || !photo.imageData) {
        return res.status(404).json({ error: "Image not found in database" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const buffer = Buffer.from(photo.imageData, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve photo from database", error);
    }
  });

  // GET /api/properties/:id/photos — list all photos for a property
  app.get("/api/properties/:id/photos", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const photos = await storage.getPropertyPhotos(propertyId);
      res.json(photos);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch property photos", error);
    }
  });

  // POST /api/properties/:id/photos — add a photo to the album
  app.post("/api/properties/:id/photos", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) {
        return res.status(403).json({ error: "Access denied" });
      }

      const parsed = insertPropertyPhotoSchema.safeParse({
        ...req.body,
        propertyId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
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
          try {
            await autoEnhancePhoto(photo.id, photo.imageUrl, photo.imageData ?? null, propertyId);
          } catch (err: unknown) {
            logger.error(`Auto-enhance failed for photo ${photo.id}: ${err instanceof Error ? err.message : String(err)}`, "property-photos");
          }
        }
      })();

      res.status(201).json(photo);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to add property photo", error);
    }
  });

  // PATCH /api/properties/:id/photos/:photoId — update caption or sort order
  app.patch("/api/properties/:id/photos/:photoId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(400).json({ error: "Invalid ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const parsed = updatePropertyPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const existingPhoto = await storage.getPhotoById(photoId);
      if (!existingPhoto || existingPhoto.propertyId !== propertyId) {
        return res.status(404).json({ error: "Photo not found for this property" });
      }

      const photo = await storage.updatePropertyPhoto(photoId, parsed.data);
      if (!photo) return res.status(404).json({ error: "Photo not found" });
      res.json(photo);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property photo", error);
    }
  });

  app.delete("/api/properties/:id/photos/:photoId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(400).json({ error: "Invalid ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const existingPhoto = await storage.getPhotoById(photoId);
      if (!existingPhoto || existingPhoto.propertyId !== propertyId) {
        return res.status(404).json({ error: "Photo not found for this property" });
      }

      const photos = await storage.getPropertyPhotos(propertyId);
      const user = getAuthUser(req);
      if (photos.length <= 1 && user.role !== "admin") {
        return res.status(403).json({ error: "Cannot delete the last photo — admin required" });
      }

      await storage.deletePropertyPhoto(photoId);
      res.status(204).send();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete property photo", error);
    }
  });

  // POST /api/properties/:id/photos/:photoId/set-hero — set as hero image
  app.post("/api/properties/:id/photos/:photoId/set-hero", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      const photoId = parseRouteId(req.params.photoId);
      if (!propertyId || !photoId) return res.status(400).json({ error: "Invalid ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      await storage.setHeroPhoto(propertyId, photoId);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to set hero photo", error);
    }
  });

  // PUT /api/properties/:id/photos/reorder — bulk reorder photos
  app.put("/api/properties/:id/photos/reorder", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(400).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const schema = z.object({ orderedIds: z.array(z.number()) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      await storage.reorderPhotos(propertyId, parsed.data.orderedIds);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reorder photos", error);
    }
  });

  const pendingEnhancements = new Map<number, string>();

  app.get("/api/property-photos/:id/enhanced-image", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      if (!photo.enhancedImageData) {
        return res.status(404).json({ error: "Enhanced image not found" });
      }
      const buffer = Buffer.from(photo.enhancedImageData, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve enhanced photo", error);
    }
  });

  app.get("/api/property-photos/:id/enhanced-preview", requireAuth, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const pending = pendingEnhancements.get(photoId);
      if (!pending) {
        return res.status(404).json({ error: "No pending enhancement preview" });
      }
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const buffer = Buffer.from(pending, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "no-store",
      });
      res.send(buffer);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to serve enhanced preview", error);
    }
  });

  app.post("/api/property-photos/:id/enhance", requireManagementAccess, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const user = getAuthUser(req);

      if (isApiRateLimited(user.id, "enhance-photo", 3)) {
        return res.status(429).json({ error: "Rate limit exceeded. Try again in a minute." });
      }

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      let sourceBuffer: Buffer;
      if (photo.imageData) {
        sourceBuffer = Buffer.from(photo.imageData, "base64");
      } else if (photo.imageUrl.startsWith("http")) {
        const imgRes = await fetch(photo.imageUrl);
        if (!imgRes.ok) {
          return res.status(400).json({ error: "Failed to fetch source image" });
        }
        sourceBuffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        return res.status(400).json({ error: "Cannot resolve source image for enhancement" });
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

      const enhancedBase64 = enhancedBuffer.toString("base64");
      pendingEnhancements.set(photoId, enhancedBase64);

      setTimeout(() => pendingEnhancements.delete(photoId), 10 * 60_000);

      res.json({
        success: true,
        previewUrl: `/api/property-photos/${photoId}/enhanced-preview`,
        photoId,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to enhance photo", error);
    }
  });

  app.post("/api/property-photos/:id/enhance/accept", requireManagementAccess, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const user = getAuthUser(req);

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const pending = pendingEnhancements.get(photoId);
      if (!pending) {
        return res.status(404).json({ error: "No pending enhancement to accept" });
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
      logAndSendError(res, "Failed to accept enhancement", error);
    }
  });

  app.post("/api/property-photos/:id/enhance/reject", requireManagementAccess, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const user = getAuthUser(req);

      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      pendingEnhancements.delete(photoId);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to reject enhancement", error);
    }
  });

  app.delete("/api/property-photos/:id/enhanced", requireManagementAccess, async (req, res) => {
    try {
      const photoId = parseRouteId(req.params.id);
      if (!photoId) return res.status(400).json({ error: "Invalid photo ID" });
      const photo = await storage.getPhotoById(photoId);
      if (!photo) {
        return res.status(404).json({ error: "Photo not found" });
      }

      const user = getAuthUser(req);
      if (!(await checkPropertyAccess(user, photo.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.updatePropertyPhoto(photoId, { enhancedImageData: null });
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to remove enhanced photo", error);
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
      logAndSendError(res, "Failed to start batch enhancement", error);
    }
  });
}
