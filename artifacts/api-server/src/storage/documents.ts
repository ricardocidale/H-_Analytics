import { db } from "../db";
import { documentExtractions, extractionFields, type DocumentExtraction, type InsertDocumentExtraction, type ExtractionField, type InsertExtractionField } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { indexDocumentExtraction } from "../ai/vector-store-service";
import { logger } from "../logger";

export interface DocumentLibraryRow extends DocumentExtraction {
  totalFields: number;
  pendingFields: number;
  approvedFields: number;
  rejectedFields: number;
}

export class DocumentStorage {
  async createDocumentExtraction(data: InsertDocumentExtraction): Promise<DocumentExtraction> {
    const [extraction] = await db.insert(documentExtractions).values(data).returning();
    return extraction;
  }

  async getDocumentExtraction(id: number): Promise<DocumentExtraction | undefined> {
    const [extraction] = await db.select().from(documentExtractions).where(eq(documentExtractions.id, id));
    return extraction;
  }

  async getPropertyExtractions(propertyId: number): Promise<DocumentExtraction[]> {
    return db.select().from(documentExtractions)
      .where(eq(documentExtractions.propertyId, propertyId))
      .orderBy(desc(documentExtractions.createdAt));
  }

  async updateDocumentExtraction(id: number, data: Partial<DocumentExtraction>): Promise<DocumentExtraction | undefined> {
    const { id: _id, ...updateData } = data;
    const [updated] = await db.update(documentExtractions)
      .set(updateData)
      .where(eq(documentExtractions.id, id))
      .returning();
    if (!updated) return undefined;

    // Index completed extractions to Vector store for semantic retrieval (fire-and-forget)
    if (updated.status === "completed" && updated.rawExtractionData) {
      try {
        const raw = updated.rawExtractionData as Record<string, unknown>;
        const extractedText = typeof raw.text === "string" ? raw.text
          : typeof raw.fullText === "string" ? raw.fullText
          : JSON.stringify(raw).slice(0, 10_000);

        if (extractedText.length > 50) {
          // We need the property name and location — fetch from DB
          const { properties } = await import("@workspace/db");
          const [prop] = await db.select().from(properties).where(eq(properties.id, updated.propertyId)).limit(1);

          indexDocumentExtraction({
            extractionId: updated.id,
            propertyId: updated.propertyId,
            propertyName: prop?.name ?? `Property ${updated.propertyId}`,
            documentType: updated.documentType,
            extractedText,
            location: prop?.location ?? "",
          }).catch(err => logger.warn(`Vector store document index failed: ${err}`, "documents"));
        }
      } catch (err: unknown) {
        logger.warn(`Vector store document index failed: ${err}`, "documents");
      }
    }

    return updated;
  }

  async createExtractionField(data: InsertExtractionField): Promise<ExtractionField> {
    const [field] = await db.insert(extractionFields).values(data).returning();
    return field;
  }

  async createExtractionFields(data: InsertExtractionField[]): Promise<ExtractionField[]> {
    if (data.length === 0) return [];
    return db.insert(extractionFields).values(data).returning();
  }

  async getExtractionField(id: number): Promise<ExtractionField | undefined> {
    const [field] = await db.select().from(extractionFields)
      .where(eq(extractionFields.id, id))
      .limit(1);
    return field;
  }

  async getExtractionFields(extractionId: number): Promise<ExtractionField[]> {
    return db.select().from(extractionFields)
      .where(eq(extractionFields.extractionId, extractionId))
      .orderBy(desc(extractionFields.confidence));
  }

  async updateExtractionFieldStatus(id: number, status: string): Promise<ExtractionField | undefined> {
    const [updated] = await db.update(extractionFields)
      .set({ status })
      .where(eq(extractionFields.id, id))
      .returning();
    return updated;
  }

  async bulkUpdateExtractionFieldStatus(extractionId: number, status: string): Promise<void> {
    await db.update(extractionFields)
      .set({ status })
      .where(eq(extractionFields.extractionId, extractionId));
  }

  async deleteDocumentExtraction(id: number): Promise<DocumentExtraction | undefined> {
    const [deleted] = await db.delete(documentExtractions)
      .where(eq(documentExtractions.id, id))
      .returning();
    return deleted;
  }

  async getPropertyExtractionsWithCounts(propertyId: number): Promise<DocumentLibraryRow[]> {
    type RawRow = {
      id: number; property_id: number; user_id: number; file_name: string;
      file_content_type: string; object_path: string; document_type: string;
      status: string; raw_extraction_data: unknown; error_message: string | null;
      processed_at: Date | null; created_at: Date;
      total_fields: number; pending_fields: number; approved_fields: number; rejected_fields: number;
    };
    const result = await db.execute<RawRow>(sql`
      SELECT
        de.id, de.property_id, de.user_id, de.file_name, de.file_content_type,
        de.object_path, de.document_type, de.status, de.raw_extraction_data,
        de.error_message, de.processed_at, de.created_at,
        COUNT(ef.id)::int                                               AS total_fields,
        COUNT(ef.id) FILTER (WHERE ef.status = 'pending')::int          AS pending_fields,
        COUNT(ef.id) FILTER (WHERE ef.status = 'approved')::int         AS approved_fields,
        COUNT(ef.id) FILTER (WHERE ef.status = 'rejected')::int         AS rejected_fields
      FROM document_extractions de
      LEFT JOIN extraction_fields ef ON ef.extraction_id = de.id
      WHERE de.property_id = ${propertyId}
      GROUP BY de.id
      ORDER BY de.created_at DESC
    `);
    return result.rows.map((r) => ({
      id: r.id,
      propertyId: r.property_id,
      userId: r.user_id,
      fileName: r.file_name,
      fileContentType: r.file_content_type,
      objectPath: r.object_path,
      documentType: r.document_type,
      status: r.status,
      rawExtractionData: r.raw_extraction_data as Record<string, unknown> | null,
      errorMessage: r.error_message,
      processedAt: r.processed_at,
      createdAt: r.created_at,
      totalFields: r.total_fields,
      pendingFields: r.pending_fields,
      approvedFields: r.approved_fields,
      rejectedFields: r.rejected_fields,
    }));
  }

}
