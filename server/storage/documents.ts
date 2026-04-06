import { db } from "../db";
import { documentExtractions, extractionFields, type DocumentExtraction, type InsertDocumentExtraction, type ExtractionField, type InsertExtractionField } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { indexDocumentExtraction } from "../ai/pinecone-service";
import { logger } from "../logger";

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

  async updateDocumentExtraction(id: number, data: Partial<DocumentExtraction>): Promise<DocumentExtraction> {
    const { id: _id, ...updateData } = data;
    const [updated] = await db.update(documentExtractions)
      .set(updateData)
      .where(eq(documentExtractions.id, id))
      .returning();

    // Index completed extractions to Pinecone for semantic retrieval (fire-and-forget)
    if (updated.status === "completed" && updated.rawExtractionData) {
      try {
        const raw = updated.rawExtractionData as Record<string, unknown>;
        const extractedText = typeof raw.text === "string" ? raw.text
          : typeof raw.fullText === "string" ? raw.fullText
          : JSON.stringify(raw).slice(0, 10_000);

        if (extractedText.length > 50) {
          // We need the property name and location — fetch from DB
          const { properties } = await import("@shared/schema");
          const [prop] = await db.select().from(properties).where(eq(properties.id, updated.propertyId)).limit(1);

          indexDocumentExtraction({
            extractionId: updated.id,
            propertyId: updated.propertyId,
            propertyName: prop?.name ?? `Property ${updated.propertyId}`,
            documentType: updated.documentType,
            extractedText,
            location: prop?.location ?? "",
          }).catch(err => logger.warn(`Pinecone document index failed: ${err}`, "documents"));
        }
      } catch (err) {
        logger.warn(`Pinecone document index failed: ${err}`, "documents");
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

  async getExtractionFields(extractionId: number): Promise<ExtractionField[]> {
    return db.select().from(extractionFields)
      .where(eq(extractionFields.extractionId, extractionId))
      .orderBy(desc(extractionFields.confidence));
  }

  async updateExtractionFieldStatus(id: number, status: string): Promise<ExtractionField> {
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

}
