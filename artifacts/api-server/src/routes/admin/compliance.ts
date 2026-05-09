/**
 * Admin compliance routes — Vito violation reporting.
 *
 * GET  /api/admin/compliance/violations       list violations with filters
 * POST /api/admin/compliance/violations/:id/resolve  mark a violation resolved
 * POST /api/admin/compliance/violations/:id/accept   accept a violation with a note
 * POST /api/admin/compliance/run             trigger an immediate audit (fire-and-forget)
 * GET  /api/admin/compliance/runs            list last N vito_runs for trend display
 */
import type { Express } from "express";
import { z } from "zod";
import { requireAdmin } from "../../auth";
import { logAndSendError, sendError } from "../helpers";
import { db } from "../../db";
import {
  complianceViolations,
  vitoRuns,
  type VitoRun,
  type ComplianceViolation,
} from "@workspace/db";
import {
  eq,
  and,
  isNull,
  isNotNull,
  desc,
  sql,
} from "drizzle-orm";
import {
  HTTP_200_OK,
  HTTP_202_ACCEPTED,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
} from "../../constants";
import { createVitoRun } from "../../ai/vito/workspace";
import { runVitoAgent, type VitoTrigger } from "../../ai/vito/agent";
import { logger } from "../../logger";

// ---------------------------------------------------------------------------
// Named constants
// ---------------------------------------------------------------------------

/** Default number of violation rows returned per page. */
const VIOLATIONS_DEFAULT_PAGE_SIZE = 50;

/** Maximum violations per page (hard cap). */
const VIOLATIONS_MAX_PAGE_SIZE = 200;

/** Maximum number of vito_runs rows returned by the trend endpoint. */
const RUNS_DEFAULT_LIMIT = 8;

/** Maximum number of vito_runs rows the trend endpoint will return. */
const RUNS_MAX_LIMIT = 50;

/** Severity sort order: block=0, warning=1, advisory=2, info=3 */
const SEVERITY_SORT_INFO = 3;
const SEVERITY_SORT_ADVISORY = 2;
const SEVERITY_SORT_WARNING = 1;
const SEVERITY_SORT_BLOCK = 0;

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const resolveBodySchema = z.object({});
const acceptBodySchema = z.object({
  note: z.string().min(1),
});
const runBodySchema = z.object({
  trigger: z.enum(["manual", "manual-full"]).default("manual"),
});
const runsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(RUNS_MAX_LIMIT).default(RUNS_DEFAULT_LIMIT),
});
const violationsQuerySchema = z.object({
  severity: z.enum(["block", "warning", "advisory", "info"]).optional(),
  resolved: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(VIOLATIONS_MAX_PAGE_SIZE).default(VIOLATIONS_DEFAULT_PAGE_SIZE),
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerComplianceRoutes(app: Express): void {
  /**
   * GET /api/admin/compliance/violations
   * Returns paginated violations optionally filtered by severity and resolution status.
   */
  app.get("/api/admin/compliance/violations", requireAdmin, async (req, res) => {
    const parsed = violationsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, HTTP_400_BAD_REQUEST, "Invalid query parameters");
    }
    const { severity, resolved, page, limit } = parsed.data;

    try {
      const conditions = [];
      if (severity) conditions.push(eq(complianceViolations.severity, severity));
      if (resolved === "true") {
        conditions.push(isNotNull(complianceViolations.resolvedAt));
      } else if (resolved === "false") {
        conditions.push(
          and(
            isNull(complianceViolations.resolvedAt),
            isNull(complianceViolations.acceptedAt),
          )!,
        );
      }

      const offset = (page - 1) * limit;

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(complianceViolations)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(
            sql`CASE WHEN ${complianceViolations.severity} = 'block' THEN ${sql.raw(String(SEVERITY_SORT_BLOCK))}
                     WHEN ${complianceViolations.severity} = 'warning' THEN ${sql.raw(String(SEVERITY_SORT_WARNING))}
                     WHEN ${complianceViolations.severity} = 'advisory' THEN ${sql.raw(String(SEVERITY_SORT_ADVISORY))}
                     ELSE ${sql.raw(String(SEVERITY_SORT_INFO))} END`,
            desc(complianceViolations.lastSeenAt),
          )
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(complianceViolations)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);

      return res.status(HTTP_200_OK).json({
        violations: rows,
        total: countResult[0]?.count ?? 0,
        page,
        limit,
      });
    } catch (error) {
      return logAndSendError(res, "Failed to list compliance violations", error);
    }
  });

  /**
   * POST /api/admin/compliance/violations/:id/resolve
   * Marks a violation as resolved by the current admin.
   */
  app.post(
    "/api/admin/compliance/violations/:id/resolve",
    requireAdmin,
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return sendError(res, HTTP_400_BAD_REQUEST, "Invalid violation id");
      }

      try {
        const [updated] = await db
          .update(complianceViolations)
          .set({
            resolvedAt: new Date(),
            resolvedBy: (req as unknown as { user?: { id: number } }).user?.id ?? null,
          })
          .where(eq(complianceViolations.id, id))
          .returning({ id: complianceViolations.id });

        if (!updated) {
          return sendError(res, HTTP_404_NOT_FOUND, "Violation not found");
        }
        return res.status(HTTP_200_OK).json({ id: updated.id, resolvedAt: new Date() });
      } catch (error) {
        return logAndSendError(res, "Failed to resolve violation", error);
      }
    },
  );

  /**
   * POST /api/admin/compliance/violations/:id/accept
   * Accepts a known violation with a note (silences it without fixing it).
   */
  app.post(
    "/api/admin/compliance/violations/:id/accept",
    requireAdmin,
    async (req, res) => {
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) {
        return sendError(res, HTTP_400_BAD_REQUEST, "Invalid violation id");
      }

      const parsed = acceptBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return sendError(res, HTTP_400_BAD_REQUEST, "note is required");
      }

      try {
        const [updated] = await db
          .update(complianceViolations)
          .set({
            acceptedAt: new Date(),
            acceptedNote: parsed.data.note,
          })
          .where(eq(complianceViolations.id, id))
          .returning({ id: complianceViolations.id });

        if (!updated) {
          return sendError(res, HTTP_404_NOT_FOUND, "Violation not found");
        }
        return res.status(HTTP_200_OK).json({ id: updated.id, acceptedAt: new Date() });
      } catch (error) {
        return logAndSendError(res, "Failed to accept violation", error);
      }
    },
  );

  /**
   * POST /api/admin/compliance/run
   * Fires a Vito audit run in the background and returns the run id immediately.
   */
  app.post("/api/admin/compliance/run", requireAdmin, async (req, res) => {
    const parsed = runBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, HTTP_400_BAD_REQUEST, "Invalid request body");
    }

    const trigger = parsed.data.trigger as VitoTrigger;
    const mode = trigger === "manual-full" ? "full" : "runtime";

    try {
      const runId = await createVitoRun(trigger, mode);

      // Fire and forget — agent updates the row on completion
      void runVitoAgent(trigger).catch((err: unknown) => {
        logger.warn(
          `[compliance-run] Agent error for run ${runId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      return res.status(HTTP_202_ACCEPTED).json({ runId, trigger, status: "started" });
    } catch (error) {
      return logAndSendError(res, "Failed to start compliance audit", error);
    }
  });

  /**
   * GET /api/admin/compliance/runs
   * Returns the last N vito_runs rows for trend display.
   */
  app.get("/api/admin/compliance/runs", requireAdmin, async (req, res) => {
    const parsed = runsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return sendError(res, HTTP_400_BAD_REQUEST, "Invalid query parameters");
    }

    try {
      const rows = await db
        .select()
        .from(vitoRuns)
        .orderBy(desc(vitoRuns.createdAt))
        .limit(parsed.data.limit);

      return res.status(HTTP_200_OK).json({ runs: rows });
    } catch (error) {
      return logAndSendError(res, "Failed to list compliance runs", error);
    }
  });
}
