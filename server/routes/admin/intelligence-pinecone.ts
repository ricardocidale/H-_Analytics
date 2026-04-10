import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin, getAuthUser } from "../../auth";
import { logAndSendError } from "../helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { isPineconeAvailable, isEmbeddingAvailable, getNamespaceStats, deleteNamespace, getTotalVectorCount, ALL_NAMESPACES, type PineconeNamespace, indexScenarioSummary, indexPropertyProfile } from "../../ai/pinecone-service";
import { mapCategoryToKpis } from "../../ai/pinecone-indexing";
import { indexAllAssets } from "../../ai/asset-intelligence";
import { indexKnowledgeBase } from "../../ai/knowledge-base";
import { checkVendorAvailability, getRecommendedDefaults } from "../../ai/resolve-llm";
import { logger } from "../../logger";

export function registerPineconeRoutes(app: Express) {
  app.get("/api/admin/intelligence/financial-lines", requireAdmin, async (req, res) => {
    try {
      const status = z.enum(["all", "pending", "approved", "rejected"]).optional().safeParse(req.query.status);
      const filter = status.success ? status.data : undefined;
      const [lines, counts] = await Promise.all([
        storage.getEngineSuggestedLines(filter),
        storage.getEngineSuggestedLineCounts(),
      ]);
      res.json({ lines, counts });
    } catch (error) {
      logAndSendError(res, "Failed to fetch financial line suggestions", error);
    }
  });

  app.patch("/api/admin/intelligence/financial-lines/:id/approve", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const user = getAuthUser(req);
      const existing = await storage.getEngineSuggestedLineById(id);
      if (!existing) return res.status(404).json({ error: "Suggestion not found" });
      const updated = await storage.approveEngineSuggestedLine(id, user.id);

      if (updated) {
        try {
          const { indexToKnowledgeBase } = await import("../../ai/pinecone-service");
          const text = `Approved financial line suggestion: ${updated.lineName} (${updated.statementType} / ${updated.category}). ${updated.description ?? ""} ${updated.justification ?? ""}`;
          await indexToKnowledgeBase(`financial-line-${updated.id}`, text, {
            type: "financial-line-suggestion",
            statementType: updated.statementType,
            category: updated.category,
            lineName: updated.lineName,
            status: "approved",
          });
        } catch {
          logger.warn("Failed to index approved financial line to Pinecone", "financial-lines");
        }
      }

      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to approve financial line suggestion", error);
    }
  });

  app.patch("/api/admin/intelligence/financial-lines/:id/reject", requireAdmin, async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
      const body = z.object({ reason: z.string().min(1).max(500) }).safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: "Rejection reason is required (1-500 chars)" });
      const user = getAuthUser(req);
      const existing = await storage.getEngineSuggestedLineById(id);
      if (!existing) return res.status(404).json({ error: "Suggestion not found" });
      const updated = await storage.rejectEngineSuggestedLine(id, user.id, body.data.reason);
      res.json(updated);
    } catch (error) {
      logAndSendError(res, "Failed to reject financial line suggestion", error);
    }
  });

  app.get("/api/admin/system-intelligence-status", requireAdmin, async (_req, res) => {
    try {
      const vendors = checkVendorAvailability();
      const recommended = getRecommendedDefaults();
      const pinecone = isPineconeAvailable();
      const embeddings = isEmbeddingAvailable();

      const knowledgeLearning = pinecone && embeddings;

      res.json({
        llmVendors: vendors,
        recommendedDefaults: recommended,
        knowledgeBase: {
          pinecone,
          embeddings,
          learningActive: knowledgeLearning,
          message: knowledgeLearning
            ? "Knowledge learning is active — research results are indexed for future retrieval"
            : !pinecone
              ? "Pinecone not configured (PINECONE_API_KEY) — knowledge learning disabled"
              : "Embedding API not available — set OPENAI_EMBEDDING_KEY for vector learning. Replit AI integration proxies do not support embedding endpoints.",
        },
        missingKeys: {
          fredApiKey: !process.env.FRED_API_KEY,
          pineconeApiKey: !pinecone,
          embeddingKey: !embeddings,
        },
      });
    } catch (error) {
      logAndSendError(res, "Failed to check system intelligence status", error);
    }
  });

  app.post("/api/admin/intelligence/index-assets", requireAdmin, async (_req, res) => {
    try {
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      if (!isEmbeddingAvailable()) {
        return res.status(400).json({ error: "Embedding service not available" });
      }
      const result = await indexAllAssets();
      res.json({ success: true, indexed: result });
    } catch (error) {
      logAndSendError(res, "Failed to index assets", error);
    }
  });

  app.get("/api/admin/pinecone/stats", requireAdmin, async (_req, res) => {
    try {
      if (!isPineconeAvailable()) {
        return res.json({ available: false, namespaces: {}, totalVectors: 0 });
      }
      const [namespaces, totalVectors] = await Promise.all([
        getNamespaceStats(),
        getTotalVectorCount(),
      ]);
      res.json({
        available: true,
        embeddingsAvailable: isEmbeddingAvailable(),
        totalVectors,
        namespaces,
        allNamespaces: ALL_NAMESPACES,
      });
    } catch (error) {
      logAndSendError(res, "Failed to get Pinecone stats", error);
    }
  });

  app.post("/api/admin/pinecone/reindex/:namespace", requireAdmin, async (req, res) => {
    try {
      const ns = req.params.namespace as PineconeNamespace;
      if (!ALL_NAMESPACES.includes(ns)) {
        return res.status(400).json({ error: `Invalid namespace: ${ns}` });
      }
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      if (!isEmbeddingAvailable()) {
        return res.status(400).json({ error: "Embedding service not available" });
      }

      let result: Record<string, any> = { namespace: ns };

      if (ns === "knowledge-base") {
        await deleteNamespace(ns);
        const kbResult = await indexKnowledgeBase();
        const assetResult = await indexAllAssets();
        result.chunksIndexed = kbResult.chunksIndexed;
        result.photosIndexed = assetResult.photos;
        result.logosIndexed = assetResult.logos;
        result.timeMs = kbResult.timeMs;
      } else if (ns === "scenarios") {
        await deleteNamespace(ns);
        const allScenariosRaw = await storage.getAllScenarios();
        const allScenarios = allScenariosRaw.filter(s => !s.deletedAt);
        let indexed = 0;
        for (const scenario of allScenarios) {
          try {
            const propArr = Array.isArray(scenario.properties) ? scenario.properties : [];
            const firstProp = propArr[0] as Record<string, any> | undefined;
            const ga = scenario.globalAssumptions as Record<string, any> | null;
            const cr = scenario.computedResults as Record<string, any> | null;
            await indexScenarioSummary({
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              propertyId: firstProp?.id ?? 0,
              propertyName: firstProp?.name ?? "Portfolio",
              location: firstProp?.location ?? firstProp?.city ?? "",
              propertyType: firstProp?.propertyType ?? firstProp?.property_type ?? "hotel",
              totalRevenue: cr?.totalRevenue ?? null,
              totalExpenses: cr?.totalExpenses ?? null,
              noi: cr?.noi ?? null,
              adr: ga?.adr ?? firstProp?.adr ?? null,
              occupancy: ga?.occupancy ?? firstProp?.occupancy ?? null,
              revpar: cr?.revpar ?? null,
              years: ga?.holdPeriod ?? ga?.projectionYears ?? null,
              createdBy: scenario.userId ? String(scenario.userId) : undefined,
            });
            indexed++;
          } catch (e) { logger.warn(`Failed to index scenario ${scenario.id}: ${e instanceof Error ? e.message : e}`, "pinecone"); }
        }
        result.indexed = indexed;
        result.total = allScenarios.length;
      } else if (ns === "properties") {
        await deleteNamespace(ns);
        const allProperties = await storage.getAllProperties();
        let indexed = 0;
        for (const property of allProperties) {
          try {
            await indexPropertyProfile({
              propertyId: property.id,
              name: property.name ?? "Unnamed Property",
              location: [property.city, property.stateProvince, property.country].filter(Boolean).join(", "),
              propertyType: (property as any).propertyType ?? (property as any).property_type ?? "hotel",
              roomCount: (property as any).roomCount ?? (property as any).room_count ?? null,
              starRating: (property as any).starRating ?? (property as any).star_rating ?? null,
              status: (property as any).status ?? "active",
              purchasePrice: (property as any).purchasePrice ?? (property as any).purchase_price ?? null,
              market: (property as any).market ?? null,
            });
            indexed++;
          } catch (e) { logger.warn(`Failed to index property ${property.id}: ${e instanceof Error ? e.message : e}`, "pinecone"); }
        }
        result.indexed = indexed;
        result.total = allProperties.length;
      } else if (ns === "comparables") {
        await deleteNamespace(ns);
        const snapshots = await storage.getBenchmarkSnapshots();
        const { indexBenchmarkSnapshot } = await import("../../ai/pinecone-service");
        let indexed = 0;
        for (const snap of snapshots) {
          try {
            const kpis = mapCategoryToKpis(snap.category, snap.value);
            await indexBenchmarkSnapshot({
              market: snap.snapshotKey,
              propertyType: snap.category,
              ...kpis,
              source: snap.source ?? "unknown",
              snapshotDate: snap.fetchedAt.toISOString(),
            });
            indexed++;
          } catch (e) { logger.warn(`Failed to index benchmark ${snap.snapshotKey}: ${e instanceof Error ? e.message : e}`, "pinecone"); }
        }
        result.indexed = indexed;
        result.total = snapshots.length;
      } else {
        await deleteNamespace(ns);
        result.cleared = true;
        result.message = `Namespace "${ns}" cleared. Data will be re-indexed as new items are created.`;
      }

      logger.info(`Admin re-indexed Pinecone namespace "${ns}": ${JSON.stringify(result)}`, "pinecone");
      res.json({ success: true, ...result });
    } catch (error) {
      logAndSendError(res, `Failed to reindex namespace ${req.params.namespace}`, error);
    }
  });

  app.delete("/api/admin/pinecone/clear/:namespace", requireAdmin, async (req, res) => {
    try {
      const ns = req.params.namespace as PineconeNamespace;
      if (!ALL_NAMESPACES.includes(ns)) {
        return res.status(400).json({ error: `Invalid namespace: ${ns}` });
      }
      if (!isPineconeAvailable()) {
        return res.status(400).json({ error: "Pinecone not configured" });
      }
      await deleteNamespace(ns);
      logger.info(`Admin cleared Pinecone namespace "${ns}"`, "pinecone");
      res.json({ success: true, namespace: ns, cleared: true });
    } catch (error) {
      logAndSendError(res, `Failed to clear namespace ${req.params.namespace}`, error);
    }
  });
}
