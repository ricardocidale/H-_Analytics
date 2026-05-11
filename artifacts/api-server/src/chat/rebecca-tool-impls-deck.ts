import { storage } from "../storage";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
  commitReferenceBrands,
} from "../ai/analyst-table-refresh";
import type { InsertReferenceBrand } from "@workspace/db";
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

// W1.3 — primitives that decompose refresh_analyst_table into a research step
// (no DB write) and a commit step. Letting the agent inspect proposed rows
// before persisting is the point — the old refresh_analyst_table tool remains
// as a deprecated single-shot wrapper.

const ANALYST_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
type AnalystTableId = (typeof ANALYST_TABLE_IDS)[number];

function validateAnalystTableId(args: Record<string, unknown>):
  | { ok: true; tableId: AnalystTableId }
  | { ok: false; result: { result: { error: string } } } {
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !(ANALYST_TABLE_IDS as readonly string[]).includes(tableId)) {
    return {
      ok: false,
      result: { result: { error: `tableId must be one of: ${ANALYST_TABLE_IDS.join(", ")}` } },
    };
  }
  return { ok: true, tableId: tableId as AnalystTableId };
}

export async function toolResearchAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const validation = validateAnalystTableId(args);
  if (!validation.ok) return validation.result;

  if (validation.tableId === "capital_raise_benchmarks") {
    const current = await storage.getCapitalRaiseBenchmarks();
    const result = await researchCapitalRaiseBenchmarks(current);
    return {
      result: {
        tableId: validation.tableId,
        ranges: result.proposedRanges,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
        narration: result.narration,
        evidence: result.evidence,
      },
    };
  }
  if (validation.tableId === "exit_multiples") {
    const current = await storage.getExitMultiples();
    const result = await researchExitMultiples(current);
    return {
      result: {
        tableId: validation.tableId,
        ranges: result.proposedRanges,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
        narration: result.narration,
        evidence: result.evidence,
      },
    };
  }
  // reference_brands — dry-run preserves the coverage guard's verdict so the
  // agent can decide whether to commit.
  const current = await storage.getReferenceBrands();
  const result = await researchReferenceBrands(current, undefined, { dryRun: true });
  return {
    result: {
      tableId: validation.tableId,
      proposedBrands: result.proposedBrands,
      coverage: {
        wouldCommit: result.coverage.hasRequiredCoverage,
        uniqueBrandCount: result.coverage.uniqueBrandCount,
        rawBrandCount: result.coverage.rawBrandCount,
        missingFoundingBrands: result.coverage.missingFoundingBrands,
      },
      sourceCount: result.sourceCount,
      tokensUsed: result.tokensUsed,
      narration: result.narration,
      evidence: result.evidence,
    },
  };
}

function coerceProposedRanges(input: unknown): Array<{
  dimensionKey: string;
  label: string;
  unit?: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}> | null {
  if (!Array.isArray(input)) return null;
  const out: Array<{
    dimensionKey: string;
    label: string;
    unit?: string;
    valueLow: number | null;
    valueMid: number | null;
    valueHigh: number | null;
  }> = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.dimensionKey !== "string" || r.dimensionKey.trim() === "") return null;
    if (typeof r.label !== "string") return null;
    const num = (x: unknown): number | null =>
      typeof x === "number" && Number.isFinite(x) ? x : x === null ? null : null;
    out.push({
      dimensionKey: r.dimensionKey,
      label: r.label,
      unit: typeof r.unit === "string" ? r.unit : undefined,
      valueLow: num(r.valueLow),
      valueMid: num(r.valueMid),
      valueHigh: num(r.valueHigh),
    });
  }
  return out;
}

function coerceReferenceBrandsInput(input: unknown): InsertReferenceBrand[] | null {
  if (!Array.isArray(input)) return null;
  const out: InsertReferenceBrand[] = [];
  for (const raw of input) {
    if (raw === null || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.brandName !== "string" || r.brandName.trim() === "") return null;
    out.push({
      brandName: r.brandName.trim(),
      niche: typeof r.niche === "string" ? r.niche : null,
      positioningSummary: typeof r.positioningSummary === "string" ? r.positioningSummary : null,
      guestSegment: typeof r.guestSegment === "string" ? r.guestSegment : null,
      propertyCount: typeof r.propertyCount === "number" ? r.propertyCount : null,
      keyCountMin: typeof r.keyCountMin === "number" ? r.keyCountMin : null,
      keyCountMax: typeof r.keyCountMax === "number" ? r.keyCountMax : null,
      geographicFocus: typeof r.geographicFocus === "string" ? r.geographicFocus : null,
      adrUsd: typeof r.adrUsd === "number" ? r.adrUsd : null,
      occupancyPct: typeof r.occupancyPct === "number" ? r.occupancyPct : null,
      revparUsd: typeof r.revparUsd === "number" ? r.revparUsd : null,
      revenueRangeLowUsd: typeof r.revenueRangeLowUsd === "number" ? r.revenueRangeLowUsd : null,
      revenueRangeHighUsd: typeof r.revenueRangeHighUsd === "number" ? r.revenueRangeHighUsd : null,
      ownershipModel: typeof r.ownershipModel === "string" ? r.ownershipModel : null,
      acquisitionContext: typeof r.acquisitionContext === "string" ? r.acquisitionContext : null,
      description: typeof r.description === "string" ? r.description : null,
      referenceDisclaimer: true,
      dataYear: typeof r.dataYear === "number" ? r.dataYear : new Date().getFullYear(),
      sourceUrls: Array.isArray(r.sourceUrls) ? (r.sourceUrls as string[]) : null,
      lastRefreshedAt: new Date(),
      refreshedByRunId: null,
    });
  }
  return out;
}

export async function toolCommitAnalystTableResearch(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const validation = validateAnalystTableId(args);
  if (!validation.ok) return validation.result;

  const now = new Date();
  const sourceCount = typeof args.sourceCount === "number" ? args.sourceCount : 0;

  if (validation.tableId === "capital_raise_benchmarks") {
    const ranges = coerceProposedRanges(args.ranges);
    if (ranges === null) {
      return { result: { error: "ranges must be an array of { dimensionKey, label, unit?, valueLow, valueMid, valueHigh }" } };
    }
    for (const r of ranges) {
      await storage.upsertCapitalRaiseBenchmark({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "usd",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: { tableId: validation.tableId, rangesCommitted: ranges.length, sourceCount },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  if (validation.tableId === "exit_multiples") {
    const ranges = coerceProposedRanges(args.ranges);
    if (ranges === null) {
      return { result: { error: "ranges must be an array of { dimensionKey, label, unit?, valueLow, valueMid, valueHigh }" } };
    }
    for (const r of ranges) {
      await storage.upsertExitMultiple({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "x_revenue",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: { tableId: validation.tableId, rangesCommitted: ranges.length, sourceCount },
      dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
    };
  }

  // reference_brands — coverage guard re-runs server-side so an admin chat
  // user can't bypass min-count + founding-brand coverage with crafted rows.
  const brands = coerceReferenceBrandsInput(args.brands);
  if (brands === null) {
    return { result: { error: "brands must be an array of brand objects with a non-empty brandName on each" } };
  }
  const commitResult = await commitReferenceBrands(brands);
  if (!commitResult.ok) {
    return {
      result: {
        error: "Coverage guard rejected the payload — refusing to overwrite reference_brands.",
        tableId: validation.tableId,
        coverage: {
          uniqueBrandCount: commitResult.coverage.uniqueBrandCount,
          rawBrandCount: commitResult.coverage.rawBrandCount,
          missingFoundingBrands: commitResult.coverage.missingFoundingBrands,
        },
      },
    };
  }
  return {
    result: {
      tableId: validation.tableId,
      brandCount: commitResult.brandCount,
      sourceCount,
    },
    dataChanged: { entityType: "analyst_table" as const, entityId: 0 },
  };
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
