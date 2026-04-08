import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManagementAccess, requireAdmin, checkPropertyAccess , getAuthUser } from "../auth";
import { insertPropertyPhotoSchema, updatePropertyPhotoSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logAndSendError } from "./helpers";
import { z } from "zod";
import { processExistingPhoto } from "../image/pipeline";
import { logger } from "../logger";
import { isApiRateLimited } from "../auth";

export function register(app: Express) {
  // GET /api/property-photos/:id/image — serve image binary stored in Neon DB.
  // imageUrl is set to this path when imageData is present, making images
  // persistent and independent of Replit Object Storage.
  app.get("/api/property-photos/:id/image", requireAuth, async (req, res) => {
    try {
      const photoId = Number(req.params.id);
      const photo = await storage.getPhotoById(photoId);
      if (!photo || !photo.imageData) {
        return res.status(404).json({ error: "Image not found in database" });
      }
      const buffer = Buffer.from(photo.imageData, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (error) {
      logAndSendError(res, "Failed to serve photo from database", error);
    }
  });

  // GET /api/properties/:id/photos — list all photos for a property
  app.get("/api/properties/:id/photos", requireAuth, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const photos = await storage.getPropertyPhotos(propertyId);
      res.json(photos);
    } catch (error) {
      logAndSendError(res, "Failed to fetch property photos", error);
    }
  });

  // POST /api/properties/:id/photos — add a photo to the album
  app.post("/api/properties/:id/photos", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const property = await storage.getProperty(propertyId);
      if (!property) return res.status(404).json({ error: "Property not found" });

      const parsed = insertPropertyPhotoSchema.safeParse({
        ...req.body,
        propertyId,
      });
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const photo = await storage.addPropertyPhoto(parsed.data);

      const shouldProcess = !req.body.skipProcessing;
      if (shouldProcess) {
        processExistingPhoto(photo.imageUrl, propertyId, photo.id)
          .then(async (result) => {
            if (result) {
              await storage.updatePropertyPhoto(photo.id, { variants: result.variants });
            }
          })
          .catch((err) => {
            logger.error(`Background image processing failed for photo ${photo.id}: ${err instanceof Error ? err.message : err}`, "property-photos");
          });
      }

      res.status(201).json(photo);
    } catch (error) {
      logAndSendError(res, "Failed to add property photo", error);
    }
  });

  // PATCH /api/properties/:id/photos/:photoId — update caption or sort order
  app.patch("/api/properties/:id/photos/:photoId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const photoId = Number(req.params.photoId);
      const parsed = updatePropertyPhotoSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const photo = await storage.updatePropertyPhoto(photoId, parsed.data);
      if (!photo) return res.status(404).json({ error: "Photo not found" });
      res.json(photo);
    } catch (error) {
      logAndSendError(res, "Failed to update property photo", error);
    }
  });

  app.delete("/api/properties/:id/photos/:photoId", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const photos = await storage.getPropertyPhotos(propertyId);
      const user = getAuthUser(req);
      if (photos.length <= 1 && user.role !== "admin") {
        return res.status(403).json({ error: "Cannot delete the last photo — admin required" });
      }

      const photoId = Number(req.params.photoId);
      await storage.deletePropertyPhoto(photoId);
      res.status(204).send();
    } catch (error) {
      logAndSendError(res, "Failed to delete property photo", error);
    }
  });

  // POST /api/properties/:id/photos/:photoId/set-hero — set as hero image
  app.post("/api/properties/:id/photos/:photoId/set-hero", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }
      const photoId = Number(req.params.photoId);
      await storage.setHeroPhoto(propertyId, photoId);
      res.json({ success: true });
    } catch (error) {
      logAndSendError(res, "Failed to set hero photo", error);
    }
  });

  // PUT /api/properties/:id/photos/reorder — bulk reorder photos
  app.put("/api/properties/:id/photos/reorder", requireManagementAccess, async (req, res) => {
    try {
      const propertyId = Number(req.params.id);
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
    } catch (error) {
      logAndSendError(res, "Failed to reorder photos", error);
    }
  });

  app.get("/api/property-photos/:id/enhanced-image", requireAuth, async (req, res) => {
    try {
      const photoId = Number(req.params.id);
      const photo = await storage.getPhotoById(photoId);
      if (!photo || !photo.enhancedImageData) {
        return res.status(404).json({ error: "Enhanced image not found" });
      }
      const buffer = Buffer.from(photo.enhancedImageData, "base64");
      res.set({
        "Content-Type": "image/png",
        "Content-Length": buffer.length,
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (error) {
      logAndSendError(res, "Failed to serve enhanced photo", error);
    }
  });

  app.post("/api/property-photos/:id/enhance", requireManagementAccess, async (req, res) => {
    try {
      const photoId = Number(req.params.id);
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
      } else if (photo.imageUrl.startsWith("/api/property-photos/")) {
        const innerPhoto = await storage.getPhotoById(photoId);
        if (!innerPhoto?.imageData) {
          return res.status(400).json({ error: "No image data available for enhancement" });
        }
        sourceBuffer = Buffer.from(innerPhoto.imageData, "base64");
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

      await storage.updatePropertyPhoto(photoId, {
        enhancedImageData: enhancedBase64,
      });

      res.json({
        success: true,
        enhancedImageUrl: `/api/property-photos/${photoId}/enhanced-image`,
        photoId,
      });
    } catch (error) {
      logAndSendError(res, "Failed to enhance photo", error);
    }
  });

  app.delete("/api/property-photos/:id/enhanced", requireManagementAccess, async (req, res) => {
    try {
      const photoId = Number(req.params.id);
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
    } catch (error) {
      logAndSendError(res, "Failed to remove enhanced photo", error);
    }
  });
}
