import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity, parseRouteId } from "../helpers";
import { insertScheduledResearchWorkflowSchema } from "@shared/schema";
import type { InsertScheduledResearchWorkflow } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { executeScheduledWorkflow } from "../../ai/ambient/research-scheduler";

export function registerScheduledResearchRoutes(app: Express) {
  app.get("/api/admin/scheduled-research", requireAdmin, async (_req, res) => {
    try {
      const workflows = await storage.getScheduledResearchWorkflows();
      res.json(workflows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch scheduled research workflows", error);
    }
  });

  app.post("/api/admin/scheduled-research", requireAdmin, async (req, res) => {
    try {
      const validation = insertScheduledResearchWorkflowSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const workflow = await storage.upsertScheduledResearchWorkflow(validation.data);
      logActivity(req, "create-scheduled-workflow", "scheduled_research", workflow.id, workflow.name);
      res.json(workflow);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create scheduled research workflow", error);
    }
  });

  app.put("/api/admin/scheduled-research/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

      const existing = await storage.getScheduledResearchWorkflowById(id);
      if (!existing) return res.status(404).json({ error: "Workflow not found" });

      const validation = insertScheduledResearchWorkflowSchema.partial().safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }

      const data: Record<string, unknown> = { ...validation.data, workflowKey: existing.workflowKey };
      if (validation.data.frequencyHours && validation.data.frequencyHours !== existing.frequencyHours) {
        data.nextRunAt = new Date(
          Date.now() + (validation.data.frequencyHours * 60 * 60 * 1000),
        );
      }
      const workflow = await storage.upsertScheduledResearchWorkflow(data as InsertScheduledResearchWorkflow);
      logActivity(req, "update-scheduled-workflow", "scheduled_research", id, workflow.name);
      res.json(workflow);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update scheduled research workflow", error);
    }
  });

  app.delete("/api/admin/scheduled-research/:id", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid workflow ID" });
      await storage.deleteScheduledResearchWorkflow(id);
      logActivity(req, "delete-scheduled-workflow", "scheduled_research", id);
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete scheduled research workflow", error);
    }
  });

  app.post("/api/admin/scheduled-research/:id/execute", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

      const workflow = await storage.getScheduledResearchWorkflowById(id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendSSE = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };

      sendSSE("phase", { phase: "starting", message: `Starting: ${workflow.name}` });
      logActivity(req, "execute-scheduled-workflow", "scheduled_research", id, workflow.name);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "running",
      });

      const result = await executeScheduledWorkflow(workflow);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: result.success ? "completed" : "failed",
        lastRunDurationMs: result.durationMs,
        lastRunError: result.error ?? null,
      });

      if (result.success) {
        sendSSE("content", result.content.slice(0, 500));
        sendSSE("done", {
          success: true,
          durationMs: result.durationMs,
          workflowKey: workflow.workflowKey,
        });
      } else {
        sendSSE("error", { message: result.error, durationMs: result.durationMs });
      }

      res.end();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to execute scheduled research workflow", error);
    }
  });

  app.get("/api/research/scheduled/check-stale", requireAdmin, async (req, res) => {
    try {
      const staleWorkflows = await storage.getDueScheduledWorkflows();
      res.json({
        hasStale: staleWorkflows.length > 0,
        workflows: staleWorkflows.map(w => ({
          id: w.id,
          workflowKey: w.workflowKey,
          name: w.name,
          description: w.description,
          lastRunAt: w.lastRunAt?.toISOString() ?? null,
          frequencyHours: w.frequencyHours,
        })),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to check stale scheduled workflows", error);
    }
  });

  app.post("/api/research/scheduled/:id/execute", requireAdmin, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(400).json({ error: "Invalid workflow ID" });

      const workflow = await storage.getScheduledResearchWorkflowById(id);
      if (!workflow) return res.status(404).json({ error: "Workflow not found" });
      if (!workflow.isEnabled) return res.status(400).json({ error: "Workflow is disabled" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendSSE = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
      };

      sendSSE("phase", { phase: "starting", message: `Starting: ${workflow.name}` });
      logActivity(req, "execute-scheduled-workflow", "scheduled_research", id, workflow.name);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: "running",
      });

      const result = await executeScheduledWorkflow(workflow);

      await storage.updateScheduledWorkflowRun(workflow.id, {
        lastRunAt: new Date(),
        nextRunAt: new Date(Date.now() + workflow.frequencyHours * 60 * 60 * 1000),
        lastRunStatus: result.success ? "completed" : "failed",
        lastRunDurationMs: result.durationMs,
        lastRunError: result.error ?? null,
      });

      if (result.success) {
        sendSSE("content", result.content.slice(0, 500));
        sendSSE("done", { success: true, durationMs: result.durationMs, workflowKey: workflow.workflowKey });
      } else {
        sendSSE("error", { message: result.error, durationMs: result.durationMs });
      }

      res.end();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to execute scheduled research workflow", error);
    }
  });
}
