import { type Express } from "express";
import { requireAdmin } from "../../auth";
import { storage } from "../../storage";
import { logAndSendError, sendError, logActivity } from "../helpers";
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

export function registerBulkDraftRunRoutes(app: Express) {
  app.get("/api/admin/bulk-draft-runs", requireAdmin, async (_req, res) => {
    try {
      const runs = await storage.listBulkDraftRuns();
      res.json(runs);
    } catch (error) {
      logAndSendError(res, "Failed to list bulk draft runs", error);
    }
  });

  app.post("/api/admin/bulk-draft-runs", requireAdmin, async (req, res) => {
    const parsed = createBulkDraftRunBody.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "Invalid request body");
    }

    const user = req.user;
    if (!user) {
      return sendError(res, 401, "Unauthorized");
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
      logAndSendError(res, "Failed to save bulk draft run", error);
    }
  });
}
