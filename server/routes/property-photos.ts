import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireManagementAccess, requireAdmin, checkPropertyAccess , getAuthUser } from "../auth";
import { insertPropertyPhotoSchema, updatePropertyPhotoSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { logAndSendError } from "./helpers";
import { z } from "zod";
import { processExistingPhoto } from "../image/pipeline";
import { logger } from "../logger";

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
}
