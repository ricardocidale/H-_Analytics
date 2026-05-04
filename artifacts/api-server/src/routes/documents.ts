import type { Express } from "express";
import { requireAuth, isApiRateLimited, checkPropertyAccess, getAuthUser } from "../auth";
import { storage } from "../storage";
import { logActivity, logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import { DocumentAIService } from "../integrations/document-ai";
import { mapExtractionToFields, getConfidenceLevel } from "../document-ai/field-mapper";
import { DOCUMENT_TEMPLATES, renderTemplate } from "../document-ai/templates";
import { getStorageProvider } from "../providers/storage";
import { deleteExtractionVectors } from "../ai/vector-store-service";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  MAX_DOC_SIZE,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
  HTTP_413_PAYLOAD_TOO_LARGE,
  HTTP_429_TOO_MANY_REQUESTS,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";
import { DEFAULT_EXIT_CAP_RATE } from "@shared/constants";
import { resolveDefault } from "../defaults";
import { classifyDocumentType, DOCUMENT_TYPES } from "@shared/document-types";

const documentAIService = new DocumentAIService();

/** Allowlist of property columns that document extraction can write to.
 *  Prevents prototype pollution and arbitrary column writes from AI output. */
const WRITABLE_EXTRACTION_FIELDS = new Set([
  "startAdr", "startOccupancy", "maxOccupancy", "exitCapRate", "taxRate",
  "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
  "costRatePropertyOps", "costRateUtilities", "costRateTaxes", "costRateIT",
  "costRateFFE", "costRateOther", "costRateInsurance",
  "revShareEvents", "revShareFB", "revShareOther", "adrGrowthRate",
  "dispositionCommission", "baseManagementFeeRate", "incentiveManagementFeeRate",
  "cateringBoostPercent", "roomCount", "purchasePrice", "renovationBudget",
  "name", "city", "stateProvince", "country", "streetAddress",
  "propertyType", "qualityTier", "businessModel",
]);

const PERCENT_FIELDS = new Set([
  "startOccupancy", "maxOccupancy", "exitCapRate", "taxRate",
  "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
  "costRatePropertyOps", "costRateUtilities",
  "costRateTaxes", "costRateIT", "costRateFFE", "costRateOther",
  "revShareEvents", "revShareFB", "revShareOther", "adrGrowthRate",
  "dispositionCommission", "baseManagementFeeRate", "incentiveManagementFeeRate",
]);

const fieldStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) });

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
];

async function readBodyBuffer(req: Express["request"], maxBytes: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<unknown>) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
    total += buf.length;
    if (total > maxBytes) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function normalizePercent(value: number, field: string): number {
  return PERCENT_FIELDS.has(field) && value > 1 ? value / 100 : value;
}

async function runAnalysisPipeline(
  extraction: Awaited<ReturnType<typeof storage.getDocumentExtraction>>,
  property: NonNullable<Awaited<ReturnType<typeof checkPropertyAccess>>>,
) {
  if (!extraction) throw new Error("Extraction not found");
  const result = await documentAIService.processDocument(extraction.objectPath, extraction.fileContentType);
  const mappedFields = mapExtractionToFields(result, property);

  await storage.updateDocumentExtraction(extraction.id, {
    status: "completed",
    rawExtractionData: result as unknown as Record<string, unknown>,
    processedAt: new Date(),
  });

  const fieldRecords = await storage.createExtractionFields(
    mappedFields.map((f) => ({
      extractionId: extraction.id,
      fieldName: f.fieldName,
      fieldLabel: f.fieldLabel,
      extractedValue: f.extractedValue,
      mappedPropertyField: f.mappedPropertyField,
      confidence: f.confidence,
      status: "pending",
      currentValue: f.currentValue,
    })),
  );

  return fieldRecords;
}

export function register(app: Express) {
  // ─── Legacy combined upload+extract (kept for backward compatibility) ────
  app.post("/api/documents/extract", requireAuth, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "document-extract", 3)) {
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded. Please wait before extracting another document." });
      }

      const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
      const propertyId = parseInt(req.headers["x-property-id"] as string, 10);
      const fileName = (req.headers["x-file-name"] as string) || "document";

      if (!propertyId || isNaN(propertyId)) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Missing x-property-id header" });
      }
      if (!ALLOWED_DOC_TYPES.includes(contentType)) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: `Unsupported file type: ${contentType}. Supported: PDF, PNG, JPEG, TIFF, WebP` });
      }

      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      const body = await readBodyBuffer(req, MAX_DOC_SIZE);
      if (body === null) return res.status(HTTP_413_PAYLOAD_TOO_LARGE).json({ error: `File too large. Maximum size is ${MAX_DOC_SIZE / 1024 / 1024}MB.` });
      if (body.length === 0) return res.status(HTTP_400_BAD_REQUEST).json({ error: "No file data received" });

      const storageProvider = getStorageProvider();
      const objectPath = await storageProvider.uploadBuffer(`documents/${randomUUID()}`, body, contentType);

      const extraction = await storage.createDocumentExtraction({
        propertyId,
        userId: getAuthUser(req).id,
        fileName,
        fileContentType: contentType,
        objectPath,
        documentType: classifyDocumentType(fileName),
        status: "processing",
      });

      logActivity(req, "document-upload", "document", extraction.id, fileName, { propertyId, objectPath });

      try {
        const fieldRecords = await runAnalysisPipeline(extraction, property);
        logActivity(req, "document-extracted", "document", extraction.id, fileName, { propertyId, fieldCount: fieldRecords.length });
        res.json({
          extraction: { ...extraction, status: "completed", processedAt: new Date() },
          fields: fieldRecords.map((f) => ({ ...f, confidenceLevel: getConfidenceLevel(f.confidence) })),
        });
      } catch (extractionError: unknown) {
        await storage.updateDocumentExtraction(extraction.id, {
          status: "failed",
          errorMessage: extractionError instanceof Error ? extractionError.message : "Extraction failed",
        });
        res.json({
          extraction: {
            ...extraction,
            status: "failed",
            errorMessage: extractionError instanceof Error ? extractionError.message : "Extraction failed",
          },
          fields: [],
        });
      }
    } catch (error: unknown) {
      logAndSendError(res, "Failed to process document", error);
    }
  });

  // ─── Upload only (no OCR) ────────────────────────────────────────────────
  app.post("/api/documents/upload", requireAuth, async (req, res) => {
    try {
      const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
      const propertyId = parseInt(req.headers["x-property-id"] as string, 10);
      const fileName = (req.headers["x-file-name"] as string) || "document";

      if (!propertyId || isNaN(propertyId)) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Missing x-property-id header" });
      }
      if (!ALLOWED_DOC_TYPES.includes(contentType)) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: `Unsupported file type: ${contentType}. Supported: PDF, PNG, JPEG, TIFF, WebP` });
      }

      const property = await checkPropertyAccess(getAuthUser(req), propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      const body = await readBodyBuffer(req, MAX_DOC_SIZE);
      if (body === null) return res.status(HTTP_413_PAYLOAD_TOO_LARGE).json({ error: `File too large. Maximum size is ${MAX_DOC_SIZE / 1024 / 1024}MB.` });
      if (body.length === 0) return res.status(HTTP_400_BAD_REQUEST).json({ error: "No file data received" });

      const storageProvider = getStorageProvider();
      const objectPath = await storageProvider.uploadBuffer(`documents/${randomUUID()}`, body, contentType);
      const suggestedType = classifyDocumentType(fileName);

      const extraction = await storage.createDocumentExtraction({
        propertyId,
        userId: getAuthUser(req).id,
        fileName,
        fileContentType: contentType,
        objectPath,
        documentType: suggestedType,
        status: "uploaded",
      });

      logActivity(req, "document-upload", "document", extraction.id, fileName, { propertyId, objectPath, fileSize: body.length });
      res.json({ extraction, fileSize: body.length, suggestedType });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to upload document", error);
    }
  });

  // ─── Library list (with field counts) ───────────────────────────────────
  app.get("/api/documents/library/:propertyId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }
      const rows = await storage.getPropertyExtractionsWithCounts(propertyId);
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get document library", error);
    }
  });

  // ─── Trigger analysis on an uploaded document ────────────────────────────
  app.post("/api/documents/extractions/:id/analyze", requireAuth, async (req, res) => {
    try {
      if (isApiRateLimited(getAuthUser(req).id, "document-extract", 3)) {
        return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Rate limit exceeded. Please wait before analyzing another document." });
      }

      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });

      const property = await checkPropertyAccess(getAuthUser(req), extraction.propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      await storage.updateDocumentExtraction(id, { status: "processing" });

      try {
        const fieldRecords = await runAnalysisPipeline(extraction, property);
        logActivity(req, "document-extracted", "document", id, extraction.fileName, {
          propertyId: extraction.propertyId,
          fieldCount: fieldRecords.length,
          documentType: extraction.documentType,
        });
        const updated = await storage.getDocumentExtraction(id);
        res.json({
          extraction: updated,
          fields: fieldRecords.map((f) => ({ ...f, confidenceLevel: getConfidenceLevel(f.confidence) })),
        });
      } catch (extractionError: unknown) {
        await storage.updateDocumentExtraction(id, {
          status: "failed",
          errorMessage: extractionError instanceof Error ? extractionError.message : "Extraction failed",
        });
        throw extractionError;
      }
    } catch (error: unknown) {
      logAndSendError(res, "Failed to analyze document", error);
    }
  });

  // ─── Rename a document ──────────────────────────────────────────────────
  app.patch("/api/documents/extractions/:id/rename", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const schema = z.object({ fileName: z.string().min(1).max(255) });
      const validation = schema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!(await checkPropertyAccess(getAuthUser(req), extraction.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      const updated = await storage.updateDocumentExtraction(id, { fileName: validation.data.fileName });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to rename document", error);
    }
  });

  // ─── Re-tag document type ────────────────────────────────────────────────
  app.patch("/api/documents/extractions/:id/type", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const schema = z.object({ documentType: z.enum(DOCUMENT_TYPES) });
      const validation = schema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!(await checkPropertyAccess(getAuthUser(req), extraction.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      const updated = await storage.updateDocumentExtraction(id, { documentType: validation.data.documentType });
      logActivity(req, "document-retagged", "document", id, extraction.fileName, { documentType: validation.data.documentType });
      res.json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update document type", error);
    }
  });

  // ─── Download original file ──────────────────────────────────────────────
  app.get("/api/documents/extractions/:id/download", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!(await checkPropertyAccess(getAuthUser(req), extraction.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(extraction.fileName)}"`);
      const storageProvider = getStorageProvider();
      await storageProvider.downloadToResponse(extraction.objectPath, res);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to download document", error);
    }
  });

  // ─── Delete a document ───────────────────────────────────────────────────
  app.delete("/api/documents/extractions/:id", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!(await checkPropertyAccess(getAuthUser(req), extraction.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      // Best-effort vector cleanup before DB row removal
      await deleteExtractionVectors(id);

      // Delete DB rows (extraction_fields cascade from FK)
      await storage.deleteDocumentExtraction(id);

      // Delete object from storage (after DB so orphaned storage > orphaned row)
      try {
        const storageProvider = getStorageProvider();
        await storageProvider.delete(extraction.objectPath);
      } catch (storageErr: unknown) {
        // Non-fatal: log and continue
        const msg = storageErr instanceof Error ? storageErr.message : String(storageErr);
        logActivity(req, "document-storage-delete-failed", "document", id, extraction.fileName, { error: msg });
      }

      logActivity(req, "document-deleted", "document", id, extraction.fileName, { propertyId: extraction.propertyId });
      res.status(204).end();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete document", error);
    }
  });

  // ─── Collision preview ───────────────────────────────────────────────────
  app.post("/api/documents/extractions/:id/collision-preview", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const schema = z.object({ fieldIds: z.array(z.number()).optional() });
      const validation = schema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });

      const property = await checkPropertyAccess(getAuthUser(req), extraction.propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      const allFields = await storage.getExtractionFields(id);
      const candidates = validation.data.fieldIds
        ? allFields.filter((f) => validation.data.fieldIds!.includes(f.id))
        : allFields.filter((f) => f.status === "pending" && f.mappedPropertyField);

      const collisions: Array<{
        fieldId: number; fieldLabel: string; mappedPropertyField: string;
        extractedValue: string; currentPropertyValue: string;
      }> = [];
      const safe: number[] = [];

      for (const field of candidates) {
        if (!field.mappedPropertyField || !WRITABLE_EXTRACTION_FIELDS.has(field.mappedPropertyField)) continue;
        const currentRaw = (property as Record<string, unknown>)[field.mappedPropertyField];
        if (currentRaw == null) { safe.push(field.id); continue; }
        const currentStr = String(currentRaw);
        if (currentStr === field.extractedValue) { safe.push(field.id); continue; }
        collisions.push({
          fieldId: field.id,
          fieldLabel: field.fieldLabel,
          mappedPropertyField: field.mappedPropertyField,
          extractedValue: field.extractedValue,
          currentPropertyValue: currentStr,
        });
      }

      res.json({ collisions, safeFieldIds: safe });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to preview collisions", error);
    }
  });

  // ─── Collision-aware apply ───────────────────────────────────────────────
  app.post("/api/documents/extractions/:id/apply", requireAuth, async (req, res) => {
    try {
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const schema = z.object({
        resolutions: z.record(z.string(), z.enum(["replace", "keep", "skip"])),
      });
      const validation = schema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });

      const extraction = await storage.getDocumentExtraction(id);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });

      const property = await checkPropertyAccess(getAuthUser(req), extraction.propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      const allFields = await storage.getExtractionFields(id);
      const propertyUpdates: Record<string, number> = {};

      for (const [fieldIdStr, resolution] of Object.entries(validation.data.resolutions)) {
        const fieldId = parseInt(fieldIdStr, 10);
        if (isNaN(fieldId)) continue;
        const field = allFields.find((f) => f.id === fieldId);
        if (!field || !field.mappedPropertyField || !WRITABLE_EXTRACTION_FIELDS.has(field.mappedPropertyField)) continue;

        if (resolution === "replace") {
          const numericValue = parseFloat(field.extractedValue.replace(/[$,%]/g, ""));
          if (!isNaN(numericValue)) {
            const finalValue = normalizePercent(numericValue, field.mappedPropertyField);
            propertyUpdates[field.mappedPropertyField] = finalValue;
            await storage.updateExtractionFieldStatus(fieldId, "approved");
            logActivity(req, "extraction-field-applied", "property", extraction.propertyId, field.fieldLabel, {
              field: field.mappedPropertyField,
              value: finalValue,
              source: `extraction:${id}`,
              documentType: extraction.documentType,
              extractionId: id,
            });
          }
        } else if (resolution === "keep") {
          await storage.updateExtractionFieldStatus(fieldId, "rejected");
        }
        // "skip" leaves the field as-is (pending)
      }

      if (Object.keys(propertyUpdates).length > 0) {
        await storage.updateProperty(extraction.propertyId, propertyUpdates);
      }

      const updatedFields = await storage.getExtractionFields(id);
      res.json(updatedFields.map((f) => ({ ...f, confidenceLevel: getConfidenceLevel(f.confidence) })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to apply extraction fields", error);
    }
  });

  // ─── Existing endpoints ──────────────────────────────────────────────────

  app.get("/api/documents/extractions/:propertyId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }
      const extractions = await storage.getPropertyExtractions(propertyId);
      res.json(extractions);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get extractions", error);
    }
  });

  app.get("/api/documents/extractions/:extractionId/fields", requireAuth, async (req, res) => {
    try {
      const extractionId = parseRouteId(req.params.extractionId);
      if (!extractionId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });

      const extraction = await storage.getDocumentExtraction(extractionId);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!await checkPropertyAccess(getAuthUser(req), extraction.propertyId)) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      const fields = await storage.getExtractionFields(extractionId);
      res.json(fields.map((f) => ({ ...f, confidenceLevel: getConfidenceLevel(f.confidence) })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get extraction fields", error);
    }
  });

  app.patch("/api/documents/fields/:fieldId/status", requireAuth, async (req, res) => {
    try {
      const fieldId = parseRouteId(req.params.fieldId);
      if (!fieldId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid field ID" });
      const validation = fieldStatusSchema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      const { status } = validation.data;

      const existingField = await storage.getExtractionField(fieldId);
      if (!existingField) return res.status(HTTP_404_NOT_FOUND).json({ error: "Field not found" });
      const ownerExtraction = await storage.getDocumentExtraction(existingField.extractionId);
      if (!ownerExtraction || !(await checkPropertyAccess(getAuthUser(req), ownerExtraction.propertyId))) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      const updated = await storage.updateExtractionFieldStatus(fieldId, status);
      if (!updated) return res.status(HTTP_404_NOT_FOUND).json({ error: "Field not found" });

      if (status === "approved" && updated.mappedPropertyField) {
        if (WRITABLE_EXTRACTION_FIELDS.has(updated.mappedPropertyField)) {
          const numericValue = parseFloat(updated.extractedValue.replace(/[$,%]/g, ""));
          if (!isNaN(numericValue)) {
            const finalValue = normalizePercent(numericValue, updated.mappedPropertyField);
            await storage.updateProperty(ownerExtraction.propertyId, { [updated.mappedPropertyField]: finalValue });
            logActivity(req, "extraction-field-applied", "property", ownerExtraction.propertyId, updated.fieldLabel, {
              field: updated.mappedPropertyField,
              value: finalValue,
              source: `extraction:${ownerExtraction.id}`,
              documentType: ownerExtraction.documentType,
              extractionId: ownerExtraction.id,
            });
          }
        }
      }

      res.json({ ...updated, confidenceLevel: getConfidenceLevel(updated.confidence) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update field status", error);
    }
  });

  app.post("/api/documents/fields/:extractionId/bulk-status", requireAuth, async (req, res) => {
    try {
      const extractionId = parseRouteId(req.params.extractionId);
      if (!extractionId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid extraction ID" });
      const validation = fieldStatusSchema.safeParse(req.body);
      if (!validation.success) return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      const { status } = validation.data;

      const extraction = await storage.getDocumentExtraction(extractionId);
      if (!extraction) return res.status(HTTP_404_NOT_FOUND).json({ error: "Extraction not found" });
      if (!await checkPropertyAccess(getAuthUser(req), extraction.propertyId)) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });
      }

      if (status === "approved") {
        const fields = await storage.getExtractionFields(extractionId);
        const updateData: Record<string, number> = {};
        for (const field of fields) {
          if (field.mappedPropertyField && field.status === "pending" && WRITABLE_EXTRACTION_FIELDS.has(field.mappedPropertyField)) {
            const numericValue = parseFloat(field.extractedValue.replace(/[$,%]/g, ""));
            if (!isNaN(numericValue)) {
              updateData[field.mappedPropertyField] = normalizePercent(numericValue, field.mappedPropertyField);
            }
          }
        }
        if (Object.keys(updateData).length > 0) {
          await storage.updateProperty(extraction.propertyId, updateData);
        }
      }

      await storage.bulkUpdateExtractionFieldStatus(extractionId, status);
      logActivity(req, "extraction-bulk-action", "document", extractionId, null, {
        status,
        documentType: extraction.documentType,
        extractionId,
      });

      const updatedFields = await storage.getExtractionFields(extractionId);
      res.json(updatedFields.map((f) => ({ ...f, confidenceLevel: getConfidenceLevel(f.confidence) })));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to bulk update fields", error);
    }
  });

  app.get("/api/documents/templates", requireAuth, async (_req, res) => {
    res.json(DOCUMENT_TEMPLATES);
  });

  app.post("/api/documents/templates/preview", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        templateId: z.string(),
        propertyId: z.number(),
        recipientName: z.string().min(1),
      });

      const data = schema.parse(req.body);

      const property = await checkPropertyAccess(getAuthUser(req), data.propertyId);
      if (!property) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied" });

      const globalAssumptions = await storage.getGlobalAssumptions();
      if (!globalAssumptions) return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: "Global assumptions not found" });

      const senderName = [getAuthUser(req).firstName, getAuthUser(req).lastName].filter(Boolean).join(" ") || getAuthUser(req).email;
      const defaultExitCapRate = (await resolveDefault<number>("mc.tax_exit.exitCapRate")) ?? DEFAULT_EXIT_CAP_RATE;

      const rendered = renderTemplate(
        data.templateId,
        property,
        globalAssumptions,
        senderName,
        data.recipientName,
        defaultExitCapRate,
      );

      res.json({ html: rendered.html, subject: rendered.subject });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to preview template", error);
    }
  });
}
