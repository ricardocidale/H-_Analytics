import { storage } from "../storage";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
} from "../ai/analyst-table-refresh";
import {
  triggerLbDeckRenderService,
  getLbDeckRenderStatusService,
} from "../routes/lb-deck-pdf";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireAdminCtx } from "./rebecca-tool-types";

// ---------------------------------------------------------------------------
// LB investor deck tools
// ---------------------------------------------------------------------------

export async function toolGetLbDeckConfig(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const config = await storage.getLbSlidesConfig();
  return {
    result: {
      config: config ?? {
        id: null, updatedAt: null,
        slide1PropertyId: null, slide2PropertyId: null,
        slide3PropertyId: null, slide5PropertyId: null,
        slide4SectionSubtitle: null, slide6Disclaimer: null,
      },
    },
  };
}

export async function toolConfigureLbDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const current = await storage.getLbSlidesConfig();

  const SLIDE_PROP_FIELDS = [
    "slide1PropertyId", "slide2PropertyId", "slide3PropertyId", "slide5PropertyId",
  ] as const;

  for (const field of SLIDE_PROP_FIELDS) {
    const rawId = args[field];
    if (rawId === undefined || rawId === null) continue;
    if (typeof rawId !== "number" || !Number.isFinite(rawId)) {
      return { result: { error: `${field} must be a number` } };
    }
    const prop = await storage.getProperty(rawId);
    if (!prop || prop.userId !== ctx.userId) {
      return { result: { error: `Property ID ${rawId} for ${field} not found or not owned by you` } };
    }
  }

  const mergeNumericOrNull = (key: string, fallback: number | null): number | null =>
    args[key] !== undefined ? (args[key] as number | null) : fallback;

  const mergeStringOrNull = (key: string, fallback: string | null): string | null => {
    const v = args[key];
    if (v === undefined) return fallback;
    if (v !== null && typeof v !== "string") return fallback;
    return v as string | null;
  };

  const updated = await storage.upsertLbSlidesConfig({
    slide1PropertyId: mergeNumericOrNull("slide1PropertyId", current?.slide1PropertyId ?? null),
    slide2PropertyId: mergeNumericOrNull("slide2PropertyId", current?.slide2PropertyId ?? null),
    slide3PropertyId: mergeNumericOrNull("slide3PropertyId", current?.slide3PropertyId ?? null),
    slide5PropertyId: mergeNumericOrNull("slide5PropertyId", current?.slide5PropertyId ?? null),
    slide4SectionSubtitle: mergeStringOrNull("slide4SectionSubtitle", current?.slide4SectionSubtitle ?? null),
    slide6Disclaimer: mergeStringOrNull("slide6Disclaimer", current?.slide6Disclaimer ?? null),
  });
  return {
    result: { success: true, config: updated },
    dataChanged: { entityType: "lb_deck_config" as const, entityId: 0 },
  };
}

export async function toolTriggerLbDeckRender(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return {
    result: triggerLbDeckRenderService(),
    dataChanged: { entityType: "lb_deck_config" as const, entityId: 0 },
  };
}

export async function toolGetLbDeckRenderStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return { result: getLbDeckRenderStatusService() };
}

// ---------------------------------------------------------------------------
// Analyst table tools
// ---------------------------------------------------------------------------

export async function toolRefreshAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const VALID_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !VALID_TABLE_IDS.includes(tableId as typeof VALID_TABLE_IDS[number])) {
    return { result: { error: `tableId must be one of: ${VALID_TABLE_IDS.join(", ")}` } };
  }
  const now = new Date();

  if (tableId === "capital_raise_benchmarks") {
    const current = await storage.getCapitalRaiseBenchmarks();
    const result = await researchCapitalRaiseBenchmarks(current);
    for (const r of result.proposedRanges) {
      await storage.upsertCapitalRaiseBenchmark({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "usd",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  if (tableId === "exit_multiples") {
    const current = await storage.getExitMultiples();
    const result = await researchExitMultiples(current);
    for (const r of result.proposedRanges) {
      await storage.upsertExitMultiple({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "x_revenue",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  if (tableId === "reference_brands") {
    const current = await storage.getReferenceBrands();
    const result = await researchReferenceBrands(current);
    return {
      result: {
        tableId,
        autoCommitted: result.autoCommitted,
        brandCount: result.brandCount,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  return { result: { error: `Unknown tableId: ${tableId}. Use capital_raise_benchmarks, exit_multiples, or reference_brands.` } };
}

export async function toolGetAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const VALID_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !VALID_TABLE_IDS.includes(tableId as typeof VALID_TABLE_IDS[number])) {
    return { result: { error: `tableId must be one of: ${VALID_TABLE_IDS.join(", ")}` } };
  }

  if (tableId === "capital_raise_benchmarks") {
    const rows = await storage.getCapitalRaiseBenchmarks();
    return { result: { tableId, rowCount: rows.length, rows } };
  }
  if (tableId === "exit_multiples") {
    const rows = await storage.getExitMultiples();
    return { result: { tableId, rowCount: rows.length, rows } };
  }
  const rows = await storage.getReferenceBrands();
  return { result: { tableId, rowCount: rows.length, rows } };
}
