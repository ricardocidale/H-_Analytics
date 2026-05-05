import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { getNamespaceStats, type VectorNamespace } from "../../ai/vector-store-service";
import { vectorStorePool } from "../../storage/vector-store";
import {
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
} from "../../constants";

const CHUNKS_PAGE_SIZE = 20;

export function registerKnowledgeRegistryRoutes(app: Express) {
  // GET /api/admin/knowledge-registry
  // Lists all 8 registry entries with live chunk counts merged in for
  // vector_namespace assets.
  app.get("/api/admin/knowledge-registry", requireAdmin, async (_req, res) => {
    try {
      const [entries, stats] = await Promise.all([
        storage.getAllKnowledgeRegistry(),
        getNamespaceStats().catch(() => ({} as Record<string, number>)),
      ]);

      const enriched = entries.map((entry) => ({
        ...entry,
        liveCount:
          entry.assetType === "vector_namespace"
            ? (stats[entry.assetRef as VectorNamespace] ?? 0)
            : null,
      }));

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry", error);
    }
  });

  // GET /api/admin/knowledge-registry/country-economic-data
  // Must be registered BEFORE /:id to prevent path shadowing.
  app.get("/api/admin/knowledge-registry/country-economic-data", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAllCountryEconomicData();
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch country economic data", error);
    }
  });

  // GET /api/admin/knowledge-registry/:id
  app.get("/api/admin/knowledge-registry/:id", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found" });
      res.json(entry);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry entry", error);
    }
  });

  // GET /api/admin/knowledge-registry/:id/chunks?page=N
  // Paginated chunk browsing for VectorChunkViewer. Only valid for
  // vector_namespace assets; returns 422 for other asset types.
  app.get("/api/admin/knowledge-registry/:id/chunks", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found" });
      if (entry.assetType !== "vector_namespace") {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: `Chunk browsing is only available for vector_namespace assets; this entry is asset_type '${entry.assetType}'`,
        });
      }

      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
      const offset = (page - 1) * CHUNKS_PAGE_SIZE;
      const namespace = entry.assetRef;

      const [chunksResult, countResult] = await Promise.all([
        vectorStorePool.query<{ id: string; text: string; metadata: Record<string, unknown> }>(
          `SELECT id, text, metadata FROM vector_chunks WHERE namespace = $1 ORDER BY id ASC LIMIT $2 OFFSET $3`,
          [namespace, CHUNKS_PAGE_SIZE, offset],
        ),
        vectorStorePool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM vector_chunks WHERE namespace = $1`,
          [namespace],
        ),
      ]);

      res.json({
        chunks: chunksResult.rows,
        page,
        total: parseInt(countResult.rows[0]?.count ?? "0", 10),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch chunks for knowledge registry entry", error);
    }
  });
}
