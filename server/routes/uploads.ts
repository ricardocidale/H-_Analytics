import type { Express } from "express";
import { requireAuth, isApiRateLimited, getAuthUser, checkPropertyAccess } from "../auth";
import { getStorageProvider } from "../providers/storage";
import { logActivity, logAndSendError, uploadRequestSchema, processImageSchema, bulkProcessPhotosSchema } from "./helpers";
import { fromZodError } from "zod-validation-error";
import { randomUUID } from "crypto";
import { processImage, type CropRegion } from "../image/pipeline";
import { storage } from "../storage";
import { isAdminRole } from "@shared/constants";
import { MAX_UPLOAD_BYTES } from "../constants";
import { logger } from "../logger";
import { isBlockedHostResolved } from "./ssrf-guard";

const ALLOWED_CONTENT_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/svg+xml", "image/bmp", "image/tiff",
];

const IMAGE_PROCESSABLE_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/gif",
  "image/webp", "image/bmp", "image/tiff",
];

export function register(app: Express) {
  app.post("/api/uploads/request-url", requireAuth, async (req, res) => {
    try {
      const validation = uploadRequestSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { name, size, contentType, entityType, entityId } = validation.data;

      const storageProvider = getStorageProvider();
      const { url: uploadURL, objectPath } = await storageProvider.getUploadUrl(name);

      logActivity(req, "upload-request", entityType || "asset", entityId, name, { objectPath });

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType }
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to generate upload URL", error);
    }
  });

  app.post("/api/uploads/direct", requireAuth, async (req, res) => {
    try {
      // Rate limit: max 10 uploads per minute per user
      if (isApiRateLimited(getAuthUser(req).id, "upload", 10)) {
        return res.status(429).json({ error: "Upload rate limit exceeded. Please wait before uploading again." });
      }

      const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return res.status(400).json({ error: "Only image files are supported (PNG, JPEG, GIF, WebP, SVG, BMP, TIFF). Please select an image file and try again." });
      }

      const contentLength = parseInt(req.headers["content-length"] || "0", 10);
      if (contentLength > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buf.length;
        if (totalSize > MAX_UPLOAD_BYTES) {
          return res.status(413).json({ error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES / 1024 / 1024}MB.` });
        }
        chunks.push(buf);
      }
      const body = Buffer.concat(chunks);

      if (body.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }

      const storageProvider = getStorageProvider();
      const objectId = randomUUID();
      const objectPath = await storageProvider.uploadBuffer(`uploads/${objectId}`, body, contentType);
      logActivity(req, "upload-direct", "asset", undefined, objectId, { objectPath, contentType, size: body.length });

      res.json({ objectPath });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to upload file", error);
    }
  });

  app.post("/api/uploads/process-image", requireAuth, async (req, res) => {
    if (isApiRateLimited(getAuthUser(req).id, "process-image", 5)) {
      return res.status(429).json({ error: "Too many image processing requests. Please try again later." });
    }
    try {
      const validation = processImageSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { propertyId, photoId, imageUrl, crop } = validation.data;

      if (!(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (!imageUrl.startsWith("/objects/")) {
        return res.status(400).json({ error: "Only object storage paths are allowed" });
      }

      const existingPhotos = await storage.getPropertyPhotos(Number(propertyId));
      const targetPhoto = existingPhotos.find(p => p.id === Number(photoId));
      if (!targetPhoto) {
        return res.status(404).json({ error: "Photo not found for this property" });
      }

      const storageProvider = getStorageProvider();
      const downloaded = await storageProvider.downloadBuffer(imageUrl);
      let buffer: Buffer = downloaded.buffer;
      let contentType = downloaded.contentType || "image/jpeg";

      if (!IMAGE_PROCESSABLE_TYPES.includes(contentType.split(";")[0].trim())) {
        return res.json({ variants: null, message: "Image type not processable" });
      }

      const cropRegion: CropRegion | undefined = crop ? {
        left: crop.x ?? crop.left ?? 0,
        top: crop.y ?? crop.top ?? 0,
        width: crop.width,
        height: crop.height,
      } : undefined;

      const result = await processImage(buffer, {
        propertyId: Number(propertyId),
        photoId: Number(photoId),
        crop: cropRegion,
      }, contentType);

      await storage.updatePropertyPhoto(Number(photoId), {
        variants: result.variants,
      });

      logActivity(req, "image-processed", "photo", photoId, `${propertyId}`, {
        variants: Object.keys(result.variants),
        width: result.width,
        height: result.height,
      });

      res.json({ variants: result.variants });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to process image", error);
    }
  });

  app.post("/api/admin/bulk-process-photos", requireAuth, async (req, res) => {
    try {
      const user = req.user;
      if (!user || !isAdminRole(user.role)) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const parsed = bulkProcessPhotosSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const { propertyId } = parsed.data;

      let photos;
      if (propertyId) {
        photos = await storage.getPropertyPhotos(propertyId);
      } else {
        const allProperties = isAdminRole(user.role)
          ? await storage.getAllProperties()
          : await storage.getAllProperties(user.id);
        // Bulk fetch all photos in a single query instead of N queries
        const photosByPropId = await storage.getPhotosByProperties(allProperties.map(p => p.id));
        photos = Object.values(photosByPropId).flat();
      }

      const unprocessed = photos.filter(p => !p.variants);
      let processed = 0;
      let failed = 0;

      for (const photo of unprocessed) {
        try {
          let buffer: Buffer;
          let contentType = "image/jpeg";

          if (photo.imageUrl.startsWith("/objects/")) {
            const storageProvider = getStorageProvider();
            const downloaded = await storageProvider.downloadBuffer(photo.imageUrl);
            buffer = downloaded.buffer;
            contentType = downloaded.contentType || "image/jpeg";
          } else if (photo.imageUrl.startsWith("https://")) {
            const parsed = new URL(photo.imageUrl);
            if (await isBlockedHostResolved(parsed.hostname)) {
              failed++;
              continue;
            }
            const response = await fetch(photo.imageUrl);
            if (!response.ok) { failed++; continue; }
            buffer = Buffer.from(await response.arrayBuffer());
            contentType = response.headers.get("content-type") || "image/jpeg";
          } else {
            failed++;
            continue;
          }

          const result = await processImage(buffer, {
            propertyId: photo.propertyId,
            photoId: photo.id,
          }, contentType);

          await storage.updatePropertyPhoto(photo.id, {
            variants: result.variants,
          });

          processed++;
        } catch (err: unknown) {
          logger.error(`Failed to process photo ${photo.id}: ${err instanceof Error ? err.message : err}`, "uploads");
          failed++;
        }
      }

      res.json({
        total: unprocessed.length,
        processed,
        failed,
        skipped: photos.length - unprocessed.length,
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to bulk process photos", error);
    }
  });
}
