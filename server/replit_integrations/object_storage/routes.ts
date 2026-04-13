import type { Express } from "express";
import { getStorageProvider } from "../../providers/storage";
import { logger } from "../../logger";

/**
 * Register object storage routes for file serving.
 *
 * The presigned-URL upload endpoint lives in server/routes/uploads.ts (with auth).
 * This module only registers the GET /objects/* route for serving stored files.
 */
export function registerObjectStorageRoutes(app: Express): void {
  /**
   * Serve uploaded objects.
   *
   * GET /objects/{path}
   *
   * This serves files from object storage. For public files, no auth needed.
   * For protected files, add authentication middleware and ACL checks.
   */
  app.get("/objects/{*path}", async (req, res) => {
    try {
      const storageProvider = getStorageProvider();
      await storageProvider.downloadToResponse(req.path, res);
    } catch (error: unknown) {
      logger.error(`Error serving object: ${error instanceof Error ? error.message : error}`, "object-storage");
      // Check for "not found" in the error message since ObjectNotFoundError
      // is an implementation detail of the Replit provider
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

