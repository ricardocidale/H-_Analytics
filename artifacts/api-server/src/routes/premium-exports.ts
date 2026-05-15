import { type Express, type Request, type Response } from "express";
import archiver from "archiver";
import { requireAuth } from "../auth";
import { isAdminRole } from "@shared/constants-enums";
import { z } from "zod";
import { logger } from "../logger";
import { storage } from "../storage";
import { renderPremiumPdf } from "../pdf/render";
import { compileReport } from "../report/compiler";
import { isWeasyPrintAvailable, renderHtmlToPdf } from "../pdf/weasyprint-renderer";
import { buildPdfSectionsFromData } from "./premium-pdf-pipeline";
import { buildPdfHtml } from "./pdf-html-templates";
import { resolveThemeColors } from "../theme-resolver";
import { generateExcelFromReport } from "./format-generators/excel-generator";
import { generatePptxFromReport } from "./format-generators/pptx-generator";
import { generateDocxFromReport } from "./format-generators/docx-generator";
import { buildExportData } from "../report/server-export-data";
import { logActivity } from "./helpers";
import { HTTP_413_PAYLOAD_TOO_LARGE, HTTP_504_GATEWAY_TIMEOUT } from "../constants";

// When a PDF export contains this many statements or more, each statement is
// exported as its own PDF file and all files are bundled into a single zip.
const PDF_SPLIT_STATEMENT_COUNT = 2;

// zlib compression level for zip archives (0 = none, 9 = max; 5 = balanced speed/size).
const ZIP_COMPRESSION_LEVEL = 5;

const exportRowSchema = z.object({
  category: z.string(),
  values: z.array(z.union([z.string(), z.number()])),
  indent: z.number().optional(),
  isBold: z.boolean().optional(),
  isHeader: z.boolean().optional(),
  isItalic: z.boolean().optional(),
  format: z.enum(["currency", "percentage", "number", "ratio", "multiplier"]).optional(),
});

export const premiumExportSchema = z.object({
  format: z.enum(["xlsx", "pptx", "pdf", "docx"]),
  orientation: z.enum(["landscape", "portrait"]).optional().default("landscape"),
  version: z.enum(["short", "extended"]).optional().default("short"),
  entityName: z.string(),
  companyName: z.string().optional().default("Hospitality Business Group"),
  statementType: z.string().optional(),
  years: z.array(z.string()).optional(),
  rows: z.array(exportRowSchema).optional(),
  statements: z.array(z.object({
    title: z.string(),
    years: z.array(z.string()),
    rows: z.array(exportRowSchema),
    includeTable: z.boolean().optional(),
    includeChart: z.boolean().optional(),
  })).optional(),
  metrics: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  projectionYears: z.number().optional(),
  themeColors: z.array(z.object({
    name: z.string(),
    hexCode: z.string(),
    rank: z.number().optional(),
    description: z.string().optional(),
  })).optional(),
  chartScreenshots: z.array(z.object({
    title: z.string(),
    dataUrl: z.string(),
    aspectRatio: z.number().optional(),
  })).optional(),
  densePagination: z.boolean().optional().default(true),
  memoSections: z.object({
    executiveSummary: z.string().optional(),
    investmentThesis: z.string().optional(),
    marketOverview: z.string().optional(),
    financialHighlights: z.string().optional(),
    riskFactors: z.string().optional(),
    conclusion: z.string().optional(),
  }).optional(),
  computeRef: z.object({
    propertyIds: z.array(z.number().int().positive()).optional(),
    projectionYears: z.number().int().min(1).max(30).optional(),
  }).optional(),
});

type PremiumExportRequest = z.infer<typeof premiumExportSchema>;

const CONTENT_TYPES: Record<string, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const FORMAT_EXTENSIONS: Record<string, string> = {
  xlsx: ".xlsx",
  pptx: ".pptx",
  pdf: ".pdf",
  docx: ".docx",
};

const DEFAULT_REPORT_TYPE: Record<string, string> = {
  xlsx: "Financial Report",
  pptx: "Presentation",
  pdf: "Financial Report",
  docx: "Investor Memo",
};

/** Collect archiver output into a Buffer (no streaming to res needed here). */
async function buildZipBuffer(
  files: Array<{ name: string; buffer: Buffer }>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: ZIP_COMPRESSION_LEVEL } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
    for (const { name, buffer } of files) {
      archive.append(buffer, { name });
    }
    archive.finalize();
  });
}

/**
 * Generates one PDF per statement (no cover pages) and returns them bundled
 * as a zip Buffer.  Called when the export contains ≥ PDF_SPLIT_STATEMENT_COUNT
 * statements.
 */
async function generatePerStatementZip(
  data: PremiumExportRequest,
): Promise<Buffer> {
  const statements = data.statements ?? [];
  const pdfFiles: Array<{ name: string; buffer: Buffer }> = [];

  for (const statement of statements) {
    const singleData: PremiumExportRequest = {
      ...data,
      statements: [statement],
      statementType: statement.title,
    };
    const buf = await generateViaTemplatePipeline(singleData);
    const safeName = statement.title
      .replace(/[^a-zA-Z0-9 \-]/g, "")
      .substring(0, 60)
      .trim();
    pdfFiles.push({ name: `${safeName}.pdf`, buffer: buf });
    logger.info(
      `[multi-pdf] Generated "${safeName}.pdf" (${buf.length} bytes)`,
      "premium-export",
    );
  }

  return buildZipBuffer(pdfFiles);
}

async function generateViaTemplatePipeline(
  data: PremiumExportRequest,
): Promise<Buffer> {
  const report = compileReport(data);
  logger.info(`[compiler] Compiled report: ${report.sections.length} sections, orientation=${report.orientation}`, "premium-export");

  switch (data.format) {
    case "pdf": {
      // Try WeasyPrint first (HTML→PDF, Excel-quality tables), fall back to React-PDF
      const weasyAvailable = await isWeasyPrintAvailable();
      if (weasyAvailable) {
        logger.info(`[weasyprint] Generating PDF via HTML templates + WeasyPrint...`, "premium-export");
        try {
          // Build sections from financial data — tables + charts only (no cover/TOC)
          const sections = buildPdfSectionsFromData(data as unknown as Parameters<typeof buildPdfSectionsFromData>[0]);
          const financialSections = sections.filter(s =>
            s.type === "financial_table" || s.type === "line_chart" || s.type === "metrics_dashboard"
          );
          const tc = resolveThemeColors(data.themeColors);
          const html = buildPdfHtml({ sections: financialSections }, {
            companyName: data.companyName ?? "H+ Analysis",
            entityName: data.entityName ?? "",
            reportTitle: data.statementType ?? "Financial Report",
            orientation: data.orientation ?? "landscape",
            sections: financialSections,
            colors: tc,
            densePagination: false, // one statement per page, not dense
          });
          return renderHtmlToPdf(html);
        } catch (wpErr: unknown) {
          logger.warn(`WeasyPrint failed, falling back to React-PDF: ${wpErr instanceof Error ? wpErr.message : String(wpErr)}`, "premium-export");
          return renderPremiumPdf(report);
        }
      }
      logger.info(`[react-pdf] Generating PDF via @react-pdf/renderer (WeasyPrint unavailable)...`, "premium-export");
      return renderPremiumPdf(report);
    }
    case "xlsx": {
      logger.info(`[template] Building Excel from compiled report (no AI call)...`, "premium-export");
      return generateExcelFromReport(report);
    }
    case "pptx": {
      logger.info(`[template] Building PPTX from compiled report (no AI call)...`, "premium-export");
      return generatePptxFromReport(report);
    }
    case "docx": {
      logger.info(`[template] Building DOCX from compiled report (no AI call)...`, "premium-export");
      return generateDocxFromReport(report);
    }
    default:
      throw new Error(`Unsupported format: ${data.format}`);
  }
}

export function register(app: Express) {
  app.post("/api/exports/premium", requireAuth, async (req: Request, res: Response) => {
    try {
      if (!req.user?.role || !isAdminRole(req.user.role)) {
        return res.status(403).json({ error: "Premium exports require admin access", code: "PEXP-001" });
      }

      const parsed = premiumExportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid export request", details: parsed.error.flatten() , code: "PEXP-005" });
      }

      const data = parsed.data;

      // Gate 1: HMC must have basic setup before exporting investor materials
      try {
        const ga = await storage.getGlobalAssumptions();
        if (!ga?.companyName) {
          return res.status(400).json({
            error: "Company setup is incomplete. An administrator must configure the company name before exporting.",
            code: "COMPANY_SETUP_INCOMPLETE",
          });
        }
      } catch {
        // Don't block if check fails
      }

      // Gate 2: warn in export metadata if properties are unvalidated
      if (data.computeRef?.propertyIds?.length) {
        try {
          const dbProps = await Promise.all(
            data.computeRef.propertyIds.map((id: number) => storage.getProperty(id))
          );
          const excluded = dbProps.filter(p => p && (p.validationStatus === "excluded_data" || p.validationStatus === "excluded_admin"));
          if (excluded.length > 0) {
            return res.status(400).json({
              error: `Cannot export: ${excluded.length} properties excluded by The Analyst due to data quality issues: ${excluded.map(p => p!.name).join(", ")}`,
              code: "PROPERTIES_EXCLUDED",
            });
          }
          const unvalidated = dbProps.filter(p => p && p.validationStatus === "pending_validation");
          if (unvalidated.length > 0) {
            logger.warn(
              `Export includes ${unvalidated.length} unvalidated properties: ${unvalidated.map(p => p!.name).join(", ")}`,
              "premium-export",
            );
          }
        } catch {
          // Don't block export if validation check fails
        }
      }

      let exportOutputHash: string | undefined;

      if (data.computeRef && !req.user?.id) {
        return res.status(401).json({ error: "Authentication required for server-recomputed exports", code: "PEXP-002" });
      }
      if (data.computeRef && req.user?.id) {
        logger.info(`[server-recompute] Computing export data server-side for user ${req.user.id}`, "premium-export");
        const serverData = await buildExportData({
          userId: req.user.id,
          propertyIds: data.computeRef.propertyIds,
          projectionYears: data.computeRef.projectionYears ?? data.projectionYears,
        });

        data.statements = serverData.statements;
        data.rows = serverData.rows;
        data.metrics = serverData.metrics;
        data.years = serverData.years;
        data.projectionYears = serverData.projectionYears;

        exportOutputHash = serverData.outputHash;
        res.setHeader("X-Finance-Output-Hash", serverData.outputHash);
        res.setHeader("X-Finance-Engine-Version", serverData.engineVersion);
        logger.info(`[server-recompute] Server data ready: hash=${serverData.outputHash.slice(0, 16)}..., ${serverData.statements.length} statements`, "premium-export");
      }

      if (!data.themeColors?.length) {
        const defaultTheme = await storage.getDefaultDesignTheme();
        if (defaultTheme?.colors && Array.isArray(defaultTheme.colors)) {
          data.themeColors = (defaultTheme.colors as Array<{ name: string; hexCode: string; rank?: number; description?: string }>);
        }
      }

      const contentType = CONTENT_TYPES[data.format];
      if (!contentType) {
        return res.status(400).json({ error: `Unsupported format: ${data.format}`, code: "PEXP-003" });
      }

      const safeCompany = (data.companyName || data.entityName).replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();
      const reportType = (data.statementType || DEFAULT_REPORT_TYPE[data.format] || "Report").replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 40).trim();

      // Multi-statement PDF: one file per statement, bundled as a zip (no cover pages).
      const isMultiStatementPdf =
        data.format === "pdf" &&
        (data.statements?.length ?? 0) >= PDF_SPLIT_STATEMENT_COUNT;

      const MAX_EXPORT_BYTES = 50 * 1024 * 1024;

      if (isMultiStatementPdf) {
        const statementCount = data.statements!.length;
        logger.info(
          `[multi-pdf] Generating ${statementCount} per-statement PDFs as zip for "${data.entityName}"...`,
          "premium-export",
        );
        const zipBuffer = await generatePerStatementZip(data);
        if (zipBuffer.length > MAX_EXPORT_BYTES) {
          logger.error(`Export too large: ${zipBuffer.length} bytes exceeds ${MAX_EXPORT_BYTES} limit`, "premium-export");
          return res.status(HTTP_413_PAYLOAD_TOO_LARGE).json({ error: "Export exceeds maximum size limit. Try reducing the number of properties or projection years.", code: "PEXP-004" });
        }
        logger.info(`[multi-pdf] Zip generated: ${statementCount} statements, ${zipBuffer.length} bytes`, "premium-export");

        logActivity(req, "export", "premium-export", undefined, data.entityName, {
          format: "pdf-zip",
          orientation: data.orientation,
          version: data.version,
          statementCount,
          bytes: zipBuffer.length,
          serverRecomputed: !!data.computeRef,
          outputHash: exportOutputHash ?? null,
        });

        const zipFilename = `${safeCompany} - Financial Statements.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
        res.setHeader("Content-Length", zipBuffer.length);
        return res.send(zipBuffer);
      }

      const ext = FORMAT_EXTENSIONS[data.format] || `.${data.format}`;
      const filename = `${safeCompany} - ${reportType}${ext}`;

      logger.info(`Generating premium ${data.format} via compiled report + template pipeline for "${data.entityName}"...`, "premium-export");
      const buffer = await generateViaTemplatePipeline(data);
      if (buffer.length > MAX_EXPORT_BYTES) {
        logger.error(`Export too large: ${buffer.length} bytes exceeds ${MAX_EXPORT_BYTES} limit`, "premium-export");
        return res.status(HTTP_413_PAYLOAD_TOO_LARGE).json({ error: "Export exceeds maximum size limit. Try reducing the number of properties or projection years.", code: "PEXP-004" });
      }
      logger.info(`Premium ${data.format} generated (${buffer.length} bytes)`, "premium-export");

      logActivity(req, "export", "premium-export", undefined, data.entityName, {
        format: data.format,
        orientation: data.orientation,
        version: data.version,
        statementType: data.statementType,
        bytes: buffer.length,
        serverRecomputed: !!data.computeRef,
        outputHash: exportOutputHash ?? null,
      });

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error) || "Unknown error";
      logger.error(`Error: ${errorMsg} ${error instanceof Error ? error.stack || "" : ""}`, "premium-export");
      const format = typeof req.body?.format === "string" ? req.body.format : "unknown";
      if (errorMsg.includes("timed out")) {
        return res.status(HTTP_504_GATEWAY_TIMEOUT).json({ error: `Export timed out generating ${format.toUpperCase()}. Please try again.`, format , code: "PEXP-006" });
      }
      res.status(500).json({ error: "Premium export generation failed. Please try again.", format , code: "PEXP-007" });
    }
  });

  app.get("/api/exports/premium/status", requireAuth, async (_req: Request, res: Response) => {
    res.json({ available: true, formats: ["xlsx", "pptx", "pdf", "docx"] });
  });
}
