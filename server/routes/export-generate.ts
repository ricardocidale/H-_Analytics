import { type Express, type Request, type Response } from "express";
import { requireAuth } from "../auth";
import { z } from "zod";
import { logger } from "../logger";
import { logActivity } from "./helpers";
import { storage } from "../storage";
import { buildExportData, buildPropertyExportData, buildCompanyExportData } from "../report/server-export-data";
import { compileReport } from "../report/compiler";
import { renderPremiumPdf } from "../pdf/render";
import { generateExcelFromReport } from "./format-generators/excel-generator";
import { generatePptxFromReport } from "./format-generators/pptx-generator";
import { generateDocxFromReport } from "./format-generators/docx-generator";
import { generateCsvFromExportData } from "../exports/csv-generator";

const generateExportSchema = z.object({
  entityType: z.enum(["portfolio", "property", "company"]),
  entityId: z.number().int().positive().optional(),
  format: z.enum(["pdf", "xlsx", "pptx", "docx", "csv"]),
  orientation: z.enum(["landscape", "portrait"]).optional().default("landscape"),
  version: z.enum(["short", "extended"]).optional().default("short"),
  projectionYears: z.number().int().min(1).max(30).optional(),
  reportScope: z.enum(["all", "income", "cashflow", "balance", "overview", "investment"]).optional().default("all"),
});

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv",
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  xlsx: ".xlsx",
  pptx: ".pptx",
  pdf: ".pdf",
  docx: ".docx",
  csv: ".csv",
};

export function register(app: Express) {
  app.post("/api/exports/generate", requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = generateExportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid export request", details: parsed.error.flatten() });
      }

      const { entityType, entityId, format, orientation, projectionYears, reportScope } = parsed.data;
      const version = format === "csv" ? "extended" as const : parsed.data.version;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      logger.info(`[server-export] Generating ${format} for ${entityType}${entityId ? ` #${entityId}` : ""} (scope=${reportScope}, version=${version})`, "server-export");

      let exportData;
      let entityName: string;
      let companyName: string;

      try {
        if (entityType === "property") {
          if (!entityId) {
            return res.status(400).json({ error: "entityId required for property exports" });
          }
          exportData = await buildPropertyExportData({ userId, propertyId: entityId, projectionYears, version, reportScope });
          const property = await storage.getProperty(entityId);
          entityName = property?.name || `Property ${entityId}`;
          const globals = await storage.getGlobalAssumptions(userId);
          companyName = (globals as Record<string, unknown>)?.companyName as string || "Financial Report";
        } else if (entityType === "company") {
          exportData = await buildCompanyExportData({ userId, projectionYears, version, reportScope });
          const globals = await storage.getGlobalAssumptions(userId);
          companyName = (globals as Record<string, unknown>)?.companyName as string || "Management Company";
          entityName = companyName;
        } else {
          exportData = await buildExportData({ userId, projectionYears, version, reportScope });
          const globals = await storage.getGlobalAssumptions(userId);
          companyName = (globals as Record<string, unknown>)?.companyName as string || "Portfolio";
          entityName = `${companyName} — Consolidated Portfolio`;
        }
      } catch (domainError: unknown) {
        const msg = domainError instanceof Error ? domainError.message : String(domainError);
        if (msg.includes("not found") || msg.includes("No matching properties")) {
          return res.status(404).json({ error: msg });
        }
        if (msg.includes("No global assumptions")) {
          return res.status(422).json({ error: msg });
        }
        throw domainError;
      }

      let buffer: Buffer;

      if (format === "csv") {
        buffer = generateCsvFromExportData(exportData);
      } else {
        let themeColors: Array<{ name: string; hexCode: string; rank?: number; description?: string }> | undefined;
        const defaultTheme = await storage.getDefaultDesignTheme();
        if (defaultTheme?.colors && Array.isArray(defaultTheme.colors)) {
          themeColors = defaultTheme.colors as Array<{ name: string; hexCode: string; rank?: number; description?: string }>;
        }

        const scopeLabel = reportScope === "all" ? "Financial Report"
          : reportScope === "income" ? "Income Statement"
          : reportScope === "cashflow" ? "Cash Flow Statement"
          : reportScope === "balance" ? "Balance Sheet"
          : reportScope === "overview" ? "Portfolio Overview"
          : reportScope === "investment" ? "Investment Analysis"
          : "Financial Report";

        const compileInput = {
          format,
          orientation,
          entityName,
          companyName,
          statementType: exportData.statements.length === 1 ? exportData.statements[0].title : scopeLabel,
          statements: exportData.statements,
          metrics: exportData.metrics,
          years: exportData.years,
          themeColors,
          densePagination: true,
        };

        const report = compileReport(compileInput);
        logger.info(`[server-export] Compiled report: ${report.sections.length} sections`, "server-export");

        switch (format) {
          case "pdf":
            buffer = await renderPremiumPdf(report);
            break;
          case "xlsx":
            buffer = await generateExcelFromReport(report);
            break;
          case "pptx":
            buffer = await generatePptxFromReport(report);
            break;
          case "docx":
            buffer = await generateDocxFromReport(report);
            break;
          default:
            return res.status(400).json({ error: `Unsupported format: ${format}` });
        }
      }

      const MAX_EXPORT_BYTES = 50 * 1024 * 1024;
      if (buffer.length > MAX_EXPORT_BYTES) {
        logger.error(`Export too large: ${buffer.length} bytes`, "server-export");
        return res.status(413).json({ error: "Export exceeds maximum size limit" });
      }

      const safeEntity = entityName.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();
      const ext = FORMAT_EXTENSIONS[format] || `.${format}`;
      const filename = `${safeEntity} - Financial Report${ext}`;

      const contentType = CONTENT_TYPES[format];
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("X-Finance-Output-Hash", exportData.outputHash);
      res.setHeader("X-Finance-Engine-Version", exportData.engineVersion);

      logger.info(`[server-export] Generated ${format} (${buffer.length} bytes) for ${entityType}`, "server-export");

      logActivity(req, "export_generated", entityType, entityId ?? null, entityName, {
        format,
        reportScope,
        version,
        sizeBytes: buffer.length,
      });

      res.send(buffer);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : "";
      logger.error(`[server-export] Error: ${errorMsg} ${errorStack}`, "server-export");
      res.status(500).json({ error: "Export generation failed. Please try again." });
    }
  });

  app.get("/api/exports/generate/status", requireAuth, async (_req: Request, res: Response) => {
    res.json({ available: true, formats: ["pdf", "xlsx", "pptx", "docx", "csv"] });
  });
}
