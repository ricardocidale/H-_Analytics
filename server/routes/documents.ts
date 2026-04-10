import type { Express } from "express";
import { requireAuth, requireManagementAccess, isApiRateLimited, checkPropertyAccess , getAuthUser } from "../auth";
import { storage } from "../storage";
import { logActivity, logAndSendError } from "./helpers";
import { DocumentAIService } from "../integrations/document-ai";
import { mapExtractionToFields, getConfidenceLevel } from "../document-ai/field-mapper";
import { DOCUMENT_TEMPLATES, renderTemplate } from "../document-ai/templates";
import { objectStorageClient, ObjectStorageService } from "../replit_integrations/object_storage";
import { randomUUID } from "crypto";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { MAX_DOC_SIZE } from "../constants";

const documentAIService = new DocumentAIService();

const fieldStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) });

const sharedObjectStorageService = new ObjectStorageService();

const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
];

export function register(app: Express) {
  app.post("/api/documents/extract", requireManagementAccess, async (req, res) => {
    try {
      // Rate limit: max 3 document extractions per minute per user
      if (isApiRateLimited(getAuthUser(req).id, "document-extract", 3)) {
        return res.status(429).json({ error: "Rate limit exceeded. Please wait before extracting another document." });
      }

      const contentType = (req.headers["content-type"] || "").split(";")[0].trim();
      const propertyId = parseInt(req.headers["x-property-id"] as string);
      const fileName = (req.headers["x-file-name"] as string) || "document";

      if (!propertyId || isNaN(propertyId)) {
        return res.status(400).json({ error: "Missing x-property-id header" });
      }

      if (!ALLOWED_DOC_TYPES.includes(contentType)) {
        return res.status(400).json({ error: `Unsupported file type: ${contentType}. Supported: PDF, PNG, JPEG, TIFF, WebP` });
      }

      const property = await storage.getProperty(propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalSize += buf.length;
        if (totalSize > MAX_DOC_SIZE) {
          return res.status(413).json({ error: `File too large. Maximum size is ${MAX_DOC_SIZE / 1024 / 1024}MB.` });
        }
        chunks.push(buf);
      }
      const body = Buffer.concat(chunks);

      if (body.length === 0) {
        return res.status(400).json({ error: "No file data received" });
      }

      const objectStorageService = sharedObjectStorageService;
      const privateDir = objectStorageService.getPrivateObjectDir();
      const objectId = randomUUID();
      const fullPath = `${privateDir}/documents/${objectId}`;
      const parts = fullPath.startsWith("/") ? fullPath.slice(1).split("/") : fullPath.split("/");
      const bucketName = parts[0];
      const objectName = parts.slice(1).join("/");

      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(body, { contentType });

      const objectPath = `/objects/documents/${objectId}`;

      const extraction = await storage.createDocumentExtraction({
        propertyId,
        userId: getAuthUser(req).id,
        fileName,
        fileContentType: contentType,
        objectPath,
        documentType: "general",
        status: "processing",
      });

      logActivity(req, "document-upload", "document", extraction.id, fileName, { propertyId, objectPath });

      try {
        const result = await documentAIService.processDocument(objectPath, contentType);

        const mappedFields = mapExtractionToFields(result, property);

        await storage.updateDocumentExtraction(extraction.id, {
          status: "completed",
          rawExtractionData: result as any,
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
          }))
        );

        logActivity(req, "document-extracted", "document", extraction.id, fileName, {
          propertyId,
          fieldCount: fieldRecords.length,
        });

        res.json({
          extraction: { ...extraction, status: "completed", processedAt: new Date() },
          fields: fieldRecords.map((f) => ({
            ...f,
            confidenceLevel: getConfidenceLevel(f.confidence),
          })),
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

  app.get("/api/documents/extractions/:propertyId", requireAuth, async (req, res) => {
    try {
      const propertyId = parseInt(String(req.params.propertyId));
      if (isNaN(propertyId)) {
        return res.status(400).json({ error: "Invalid property ID" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const extractions = await storage.getPropertyExtractions(propertyId);
      res.json(extractions);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get extractions", error);
    }
  });

  app.get("/api/documents/extractions/:extractionId/fields", requireAuth, async (req, res) => {
    try {
      const extractionId = parseInt(String(req.params.extractionId));
      if (isNaN(extractionId)) {
        return res.status(400).json({ error: "Invalid extraction ID" });
      }

      const extraction = await storage.getDocumentExtraction(extractionId);
      if (!extraction) return res.status(404).json({ error: "Extraction not found" });
      if (!await checkPropertyAccess(getAuthUser(req), extraction.propertyId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const fields = await storage.getExtractionFields(extractionId);
      res.json(
        fields.map((f) => ({
          ...f,
          confidenceLevel: getConfidenceLevel(f.confidence),
        }))
      );
    } catch (error: unknown) {
      logAndSendError(res, "Failed to get extraction fields", error);
    }
  });

  app.patch("/api/documents/fields/:fieldId/status", requireManagementAccess, async (req, res) => {
    try {
      const fieldId = parseInt(String(req.params.fieldId));
      const validation = fieldStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { status } = validation.data;

      const existingField = await storage.getExtractionField(fieldId);
      if (!existingField) {
        return res.status(404).json({ error: "Field not found" });
      }
      const ownerExtraction = await storage.getDocumentExtraction(existingField.extractionId);
      if (!ownerExtraction || !(await checkPropertyAccess(getAuthUser(req), ownerExtraction.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const updated = await storage.updateExtractionFieldStatus(fieldId, status);

      if (status === "approved" && updated.mappedPropertyField) {
        const extraction = ownerExtraction;
        if (extraction) {
          const numericValue = parseFloat(updated.extractedValue.replace(/[$,%]/g, ""));
          if (!isNaN(numericValue)) {
            const updateData: Record<string, any> = {};
            let finalValue = numericValue;

            const percentFields = [
              "startOccupancy", "maxOccupancy", "exitCapRate", "taxRate",
              "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
              "costRatePropertyOps", "costRateUtilities",
              "costRateTaxes", "costRateIT", "costRateFFE", "costRateOther",
              "revShareEvents", "revShareFB", "revShareOther", "adrGrowthRate",
              "dispositionCommission", "baseManagementFeeRate", "incentiveManagementFeeRate",
            ];

            if (percentFields.includes(updated.mappedPropertyField) && finalValue > 1) {
              finalValue = finalValue / 100;
            }

            updateData[updated.mappedPropertyField] = finalValue;
            await storage.updateProperty(extraction.propertyId, updateData);

            logActivity(req, "extraction-field-applied", "property", extraction.propertyId, updated.fieldLabel, {
              field: updated.mappedPropertyField,
              value: finalValue,
              source: `extraction:${extraction.id}`,
            });
          }
        }
      }

      res.json({ ...updated, confidenceLevel: getConfidenceLevel(updated.confidence) });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update field status", error);
    }
  });

  app.post("/api/documents/fields/:extractionId/bulk-status", requireManagementAccess, async (req, res) => {
    try {
      const extractionId = parseInt(String(req.params.extractionId));
      const validation = fieldStatusSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      const { status } = validation.data;

      const extraction = await storage.getDocumentExtraction(extractionId);
      if (!extraction) return res.status(404).json({ error: "Extraction not found" });
      if (!await checkPropertyAccess(getAuthUser(req), extraction.propertyId)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (status === "approved") {
        const fields = await storage.getExtractionFields(extractionId);

        if (extraction) {
          const updateData: Record<string, any> = {};
          const percentFields = [
            "startOccupancy", "maxOccupancy", "exitCapRate", "taxRate",
            "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
            "costRatePropertyOps", "costRateUtilities",
            "costRateTaxes", "costRateIT", "costRateFFE", "costRateOther",
            "revShareEvents", "revShareFB", "revShareOther", "adrGrowthRate",
            "dispositionCommission", "baseManagementFeeRate", "incentiveManagementFeeRate",
          ];

          for (const field of fields) {
            if (field.mappedPropertyField && field.status === "pending") {
              const numericValue = parseFloat(field.extractedValue.replace(/[$,%]/g, ""));
              if (!isNaN(numericValue)) {
                let finalValue = numericValue;
                if (percentFields.includes(field.mappedPropertyField) && finalValue > 1) {
                  finalValue = finalValue / 100;
                }
                updateData[field.mappedPropertyField] = finalValue;
              }
            }
          }

          if (Object.keys(updateData).length > 0) {
            await storage.updateProperty(extraction.propertyId, updateData);
          }
        }
      }

      await storage.bulkUpdateExtractionFieldStatus(extractionId, status);

      logActivity(req, "extraction-bulk-action", "document", extractionId, null, { status });

      const updatedFields = await storage.getExtractionFields(extractionId);
      res.json(
        updatedFields.map((f) => ({
          ...f,
          confidenceLevel: getConfidenceLevel(f.confidence),
        }))
      );
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

      const property = await storage.getProperty(data.propertyId);
      if (!property) {
        return res.status(404).json({ error: "Property not found" });
      }
      if (!(await checkPropertyAccess(getAuthUser(req), data.propertyId))) {
        return res.status(403).json({ error: "Access denied" });
      }

      const globalAssumptions = await storage.getGlobalAssumptions();
      if (!globalAssumptions) {
        return res.status(500).json({ error: "Global assumptions not found" });
      }

      const senderName = [getAuthUser(req).firstName, getAuthUser(req).lastName].filter(Boolean).join(" ") || getAuthUser(req).email;

      const rendered = renderTemplate(
        data.templateId,
        property,
        globalAssumptions,
        senderName,
        data.recipientName
      );

      res.json({ html: rendered.html, subject: rendered.subject });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to preview template", error);
    }
  });

}
