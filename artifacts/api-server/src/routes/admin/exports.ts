import { type Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError } from "../helpers";
import { HTTP_405_METHOD_NOT_ALLOWED } from "../../constants";


const FORMAT_DEFAULTS = {
  allowLandscape: true,
  allowPortrait: true,
  allowShort: true,
  allowExtended: true,
  allowPremium: true,
  densePagination: true,
};

const DEFAULT_EXPORT_CONFIG = {
  overview: {
    ...FORMAT_DEFAULTS,
    kpiMetrics: true,
    revenueChart: true,
    projectionTable: true,
    compositionTables: true,
    compositionCharts: true,
    waterfallTable: true,
    propertyInsights: true,
    aiInsights: true,
  },
  statements: {
    ...FORMAT_DEFAULTS,
    incomeStatement: true,
    incomeChart: true,
    cashFlow: true,
    cashFlowChart: true,
    balanceSheet: true,
    balanceSheetChart: true,
  },
  analysis: {
    ...FORMAT_DEFAULTS,
    kpiSummaryCards: true,
    returnChart: true,
    freeCashFlowTable: true,
    propertyIrrTable: true,
    dcfAnalysis: true,
    performanceTrend: true,
  },
};

type StoredConfig = Record<string, unknown>;

function mergeWithDefaults(stored: StoredConfig | null): typeof DEFAULT_EXPORT_CONFIG {
  if (!stored) return DEFAULT_EXPORT_CONFIG;

  return {
    overview: {
      ...DEFAULT_EXPORT_CONFIG.overview,
      ...((stored.overview as Record<string, unknown>) ?? {}),
    },
    statements: {
      ...DEFAULT_EXPORT_CONFIG.statements,
      ...((stored.statements as Record<string, unknown>) ?? {}),
    },
    analysis: {
      ...DEFAULT_EXPORT_CONFIG.analysis,
      ...((stored.analysis as Record<string, unknown>) ?? {}),
    },
  };
}

export function registerExportConfigRoutes(app: Express) {
  app.get("/api/admin/export-config", requireAdmin, async (_req, res) => {
    try {
      const ga = await storage.getGlobalAssumptions();
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      res.json(mergeWithDefaults(ga.exportConfig as StoredConfig | null));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch export config", error);
    }
  });

  // Disabled: ExportsTab was an orphan — the config persisted here was never read by
  // the production export pipeline (export-generate.ts uses compileReport directly).
  // ExportsTab UI deleted in admin-cleanup-exports-tab-kill packet. 405 so any
  // stale callers surface a clear error rather than silently no-oping.
  app.put("/api/admin/export-config", requireAdmin, (_req, res) => {
    res.status(HTTP_405_METHOD_NOT_ALLOWED).json({ error: "Export config is no longer managed via admin UI — it is inert. The export pipeline is configured via compileReport directly." });
  });
}
