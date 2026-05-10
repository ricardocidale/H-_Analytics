import { logger } from "../logger";
import { appendIrisGap, clearIrisGaps, readIrisGaps } from "../ai/iris/workspace";
import { runIrisAgent, type IrisTrigger } from "../ai/iris/agent";
import { capErrors, IRIS_HEALTH_SUMMARY_MAX_ERRORS } from "../ai/iris/format";
import { insertIrisRun, updateIrisRun, getLatestIrisRun } from "../storage/iris-runs";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireAdminCtx } from "./rebecca-tool-types";

/** Max characters accepted for a retrieval-gap query before truncation. */
const IRIS_GAP_MAX_QUERY_CHARS = 500;

// ---------------------------------------------------------------------------
// Iris run trigger (shared implementation)
// ---------------------------------------------------------------------------

async function toolTriggerIrisRun(
  trigger: IrisTrigger,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const latest = await getLatestIrisRun();
  if (latest?.status === "running") {
    return { result: { error: "An Iris run is already in progress" } };
  }

  const run = await insertIrisRun({ trigger, status: "running" });
  const runId = run.id;
  const startTs = Date.now();

  void runIrisAgent(trigger)
    .then((result) =>
      updateIrisRun(runId, {
        status: "completed",
        modelUsed: result.model,
        chunksIndexed: result.chunksIndexed,
        errorsEncountered: result.errorsEncountered,
        durationMs: result.durationMs,
        healthSummary: {
          summary: result.summary,
          toolsInvoked: result.toolsInvoked,
          runId: result.runId,
          errors: capErrors(result.errors, IRIS_HEALTH_SUMMARY_MAX_ERRORS),
        },
      }),
    )
    .catch((err: unknown) => {
      const durationMs = Date.now() - startTs;
      return updateIrisRun(runId, {
        status: "error",
        durationMs,
        healthSummary: { error: String(err) },
      });
    });

  return { result: { runId, status: "started" }, dataChanged: { entityType: "iris_run", entityId: runId } };
}

// ---------------------------------------------------------------------------
// Exported iris tools
// ---------------------------------------------------------------------------

export async function toolTriggerIrisHealthCheck(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  return toolTriggerIrisRun("scheduled-health", ctx);
}

export async function toolTriggerIrisReindex(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  return toolTriggerIrisRun("scheduled-reindex", ctx);
}

export async function toolClearIrisGaps(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  await clearIrisGaps();
  return { result: { success: true }, dataChanged: { entityType: "iris_gap", entityId: 0 } };
}

export async function toolGetIrisStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const [lastRun, gaps] = await Promise.all([
    getLatestIrisRun(),
    readIrisGaps(),
  ]);

  const healthSummary = lastRun?.healthSummary as
    | { summary?: string; toolsInvoked?: string[]; runId?: string; errors?: string[]; error?: string }
    | null
    | undefined;
  const errorMessages: string[] = [];
  if (healthSummary?.errors && Array.isArray(healthSummary.errors) && healthSummary.errors.length > 0) {
    errorMessages.push(...healthSummary.errors);
  } else if (healthSummary?.error) {
    errorMessages.push(healthSummary.error);
  }

  return {
    result: {
      lastRun,
      gapsCount: gaps.length,
      ...(errorMessages.length > 0 && { errorMessages }),
    },
  };
}

export async function toolWriteRetrievalGap(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  void ctx;
  const rawQuery = ((args.query as string) ?? "").replace(/\s+/g, " ").trim();
  const query = rawQuery.slice(0, IRIS_GAP_MAX_QUERY_CHARS);
  if (!query) return { result: { recorded: false } };
  await appendIrisGap(query);
  return { result: { recorded: true }, dataChanged: { entityType: "iris_gap", entityId: 0 } };
}

// ---------------------------------------------------------------------------
// Compliance audit (Vito)
// ---------------------------------------------------------------------------

export async function toolRunComplianceAudit(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { runVitoAgent } = await import("../ai/vito/agent");
  const { createVitoRun } = await import("../ai/vito/workspace");

  const runId = await createVitoRun("manual", "runtime");

  void runVitoAgent("manual", runId)
    .catch((err: unknown) => {
      logger.error(`[compliance-audit] agent error: ${err instanceof Error ? err.message : String(err)}`, "rebecca");
    });

  return {
    result: { message: "Compliance audit started", runId },
    dataChanged: { entityType: "compliance_run", entityId: runId },
  };
}
