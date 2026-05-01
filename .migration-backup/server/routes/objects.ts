import type { Express } from "express";
import { getStorageProvider } from "../providers/storage";
import { logger } from "../logger";

/**
 * Registers the GET /objects/* route for serving stored files.
 * Upload URLs are handled in server/routes/uploads.ts (with auth).
 */
export function registerObjectRoutes(app: Express): void {
  app.get("/objects/{*path}", async (req, res) => {
    try {
      const storageProvider = getStorageProvider();
      await storageProvider.downloadToResponse(req.path, res);
    } catch (error: unknown) {
      logger.error(`Error serving object: ${error instanceof Error ? error.message : error}`, "object-storage");
      const isNotFound = error instanceof Error && (
        error.constructor.name === "ObjectNotFoundError" ||
        error.message.includes("not found") ||
        error.message.includes("Not Found")
      );
      if (isNotFound) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });
}
