import { type Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";

const categoryFormatSchema = {
  allowLandscape: z.boolean(),
  allowPortrait: z.boolean(),
  allowShort: z.boolean(),
  allowExtended: z.boolean(),
  allowPremium: z.boolean(),
  densePagination: z.boolean(),
};

const exportConfigSchema = z.object({
  overview: z.object({
    ...categoryFormatSchema,
    kpiMetrics: z.boolean(),
    revenueChart: z.boolean(),
    projectionTable: z.boolean(),
    compositionTables: z.boolean(),
    compositionCharts: z.boolean(),
    waterfallTable: z.boolean(),
    propertyInsights: z.boolean(),
    aiInsights: z.boolean(),
  }).partial().optional(),
  statements: z.object({
    ...categoryFormatSchema,
    incomeStatement: z.boolean(),
    incomeChart: z.boolean(),
    cashFlow: z.boolean(),
    cashFlowChart: z.boolean(),
    balanceSheet: z.boolean(),
    balanceSheetChart: z.boolean(),
  }).partial().optional(),
  analysis: z.object({
    ...categoryFormatSchema,
    kpiSummaryCards: z.boolean(),
    returnChart: z.boolean(),
    freeCashFlowTable: z.boolean(),
    propertyIrrTable: z.boolean(),
    dcfAnalysis: z.boolean(),
    performanceTrend: z.boolean(),
  }).partial().optional(),
});

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

  app.put("/api/admin/export-config", requireAdmin, async (req, res) => {
    try {
      const parsed = exportConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid export config", details: parsed.error.flatten() });
      }
      const ga = await storage.getGlobalAssumptions();
      if (!ga) return res.status(404).json({ error: "No global assumptions found" });
      const current = mergeWithDefaults(ga.exportConfig as StoredConfig | null);
      const incoming = parsed.data;
      const merged = {
        overview: { ...current.overview, ...(incoming.overview ?? {}) },
        statements: { ...current.statements, ...(incoming.statements ?? {}) },
        analysis: { ...current.analysis, ...(incoming.analysis ?? {}) },
      };
      await storage.patchGlobalAssumptions(ga.id, { exportConfig: merged });
      logActivity(req, "update-export-config", "settings", ga.id, "Export Config");
      res.json(merged);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to save export config", error);
    }
  });
}
