import { getStorageProvider } from "../providers/storage";
import { BaseIntegrationService, type IntegrationHealth } from "./base";
import { logApiCost } from "../middleware/cost-logger";
import { logger } from "../logger";

export interface DocumentAIResult {
  text: string;
  pages: Array<{
    pageNumber: number;
    tables: Array<{
      headerRows: string[][];
      bodyRows: string[][];
    }>;
  }>;
  entities: Array<{
    type: string;
    mentionText: string;
    confidence: number;
  }>;
  keyValuePairs: Array<{
    key: string;
    value: string;
    confidence: number;
  }>;
}

export class DocumentAIService extends BaseIntegrationService {
  readonly serviceName = "document-ai";
  private projectId: string;
  private location: string;
  private processorId: string;

  constructor() {
    super();
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    this.location = process.env.DOCUMENT_AI_LOCATION || "us";
    this.processorId = process.env.DOCUMENT_AI_PROCESSOR_ID || "";
  }

  isConfigured(): boolean {
    return !!(this.projectId && this.processorId);
  }

  async healthCheck(): Promise<IntegrationHealth> {
    const start = Date.now();
    const { lastError, lastErrorAt } = this.getLastError();
    try {
      if (!this.isConfigured()) {
        return {
          name: this.serviceName,
          healthy: false,
          latencyMs: Date.now() - start,
          lastError: "GOOGLE_CLOUD_PROJECT or DOCUMENT_AI_PROCESSOR_ID not configured",
          circuitState: this.getCircuitState(),
        };
      }
      return {
        name: this.serviceName,
        healthy: true,
        latencyMs: Date.now() - start,
        lastError,
        lastErrorAt,
        circuitState: this.getCircuitState(),
      };
    } catch (error: unknown) {
      return {
        name: this.serviceName,
        healthy: false,
        latencyMs: Date.now() - start,
        lastError: error instanceof Error ? error.message : String(error),
        lastErrorAt: Date.now(),
        circuitState: this.getCircuitState(),
      };
    }
  }

  async processDocument(objectPath: string, contentType: string): Promise<DocumentAIResult> {
    if (!this.isConfigured()) {
      return this.simulateExtraction(objectPath);
    }

    try {
      return await this.execute("processDocument", async () => {
        const storageProvider = getStorageProvider();
        const { buffer: fileBuffer } = await storageProvider.downloadBuffer(objectPath);

        const endpoint = `https://${this.location}-documentai.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/processors/${this.processorId}:process`;

        const startTime = Date.now();
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            rawDocument: {
              content: fileBuffer.toString("base64"),
              mimeType: contentType,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Document AI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const result = this.parseDocumentAIResponse(data);
        const pageCount = result.pages?.length ?? 1;
        try { logApiCost({ timestamp: new Date().toISOString(), service: "document-ai", operation: "document-parse", estimatedCostUsd: 0.01 * pageCount, durationMs: Date.now() - startTime, route: "document-ai-integration" }); } catch (e: unknown) { logger.warn(`Failed to log API cost: ${(e instanceof Error ? e.message : String(e))}`, "cost-logger"); }
        return result;
      });
    } catch (error: unknown) {
      logger.error(`Document AI processing failed: ${error instanceof Error ? error.message : error}`, "document-ai");
      // Return empty result instead of fake simulated data — caller should handle null/empty gracefully
      return { text: "", pages: [], fields: [], tables: [], entities: [], keyValuePairs: [], simulated: true } as DocumentAIResult;
    }
  }

  private parseDocumentAIResponse(response: any): DocumentAIResult {
    const document = response.document || {};
    const text = document.text || "";
    const pages = (document.pages || []).map((page: any, idx: number) => ({
      pageNumber: idx + 1,
      tables: (page.tables || []).map((table: any) => ({
        headerRows: (table.headerRows || []).map((row: any) =>
          (row.cells || []).map((cell: any) => this.extractTextFromLayout(cell.layout, text))
        ),
        bodyRows: (table.bodyRows || []).map((row: any) =>
          (row.cells || []).map((cell: any) => this.extractTextFromLayout(cell.layout, text))
        ),
      })),
    }));

    const entities = (document.entities || []).map((entity: any) => ({
      type: entity.type || "",
      mentionText: entity.mentionText || "",
      confidence: entity.confidence || 0,
    }));

    const keyValuePairs: Array<{ key: string; value: string; confidence: number }> = [];
    for (const page of document.pages || []) {
      for (const field of page.formFields || []) {
        const key = this.extractTextFromLayout(field.fieldName, text).trim();
        const value = this.extractTextFromLayout(field.fieldValue, text).trim();
        const confidence = field.fieldName?.confidence || field.fieldValue?.confidence || 0;
        if (key && value) {
          keyValuePairs.push({ key, value, confidence });
        }
      }
    }

    return { text, pages, entities, keyValuePairs };
  }

  private extractTextFromLayout(layout: any, fullText: string): string {
    if (!layout?.textAnchor?.textSegments) return "";
    return layout.textAnchor.textSegments
      .map((seg: any) => fullText.substring(seg.startIndex || 0, seg.endIndex || 0))
      .join("");
  }

  private simulateExtraction(_objectPath: string): DocumentAIResult {
    return {
      text: "Simulated document extraction - Document AI not configured",
      pages: [{
        pageNumber: 1,
        tables: [{
          headerRows: [["Category", "Amount"]],
          bodyRows: [
            ["Rooms Revenue", "$1,250,000"],
            ["Food & Beverage Revenue", "$450,000"],
            ["Events Revenue", "$320,000"],
            ["Other Revenue", "$85,000"],
            ["Total Revenue", "$2,105,000"],
            ["Rooms Expense", "$312,500"],
            ["F&B Expense", "$157,500"],
            ["Administrative & General", "$189,450"],
            ["Marketing", "$105,250"],
            ["Property Operations", "$147,350"],
            ["Utilities", "$126,300"],
            ["Property Taxes", "$84,200"],
            ["IT & Telecom", "$42,100"],
            ["FF&E Reserve", "$84,200"],
            ["Net Operating Income", "$493,000"],
            ["Average Daily Rate", "$285"],
            ["Occupancy Rate", "72%"],
            ["Room Count", "45"],
            ["Purchase Price", "$6,500,000"],
          ],
        }],
      }],
      entities: [
        { type: "total_revenue", mentionText: "$2,105,000", confidence: 0.95 },
        { type: "noi", mentionText: "$493,000", confidence: 0.92 },
      ],
      keyValuePairs: [
        { key: "Total Revenue", value: "$2,105,000", confidence: 0.95 },
        { key: "Net Operating Income", value: "$493,000", confidence: 0.92 },
        { key: "Average Daily Rate", value: "$285", confidence: 0.88 },
        { key: "Occupancy Rate", value: "72%", confidence: 0.85 },
      ],
    };
  }
}

export const getDocumentAIHealthCheck = () => new DocumentAIService().healthCheck();
