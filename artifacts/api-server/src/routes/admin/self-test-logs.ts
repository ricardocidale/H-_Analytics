/**
 * Admin Self-test Logs route (Task #1458).
 *
 *   GET /api/admin/intelligence/self-test-logs
 *
 * Returns rows from `self_test_logs` for the Self-tests tab on the
 * Logs page. Supports optional filters:
 *   - entityKind  (admin_resource | agent | specialist | minion | rebecca | …)
 *   - outcome     (pass | warn | fail)
 *   - dateRange   (7d | 30d | all)
 *   - limit       (1..2000, default 500)
 *
 * Server-side filters keep the page fast even after the table grows;
 * the client still applies the same filters defensively so the user
 * sees a consistent count without a refetch.
 */
import type { Express } from "express";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { storage } from "../../storage";
import { SELF_TEST_OUTCOMES, type SelfTestOutcome } from "@workspace/db";
import {
  SELF_TEST_LOGS_DEFAULT_LIMIT,
  SELF_TEST_LOGS_MAX_LIMIT,
  SELF_TEST_LOGS_RANGE_7D_MS,
  SELF_TEST_LOGS_RANGE_30D_MS,
} from "./self-test-logs-constants";

function parseDateRange(raw: unknown): Date | undefined {
  if (raw === "all" || raw == null || raw === "") return undefined;
  if (raw === "7d") return new Date(Date.now() - SELF_TEST_LOGS_RANGE_7D_MS);
  if (raw === "30d") return new Date(Date.now() - SELF_TEST_LOGS_RANGE_30D_MS);
  return new Date(Date.now() - SELF_TEST_LOGS_RANGE_30D_MS);
}

function parseOutcome(raw: unknown): SelfTestOutcome | undefined {
  if (typeof raw !== "string") return undefined;
  const lower = raw.toLowerCase();
  return (SELF_TEST_OUTCOMES as readonly string[]).includes(lower)
    ? (lower as SelfTestOutcome)
    : undefined;
}

function parseLimit(raw: unknown): number {
  if (typeof raw !== "string") return SELF_TEST_LOGS_DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return SELF_TEST_LOGS_DEFAULT_LIMIT;
  return Math.min(SELF_TEST_LOGS_MAX_LIMIT, n);
}

export function registerSelfTestLogsRoutes(app: Express) {
  app.get("/api/admin/intelligence/self-test-logs", requireAdmin, async (req, res) => {
    try {
      const entityKindRaw = req.query.entityKind;
      const entityKind =
        typeof entityKindRaw === "string" && entityKindRaw !== "" && entityKindRaw !== "all"
          ? entityKindRaw
          : undefined;
      const outcome = parseOutcome(req.query.outcome);
      const since = parseDateRange(req.query.dateRange);
      const limit = parseLimit(req.query.limit);

      const rows = await storage.listSelfTestLogs({ entityKind, outcome, since, limit });

      // Task #1459: enrich rows with the per-entity self-test cadence override
      // (selfTestIntervalDays) from `admin_resources`. Surfaced as a tooltip
      // on each row in the Self-tests tab. null = use 30-day system default.
      const resourceIds = Array.from(
        new Set(rows.map((r) => r.adminResourceId).filter((id): id is number => id != null)),
      );
      const resources = await Promise.all(
        resourceIds.map((id) => storage.getAdminResourceById(id)),
      );
      const intervalById = new Map<number, number | null>(
        resourceIds.map((id, i) => [id, resources[i]?.selfTestIntervalDays ?? null]),
      );

      const logs = rows.map((r) => ({
        id: String(r.id),
        entityKind: r.entityKind,
        entityId: r.entityId,
        entityName: r.entityName,
        outcome: r.outcome,
        durationMs: r.durationMs,
        summary: r.summary,
        ranAt: r.ranAt instanceof Date ? r.ranAt.toISOString() : new Date(String(r.ranAt)).toISOString(),
        selfTestIntervalDays:
          r.adminResourceId != null ? (intervalById.get(r.adminResourceId) ?? null) : null,
      }));

      res.json({ logs, generatedAt: new Date().toISOString(), limit });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch self-test logs", error, "STLOG-001");
    }
  });
}
