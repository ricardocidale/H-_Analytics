import { type Express } from "express";
import { requireAdmin } from "../../auth";
import { storage } from "../../storage";
import { logAndSendError, sendError, logActivity, parseRouteId } from "../helpers";
import { z } from "zod";

const createBulkDraftRunBody = z.object({
  propertyResults: z.array(
    z.object({
      propertyId: z.number(),
      propertyName: z.string(),
      status: z.enum(["done", "error"]),
      draftedSlots: z.array(z.string()),
      skippedSlots: z.array(z.string()),
    }),
  ),
});

const deleteBeforeQuery = z.object({
  before: z.string().datetime({ message: "before must be an ISO 8601 datetime string" }),
});

const deleteManyBody = z.object({
  ids: z.array(z.number().int().positive()).min(1, "ids must be a non-empty array of positive integers"),
});

export function registerBulkDraftRunRoutes(app: Express) {
  app.get("/api/admin/bulk-draft-runs", requireAdmin, async (_req, res) => {
    try {
      const runs = await storage.listBulkDraftRuns();
      res.json(runs);
    } catch (error) {
      logAndSendError(res, "Failed to list bulk draft runs", error, "ABDR-001");
    }
  });

  app.post("/api/admin/bulk-draft-runs", requireAdmin, async (req, res) => {
    const parsed = createBulkDraftRunBody.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body", "ABDR-006");
    }

    const user = req.user;
    if (!user) {
      return sendError(res, 401, "Unauthorized", "ABDR-007");
    }

    const { propertyResults } = parsed.data;

    const totalDrafted = propertyResults.reduce(
      (sum, r) => sum + r.draftedSlots.length,
      0,
    );
    const totalSkipped = propertyResults.reduce(
      (sum, r) => sum + r.skippedSlots.length,
      0,
    );
    const totalErrors = propertyResults.filter(
      (r) => r.status === "error",
    ).length;

    const userName = [user.firstName, user.lastName]
      .filter(Boolean)
      .join(" ") || user.email || `User ${user.id}`;

    try {
      const run = await storage.createBulkDraftRun({
        userId: user.id,
        userName,
        totalDrafted,
        totalSkipped,
        totalErrors,
        propertyCount: propertyResults.length,
        propertyResults,
      });

      logActivity(req, "bulk-draft-run", "bulk_draft_runs", run.id);

      res.status(201).json(run);
    } catch (error) {
      logAndSendError(res, "Failed to save bulk draft run", error, "ABDR-002");
    }
  });

  app.delete("/api/admin/bulk-draft-runs/:id", requireAdmin, async (req, res) => {
    const id = parseRouteId(req.params.id);
    if (!id) {
      return sendError(res, 400, "Invalid run id", "ABDR-008");
    }

    try {
      const deleted = await storage.deleteBulkDraftRun(id);
      if (!deleted) {
        return sendError(res, 404, "Run not found", "ABDR-009");
      }
      logActivity(req, "delete-bulk-draft-run", "bulk_draft_runs", id);
      res.status(204).end();
    } catch (error) {
      logAndSendError(res, "Failed to delete bulk draft run", error, "ABDR-003");
    }
  });

  app.delete("/api/admin/bulk-draft-runs", requireAdmin, async (req, res) => {
    const bodyParsed = deleteManyBody.safeParse(req.body);
    if (bodyParsed.success) {
      const { ids } = bodyParsed.data;
      try {
        const result = await storage.deleteBulkDraftRunsByIds(ids);
        logActivity(req, "delete-bulk-draft-runs-by-ids", "bulk_draft_runs", null, undefined, { deleted: result.deleted, failed: result.failed.length });
        res.json(result);
      } catch (error) {
        logAndSendError(res, "Failed to bulk-delete draft runs", error, "ABDR-004");
      }
      return;
    }

    const queryParsed = deleteBeforeQuery.safeParse(req.query);
    if (!queryParsed.success) {
      return sendError(res, 400, "Provide either a JSON body { ids: number[] } or query parameter 'before' (ISO 8601 datetime)", "ABDR-010");
    }

    const before = new Date(queryParsed.data.before);

    try {
      const count = await storage.deleteBulkDraftRunsBefore(before);
      logActivity(req, "delete-bulk-draft-runs-before", "bulk_draft_runs", null, queryParsed.data.before, { count });
      res.json({ deleted: count });
    } catch (error) {
      logAndSendError(res, "Failed to delete bulk draft runs", error, "ABDR-005");
    }
  });
}
